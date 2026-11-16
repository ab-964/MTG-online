/**
 * Game state + actions (runs in the HOST's browser).
 *
 * This is a "tabletop" model: the host tracks where every card is and who
 * can see it, but does NOT enforce Magic rules. Players move cards themselves.
 *
 * Works in the browser (window.MTGEngine) and in Node (for tests).
 */
(function (root) {
'use strict';

const cryptoApi = (typeof globalThis !== 'undefined' && globalThis.crypto) || require('crypto').webcrypto;
function randomInt(max) {
  // unbiased random integer in [0, max)
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let x;
  do { cryptoApi.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % max;
}
function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  cryptoApi.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

const PHASES = ['Untap', 'Upkeep', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End'];
const PLAYER_ZONES = ['library', 'hand', 'graveyard', 'exile', 'command', 'battlefield'];
const PUBLIC_ZONES = new Set(['graveyard', 'exile', 'command', 'battlefield', 'stack']);
const COLORS = ['#e05252', '#4f8fe0', '#4caf6a', '#d6a531'];
const MAX_PLAYERS = 4;
const MAX_DECK_CARDS = 300;
const TABLE_W = 1600;
const TABLE_H = 700;
const CARD_W = 100;
const CARD_H = 140;
const LOG_LIMIT = 400;

const rid = (bytes = 6) => randomHex(bytes);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Short, easy-to-read room code like "K7QZ4M". */
const makeCode = (n = 6) => Array.from({ length: n }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

/* ---------------------------------------------------------------- helpers */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const str = (v, max = 100) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v, min, max, dflt) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};
const num = (v, min, max, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeImg = (u) => (typeof u === 'string' && u.startsWith('https://cards.scryfall.io/') && u.length < 300 ? u : null);
const safeScryfallUrl = (u) => (typeof u === 'string' && u.startsWith('https://scryfall.com/') && u.length < 400 ? u : null);

/** Build a Scryfall image URL straight from a card's Scryfall id. */
function imageFromId(id, face = 'front', size = 'normal') {
  if (!SCRYFALL_ID.test(id || '')) return null;
  id = id.toLowerCase();
  return `https://cards.scryfall.io/${size}/${face}/${id[0]}/${id[1]}/${id}.jpg`;
}

/** Parse "2/3" style power/toughness. Non-numbers (like *) come back as null. */
function parsePT(pt) {
  const m = /^\s*([^/]+)\/([^/]+)\s*$/.exec(pt || '');
  if (!m) return null;
  const n = (v) => (/^[+-]?\d+$/.test(v.trim()) ? Number(v) : null);
  return { p: n(m[1]), t: n(m[2]), rawP: m[1].trim(), rawT: m[2].trim() };
}
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Deterministic dice physics so every player sees the same bounce.
 * Units are "table units"; returns frames [[x, y, rotationDeg], ...] at 60 fps.
 */
function simulateDie(sx, sy, vx, vy, W, H, size = 70) {
  let x = sx;
  let y = sy;
  let sp = Math.hypot(vx, vy);
  if (sp < 1) { vx = 400; vy = -300; sp = 500; }
  if (sp < 450) { vx *= 450 / sp; vy *= 450 / sp; }
  if (sp > 4500) { vx *= 4500 / sp; vy *= 4500 / sp; }
  let rot = 0;
  let vr = (vx - vy) * 0.9;
  const frames = [];
  for (let i = 0; i < 360; i++) {
    x += vx / 60;
    y += vy / 60;
    if (x < 0) { x = -x; vx = -vx * 0.75; vr = -vr * 0.8; }
    if (x > W - size) { x = 2 * (W - size) - x; vx = -vx * 0.75; vr = -vr * 0.8; }
    if (y < 0) { y = -y; vy = -vy * 0.75; vr = -vr * 0.8; }
    if (y > H - size) { y = 2 * (H - size) - y; vy = -vy * 0.75; vr = -vr * 0.8; }
    x = Math.max(0, Math.min(W - size, x));
    y = Math.max(0, Math.min(H - size, y));
    vx *= 0.962; vy *= 0.962; vr *= 0.955;
    rot += vr / 60;
    frames.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(rot * 10) / 10]);
    if (i > 40 && Math.hypot(vx, vy) < 12) break;
  }
  return frames;
}
const TRAY_W = 900;
const TRAY_H = 420;

function getPlayer(game, id) {
  return game.players.find((p) => p.id === id) || null;
}
function needPlayer(game, id) {
  return getPlayer(game, id) || fail('That player is not in this game.');
}
function needCard(game, id) {
  return game.cards[id] || fail('That card no longer exists.');
}

function addLog(game, text, extra = {}) {
  game.log.push({ id: game.nextLogId++, t: Date.now(), text, ...extra });
  if (game.log.length > LOG_LIMIT) game.log.splice(0, game.log.length - LOG_LIMIT);
}

/* ----------------------------------------------------------- game setup */

function createGame({ name, format } = {}) {
  const fmt = format === 'standard' ? 'standard' : 'commander';
  return {
    id: makeCode(),
    name: str(String(name || '').trim(), 60) || 'MTG Game',
    format: fmt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 0,
    settings: { startingLife: fmt === 'commander' ? 40 : 20, autoUntap: true, autoDraw: true },
    players: [],
    cards: {},
    stack: [],
    turn: { active: null, number: 1, phase: 0 },
    order: [], // turn order (player ids), set by the opening d20 roll
    setup: null, // opening mulligan / roll-for-turn-order state
    dice: {}, // d20s sitting on battlefields
    requests: [], // permission requests waiting for an answer
    nextSeq: 1,
    log: [],
    nextLogId: 1,
  };
}

function newPlayer(game, name) {
  const used = new Set(game.players.map((p) => p.color));
  const p = {
    id: rid(4),
    name,
    token: rid(16),
    color: COLORS.find((c) => !used.has(c)) || COLORS[0],
    life: game.settings.startingLife,
    counters: {},
    cmdDamage: {},
    revealTop: false,
    handRevealed: false,
    deckName: null,
    deck: null,
    bfColor: null,
    zones: {},
  };
  for (const z of PLAYER_ZONES) p.zones[z] = [];
  return p;
}

/** Join (or re-join by name) a game. Returns { player, rejoined }. */
function joinGame(game, rawName) {
  const name = str(String(rawName || '').trim(), 24);
  if (!name) fail('Please enter a name.');
  const existing = game.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return { player: existing, rejoined: true };
  if (game.players.length >= MAX_PLAYERS) fail('This game is full.');
  const p = newPlayer(game, name);
  game.players.push(p);
  if (!game.turn.active) game.turn.active = p.id;
  addLog(game, `${p.name} joined the game.`);
  return { player: p, rejoined: false };
}

/* ----------------------------------------------------------------- cards */

function cleanTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  const name = str(t.name, 150).trim();
  if (!name) return null;
  const scryfallId = SCRYFALL_ID.test(t.scryfallId || '') ? t.scryfallId.toLowerCase() : null;
  return {
    name,
    qty: int(t.qty, 1, 99, 1),
    scryfallId,
    set: str(t.set, 10) || null,
    cn: str(t.cn, 12) || null,
    img: safeImg(t.img) || (scryfallId ? imageFromId(scryfallId) : null),
    backImg: safeImg(t.backImg),
    backName: str(t.backName, 150) || null,
    typeLine: str(t.typeLine, 150),
    pt: str(t.pt, 12) || null,
    backPt: str(t.backPt, 12) || null,
    backTypeLine: str(t.backTypeLine, 150),
    manaCost: str(t.manaCost, 60),
    oracle: str(t.oracle, 1500),
    backOracle: str(t.backOracle, 1500),
    effects: cleanEffects(t.effects),
    scryfallUri: safeScryfallUrl(t.scryfallUri),
    isCommander: !!t.isCommander,
    tokens: Array.isArray(t.tokens)
      ? t.tokens
          .slice(0, 12)
          .map((k) => ({ name: str(k && k.name, 80), scryfallId: SCRYFALL_ID.test((k && k.scryfallId) || '') ? k.scryfallId : null }))
          .filter((k) => k.name)
      : [],
  };
}

const WHO = ['self', 'attached', 'yours', 'yoursOther', 'opponents', 'all'];
const WHERE = ['you', 'opp', 'all', 'yourGraveyard'];
const KINDS = ['pt', 'forEach', 'etb', 'keyword'];

/** Effects are small structured rules a player builds (or approves) for a card. */
function cleanEffects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list.slice(0, 12)) {
    if (!e || !KINDS.includes(e.kind)) continue;
    const eff = { kind: e.kind, on: e.on !== false };
    if (e.kind === 'pt' || e.kind === 'etb' || e.kind === 'keyword') {
      eff.who = WHO.includes(e.who) ? e.who : 'self';
      eff.filter = str(String(e.filter || '').trim(), 30);
    }
    if (e.kind === 'pt' || e.kind === 'forEach') {
      eff.p = int(e.p, -99, 99, 0);
      eff.t = int(e.t, -99, 99, 0);
    }
    if (e.kind === 'forEach') {
      eff.count = str(String(e.count || 'creature').trim(), 30) || 'creature';
      eff.where = WHERE.includes(e.where) ? e.where : 'you';
      eff.other = !!e.other;
    }
    if (e.kind === 'etb') {
      eff.n = int(e.n, 1, 20, 1);
      eff.counter = str(String(e.counter || '+1/+1').trim(), 20) || '+1/+1';
    }
    if (e.kind === 'keyword') eff.keyword = str(String(e.keyword || '').trim(), 30);
    if (e.kind === 'keyword' && !eff.keyword) continue;
    if (e.note) eff.note = str(e.note, 80);
    out.push(eff);
  }
  return out;
}

const WHO_TEXT = {
  self: 'This creature',
  attached: 'Equipped/enchanted creature',
  yours: 'Creatures you control',
  yoursOther: 'Other creatures you control',
  opponents: "Creatures your opponents control",
  all: 'All creatures',
};
const WHERE_TEXT = { you: 'you control', opp: 'your opponents control', all: 'on the battlefield', yourGraveyard: 'in your graveyard' };

/** Human-readable sentence for an effect, e.g. "Other Elf creatures you control get +1/+1". */
function describeEffect(e) {
  const who = () => {
    if (e.who === 'self' || e.who === 'attached' || !WHO_TEXT[e.who]) return WHO_TEXT[e.who] || 'This creature';
    const [pre, rest] = { yours: ['', 'creatures you control'], yoursOther: ['other ', 'creatures you control'], opponents: ['', 'creatures your opponents control'], all: ['all ', 'creatures'] }[e.who];
    const out = `${pre}${e.filter ? `${e.filter} ` : ''}${rest}`;
    return out[0].toUpperCase() + out.slice(1);
  };
  const plural = e.who !== 'self' && e.who !== 'attached';
  switch (e.kind) {
    case 'pt':
      return `${who()} ${plural ? 'get' : 'gets'} ${sign(e.p)}/${sign(e.t)}`;
    case 'forEach':
      return `This creature gets ${sign(e.p)}/${sign(e.t)} for each ${e.other ? 'other ' : ''}${e.count} ${WHERE_TEXT[e.where]}`;
    case 'etb':
      return `${who()} ${plural ? 'enter' : 'enters'} with ${e.n} extra ${e.counter} counter${e.n === 1 ? '' : 's'}`;
    case 'keyword':
      return `${who()} ${plural ? 'have' : 'has'} ${e.keyword}`;
    default:
      return '';
  }
}

function instantiate(game, tpl, ownerId, extra = {}) {
  const id = rid(5);
  const c = {
    id,
    owner: ownerId,
    name: tpl.name || 'Unknown card',
    scryfallId: tpl.scryfallId || null,
    set: tpl.set || null,
    cn: tpl.cn || null,
    img: tpl.img || null,
    backImg: tpl.backImg || null,
    backName: tpl.backName || null,
    typeLine: tpl.typeLine || '',
    pt: tpl.pt || null,
    backPt: tpl.backPt || null,
    backTypeLine: tpl.backTypeLine || '',
    manaCost: tpl.manaCost || '',
    oracle: tpl.oracle || '',
    backOracle: tpl.backOracle || '',
    effects: cleanEffects(tpl.effects),
    ptMod: { p: 0, t: 0 },
    attachedTo: null,
    scryfallUri: tpl.scryfallUri || null,
    tokens: tpl.tokens || [],
    isCommander: !!tpl.isCommander,
    isToken: !!extra.isToken,
    tapped: false,
    flipped: false,
    faceDown: false,
    counters: {},
    note: '',
    x: 0,
    y: 0,
    castCount: 0,
    zone: null,
    zp: null, // id of the player whose zone the card is in (battlefield: controller)
  };
  game.cards[id] = c;
  return c;
}

function zoneArray(game, zone, pid) {
  if (zone === 'stack') return game.stack;
  const p = getPlayer(game, pid);
  return p ? p.zones[zone] : null;
}

function detach(game, card) {
  if (!card.zone) return;
  const arr = zoneArray(game, card.zone, card.zp);
  if (arr) {
    const i = arr.indexOf(card.id);
    if (i >= 0) arr.splice(i, 1);
  }
  card.zone = null;
  card.zp = null;
}

function placeIn(game, card, zone, pid, opts = {}) {
  const arr = zoneArray(game, zone, pid);
  if (!arr) fail('Unknown zone.');
  if (zone === 'library') {
    if (opts.pos === 'bottom') arr.push(card.id);
    else if (Number.isInteger(opts.pos)) arr.splice(Math.max(0, Math.min(arr.length, opts.pos)), 0, card.id);
    else arr.unshift(card.id); // index 0 is the top of the library
  } else if (Number.isInteger(opts.pos)) {
    arr.splice(Math.max(0, Math.min(arr.length, opts.pos)), 0, card.id);
  } else {
    arr.push(card.id); // graveyard/exile: last element is the top
  }
  card.zone = zone;
  card.zp = zone === 'stack' ? null : pid;
}

function destroyCard(game, card) {
  detach(game, card);
  delete game.cards[card.id];
}

function removeOwnedCards(game, pid) {
  for (const c of Object.values(game.cards)) if (c.owner === pid) destroyCard(game, c);
}

const currentType = (card) => (card.flipped && card.backTypeLine ? card.backTypeLine : card.typeLine) || '';
function isLand(card) {
  return /\bLand\b/.test(currentType(card)) && !/\bCreature\b/.test(currentType(card));
}
function isCreature(card) {
  return /\bCreature\b/.test(currentType(card));
}
/** Does a card's type line contain this word (e.g. "Dragon", "artifact")? Handles simple plurals. */
function hasType(card, word) {
  if (!word) return true;
  let w = word.trim().toLowerCase();
  if (w === 'card' || w === 'permanent') return true;
  const tl = currentType(card).toLowerCase();
  const re = (x) => new RegExp(`(^|[^a-z])${x.replace(/[^a-z' -]/g, '')}([^a-z]|$)`);
  if (re(w).test(tl)) return true;
  const singular = w.endsWith('ves') ? w.slice(0, -3) + 'f' : w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('s') ? w.slice(0, -1) : w;
  return singular !== w && re(singular).test(tl);
}

/** Add counters, letting +1/+1 and -1/-1 cancel each other out like the real rules. */
function addCounter(card, name, delta) {
  if (name === '+1/+1' || name === '-1/-1') {
    const net = (card.counters['+1/+1'] || 0) - (card.counters['-1/-1'] || 0) + (name === '+1/+1' ? delta : -delta);
    delete card.counters['+1/+1'];
    delete card.counters['-1/-1'];
    if (net > 0) card.counters['+1/+1'] = net;
    if (net < 0) card.counters['-1/-1'] = -net;
    return net;
  }
  const v = (card.counters[name] || 0) + delta;
  if (v <= 0) delete card.counters[name];
  else card.counters[name] = v;
  return v;
}

function autoPlace(game, pid, card) {
  const p = getPlayer(game, pid);
  const others = p.zones.battlefield.map((id) => game.cards[id]).filter((c) => c && c.id !== card.id);
  let y = isLand(card) ? 530 : isCreature(card) ? 30 : 280;
  for (let pass = 0; pass < 6; pass++) {
    for (let x = 30; x <= TABLE_W - CARD_W - 20; x += 115) {
      if (!others.some((o) => Math.abs(o.x - x) < 70 && Math.abs(o.y - y) < 70)) {
        card.x = x;
        card.y = y;
        return;
      }
    }
    y = Math.min(TABLE_H - CARD_H, y + 40);
  }
  card.x = 30 + Math.floor(Math.random() * 400);
  card.y = 300 + Math.floor(Math.random() * 300);
}

function resetCardState(card) {
  card.tapped = false;
  card.flipped = false;
  card.faceDown = false;
  card.counters = {};
  card.note = '';
  card.ptMod = { p: 0, t: 0 };
  card.attachedTo = null;
}

/** When a permanent leaves, anything attached to it falls off (stays on the battlefield). */
function dropAttachments(game, card) {
  for (const c of Object.values(game.cards)) if (c.attachedTo === card.id) c.attachedTo = null;
}

/** Effect "who" matching: does source effect e (on card src) apply to target card t? */
function effectHits(game, e, src, t) {
  if (!isCreature(t) && e.who !== 'self' && e.who !== 'attached') return false;
  switch (e.who) {
    case 'self':
      if (t.id !== src.id) return false;
      break;
    case 'attached':
      if (src.attachedTo !== t.id) return false;
      break;
    case 'yours':
      if (t.zp !== src.zp) return false;
      break;
    case 'yoursOther':
      if (t.zp !== src.zp || t.id === src.id) return false;
      break;
    case 'opponents':
      if (t.zp === src.zp) return false;
      break;
    case 'all':
      break;
    default:
      return false;
  }
  return !e.filter || e.who === 'self' || e.who === 'attached' ? true : hasType(t, e.filter);
}

function effectSources(game) {
  const out = [];
  for (const p of game.players)
    for (const id of p.zones.battlefield) {
      const c = game.cards[id];
      if (c && !c.faceDown) for (const e of c.effects || []) if (e.on) out.push([c, e]);
    }
  return out;
}

/** Apply "enters with extra counters" effects to a card that just entered. Returns log notes. */
function applyEtbEffects(game, card) {
  const notes = [];
  if (card.faceDown) return notes;
  const sources = effectSources(game);
  for (const e of card.effects || []) if (e.on && e.kind === 'etb' && e.who === 'self') sources.push([card, e]);
  for (const [src, e] of sources) {
    if (e.kind !== 'etb') continue;
    if (e.who === 'self' ? src.id !== card.id : !effectHits(game, e, src, card)) continue;
    addCounter(card, e.counter, e.n);
    notes.push(`+${e.n} ${e.counter} from ${src.id === card.id ? 'itself' : src.name}`);
  }
  return notes;
}

function countFor(game, e, src) {
  let n = 0;
  if (e.where === 'yourGraveyard') {
    const p = getPlayer(game, src.zp);
    for (const id of p ? p.zones.graveyard : []) if (hasType(game.cards[id], e.count)) n++;
    return n;
  }
  for (const p of game.players) {
    if (e.where === 'you' && p.id !== src.zp) continue;
    if (e.where === 'opp' && p.id === src.zp) continue;
    for (const id of p.zones.battlefield) {
      const c = game.cards[id];
      if (!c || c.faceDown) continue;
      if (e.other && c.id === src.id) continue;
      if (hasType(c, e.count)) n++;
    }
  }
  return n;
}

/**
 * Work out every battlefield card's final power/toughness, with a breakdown
 * of where each bonus came from, plus granted keywords.
 */
function computeStats(game) {
  const stats = {};
  const sources = effectSources(game);
  for (const p of game.players)
    for (const id of p.zones.battlefield) {
      const c = game.cards[id];
      if (!c || c.faceDown) continue;
      const base = parsePT(c.flipped && c.backPt ? c.backPt : c.pt);
      const parts = [];
      const net = (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
      if (net) parts.push({ src: 'counters', p: net, t: net, counter: true });
      if (c.ptMod && (c.ptMod.p || c.ptMod.t)) parts.push({ src: 'manual bonus', p: c.ptMod.p, t: c.ptMod.t, manual: true });
      const keywords = [];
      for (const [src, e] of sources) {
        if (e.kind === 'pt' && effectHits(game, e, src, c) && (e.p || e.t)) parts.push({ src: src.name, p: e.p, t: e.t });
        if (e.kind === 'forEach' && src.id === c.id) {
          const n = countFor(game, e, src);
          if (n) parts.push({ src: `${src.name} (${n} ${e.count}${n === 1 ? '' : 's'})`, p: e.p * n, t: e.t * n });
        }
        if (e.kind === 'keyword' && effectHits(game, e, src, c)) keywords.push({ keyword: e.keyword, src: src.name });
      }
      if (!base && !parts.length && !keywords.length) continue;
      const sp = parts.reduce((s, x) => s + x.p, 0);
      const st = parts.reduce((s, x) => s + x.t, 0);
      const fx = parts.filter((x) => !x.counter);
      const total = base
        ? {
            p: base.p != null ? String(base.p + sp) : `${base.rawP}${sp ? sign(sp) : ''}`,
            t: base.t != null ? String(base.t + st) : `${base.rawT}${st ? sign(st) : ''}`,
          }
        : null;
      stats[id] = {
        base: base ? `${base.rawP}/${base.rawT}` : null,
        total: total ? `${total.p}/${total.t}` : null,
        parts,
        keywords,
        // sum of non-counter bonuses (manual + effects), shown as one badge on the card
        fx: fx.length ? { p: fx.reduce((s, x) => s + x.p, 0), t: fx.reduce((s, x) => s + x.t, 0) } : null,
      };
    }
  return stats;
}

/** Display name used in the log, hiding hidden information. */
function logName(card, fromZone, toZone) {
  if (card.faceDown) return 'a face-down card';
  if (PUBLIC_ZONES.has(fromZone) || PUBLIC_ZONES.has(toZone)) return card.name;
  return 'a card';
}

function zoneLabel(game, actor, zone, pid, pos) {
  if (zone === 'stack') return 'the stack';
  const owner = pid === actor.id ? 'their' : `${(getPlayer(game, pid) || {}).name || '?'}'s`;
  if (zone === 'library') return `${pos === 'bottom' ? 'the bottom of ' : 'the top of '}${owner} library`;
  return `${owner} ${zone}`;
}

function moveCard(game, actor, a, { quiet = false } = {}) {
  const card = needCard(game, a.cardId);
  const to = a.to;
  if (to !== 'stack' && !PLAYER_ZONES.includes(to)) fail('Unknown destination zone.');
  const fromZone = card.zone;
  const fromP = card.zp;

  let destP = null;
  if (to === 'battlefield') {
    destP = a.playerId && getPlayer(game, a.playerId) ? a.playerId : fromZone === 'battlefield' ? fromP : actor.id;
  } else if (to !== 'stack') {
    // Cards always go to their OWNER's hand / library / graveyard / exile / command zone.
    destP = card.owner;
  }

  // Tokens stop existing once they leave the battlefield / stack.
  if (card.isToken && to !== 'battlefield' && to !== 'stack') {
    if (!quiet) addLog(game, `${actor.name}: token ${card.name} left the battlefield and was removed.`);
    dropAttachments(game, card);
    destroyCard(game, card);
    return;
  }

  if (fromZone === 'command' && card.isCommander && (to === 'battlefield' || to === 'stack')) card.castCount += 1;

  const sameBattlefield = fromZone === 'battlefield' && to === 'battlefield';
  if (fromZone === 'hand' && to === 'hand' && fromP === destP) quiet = true; // just re-sorting a hand
  detach(game, card);
  if (fromZone === 'battlefield' && to !== 'battlefield') dropAttachments(game, card);

  if (!sameBattlefield) {
    const keepFaceDown = fromZone === 'battlefield' && to === 'battlefield';
    if (fromZone === 'battlefield' || fromZone === 'stack' || to !== 'battlefield') resetCardState(card);
    card.faceDown = keepFaceDown ? card.faceDown : (to === 'battlefield' || to === 'exile') && !!a.faceDown;
  }
  if (to === 'battlefield') {
    if (Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y))) {
      card.x = num(a.x, 0, TABLE_W - CARD_W, 0);
      card.y = num(a.y, 0, TABLE_H - CARD_H, 0);
    } else if (!sameBattlefield) {
      autoPlace(game, destP, card);
    }
  }
  placeIn(game, card, to, destP, { pos: a.pos });
  const etb = to === 'battlefield' && fromZone !== 'battlefield' ? applyEtbEffects(game, card) : [];

  if (!quiet) {
    const nm = logName(card, fromZone, to);
    const from = fromZone ? zoneLabel(game, actor, fromZone, fromP) : 'nowhere';
    const dest = zoneLabel(game, actor, to, destP, a.pos);
    let text;
    if (fromZone === 'hand' && to === 'battlefield' && destP === actor.id) text = `${actor.name} played ${nm}.`;
    else if (fromZone === 'hand' && to === 'stack') text = `${actor.name} cast ${nm}.`;
    else if (fromZone === 'command' && (to === 'stack' || to === 'battlefield'))
      text = `${actor.name} cast ${nm} from the command zone (cast ${card.castCount} time${card.castCount === 1 ? '' : 's'}).`;
    else text = `${actor.name} moved ${nm} from ${from} to ${dest}.`;
    if (etb.length) text += ` It entered with ${etb.join(', ')}.`;
    addLog(game, text);
  }
}

function buildDeck(game, player) {
  removeOwnedCards(game, player.id);
  if (!player.deck) return;
  for (const tpl of player.deck.cards) {
    for (let i = 0; i < tpl.qty; i++) {
      const c = instantiate(game, tpl, player.id);
      placeIn(game, c, tpl.isCommander ? 'command' : 'library', player.id, { pos: 'bottom' });
    }
  }
  shuffle(player.zones.library);
}

function drawCards(game, player, n) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const id = player.zones.library[0];
    if (!id) break;
    const c = game.cards[id];
    detach(game, c);
    placeIn(game, c, 'hand', player.id);
    drawn++;
  }
  return drawn;
}

function resetPlayerState(game, p) {
  p.life = game.settings.startingLife;
  p.counters = {};
  p.cmdDamage = {};
  p.revealTop = false;
  p.handRevealed = false;
}

/* ---------------------------------------------------------------- actions */

/** Turn order: from the opening roll, plus anyone who joined later. */
function turnOrder(game) {
  const order = (game.order || []).filter((id) => getPlayer(game, id));
  for (const p of game.players) if (!order.includes(p.id)) order.push(p.id);
  return order;
}

function resolveTurnOrder(game) {
  const st = game.setup;
  const res = st.results;
  const cmp = (a, b) => {
    const ra = res[a] || [];
    const rb = res[b] || [];
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const x = ra[i] || 0;
      const y = rb[i] || 0;
      if (x !== y) return y - x;
    }
    return 0;
  };
  const sorted = st.rollers.slice().sort(cmp);
  const tied = new Set();
  for (let i = 0; i < sorted.length - 1; i++)
    if (cmp(sorted[i], sorted[i + 1]) === 0) {
      tied.add(sorted[i]);
      tied.add(sorted[i + 1]);
    }
  if (tied.size) {
    st.eligible = [...tied];
    st.round += 1;
    addLog(game, `Tie between ${[...tied].map((id) => getPlayer(game, id).name).join(' and ')}! Roll again.`, { kind: 'turn' });
    return;
  }
  game.order = sorted.concat(game.players.map((p) => p.id).filter((id) => !sorted.includes(id)));
  game.turn = { active: sorted[0], number: 1, phase: 1 };
  st.stage = 'done';
  addLog(game, `Turn order: ${game.order.map((id) => getPlayer(game, id).name).join(' → ')}. ${getPlayer(game, sorted[0]).name} goes first!`, {
    kind: 'turn',
  });
}

/* ------------------------------------------------------------ permission */

const UNDO_BARRIERS = new Set(['shuffle', 'mulligan', 'startGame', 'rollInitiative', 'rollDie', 'roll', 'coin']);

/** Returns the id of the player who must approve this action, or null. */
function needsPermission(game, actor, a) {
  const other = (pid) => (pid && pid !== actor.id && getPlayer(game, pid) ? pid : null);
  const cardVictim = (id) => {
    const c = game.cards[id];
    if (!c) return null;
    return ['battlefield', 'hand', 'library'].includes(c.zone) ? other(c.zp) : null;
  };
  switch (a.type) {
    case 'tap':
      if (Array.isArray(a.cardIds)) {
        for (const id of a.cardIds) {
          const v = cardVictim(id);
          if (v) return v;
        }
        return null;
      }
      return cardVictim(a.cardId);
    case 'move':
    case 'position':
    case 'cardCounter':
    case 'flip':
    case 'faceDown':
    case 'note':
    case 'setPtMod':
    case 'setEffects':
    case 'unattach':
      return cardVictim(a.cardId);
    case 'attach':
      return cardVictim(a.cardId) || cardVictim(a.targetId);
    case 'untapAll':
    case 'life':
    case 'setLife':
    case 'playerCounter':
    case 'cmdDamage':
    case 'createToken':
      return other(a.playerId);
    case 'viewZone':
      return a.zone === 'library' ? other(a.playerId) : null;
    default:
      return null;
  }
}

/** Plain-English description of an action, written for the person being asked. */
function describeRequest(game, actor, a) {
  const c = a.cardId ? game.cards[a.cardId] : null;
  const nm = c ? (c.faceDown ? 'a face-down card' : c.zone === 'hand' || c.zone === 'library' ? `a card in your ${c.zone}` : c.name) : 'a card';
  const n = Math.abs(Number(a.delta) || 0);
  switch (a.type) {
    case 'move': {
      let where;
      if (a.to === 'battlefield') where = a.playerId === actor.id ? 'their battlefield (take control of it)' : 'the battlefield';
      else if (a.to === 'library') where = `the ${a.pos === 'bottom' ? 'bottom' : 'top'} of its owner's library`;
      else if (a.to === 'stack') where = 'the stack';
      else where = `its owner's ${a.to}`;
      return `move ${nm} to ${where}`;
    }
    case 'position':
      return `rearrange ${nm} on your battlefield`;
    case 'tap':
      if (Array.isArray(a.cardIds)) return `tap/untap ${a.cardIds.length} of your permanents`;
      return `${c && c.tapped ? 'untap' : 'tap'} ${nm}`;
    case 'cardCounter':
      return `${a.delta > 0 ? 'put' : 'remove'} ${n} ${a.name} counter${n === 1 ? '' : 's'} ${a.delta > 0 ? 'on' : 'from'} ${nm}`;
    case 'flip':
      return `transform ${nm}`;
    case 'faceDown':
      return `turn ${nm} face ${c && c.faceDown ? 'up' : 'down'}`;
    case 'note':
      return `put a note on ${nm}: "${str(String(a.text || ''), 80)}"`;
    case 'setPtMod':
      return `give ${nm} a ${sign(int(a.p, -99, 99, 0))}/${sign(int(a.t, -99, 99, 0))} bonus`;
    case 'setEffects':
      return `change the effects on ${nm}`;
    case 'attach': {
      const t = game.cards[a.targetId];
      return `attach ${c ? c.name : 'a card'} to ${t ? t.name : 'a card'}`;
    }
    case 'unattach':
      return `unattach ${nm}`;
    case 'untapAll':
      return 'untap all your permanents';
    case 'life':
      return `make you ${a.delta > 0 ? 'gain' : 'lose'} ${n} life`;
    case 'setLife':
      return `set your life to ${int(a.value, -9999, 9999, 0)}`;
    case 'playerCounter':
      return `${a.delta > 0 ? 'give you' : 'remove'} ${n} ${a.name} counter${n === 1 ? '' : 's'}`;
    case 'cmdDamage': {
      const src = game.cards[a.sourceId];
      return `${a.delta > 0 ? 'deal you' : 'remove'} ${n} commander damage${src ? ` from ${src.name}` : ''}`;
    }
    case 'createToken':
      return `create ${int(a.count, 1, 30, 1)} ${str(a.name, 60) || 'token'} token(s) on your battlefield`;
    case 'viewZone':
      return a.count ? `look at the top ${int(a.count, 1, 99, 1)} cards of your library` : 'search your library';
    case 'undo':
      return 'undo your last action';
    default:
      return a.type;
  }
}

function createRequest(game, actor, victimId, action) {
  if (game.requests.filter((r) => r.from === actor.id).length >= 5) fail('You already have several requests waiting. Wait for answers (or cancel some).');
  const victim = needPlayer(game, victimId);
  const req = {
    id: rid(4),
    from: actor.id,
    to: victim.id,
    action: JSON.parse(JSON.stringify(action)),
    text: describeRequest(game, actor, action),
    t: Date.now(),
  };
  game.requests.push(req);
  addLog(game, `${actor.name} asked ${victim.name} for permission to ${req.text}.`, { kind: 'warn' });
  return { pendingRequest: req.id, waitingFor: victim.name };
}

function applyAction(game, actor, a, opts = {}) {
  if (!a || typeof a !== 'object') fail('Bad action.');
  if (!opts.approved) {
    const victim = needsPermission(game, actor, a);
    if (victim) return createRequest(game, actor, victim, a);
  }
  const t = a.type;
  let result = {};

  switch (t) {
    case 'move':
      moveCard(game, actor, a);
      break;

    case 'position': {
      const c = needCard(game, a.cardId);
      if (c.zone !== 'battlefield') fail('Card is not on the battlefield.');
      c.x = num(a.x, 0, TABLE_W - CARD_W, c.x);
      c.y = num(a.y, 0, TABLE_H - CARD_H, c.y);
      // bring to front
      const arr = getPlayer(game, c.zp).zones.battlefield;
      arr.splice(arr.indexOf(c.id), 1);
      arr.push(c.id);
      return { silentVersion: true };
    }

    case 'tap': {
      const ids = Array.isArray(a.cardIds) ? a.cardIds.slice(0, 100) : [a.cardId];
      const names = [];
      let state = null;
      for (const id of ids) {
        const c = game.cards[id];
        if (!c || c.zone !== 'battlefield') continue;
        c.tapped = typeof a.tapped === 'boolean' ? a.tapped : !c.tapped;
        state = c.tapped;
        names.push(c.faceDown && c.zp !== actor.id ? 'a face-down card' : c.name);
      }
      if (names.length)
        addLog(game, `${actor.name} ${state ? 'tapped' : 'untapped'} ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}.`);
      break;
    }

    case 'untapAll': {
      const p = a.playerId ? needPlayer(game, a.playerId) : actor;
      for (const id of p.zones.battlefield) game.cards[id].tapped = false;
      addLog(game, `${actor.name} untapped all of ${p.id === actor.id ? 'their' : `${p.name}'s`} permanents.`);
      break;
    }

    case 'draw': {
      const n = int(a.n, 1, 50, 1);
      const got = drawCards(game, actor, n);
      if (got < n) addLog(game, `${actor.name} tried to draw ${n} but their library only had ${got}.`, { kind: 'warn' });
      else addLog(game, `${actor.name} drew ${n === 1 ? 'a card' : `${n} cards`}.`);
      break;
    }

    case 'mill': {
      const n = int(a.n, 1, 100, 1);
      const names = [];
      for (let i = 0; i < n && actor.zones.library.length; i++) {
        const c = game.cards[actor.zones.library[0]];
        detach(game, c);
        placeIn(game, c, 'graveyard', actor.id);
        names.push(c.name);
      }
      addLog(game, `${actor.name} milled ${names.length}: ${names.join(', ') || 'nothing'}.`);
      break;
    }

    case 'exileTop': {
      const n = int(a.n, 1, 100, 1);
      const names = [];
      for (let i = 0; i < n && actor.zones.library.length; i++) {
        const c = game.cards[actor.zones.library[0]];
        detach(game, c);
        c.faceDown = !!a.faceDown;
        placeIn(game, c, 'exile', actor.id);
        names.push(c.faceDown ? 'a face-down card' : c.name);
      }
      addLog(game, `${actor.name} exiled the top ${names.length} of their library: ${names.join(', ')}.`);
      break;
    }

    case 'shuffle':
      shuffle(actor.zones.library);
      addLog(game, `${actor.name} shuffled their library.`);
      break;

    case 'mulligan': {
      const st = game.setup;
      if (st && st.stage === 'mulligan' && st.kept[actor.id]) fail('You already kept your hand.');
      for (const id of actor.zones.hand.slice()) {
        const c = game.cards[id];
        detach(game, c);
        placeIn(game, c, 'library', actor.id);
      }
      shuffle(actor.zones.library);
      drawCards(game, actor, 7);
      if (st && st.stage === 'mulligan') {
        st.mulls[actor.id] = (st.mulls[actor.id] || 0) + 1;
        addLog(game, `${actor.name} mulliganed (mulligan #${st.mulls[actor.id]}).`);
      } else addLog(game, `${actor.name} shuffled their hand away and drew a new 7.`);
      break;
    }

    case 'keep': {
      const st = game.setup;
      if (!st || st.stage !== 'mulligan') fail('There is nothing to keep right now.');
      if (!st.rollers.includes(actor.id)) fail("You don't have a deck in this game.");
      st.kept[actor.id] = true;
      const m = st.mulls[actor.id] || 0;
      addLog(game, `${actor.name} kept their hand${m ? ` after ${m} mulligan${m === 1 ? '' : 's'}` : ''}.`);
      if (st.rollers.every((id) => st.kept[id])) {
        st.stage = 'roll';
        st.eligible = st.rollers.slice();
        addLog(game, 'Everyone has kept. Flick your d20 to roll for turn order!', { kind: 'turn' });
      }
      break;
    }

    case 'rollInitiative': {
      const st = game.setup;
      if (!st || st.stage !== 'roll') fail('Not rolling for turn order right now.');
      if (!st.eligible.includes(actor.id)) fail('You have already rolled. Waiting for the others.');
      const v = randomInt(20) + 1;
      (st.results[actor.id] = st.results[actor.id] || []).push(v);
      st.eligible = st.eligible.filter((x) => x !== actor.id);
      const idx = st.rollers.indexOf(actor.id);
      st.anims[actor.id] = {
        seq: game.nextSeq++,
        value: v,
        sx: 60 + idx * ((TRAY_W - 200) / Math.max(1, st.rollers.length - 1 || 1)),
        sy: TRAY_H - 110,
        vx: num(a.vx, -6000, 6000, 600),
        vy: num(a.vy, -6000, 6000, -800),
      };
      addLog(game, `${actor.name} rolled ${v} for turn order.`, { kind: 'roll' });
      if (!st.eligible.length) resolveTurnOrder(game);
      break;
    }

    case 'closeSetup':
      if (game.setup && game.setup.stage === 'done') game.setup = null;
      break;

    case 'placeDie': {
      const mine = Object.values(game.dice).filter((d) => d.owner === actor.id);
      if (mine.length >= 3) fail('You already have 3 dice out. Tap one to remove it.');
      const id = rid(3);
      game.dice[id] = { id, owner: actor.id, x: TABLE_W / 2 - 35 + mine.length * 90, y: TABLE_H / 2 - 35, value: null, seq: 0 };
      break;
    }

    case 'rollDie': {
      const d = game.dice[a.dieId] || fail('That die is gone.');
      if (d.owner !== actor.id) fail("That's not your die.");
      if (Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y))) {
        d.x = num(a.x, 0, TABLE_W - 70, d.x);
        d.y = num(a.y, 0, TABLE_H - 70, d.y);
      }
      const frames = simulateDie(d.x, d.y, num(a.vx, -6000, 6000, 600), num(a.vy, -6000, 6000, -600), TABLE_W, TABLE_H);
      d.sx = d.x;
      d.sy = d.y;
      d.vx = num(a.vx, -6000, 6000, 600);
      d.vy = num(a.vy, -6000, 6000, -600);
      [d.x, d.y] = frames[frames.length - 1];
      d.value = randomInt(20) + 1;
      d.seq = game.nextSeq++;
      addLog(game, `${actor.name} rolled a d20: ${d.value}`, { kind: 'roll' });
      break;
    }

    case 'removeDie': {
      const d = game.dice[a.dieId];
      if (d && d.owner === actor.id) delete game.dice[a.dieId];
      break;
    }

    case 'setColor': {
      const c = String(a.color || '');
      actor.bfColor = /^#[0-9a-f]{6}$/i.test(c) ? c : null;
      break;
    }

    case 'setPtMod': {
      const c = needCard(game, a.cardId);
      c.ptMod = { p: int(a.p, -99, 99, 0), t: int(a.t, -99, 99, 0) };
      addLog(game, c.ptMod.p || c.ptMod.t ? `${actor.name} gave ${c.name} a ${sign(c.ptMod.p)}/${sign(c.ptMod.t)} bonus.` : `${actor.name} cleared the bonus on ${c.name}.`);
      break;
    }

    case 'setEffects': {
      const c = needCard(game, a.cardId);
      const effects = cleanEffects(a.effects);
      // every copy of this card owned by the same player, plus their saved deck list
      for (const x of Object.values(game.cards)) if (x.owner === c.owner && x.name === c.name && !x.isToken) x.effects = JSON.parse(JSON.stringify(effects));
      if (c.isToken) c.effects = effects;
      const owner = getPlayer(game, c.owner);
      if (owner && owner.deck) for (const tpl of owner.deck.cards) if (tpl.name === c.name) tpl.effects = JSON.parse(JSON.stringify(effects));
      addLog(game, `${actor.name} updated the effects on ${c.name}${effects.length ? `: ${effects.map(describeEffect).join('; ')}` : ' (none)'}.`);
      result.effectsSaved = { owner: c.owner, name: c.name, effects };
      break;
    }

    case 'attach': {
      const c = needCard(game, a.cardId);
      const target = needCard(game, a.targetId);
      if (c.zone !== 'battlefield' || target.zone !== 'battlefield') fail('Both cards need to be on the battlefield.');
      if (c.id === target.id || target.attachedTo === c.id) fail("Can't attach that there.");
      c.attachedTo = target.id;
      for (const x of Object.values(game.cards)) if (x.attachedTo === c.id) x.attachedTo = null;
      addLog(game, `${actor.name} attached ${c.name} to ${target.faceDown ? 'a face-down card' : target.name}.`);
      break;
    }

    case 'unattach': {
      const c = needCard(game, a.cardId);
      if (!c.attachedTo) break;
      const t = game.cards[c.attachedTo];
      c.attachedTo = null;
      if (t && t.zp === c.zp) {
        c.x = Math.min(TABLE_W - CARD_W, t.x + 120);
        c.y = t.y;
      } else autoPlace(game, c.zp, c);
      addLog(game, `${actor.name} unattached ${c.name}.`);
      break;
    }

    case 'proliferate': {
      const names = [];
      for (const id of (Array.isArray(a.cardIds) ? a.cardIds : []).slice(0, 200)) {
        const c = game.cards[id];
        if (!c || c.zone !== 'battlefield') continue;
        const kinds = Object.keys(c.counters);
        if (!kinds.length) continue;
        for (const k of kinds) addCounter(c, k, 1);
        names.push(c.faceDown ? 'a face-down card' : c.name);
      }
      for (const pid of (Array.isArray(a.playerIds) ? a.playerIds : []).slice(0, 8)) {
        const p = getPlayer(game, pid);
        if (!p || !Object.keys(p.counters).length) continue;
        for (const k of Object.keys(p.counters)) p.counters[k] += 1;
        names.push(p.name);
      }
      addLog(game, names.length ? `${actor.name} proliferated: ${names.join(', ')}.` : `${actor.name} proliferated (nothing had counters).`);
      break;
    }

    case 'reorderHand': {
      const c = needCard(game, a.cardId);
      if (c.zone !== 'hand' || c.zp !== actor.id) fail('That card is not in your hand.');
      detach(game, c);
      placeIn(game, c, 'hand', actor.id, { pos: int(a.index, 0, 200, 0) });
      return { quiet: true };
    }

    case 'respond': {
      const i = game.requests.findIndex((r) => r.id === a.requestId);
      if (i < 0) fail('That request is no longer waiting.');
      const r = game.requests[i];
      if (r.to !== actor.id) fail('That request is not for you.');
      game.requests.splice(i, 1);
      const from = getPlayer(game, r.from);
      if (!from) break;
      if (!a.allow) {
        addLog(game, `${actor.name} said no to ${from.name}'s request to ${r.text}.`, { kind: 'warn' });
        return { denied: true, notify: { to: from.id, text: `${actor.name} said no to: ${r.text}.` } };
      }
      addLog(game, `${actor.name} allowed ${from.name} to ${r.text}.`);
      if (r.action.type === 'undo') return { undoApproved: true, requesterId: from.id };
      const res = applyAction(game, from, r.action, { approved: true }) || {};
      return { ...res, privateFor: from.id, appliedBy: from.id, appliedType: r.action.type };
    }

    case 'cancelRequest': {
      const i = game.requests.findIndex((r) => r.id === a.requestId && r.from === actor.id);
      if (i >= 0) {
        addLog(game, `${actor.name} cancelled their request to ${game.requests[i].text}.`);
        game.requests.splice(i, 1);
      }
      break;
    }

    case 'moveZone': {
      const from = a.from;
      if (!['hand', 'graveyard', 'exile'].includes(from)) fail('Can only move all cards from hand, graveyard or exile.');
      if (!['library', 'graveyard', 'exile', 'hand'].includes(a.to) || a.to === from) fail('Bad destination.');
      const ids = actor.zones[from].slice();
      for (const id of ids) moveCard(game, actor, { cardId: id, to: a.to, pos: 'bottom' }, { quiet: true });
      if (a.to === 'library' && a.shuffle !== false) shuffle(actor.zones.library);
      addLog(game, `${actor.name} moved all ${ids.length} cards from their ${from} to their ${a.to}${a.to === 'library' ? ' and shuffled' : ''}.`);
      break;
    }

    case 'life': {
      const p = needPlayer(game, a.playerId || actor.id);
      const d = int(a.delta, -1000, 1000, 0);
      if (!d) break;
      p.life += d;
      addLog(game, `${p.id === actor.id ? '' : `${actor.name}: `}${p.name} ${d > 0 ? 'gained' : 'lost'} ${Math.abs(d)} life (now ${p.life}).`, { kind: 'life' });
      break;
    }

    case 'setLife': {
      const p = needPlayer(game, a.playerId || actor.id);
      p.life = int(a.value, -9999, 9999, p.life);
      addLog(game, `${actor.name} set ${p.name}'s life to ${p.life}.`, { kind: 'life' });
      break;
    }

    case 'playerCounter': {
      const p = needPlayer(game, a.playerId || actor.id);
      const name = str(String(a.name || '').trim(), 20);
      if (!name) fail('Counter needs a name.');
      const v = (p.counters[name] || 0) + int(a.delta, -100, 100, 0);
      if (v <= 0) delete p.counters[name];
      else p.counters[name] = v;
      addLog(game, `${actor.name}: ${p.name} now has ${v > 0 ? v : 0} ${name} counter${v === 1 ? '' : 's'}.`);
      break;
    }

    case 'cmdDamage': {
      const p = needPlayer(game, a.playerId);
      const src = needCard(game, a.sourceId);
      const d = int(a.delta, -100, 100, 0);
      const before = p.cmdDamage[src.id] || 0;
      const after = Math.max(0, before + d);
      p.cmdDamage[src.id] = after;
      const applied = after - before;
      p.life -= applied;
      addLog(game, `${actor.name}: ${p.name} has taken ${after} commander damage from ${src.name} (life ${p.life}).`, { kind: 'life' });
      break;
    }

    case 'cardCounter': {
      const c = needCard(game, a.cardId);
      const name = str(String(a.name || '').trim(), 20);
      if (!name) fail('Counter needs a name.');
      const v = addCounter(c, name, int(a.delta, -100, 100, 0));
      const nm = c.faceDown ? 'face-down card' : c.name;
      if (name === '+1/+1' || name === '-1/-1')
        addLog(game, `${actor.name}: ${nm} now has ${v === 0 ? 'no +1/+1 or -1/-1 counters' : v > 0 ? `${v} +1/+1 counter${v === 1 ? '' : 's'}` : `${-v} -1/-1 counter${v === -1 ? '' : 's'}`}.`);
      else addLog(game, `${actor.name}: ${nm} now has ${Math.max(v, 0)} ${name} counter${v === 1 ? '' : 's'}.`);
      break;
    }

    case 'flip': {
      const c = needCard(game, a.cardId);
      if (!c.backImg) fail(`${c.name} doesn't have a back face. (Use "Turn face down" instead.)`);
      c.flipped = !c.flipped;
      addLog(game, `${actor.name} transformed ${c.flipped ? c.name : c.backName} into ${c.flipped ? c.backName : c.name}.`);
      break;
    }

    case 'faceDown': {
      const c = needCard(game, a.cardId);
      if (c.zone !== 'battlefield' && c.zone !== 'exile') fail('Only cards on the battlefield or in exile can be turned face down.');
      c.faceDown = !c.faceDown;
      addLog(game, `${actor.name} turned ${c.faceDown ? 'a card face down' : `${c.name} face up`}.`);
      break;
    }

    case 'note': {
      const c = needCard(game, a.cardId);
      c.note = str(String(a.text || ''), 80);
      if (c.note) addLog(game, `${actor.name} noted on ${c.faceDown ? 'a face-down card' : c.name}: "${c.note}".`);
      break;
    }

    case 'createToken': {
      const p = a.playerId ? needPlayer(game, a.playerId) : actor;
      const count = int(a.count, 1, 30, 1);
      const scryfallId = SCRYFALL_ID.test(a.scryfallId || '') ? a.scryfallId.toLowerCase() : null;
      const tpl = cleanTemplate({
        name: a.name || 'Token',
        scryfallId,
        img: a.img,
        backImg: a.backImg,
        backName: a.backName,
        typeLine: a.typeLine || 'Token',
        pt: a.pt,
        scryfallUri: a.scryfallUri,
      });
      if (!tpl) fail('Token needs a name.');
      for (let i = 0; i < count; i++) {
        const c = instantiate(game, tpl, p.id, { isToken: true });
        autoPlace(game, p.id, c);
        placeIn(game, c, 'battlefield', p.id);
      }
      addLog(game, `${actor.name} created ${count} ${tpl.name}${tpl.pt ? ` (${tpl.pt})` : ''} token${count === 1 ? '' : 's'}${p.id !== actor.id ? ` for ${p.name}` : ''}.`);
      break;
    }

    case 'clone': {
      const src = needCard(game, a.cardId);
      const pid = src.zone === 'battlefield' ? src.zp : actor.id;
      const c = instantiate(game, src, actor.id, { isToken: true });
      c.isCommander = false;
      c.x = Math.min(TABLE_W - CARD_W, src.x + 25);
      c.y = Math.min(TABLE_H - CARD_H, src.y + 25);
      if (src.zone !== 'battlefield') autoPlace(game, pid, c);
      placeIn(game, c, 'battlefield', pid);
      addLog(game, `${actor.name} created a token copy of ${src.name}.`);
      break;
    }

    case 'revealTop':
      actor.revealTop = !actor.revealTop;
      addLog(game, `${actor.name} is ${actor.revealTop ? 'now' : 'no longer'} playing with the top of their library revealed.`);
      break;

    case 'revealHand':
      actor.handRevealed = !actor.handRevealed;
      addLog(game, `${actor.name} ${actor.handRevealed ? 'revealed' : 'hid'} their hand.`);
      break;

    case 'viewZone': {
      // Private look at a hidden zone. The cards are returned only to the requester.
      const p = needPlayer(game, a.playerId || actor.id);
      const zone = a.zone;
      if (zone !== 'library' && zone !== 'hand') fail('Only library and hand are hidden zones.');
      if (zone === 'hand' && p.id !== actor.id && !p.handRevealed) fail(`${p.name}'s hand is hidden.`);
      const ids = p.zones[zone];
      const count = a.count ? int(a.count, 1, ids.length || 1, ids.length) : ids.length;
      const shown = ids.slice(0, count);
      if (!a.silent) {
        const whose = p.id === actor.id ? 'their' : `${p.name}'s`;
        if (zone === 'library')
          addLog(game, a.count ? `${actor.name} is looking at the top ${shown.length} of ${whose} library.` : `${actor.name} is searching ${whose} library.`);
      }
      result.private = { zone, playerId: p.id, cards: shown.map((id) => cardView(game.cards[id], actor.id, true)) };
      result.noChange = !!a.silent;
      break;
    }

    case 'passTurn': {
      if (!game.players.length) break;
      const order = turnOrder(game);
      let idx = order.indexOf(game.turn.active);
      idx = (idx + 1) % order.length;
      const next = getPlayer(game, order[idx]);
      game.turn.active = next.id;
      game.turn.number += 1;
      game.turn.phase = 0;
      addLog(game, `— Turn ${game.turn.number}: ${next.name}'s turn —`, { kind: 'turn' });
      if (game.settings.autoUntap) {
        for (const id of next.zones.battlefield) game.cards[id].tapped = false;
        game.turn.phase = 1;
      }
      if (game.settings.autoDraw) {
        if (drawCards(game, next, 1)) addLog(game, `${next.name} drew for the turn.`);
        else addLog(game, `${next.name} has no cards left to draw!`, { kind: 'warn' });
        game.turn.phase = 3;
      }
      break;
    }

    case 'setPhase':
      game.turn.phase = int(a.phase, 0, PHASES.length - 1, game.turn.phase);
      break;

    case 'setActive': {
      const p = needPlayer(game, a.playerId);
      game.turn.active = p.id;
      addLog(game, `${actor.name} made it ${p.name}'s turn.`, { kind: 'turn' });
      break;
    }

    case 'roll': {
      const sides = int(a.sides, 2, 1000, 20);
      addLog(game, `${actor.name} rolled a d${sides}: ${randomInt(sides) + 1}`, { kind: 'roll' });
      break;
    }

    case 'coin':
      addLog(game, `${actor.name} flipped a coin: ${randomInt(2) ? 'Heads' : 'Tails'}`, { kind: 'roll' });
      break;

    case 'chat': {
      const text = str(String(a.text || '').trim(), 300);
      if (!text) break;
      addLog(game, text, { kind: 'chat', who: actor.name, color: actor.color });
      break;
    }

    case 'loadDeck': {
      const deck = a.deck || {};
      const cards = (Array.isArray(deck.cards) ? deck.cards : []).map(cleanTemplate).filter(Boolean);
      const total = cards.reduce((s, c) => s + c.qty, 0);
      if (!total) fail('That deck has no cards.');
      if (total > MAX_DECK_CARDS) fail(`Decks are limited to ${MAX_DECK_CARDS} cards.`);
      actor.deck = { name: str(deck.name, 80) || 'Deck', cards };
      actor.deckName = actor.deck.name;
      buildDeck(game, actor);
      addLog(game, `${actor.name} loaded the deck "${actor.deckName}" (${total} cards).`);
      break;
    }

    case 'startGame': {
      const withDecks = game.players.filter((p) => p.deck);
      if (!withDecks.length) fail('Load a deck first.');
      game.stack = [];
      for (const p of game.players) {
        resetPlayerState(game, p);
        buildDeck(game, p);
        drawCards(game, p, 7);
      }
      // leftover tokens / cards of players without decks
      for (const c of Object.values(game.cards)) if (!getPlayer(game, c.owner)) destroyCard(game, c);
      game.dice = {};
      game.requests = [];
      game.order = [];
      game.turn = { active: null, number: 1, phase: 0 };
      game.setup = { stage: 'mulligan', rollers: withDecks.map((p) => p.id), kept: {}, mulls: {}, results: {}, eligible: [], anims: {}, round: 1 };
      addLog(game, `${actor.name} started a new game. Everyone shuffled and drew 7. Mulligan or keep!`, { kind: 'turn' });
      break;
    }

    case 'setting': {
      const k = a.key;
      if (k === 'autoUntap' || k === 'autoDraw') game.settings[k] = !!a.value;
      else if (k === 'startingLife') game.settings.startingLife = int(a.value, 1, 999, game.settings.startingLife);
      else fail('Unknown setting.');
      addLog(game, `${actor.name} changed setting ${k} to ${game.settings[k]}.`);
      break;
    }

    case 'removePlayer': {
      const p = needPlayer(game, a.playerId);
      removeOwnedCards(game, p.id);
      // cards they controlled but didn't own go back to their owners' battlefields
      for (const id of p.zones.battlefield.slice()) {
        const c = game.cards[id];
        if (c) moveCard(game, actor, { cardId: id, to: 'battlefield', playerId: c.owner }, { quiet: true });
      }
      game.players.splice(game.players.indexOf(p), 1);
      game.order = game.order.filter((x) => x !== p.id);
      game.requests = game.requests.filter((r) => r.from !== p.id && r.to !== p.id);
      for (const d of Object.values(game.dice)) if (d.owner === p.id) delete game.dice[d.id];
      if (game.setup) {
        game.setup.rollers = game.setup.rollers.filter((x) => x !== p.id);
        game.setup.eligible = game.setup.eligible.filter((x) => x !== p.id);
      }
      if (game.turn.active === p.id) game.turn.active = game.players[0] ? game.players[0].id : null;
      addLog(game, `${actor.name} removed ${p.name} from the game.`);
      break;
    }

    default:
      fail(`Unknown action "${t}".`);
  }
  return result;
}

/* ---------------------------------------------------------------- views */

function cardView(c, viewerId, forceVisible = false, stats = null) {
  const base = {
    id: c.id,
    owner: c.owner,
    zone: c.zone,
    zp: c.zp,
    tapped: c.tapped,
    counters: c.counters,
    x: c.x,
    y: c.y,
    isToken: c.isToken,
    faceDown: c.faceDown,
    note: c.note,
    attachedTo: c.attachedTo || null,
  };
  const hidden = !forceVisible && c.faceDown && c.owner !== viewerId && c.zp !== viewerId;
  if (hidden) return { ...base, hidden: true };
  return {
    ...base,
    name: c.name,
    img: c.img,
    backImg: c.backImg,
    backName: c.backName,
    flipped: c.flipped,
    typeLine: c.typeLine,
    pt: c.pt,
    backPt: c.backPt,
    backTypeLine: c.backTypeLine,
    manaCost: c.manaCost,
    oracle: c.oracle,
    backOracle: c.backOracle,
    effects: c.effects,
    ptMod: c.ptMod,
    stats: stats ? stats[c.id] || null : null,
    scryfallUri: c.scryfallUri,
    scryfallId: c.scryfallId,
    set: c.set,
    cn: c.cn,
    isCommander: c.isCommander,
    castCount: c.castCount,
    tokens: c.tokens,
  };
}

function viewFor(game, viewerId, connectedIds = new Set()) {
  const cards = {};
  const stats = computeStats(game);
  const add = (id) => {
    const c = game.cards[id];
    if (c) cards[id] = cardView(c, viewerId, false, stats);
  };
  const players = game.players.map((p) => {
    const zones = {};
    for (const z of ['graveyard', 'exile', 'command', 'battlefield']) {
      zones[z] = p.zones[z].slice();
      zones[z].forEach(add);
    }
    const handVisible = p.id === viewerId || p.handRevealed;
    zones.hand = handVisible ? p.zones.hand.slice() : null;
    if (zones.hand) zones.hand.forEach(add);
    let topCard = null;
    if (p.revealTop && p.zones.library.length) {
      topCard = p.zones.library[0];
      add(topCard);
    }
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      life: p.life,
      counters: p.counters,
      cmdDamage: p.cmdDamage,
      revealTop: p.revealTop,
      handRevealed: p.handRevealed,
      deckName: p.deckName,
      bfColor: p.bfColor || null,
      handCount: p.zones.hand.length,
      libraryCount: p.zones.library.length,
      topCard,
      zones,
      connected: connectedIds.has(p.id),
    };
  });
  game.stack.forEach(add);
  // commanders referenced by commander damage stay visible even if they move to hidden zones
  for (const p of game.players) for (const id of Object.keys(p.cmdDamage)) if (game.cards[id] && !cards[id]) {
    const c = game.cards[id];
    cards[id] = { id, name: c.name, img: c.img, owner: c.owner, zone: c.zone, zp: c.zp, counters: {}, offstage: true };
  }
  return {
    id: game.id,
    name: game.name,
    format: game.format,
    version: game.version,
    settings: game.settings,
    turn: game.turn,
    order: turnOrder(game),
    setup: game.setup,
    dice: game.dice,
    requests: game.requests
      .filter((r) => r.from === viewerId || r.to === viewerId)
      .map((r) => ({ id: r.id, from: r.from, to: r.to, text: r.text, t: r.t, type: r.action.type })),
    tray: { w: TRAY_W, h: TRAY_H },
    phases: PHASES,
    you: viewerId,
    players,
    stack: game.stack.slice(),
    cards,
    log: game.log.slice(-200),
    table: { w: TABLE_W, h: TABLE_H, cardW: CARD_W, cardH: CARD_H },
  };
}

function summary(game) {
  return {
    id: game.id,
    name: game.name,
    format: game.format,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    players: game.players.map((p) => p.name),
    full: game.players.length >= MAX_PLAYERS,
  };
}

const api = {
  createGame,
  joinGame,
  applyAction,
  viewFor,
  summary,
  imageFromId,
  GameError,
  PHASES,
  MAX_PLAYERS,
  rid,
  makeCode,
  simulateDie,
  describeEffect,
  cleanEffects,
  computeStats,
  needsPermission,
  createRequest,
  UNDO_BARRIERS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MTGEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
