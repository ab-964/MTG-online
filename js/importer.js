/**
 * Deck importing (runs in each player's own browser).
 *
 *  - Pasted text decklists: Archidekt's text export, MTG Arena, Moxfield, or plain "1 Sol Ring".
 *    Lines with a set code + collector number, e.g. "1x Sol Ring (c21) 263", get that exact printing's art.
 *  - Archidekt links are tried too, but Archidekt usually blocks other websites from reading
 *    decks directly, so the paste option is the reliable one.
 *
 * Every card is looked up on Scryfall for art, type line, back faces and related tokens.
 */
(function (root) {
  'use strict';

  const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');

  function imageFromId(id, face = 'front', size = 'normal') {
    if (!SCRYFALL_ID.test(id || '')) return null;
    id = id.toLowerCase();
    return `https://cards.scryfall.io/${size}/${face}/${id[0]}/${id[1]}/${id}.jpg`;
  }

  async function getJSON(url, init = {}) {
    const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /* ----------------------------------------------------------- Archidekt */

  function archidektId(source) {
    const m = String(source).match(/archidekt\.com\/(?:api\/)?decks\/(\d+)/i);
    return m ? m[1] : null;
  }

  const ARCHIDEKT_HELP =
    "Archidekt doesn't let other websites read decks directly, so please paste the decklist instead:\n" +
    "open your deck on Archidekt → Export → pick the text format that includes set codes (it looks like \"1x Sol Ring (c21) 263\") → copy, then paste it here.";

  async function fetchArchidekt(id) {
    let data;
    try {
      data = await getJSON(`https://archidekt.com/api/decks/${id}/`);
    } catch (e) {
      throw new Error(e.status === 404 ? 'Archidekt could not find that deck (is it set to Private?).\n\n' + ARCHIDEKT_HELP : ARCHIDEKT_HELP);
    }
    if (!data || !Array.isArray(data.cards)) throw new Error(ARCHIDEKT_HELP);

    const excluded = new Set(['maybeboard', 'sideboard', 'considering']);
    const premier = new Set(['commander']);
    for (const c of data.categories || []) {
      const n = String(c.name || '').toLowerCase();
      if (c.includedInDeck === false) excluded.add(n);
      if (c.isPremier) premier.add(n);
    }
    const entries = [];
    for (const e of data.cards) {
      const card = e.card || {};
      const cats = (e.categories || []).map((c) => String(typeof c === 'string' ? c : c && c.name).toLowerCase());
      if (cats.length && excluded.has(cats[0])) continue;
      const oracle = card.oracleCard || {};
      const edition = card.edition || {};
      entries.push({
        qty: Number(e.quantity) || 1,
        name: pick(oracle.name, card.name, card.displayName),
        scryfallId: pick(card.uid, card.scryfallId),
        set: pick(edition.editioncode, edition.code),
        cn: pick(card.collectorNumber, card.collector_number),
        isCommander: cats.some((c) => premier.has(c)),
      });
    }
    if (!entries.length) throw new Error('That Archidekt deck appears to be empty.');
    return { name: data.name || `Archidekt deck ${id}`, entries };
  }

  /* ---------------------------------------------------------- text lists */

  function parseText(text) {
    const entries = [];
    let section = 'main';
    let name = null;
    for (const raw of String(text).split(/\r?\n/)) {
      let line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) {
        const m = line.match(/^\/\/\s*(commander|sideboard|maybeboard|main)/i);
        if (m) section = m[1].toLowerCase() === 'commander' ? 'commander' : m[1].toLowerCase() === 'main' ? 'main' : 'skip';
        continue;
      }
      if (/^name\s+/i.test(line)) {
        name = line.replace(/^name\s+/i, '');
        continue;
      }
      const header = line.match(
        /^(commanders?|deck|mainboard|main ?deck|main|sideboard|maybeboard|considering|companion|tokens?|about)\s*:?\s*(\(\d+\))?$/i,
      );
      if (header) {
        const h = header[1].toLowerCase();
        section = h.startsWith('commander') || h === 'companion' ? 'commander' : /side|maybe|consider|token|about/.test(h) ? 'skip' : 'main';
        continue;
      }
      if (section === 'skip' || /^SB:/i.test(line)) continue;

      let qty = 1;
      const q = line.match(/^(\d+)\s*x?\s+(.*)$/i);
      if (q) {
        qty = Number(q[1]);
        line = q[2];
      }
      let cats = '';
      const cm = line.match(/\[([^\]]*)\]/);
      if (cm) {
        cats = cm[1].toLowerCase();
        line = line.replace(/\[[^\]]*\]/g, '');
      }
      const isCmdrTag = /\*cmdr\*/i.test(line);
      line = line
        .replace(/\^[^^]*\^/g, '') // archidekt colour tags like ^Have,#37d67a^
        .replace(/\*[A-Z]+\*/gi, '') // *F* foil / *CMDR* markers
        .trim();
      let set = null;
      let cn = null;
      const sm = line.match(/\s*\(([A-Za-z0-9]{2,8})\)\s*([^\s]+)?\s*$/);
      if (sm) {
        set = sm[1].toLowerCase();
        cn = sm[2] || null;
        line = line.slice(0, sm.index).trim();
      }
      if (/maybeboard|sideboard|considering/.test(cats) && !/commander/.test(cats)) continue;
      if (!line) continue;
      entries.push({
        qty: Math.max(1, Math.min(99, qty)),
        name: line,
        set,
        cn,
        isCommander: section === 'commander' || /commander/.test(cats) || isCmdrTag,
      });
    }
    if (!entries.length) throw new Error('Couldn\'t find any cards. Each line should look like "1 Sol Ring" or "1x Sol Ring (C21) 263".');
    return { name: name || 'Pasted deck', entries };
  }

  /* ------------------------------------------------------------ Scryfall */

  function templateFromScryfall(sc, entry) {
    const faces = Array.isArray(sc.card_faces) ? sc.card_faces : null;
    const frontImgs = sc.image_uris || (faces && faces[0] && faces[0].image_uris);
    const backImgs = !sc.image_uris && faces && faces[1] && faces[1].image_uris ? faces[1].image_uris : null;
    const front = faces ? faces[0] : sc;
    const pt = front.power != null ? `${front.power}/${front.toughness}` : front.loyalty != null ? `[${front.loyalty}]` : null;
    return {
      qty: entry.qty,
      isCommander: !!entry.isCommander,
      name: backImgs && faces ? faces[0].name : sc.name,
      backName: backImgs && faces ? faces[1].name : null,
      scryfallId: sc.id,
      set: sc.set,
      cn: sc.collector_number,
      img: (frontImgs && frontImgs.normal) || imageFromId(sc.id),
      backImg: backImgs ? backImgs.normal : null,
      typeLine: front.type_line || sc.type_line || '',
      pt,
      scryfallUri: sc.scryfall_uri ? sc.scryfall_uri.split('?')[0] : null,
      tokens: (sc.all_parts || [])
        .filter((p) => p.component === 'token' || /emblem/i.test(p.type_line || ''))
        .map((p) => ({ name: p.name, scryfallId: p.id })),
    };
  }

  function fallbackTemplate(entry) {
    const id = SCRYFALL_ID.test(entry.scryfallId || '') ? entry.scryfallId : null;
    return {
      qty: entry.qty,
      isCommander: !!entry.isCommander,
      name: entry.name || 'Unknown card',
      scryfallId: id,
      set: entry.set,
      cn: entry.cn,
      img: id ? imageFromId(id) : null,
      backImg: null,
      typeLine: '',
      scryfallUri: entry.set && entry.cn ? `https://scryfall.com/card/${entry.set}/${entry.cn}` : null,
      tokens: [],
    };
  }

  function identifierFor(e) {
    if (SCRYFALL_ID.test(e.scryfallId || '')) return { id: e.scryfallId };
    if (e.set && e.cn) return { set: String(e.set).toLowerCase(), collector_number: String(e.cn) };
    if (e.name) return { name: e.name.split(' // ')[0] };
    return null;
  }

  async function resolveWithScryfall(entries, onProgress) {
    const out = new Array(entries.length).fill(null);
    const missing = [];
    let todo = entries.map((e, i) => ({ i, ident: identifierFor(e) })).filter((x) => x.ident);
    for (let round = 0; round < 2 && todo.length; round++) {
      const retry = [];
      for (let start = 0; start < todo.length; start += 75) {
        const batch = todo.slice(start, start + 75);
        if (onProgress) onProgress(`Looking up cards on Scryfall… (${Math.min(start + 75, todo.length)}/${todo.length})`);
        const res = await getJSON('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: batch.map((b) => b.ident) }),
        });
        const byId = new Map();
        const bySetCn = new Map();
        const byName = new Map();
        for (const sc of res.data || []) {
          byId.set(sc.id, sc);
          bySetCn.set(`${sc.set}|${sc.collector_number}`.toLowerCase(), sc);
          byName.set(sc.name.toLowerCase(), sc);
          if (sc.card_faces) byName.set(sc.card_faces[0].name.toLowerCase(), sc);
        }
        for (const b of batch) {
          const id = b.ident;
          const sc = id.id
            ? byId.get(id.id)
            : id.set
              ? bySetCn.get(`${id.set}|${id.collector_number}`.toLowerCase())
              : byName.get(String(id.name).toLowerCase());
          if (sc) out[b.i] = templateFromScryfall(sc, entries[b.i]);
          else if (!id.name && entries[b.i].name) retry.push({ i: b.i, ident: { name: entries[b.i].name.split(' // ')[0] } });
          else missing.push(entries[b.i].name);
        }
        await sleep(120); // Scryfall asks for fewer than 10 requests per second
      }
      todo = retry;
    }
    return { cards: out.map((t, i) => t || fallbackTemplate(entries[i])), missing };
  }

  /** source: decklist text, or an Archidekt link. */
  async function importDeck(source, onProgress) {
    source = String(source || '').trim();
    if (!source) throw new Error('Paste a decklist first.');
    const id = archidektId(source);
    const parsed = id && source.split('\n').length === 1 ? await fetchArchidekt(id) : parseText(source);
    let resolved;
    try {
      resolved = await resolveWithScryfall(parsed.entries, onProgress);
    } catch (e) {
      resolved = { cards: parsed.entries.map(fallbackTemplate), missing: [], warning: `Couldn't reach Scryfall (${e.message}), so some art may be missing.` };
    }
    return {
      name: parsed.name,
      cards: resolved.cards,
      missing: resolved.missing,
      warning: resolved.warning || null,
      total: resolved.cards.reduce((s, c) => s + c.qty, 0),
      commanders: resolved.cards.filter((c) => c.isCommander).map((c) => c.name),
    };
  }

  async function searchTokens(q) {
    q = String(q || '').trim().slice(0, 60);
    if (!q) return [];
    const query = `(t:token or t:emblem) name:"${q.replace(/"/g, '')}"`;
    try {
      const res = await getJSON(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=art&include_extras=true&order=released&dir=desc`,
      );
      return (res.data || []).slice(0, 40).map((sc) => templateFromScryfall(sc, { qty: 1 }));
    } catch (e) {
      if (e.status === 404) return [];
      throw new Error(`Couldn't reach Scryfall (${e.message}).`);
    }
  }

  async function getCard(id) {
    if (!SCRYFALL_ID.test(id || '')) throw new Error('Bad card id.');
    return templateFromScryfall(await getJSON(`https://api.scryfall.com/cards/${id}`), { qty: 1 });
  }

  const api = { importDeck, searchTokens, getCard, parseText, archidektId, imageFromId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MTGImporter = api;
})(typeof window !== 'undefined' ? window : globalThis);
