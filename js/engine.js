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

function isLand(card) {
  return /\bLand\b/.test(card.typeLine || '') && !/\bCreature\b/.test(card.typeLine || '');
}
function isCreature(card) {
  return /\bCreature\b/.test(card.typeLine || '');
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
    destroyCard(game, card);
    return;
  }

  if (fromZone === 'command' && card.isCommander && (to === 'battlefield' || to === 'stack')) card.castCount += 1;

  const sameBattlefield = fromZone === 'battlefield' && to === 'battlefield';
  detach(game, card);

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

function applyAction(game, actor, a) {
  if (!a || typeof a !== 'object') fail('Bad action.');
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
      for (const id of actor.zones.hand.slice()) {
        const c = game.cards[id];
        detach(game, c);
        placeIn(game, c, 'library', actor.id);
      }
      shuffle(actor.zones.library);
      drawCards(game, actor, 7);
      addLog(game, `${actor.name} took a mulligan and drew a new 7 (put cards on the bottom as needed).`);
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
      const v = (c.counters[name] || 0) + int(a.delta, -100, 100, 0);
      if (v <= 0) delete c.counters[name];
      else c.counters[name] = v;
      addLog(game, `${actor.name}: ${c.faceDown ? 'face-down card' : c.name} now has ${Math.max(v, 0)} ${name} counter${v === 1 ? '' : 's'}.`);
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
      let idx = game.players.findIndex((p) => p.id === game.turn.active);
      idx = (idx + 1) % game.players.length;
      const next = game.players[idx];
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
      const first = game.players[randomInt(game.players.length)];
      game.turn = { active: first.id, number: 1, phase: 1 };
      addLog(game, `${actor.name} started a new game. Everyone shuffled and drew 7. ${first.name} goes first (randomly chosen).`, {
        kind: 'turn',
      });
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

function cardView(c, viewerId, forceVisible = false) {
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
  const add = (id) => {
    const c = game.cards[id];
    if (c) cards[id] = cardView(c, viewerId);
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
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MTGEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
