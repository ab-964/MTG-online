/**
 * Everything you see and click: lobby, battlefield, hand, menus, dialogs.
 */
(function () {
  'use strict';

  const E = window.MTGEngine;
  const I = window.MTGImporter;
  const { Store, HostSession, GuestSession } = window.MTGNet;

  /* =============================================================== utils */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const large = (url) => (url ? url.replace('/normal/', '/large/') : url);
  const NAME_KEY = 'mtgtt.name';
  const DECKS_KEY = 'mtgtt.decks';

  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 5000 : 3000);
  }

  function relTime(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString();
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function scryfallUrl(c) {
    if (c.scryfallUri) return c.scryfallUri;
    if (c.set && c.cn) return `https://scryfall.com/card/${encodeURIComponent(c.set)}/${encodeURIComponent(c.cn)}`;
    return `https://scryfall.com/search?q=${encodeURIComponent(`!"${c.name}"`)}`;
  }

  /* ============================================================= dialogs */

  /**
   * dialog({ title, body (html string), buttons: [{label, value, primary, danger}], wide, onMount(root, close) })
   * Resolves with { value, root } (value null if dismissed).
   */
  function dialog({ title, body = '', buttons = [{ label: 'Close', value: null }], wide = false, onMount }) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">
        <h3>${esc(title)}</h3><div class="mb">${body}</div>
        <div class="mf">${buttons
          .map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${esc(b.label)}</button>`)
          .join('')}</div></div>`;
      const root = bg.querySelector('.modal');
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        bg.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve({ value, root });
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close(null);
        } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
          const p = buttons.findIndex((b) => b.primary);
          if (p >= 0) {
            e.preventDefault();
            close(buttons[p].value);
          }
        }
      };
      bg.addEventListener('pointerdown', (e) => {
        if (e.target === bg) close(null);
      });
      root.querySelector('.mf').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (b) close(buttons[Number(b.dataset.i)].value);
      });
      document.addEventListener('keydown', onKey, true);
      $('#modal-root').appendChild(bg);
      if (onMount) onMount(root, close);
      const first = root.querySelector('input, textarea, select');
      if (first) setTimeout(() => first.focus(), 30);
    });
  }

  async function askNumber(title, def = 1, label = '') {
    const { value, root } = await dialog({
      title,
      body: `<label class="form">${esc(label)}<input type="number" value="${def}" id="dlg-num" /></label>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }],
    });
    if (value !== 'ok') return null;
    const n = Number.parseInt(root.querySelector('#dlg-num').value, 10);
    return Number.isFinite(n) ? n : null;
  }

  async function askText(title, def = '', placeholder = '', label = '') {
    const { value, root } = await dialog({
      title,
      body: `<label class="form">${esc(label)}<input id="dlg-text" maxlength="80" value="${esc(def)}" placeholder="${esc(placeholder)}" /></label>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }],
    });
    if (value !== 'ok') return null;
    return root.querySelector('#dlg-text').value.trim();
  }

  async function confirmBox(title, text, okLabel = 'OK', danger = false) {
    const { value } = await dialog({
      title,
      body: `<p style="margin:0">${text}</p>`,
      buttons: [{ label: 'Cancel', value: null }, { label: okLabel, value: 'ok', primary: !danger, danger }],
    });
    return value === 'ok';
  }

  /* =============================================================== lobby */

  function showLobby() {
    $('#lobby').hidden = false;
    $('#game').hidden = true;
    const name = Store.get(NAME_KEY) || '';
    for (const f of ['#host-form', '#join-form']) $(f).elements.name.value = name;

    const list = $('#hosted-list');
    const games = Store.listGames();
    list.innerHTML = games.length
      ? games
          .map(
            (g) => `<div class="hosted">
              <div class="meta"><b>${esc(g.name)}</b>
                <span class="muted small">Code <b style="display:inline;color:var(--accent);letter-spacing:2px">${esc(g.id)}</b> ·
                ${g.format === 'commander' ? 'Commander' : '60-card'} · ${g.players.map((p) => esc(p.name)).join(', ')} · ${relTime(g.updatedAt)}</span></div>
              <button class="btn primary" data-host="${esc(g.id)}">Open &amp; host</button>
              <button class="btn ghost" data-backup="${esc(g.id)}" title="Download a backup file">Backup</button>
              <button class="btn ghost" data-del="${esc(g.id)}" title="Delete">🗑</button>
            </div>`,
          )
          .join('')
      : '<p class="muted">No hosted games yet.</p>';

    const seats = Store.keys('mtgtt.seat.')
      .map((k) => ({ code: k.slice('mtgtt.seat.'.length), ...(Store.get(k) || {}) }))
      .filter((s) => !Store.loadGame(s.code))
      .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))
      .slice(0, 6);
    $('#recent-joins').innerHTML = seats.length
      ? `<div class="recent muted">Rejoin: ${seats
          .map((s) => `<button class="btn small" data-rejoin="${esc(s.code)}">${esc(s.gameName || s.code)} (${esc(s.name || '')})</button>`)
          .join('')}</div>`
      : '';
  }

  function setupLobby() {
    $('#host-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const name = f.name.value.trim();
      if (!name) return;
      Store.set(NAME_KEY, name);
      const g = E.createGame({ name: f.game.value.trim() || `${name}'s game`, format: f.format.value });
      const { player } = E.joinGame(g, name);
      g.hostPlayerId = player.id;
      if (!Store.saveGame(g)) return toast('Could not save in this browser. Is private/incognito mode blocking storage?', 'error');
      location.href = `?host=${g.id}`;
    });
    $('#join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const name = f.name.value.trim();
      const code = f.code.value.trim().toUpperCase();
      if (!name || !code) return;
      Store.set(NAME_KEY, name);
      if (Store.loadGame(code)) return (location.href = `?host=${code}`);
      location.href = `?join=${code}`;
    });
    $('#lobby').addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.host) location.href = `?host=${b.dataset.host}`;
      if (b.dataset.rejoin) location.href = `?join=${b.dataset.rejoin}`;
      if (b.dataset.backup) {
        const g = Store.loadGame(b.dataset.backup);
        if (g) downloadJSON(g, `mtg-game-${g.id}-${new Date().toISOString().slice(0, 10)}.json`);
      }
      if (b.dataset.del) {
        if (await confirmBox('Delete game?', 'This permanently deletes the saved game from this browser.', 'Delete', true)) {
          Store.deleteGame(b.dataset.del);
          showLobby();
        }
      }
    });
    $('#restore-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const g = JSON.parse(await file.text());
        if (!g || !g.id || !Array.isArray(g.players) || !g.cards || !g.hostPlayerId) throw new Error('not a game file');
        if (Store.loadGame(g.id) && !(await confirmBox('Overwrite?', `A game with code ${esc(g.id)} already exists here. Replace it with the backup?`, 'Replace')))
          return;
        Store.saveGame(g);
        toast(`Restored "${g.name}".`);
        showLobby();
      } catch (err) {
        toast(`That file isn't a valid game backup (${err.message}).`, 'error');
      }
    });
  }

  /* ============================================================= session */

  let session = null;
  let S = null; // latest view from the host
  const views = {}; // battlefield camera per player id: {x, y, z, auto}
  let viewer = null; // open zone viewer state
  let hoveredId = null;
  let lastLogId = 0;

  function onStatus({ level, text }) {
    const el = $('#status');
    el.className = `status ${level}`;
    el.textContent = text;
    el.title = text;
  }

  function onState(view) {
    S = view;
    render();
  }

  async function act(action) {
    if (!session) return { error: 'Not connected.' };
    const r = await session.act(action);
    if (r && r.error) toast(r.error, 'error');
    return r || {};
  }

  function startHost(code) {
    const g = Store.loadGame(code);
    if (!g) {
      showLobby();
      return toast(`No saved game with code ${code} in this browser. To join a friend's game, use "Join a friend's game".`, 'error');
    }
    session = new HostSession(g, { onState, onStatus });
    showGame();
    session.start();
  }

  async function startJoin(code) {
    let name = Store.get(NAME_KEY) || (Store.getSeat(code) || {}).name;
    if (!name) {
      name = await askText('Your name', '', 'e.g. Sam', 'Pick a name for this game');
      if (!name) return showLobby();
      Store.set(NAME_KEY, name);
    }
    showGame();
    session = new GuestSession(code, name, {
      onState,
      onStatus,
      onNeedName: async () => {
        const n = await askText('Your name', '', '', 'Pick a name for this game');
        if (n) session.setName(n);
      },
      onJoinError: async (msg) => {
        toast(msg, 'error');
        const n = await askText('Pick another name', '', '', msg);
        if (n) session.setName(n);
      },
    });
    session.start();
  }

  function showGame() {
    $('#lobby').hidden = true;
    $('#game').hidden = false;
    try {
      if (localStorage.getItem('mtgtt.hideLog') === '1') $('#game').classList.add('no-log');
    } catch {
      /* ignore */
    }
  }

  /* ============================================================= render */

  const me = () => S && S.players.find((p) => p.id === S.you);
  const playerById = (id) => S && S.players.find((p) => p.id === id);
  const getCard = (id) => (S && S.cards[id]) || (viewer && viewer.map && viewer.map[id]) || null;

  function render() {
    if (!S) return;
    document.title = `${S.name} · MTG Tabletop`;
    $('#game-name').textContent = S.name;
    $('#btn-code').textContent = S.id;

    const mine = me();
    const opps = S.players.filter((p) => p.id !== S.you);

    // opponents' areas
    const oppBox = $('#opponents');
    for (const el of $$('.player-area', oppBox)) if (!opps.some((p) => p.id === el.dataset.pid)) el.remove();
    for (const p of opps) renderArea(oppBox, p, false);
    // my area
    const meBox = $('#me-area');
    if (mine) renderArea(meBox, mine, true);
    else meBox.innerHTML = '<p class="muted" style="margin:auto">You are not seated in this game.</p>';

    renderCenter();
    renderHandAndPiles(mine);
    renderLog();
    if (viewer) renderViewer();
  }

  function renderArea(parent, p, isMe) {
    let area = $(`.player-area[data-pid="${p.id}"]`, parent);
    if (!area) {
      area = document.createElement('div');
      area.className = 'player-area';
      area.dataset.pid = p.id;
      area.innerHTML = `<div class="ppanel"></div>
        <div class="bf" data-pid="${p.id}">
          <div class="bf-table" data-drop="bf" data-player="${p.id}">
            <div class="zone-hint" style="top:82px">CREATURES</div>
            <div class="zone-hint" style="top:332px">OTHER PERMANENTS</div>
            <div class="zone-hint" style="top:582px">LANDS</div>
            <div class="layer" style="position:absolute;inset:0"></div>
          </div>
          <div class="bf-owner"></div>
          <div class="bf-controls">
            <button class="btn tiny" data-zoom="out" title="Zoom out">−</button>
            <button class="btn tiny" data-zoom="fit" title="Fit whole battlefield">fit</button>
            <button class="btn tiny" data-zoom="in" title="Zoom in">+</button>
          </div>
        </div>`;
      parent.appendChild(area);
      const table = $('.bf-table', area);
      table.style.width = `${S.table.w}px`;
      table.style.height = `${S.table.h}px`;
      setupBattlefield($('.bf', area), p.id);
    }
    area.classList.toggle('active', S.turn.active === p.id);
    $('.ppanel', area).innerHTML = panelHTML(p, isMe);
    $('.bf-owner', area).textContent = isMe ? 'Your battlefield' : `${p.name}'s battlefield`;
    reconcile($('.layer', area), p.zones.battlefield, (id, el) => cardEl(S.cards[id], el, 'bf'));
  }

  function counterLabel(name, n) {
    if (name === '+1/+1') return { text: `+${n}/+${n}`, cls: 'plus' };
    if (name === '-1/-1') return { text: `-${n}/-${n}`, cls: 'minus' };
    return { text: `${name} ${n}`, cls: '' };
  }

  function panelHTML(p, isMe) {
    const rows = [];
    rows.push(`<div class="pname"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}${isMe ? ' (you)' : ''}
      <span class="online ${p.connected ? 'on' : ''}">${p.connected ? '● online' : '○ offline'}</span></div>`);
    if (p.deckName) rows.push(`<div class="deckname" title="${esc(p.deckName)}">${esc(p.deckName)}</div>`);
    rows.push(`<div class="life" title="Click ± to change life (Shift = 5). Click the number to set it.">
      <button class="btn" data-act="life" data-pid="${p.id}" data-d="-1">−</button>
      <span class="val" data-act="setlife" data-pid="${p.id}">${p.life}</span>
      <button class="btn" data-act="life" data-pid="${p.id}" data-d="1">+</button></div>`);
    const counters = Object.entries(p.counters || {});
    for (const [k, v] of counters)
      rows.push(`<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span>
        <button class="btn tiny" data-act="pc" data-pid="${p.id}" data-name="${esc(k)}" data-d="-1">−</button>
        <button class="btn tiny" data-act="pc" data-pid="${p.id}" data-name="${esc(k)}" data-d="1">+</button></div>`);
    rows.push(`<button class="btn small" data-act="pc-add" data-pid="${p.id}">+ player counter</button>`);

    if (S.format === 'commander') {
      const sources = new Map();
      for (const c of Object.values(S.cards)) if (c.isCommander && c.owner !== p.id && !c.isToken) sources.set(c.id, c);
      for (const id of Object.keys(p.cmdDamage || {})) if (S.cards[id]) sources.set(id, S.cards[id]);
      if (sources.size) {
        rows.push('<div class="sect-title">Commander damage taken</div>');
        for (const c of sources.values()) {
          const v = (p.cmdDamage || {})[c.id] || 0;
          rows.push(`<div class="kv" title="${esc(c.name)}"><span class="k">${esc(c.name)}</span><span class="v" style="${v >= 21 ? 'color:var(--bad)' : ''}">${v}</span>
            <button class="btn tiny" data-act="cmd" data-pid="${p.id}" data-src="${c.id}" data-d="-1">−</button>
            <button class="btn tiny" data-act="cmd" data-pid="${p.id}" data-src="${c.id}" data-d="1">+</button></div>`);
        }
      }
    }

    if (!isMe) {
      const z = p.zones;
      rows.push(`<div class="zones">
        <button class="zbtn" data-act="zone" data-pid="${p.id}" data-zone="hand" data-drop="zone" data-zone-target="hand">Hand <b>${p.handCount}</b></button>
        <button class="zbtn" data-act="zone" data-pid="${p.id}" data-zone="library" data-drop="zone" data-zone-target="library">Library <b>${p.libraryCount}</b></button>
        <button class="zbtn" data-act="zone" data-pid="${p.id}" data-zone="graveyard" data-drop="zone" data-zone-target="graveyard">Grave <b>${z.graveyard.length}</b></button>
        <button class="zbtn" data-act="zone" data-pid="${p.id}" data-zone="exile" data-drop="zone" data-zone-target="exile">Exile <b>${z.exile.length}</b></button>
        ${S.format === 'commander' || z.command.length ? `<button class="zbtn" data-act="zone" data-pid="${p.id}" data-zone="command" data-drop="zone" data-zone-target="command">Command <b>${z.command.length}</b></button>` : ''}
      </div>`);
      const flags = [];
      if (p.handRevealed) flags.push('hand revealed');
      if (p.revealTop) flags.push('top of library revealed');
      if (flags.length) rows.push(`<div class="muted small">${flags.join(' · ')}</div>`);
      if (p.topCard && S.cards[p.topCard])
        rows.push(`<div class="muted small">Top card: <a href="${esc(scryfallUrl(S.cards[p.topCard]))}" target="_blank" rel="noopener">${esc(S.cards[p.topCard].name)}</a></div>`);
    } else {
      rows.push(`<div class="muted small">Hand ${p.handCount} · Library ${p.libraryCount}${p.handRevealed ? ' · hand revealed' : ''}</div>`);
    }
    return rows.join('');
  }

  function renderCenter() {
    const active = playerById(S.turn.active);
    const mineTurn = S.turn.active === S.you;
    $('#turn-label').innerHTML = `Turn ${S.turn.number} · ${active ? (mineTurn ? '<span style="color:var(--accent)">Your turn</span>' : `${esc(active.name)}'s turn`) : '—'}`;
    $('#phases').innerHTML = S.phases
      .map((ph, i) => `<span class="phase ${i === S.turn.phase ? 'on' : ''}" data-act="phase" data-i="${i}">${esc(ph)}</span>`)
      .join('');
    $('#btn-pass').textContent = mineTurn ? 'Pass turn ▶' : `End ${active ? active.name : ''}'s turn ▶`;
    reconcile($('#stack'), S.stack, (id, el) => cardEl(S.cards[id], el, 'stack'));
  }

  function renderHandAndPiles(mine) {
    const hand = $('#hand');
    const ids = (mine && mine.zones.hand) || [];
    reconcile(hand, ids, (id, el) => cardEl(S.cards[id], el, 'hand'));
    const n = ids.length;
    const avail = hand.clientWidth - 24;
    const ov = n > 1 ? clamp((avail - 110) / (n - 1) - 110, -92, -4) : 0;
    hand.style.setProperty('--ov', `${Math.round(ov)}px`);

    if (!mine) return ($('#piles').innerHTML = '');
    const z = mine.zones;
    const top = (arr) => (arr.length ? S.cards[arr[arr.length - 1]] : null);
    const pile = (zone, label, count, inner, extra = '') =>
      `<div class="pile ${extra}"><div class="slot" data-drop="zone" data-zone-target="${zone}" data-pile="${zone}">${inner || label}</div>
        <div class="lbl">${label} <b>${count}</b></div></div>`;

    const libTop = mine.revealTop && mine.topCard && S.cards[mine.topCard];
    const libInner = mine.libraryCount
      ? libTop
        ? `<div class="card" data-id="${libTop.id}" data-ctx="libtop" style="left:-2px;top:-2px"><img src="${esc(libTop.img)}" draggable="false" alt=""></div>`
        : '<div class="back">✦</div>'
      : '';
    const gy = top(z.graveyard);
    const ex = top(z.exile);
    const cmd = z.command.map((id) => S.cards[id]).filter(Boolean);
    let html = pile('library', 'Library', mine.libraryCount, libInner);
    html += pile('graveyard', 'Graveyard', z.graveyard.length, gy ? cardHTML(gy, 'pile') : '');
    html += pile('exile', 'Exile', z.exile.length, ex ? cardHTML(ex, 'pile') : '');
    if (S.format === 'commander' || cmd.length) html += pile('command', 'Command', cmd.length, cmd.length ? cardHTML(cmd[0], 'pile') : '', 'cmd');
    $('#piles').innerHTML = html;
  }

  function renderLog() {
    const log = $('#log');
    const entries = S.log || [];
    const firstId = entries.length ? entries[0].id : 0;
    if (!entries.length || firstId > lastLogId + 1 || entries[entries.length - 1].id < lastLogId) {
      log.innerHTML = '';
      lastLogId = 0;
    }
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    for (const e of entries) {
      if (e.id <= lastLogId) continue;
      const d = document.createElement('div');
      d.className = `e ${e.kind ? `k-${e.kind}` : ''}`;
      const time = new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      d.innerHTML =
        e.kind === 'chat'
          ? `<span class="t">${time}</span><b style="color:${esc(e.color)}">${esc(e.who)}:</b> ${esc(e.text)}`
          : `<span class="t">${time}</span>${esc(e.text)}`;
      log.appendChild(d);
      lastLogId = e.id;
    }
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  /* -------------------------------------------------------------- cards */

  function cardInner(c) {
    if (!c) return '<div class="back">?</div>';
    if (c.hidden) return '<div class="back">✦</div>';
    const src = c.flipped && c.backImg ? c.backImg : c.img;
    const shownName = c.flipped && c.backName ? c.backName : c.name;
    let html = src
      ? `<img src="${esc(src)}" alt="${esc(shownName)}" draggable="false" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:this.alt}))" ${c.faceDown ? 'style="opacity:.45;filter:grayscale(1)"' : ''}>`
      : `<div class="fallback">${esc(shownName)}<span class="tl">${esc(c.typeLine || '')}</span>${c.pt ? `<span class="tl">${esc(c.pt)}</span>` : ''}</div>`;
    const tags = [];
    if (c.faceDown) tags.push('<span class="tag">face-down</span>');
    if (c.isToken) tags.push('<span class="tag token">token</span>');
    if (c.isCommander && c.zone === 'command' && c.castCount) tags.push(`<span class="tag tax">tax +${c.castCount * 2}</span>`);
    if (tags.length) html += `<div class="tags">${tags.join('')}</div>`;
    const ctr = Object.entries(c.counters || {});
    if (ctr.length)
      html += `<div class="badges">${ctr
        .map(([k, v]) => {
          const l = counterLabel(k, v);
          return `<span class="badge ${l.cls}">${esc(l.text)}</span>`;
        })
        .join('')}</div>`;
    if (c.note) html += `<div class="note">${esc(c.note)}</div>`;
    return html;
  }

  function cardHTML(c, ctx) {
    return `<div class="card" data-id="${esc(c.id)}" data-ctx="${ctx}">${cardInner(c)}</div>`;
  }

  /** Create or update a card element (keeps the same element so images don't reload). */
  function cardEl(c, el, ctx) {
    if (!el) {
      el = document.createElement('div');
      el.className = 'card';
    }
    if (!c) return el;
    el.dataset.id = c.id;
    el.dataset.ctx = ctx;
    if (ctx === 'bf') {
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;
    }
    el.classList.toggle('tapped', ctx === 'bf' && !!c.tapped);
    const inner = cardInner(c);
    if (el._sig !== inner) {
      el.innerHTML = inner;
      el._sig = inner;
    }
    return el;
  }

  /** Keep a container's children in the same order as ids, reusing elements. */
  function reconcile(container, ids, build) {
    const existing = new Map();
    for (const el of [...container.children]) if (el.dataset.key) existing.set(el.dataset.key, el);
    let prev = null;
    for (const id of ids) {
      let el = existing.get(id);
      existing.delete(id);
      el = build(id, el);
      el.dataset.key = id;
      const want = prev ? prev.nextSibling : container.firstChild;
      if (want !== el) container.insertBefore(el, want);
      prev = el;
    }
    for (const el of existing.values()) el.remove();
  }

  /* -------------------------------------------------------- battlefield */

  function setupBattlefield(bf, pid) {
    views[pid] = views[pid] || { x: 0, y: 0, z: 0.5, auto: true };
    const ro = new ResizeObserver(() => {
      if (views[pid].auto) fitView(pid);
    });
    ro.observe(bf);
    bf.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        zoomAt(pid, Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      },
      { passive: false },
    );
    bf.querySelector('.bf-controls').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const r = bf.getBoundingClientRect();
      if (b.dataset.zoom === 'fit') fitView(pid);
      else zoomAt(pid, b.dataset.zoom === 'in' ? 1.25 : 0.8, r.left + r.width / 2, r.top + r.height / 2);
    });
  }

  function bfEl(pid) {
    return $(`.bf[data-pid="${pid}"]`);
  }

  function applyView(pid) {
    const bf = bfEl(pid);
    if (!bf) return;
    const v = views[pid];
    bf.querySelector('.bf-table').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }

  function fitView(pid) {
    const bf = bfEl(pid);
    if (!bf || !S) return;
    const r = bf.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const z = Math.min(r.width / S.table.w, r.height / S.table.h) * 0.98;
    views[pid] = { z, x: (r.width - S.table.w * z) / 2, y: (r.height - S.table.h * z) / 2, auto: true };
    applyView(pid);
  }

  function zoomAt(pid, factor, cx, cy) {
    const bf = bfEl(pid);
    const v = views[pid];
    if (!bf || !v) return;
    const r = bf.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    const nz = clamp(v.z * factor, 0.15, 3);
    v.x = px - ((px - v.x) * nz) / v.z;
    v.y = py - ((py - v.y) * nz) / v.z;
    v.z = nz;
    v.auto = false;
    applyView(pid);
  }

  /* ================================================== pointer: drag / pan */

  let drag = null;
  let pan = null;

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-drop]') : null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    hideMenu(e);
    const el = e.target.closest('.card[data-id]');
    if (el && !el.closest('.token-results')) {
      const c = getCard(el.dataset.id);
      if (!c) return;
      const r = el.getBoundingClientRect();
      let offX = 50;
      let offY = 70;
      if (!el.classList.contains('tapped')) {
        offX = ((e.clientX - r.left) / r.width) * 100;
        offY = ((e.clientY - r.top) / r.height) * 140;
      }
      drag = { id: c.id, card: c, el, ctx: el.dataset.ctx, sx: e.clientX, sy: e.clientY, offX, offY, started: false, w: r.width, h: r.height };
      if (el.classList.contains('tapped')) {
        drag.w = r.height;
        drag.h = r.width;
      }
      return;
    }
    const bf = e.target.closest('.bf');
    if (bf && !e.target.closest('.bf-controls')) {
      const v = views[bf.dataset.pid];
      pan = { pid: bf.dataset.pid, bf, sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y };
      bf.classList.add('panning');
      e.preventDefault();
    }
    const vh = e.target.closest('.viewer .vh');
    if (vh && !e.target.closest('button')) {
      const box = $('#viewer').getBoundingClientRect();
      pan = { viewer: true, sx: e.clientX, sy: e.clientY, ox: box.left, oy: box.top };
      e.preventDefault();
    }
  });

  let lastHoverTarget = null;
  document.addEventListener('pointermove', (e) => {
    if (pan) {
      if (pan.viewer) {
        const v = $('#viewer');
        v.style.left = `${pan.ox + e.clientX - pan.sx}px`;
        v.style.top = `${Math.max(48, pan.oy + e.clientY - pan.sy)}px`;
        v.style.right = 'auto';
        return;
      }
      const v = views[pan.pid];
      v.x = pan.ox + e.clientX - pan.sx;
      v.y = pan.oy + e.clientY - pan.sy;
      v.auto = false;
      applyView(pan.pid);
      return;
    }
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.started = true;
      hidePreview();
      document.body.style.userSelect = 'none';
      const g = document.createElement('div');
      g.className = 'drag-ghost card';
      g.style.width = `${drag.w}px`;
      g.style.height = `${drag.h}px`;
      g.innerHTML = cardInner(drag.card);
      document.body.appendChild(g);
      drag.ghost = g;
      drag.el.classList.add('dragging-src');
    }
    const g = drag.ghost;
    g.style.left = `${e.clientX - (drag.offX / 100) * drag.w}px`;
    g.style.top = `${e.clientY - (drag.offY / 140) * drag.h}px`;
    const t = dropTargetAt(e.clientX, e.clientY);
    const hl = t && t.dataset.drop !== 'bf' ? t : null;
    if (hl !== lastHoverTarget) {
      if (lastHoverTarget) lastHoverTarget.classList.remove('drop-hover');
      if (hl) hl.classList.add('drop-hover');
      lastHoverTarget = hl;
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (pan) {
      if (pan.bf) pan.bf.classList.remove('panning');
      pan = null;
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    document.body.style.userSelect = '';
    if (lastHoverTarget) lastHoverTarget.classList.remove('drop-hover');
    lastHoverTarget = null;
    if (!d.started) {
      // a plain click
      if (d.ctx === 'bf') act({ type: 'tap', cardId: d.id });
      else if (d.ctx === 'pile') {
        const pileEl = d.el.closest('[data-pile]');
        if (pileEl) openViewer(S.you, pileEl.dataset.pile);
      } else if (d.ctx === 'libtop') act({ type: 'draw', n: 1 });
      return;
    }
    d.el.classList.remove('dragging-src');
    if (d.ghost) d.ghost.remove();
    const t = dropTargetAt(e.clientX, e.clientY);
    if (t) dropOn(d, t, e.clientX, e.clientY);
  });

  function dropOn(d, t, cx, cy) {
    const c = d.card;
    switch (t.dataset.drop) {
      case 'bf': {
        const pid = t.dataset.player;
        const r = t.getBoundingClientRect();
        const z = views[pid].z;
        const x = clamp((cx - r.left) / z - d.offX, 0, S.table.w - S.table.cardW);
        const y = clamp((cy - r.top) / z - d.offY, 0, S.table.h - S.table.cardH);
        if (c.zone === 'battlefield' && c.zp === pid) {
          d.el.style.left = `${x}px`; // feel instant
          d.el.style.top = `${y}px`;
          act({ type: 'position', cardId: c.id, x, y });
        } else act({ type: 'move', cardId: c.id, to: 'battlefield', playerId: pid, x, y });
        break;
      }
      case 'zone': {
        const to = t.dataset.zoneTarget;
        if (to === c.zone && (c.zp === S.you || to !== 'battlefield')) return;
        act({ type: 'move', cardId: c.id, to, pos: 'top' });
        break;
      }
      case 'hand':
        if (c.zone !== 'hand' || c.zp !== S.you) act({ type: 'move', cardId: c.id, to: 'hand' });
        break;
      case 'stack':
        if (c.zone !== 'stack') act({ type: 'move', cardId: c.id, to: 'stack' });
        break;
      default:
        break;
    }
  }

  document.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.card[data-id]');
    if (!el) return;
    const c = getCard(el.dataset.id);
    if (!c) return;
    const ctx = el.dataset.ctx;
    if (ctx === 'hand') act({ type: 'move', cardId: c.id, to: 'battlefield' });
    else if (ctx === 'stack') resolveStack(c);
    else if (ctx === 'viewer') act({ type: 'move', cardId: c.id, to: 'hand' });
  });

  function resolveStack(c) {
    const permanent = /\b(Creature|Artifact|Enchantment|Planeswalker|Land|Battle)\b/.test(c.typeLine || '');
    act({ type: 'move', cardId: c.id, to: permanent ? 'battlefield' : 'graveyard' });
  }

  /* ============================================================ preview */

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || drag) return;
    const el = e.target.closest('.card[data-id]');
    if (!el || el.closest('.drag-ghost')) return;
    hoveredId = el.dataset.id;
    showPreview(getCard(el.dataset.id), e.clientX);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest('.card[data-id]');
    if (el && !el.contains(e.relatedTarget)) {
      hoveredId = null;
      hidePreview();
    }
  });

  function showPreview(c, cx) {
    const p = $('#preview');
    if (!c || c.hidden) return hidePreview();
    const imgs = [];
    if (c.img) imgs.push(c.flipped && c.backImg ? c.backImg : c.img);
    if (c.backImg) imgs.push(c.flipped ? c.img : c.backImg);
    const info = [];
    if (c.note) info.push(`Note: ${c.note}`);
    if (c.isCommander && c.castCount) info.push(`Commander tax: +${c.castCount * 2}`);
    p.innerHTML = imgs.length
      ? imgs.map((u) => `<img src="${esc(large(u))}" alt="">`).join('') + (info.length ? `<div class="pinfo">${esc(info.join(' · '))}</div>` : '')
      : `<div class="ptext"><b>${esc(c.name)}</b><br><span class="muted">${esc(c.typeLine || '')}</span>${c.pt ? `<br>${esc(c.pt)}` : ''}</div>`;
    p.hidden = false;
    const w = imgs.length > 1 ? 608 : 300;
    const left = cx < innerWidth / 2 ? innerWidth - w - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--side'), 10) || 0) - 20 : 16;
    p.style.left = `${Math.max(8, left)}px`;
    p.style.top = '60px';
  }
  function hidePreview() {
    $('#preview').hidden = true;
  }

  /* ======================================================= context menus */

  function showMenu(items, x, y) {
    const m = $('#menu');
    m.innerHTML = '';
    for (const it of items) {
      if (!it) continue;
      if (it.sep) {
        m.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
        continue;
      }
      if (it.header) {
        m.insertAdjacentHTML('beforeend', `<div class="mh">${esc(it.header)}</div>`);
        continue;
      }
      if (it.href) {
        m.insertAdjacentHTML('beforeend', `<a class="mi" href="${esc(it.href)}" target="_blank" rel="noopener">${esc(it.label)}</a>`);
        continue;
      }
      const b = document.createElement('button');
      b.className = `mi ${it.disabled ? 'disabled' : ''}`;
      b.textContent = it.label;
      b.addEventListener('click', () => {
        m.hidden = true;
        it.fn();
      });
      m.appendChild(b);
    }
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = `${clamp(x, 4, innerWidth - r.width - 4)}px`;
    m.style.top = `${clamp(y, 4, innerHeight - r.height - 4)}px`;
  }
  function hideMenu(e) {
    if (e && e.target.closest && e.target.closest('#menu')) return;
    $('#menu').hidden = true;
  }
  document.addEventListener('scroll', () => hideMenu(), true);

  document.addEventListener('contextmenu', (e) => {
    if ($('#game').hidden) return;
    if (e.target.closest('input, textarea')) return;
    const cardElm = e.target.closest('.card[data-id]');
    let items = null;
    if (cardElm) {
      const c = getCard(cardElm.dataset.id);
      if (c) items = cardMenu(c, cardElm.dataset.ctx);
    } else if (e.target.closest('[data-pile="library"]')) items = libraryMenu();
    else if (e.target.closest('[data-pile="graveyard"]')) items = zoneBulkMenu('graveyard');
    else if (e.target.closest('[data-pile="exile"]')) items = zoneBulkMenu('exile');
    else if (e.target.closest('#hand')) items = handMenu();
    else if (e.target.closest('.bf')) items = battlefieldMenu(e.target.closest('.bf').dataset.pid);
    if (!items) return;
    e.preventDefault();
    hidePreview();
    showMenu(items, e.clientX, e.clientY);
  });

  function cardMenu(c, ctx) {
    const items = [];
    const onBf = c.zone === 'battlefield';
    items.push({ header: c.hidden ? 'Face-down card' : c.flipped && c.backName ? c.backName : c.name });
    if (onBf) {
      items.push({ label: c.tapped ? 'Untap  (T)' : 'Tap  (T)', fn: () => act({ type: 'tap', cardId: c.id }) });
      if (c.backImg) items.push({ label: 'Transform / flip  (F)', fn: () => act({ type: 'flip', cardId: c.id }) });
      items.push({ label: c.faceDown ? 'Turn face up' : 'Turn face down', fn: () => act({ type: 'faceDown', cardId: c.id }) });
      items.push({ label: 'Counters…', fn: () => countersDialog(c.id) });
      items.push({ label: 'Add +1/+1 counter', fn: () => act({ type: 'cardCounter', cardId: c.id, name: '+1/+1', delta: 1 }) });
      items.push({ label: c.note ? 'Edit note…' : 'Add note… (e.g. "+2/+2 until EOT")', fn: () => noteDialog(c) });
      if (!c.hidden) items.push({ label: 'Create a token copy', fn: () => act({ type: 'clone', cardId: c.id }) });
      for (const p of S.players)
        if (p.id !== c.zp) items.push({ label: `Give control to ${p.name}`, fn: () => act({ type: 'move', cardId: c.id, to: 'battlefield', playerId: p.id }) });
    } else if (c.zone === 'stack') {
      items.push({ label: 'Resolve (to battlefield or graveyard)', fn: () => resolveStack(c) });
    } else if (c.backImg && !c.hidden) {
      items.push({ label: 'Transform / flip', fn: () => act({ type: 'flip', cardId: c.id }) });
    }
    if (c.tokens && c.tokens.length) {
      items.push({ sep: true });
      for (const t of c.tokens.slice(0, 6)) items.push({ label: `Create token: ${t.name}`, fn: () => createRelatedToken(t) });
    }
    items.push({ sep: true });
    items.push({ header: 'Move to' });
    const mv = (label, to, extra = {}) => ({ label, fn: () => act({ type: 'move', cardId: c.id, to, ...extra }) });
    if (!onBf) items.push(mv('Battlefield', 'battlefield', { playerId: S.you }));
    if (ctx === 'hand') items.push(mv('Battlefield face down', 'battlefield', { playerId: S.you, faceDown: true }));
    if (c.zone !== 'stack') items.push(mv('Stack', 'stack'));
    if (c.zone !== 'hand') items.push(mv("Owner's hand", 'hand'));
    if (c.zone !== 'graveyard') items.push(mv('Graveyard', 'graveyard'));
    if (c.zone !== 'exile') items.push(mv('Exile', 'exile'));
    if (c.zone !== 'exile') items.push(mv('Exile face down', 'exile', { faceDown: true }));
    items.push(mv('Top of library', 'library', { pos: 'top' }));
    items.push(mv('Bottom of library', 'library', { pos: 'bottom' }));
    if (c.zone !== 'command' && (c.isCommander || S.format === 'commander')) items.push(mv('Command zone', 'command'));
    if (!c.hidden) {
      items.push({ sep: true });
      items.push({ label: 'Open on Scryfall ↗', href: scryfallUrl(c) });
    }
    return items;
  }

  function libraryMenu() {
    const m = me();
    return [
      { header: `Your library (${m ? m.libraryCount : 0})` },
      { label: 'Draw a card  (D)', fn: () => act({ type: 'draw', n: 1 }) },
      { label: 'Draw X…', fn: async () => { const n = await askNumber('Draw how many?', 2); if (n) act({ type: 'draw', n }); } },
      { label: 'Shuffle', fn: () => act({ type: 'shuffle' }) },
      { label: 'Search library…', fn: () => openViewer(S.you, 'library') },
      { label: 'Look at top X… (scry / surveil)', fn: async () => { const n = await askNumber('Look at how many cards from the top?', 3); if (n) openViewer(S.you, 'library', n); } },
      { label: 'Mill X…', fn: async () => { const n = await askNumber('Mill how many?', 1); if (n) act({ type: 'mill', n }); } },
      { label: 'Exile top card', fn: () => act({ type: 'exileTop', n: 1 }) },
      { label: 'Exile top card face down', fn: () => act({ type: 'exileTop', n: 1, faceDown: true }) },
      { label: m && m.revealTop ? 'Stop revealing top card' : 'Play with top card revealed', fn: () => act({ type: 'revealTop' }) },
      { sep: true },
      {
        label: 'Mulligan (shuffle hand in, draw 7)',
        fn: async () => {
          if (await confirmBox('Mulligan?', 'Shuffle your hand into your library and draw 7. Then put cards on the bottom yourself (right-click → Bottom of library).', 'Mulligan'))
            act({ type: 'mulligan' });
        },
      },
    ];
  }

  function zoneBulkMenu(zone) {
    return [
      { header: `Your ${zone}` },
      { label: 'View', fn: () => openViewer(S.you, zone) },
      { label: 'Shuffle all into library', fn: () => act({ type: 'moveZone', from: zone, to: 'library' }) },
      zone === 'graveyard' ? { label: 'Exile all', fn: () => act({ type: 'moveZone', from: zone, to: 'exile' }) } : null,
      { label: 'Return all to hand', fn: () => act({ type: 'moveZone', from: zone, to: 'hand' }) },
    ];
  }

  function handMenu() {
    const m = me();
    return [
      { header: 'Your hand' },
      { label: m && m.handRevealed ? 'Hide hand' : 'Reveal hand to everyone', fn: () => act({ type: 'revealHand' }) },
      { label: 'Discard whole hand', fn: () => act({ type: 'moveZone', from: 'hand', to: 'graveyard' }) },
      { label: 'Shuffle hand into library', fn: () => act({ type: 'moveZone', from: 'hand', to: 'library' }) },
    ];
  }

  function battlefieldMenu(pid) {
    const p = playerById(pid);
    return [
      { header: pid === S.you ? 'Your battlefield' : `${p ? p.name : ''}'s battlefield` },
      { label: 'Untap all', fn: () => act({ type: 'untapAll', playerId: pid }) },
      { label: 'Create token…', fn: () => tokenDialog(pid) },
      { label: 'Fit to screen', fn: () => fitView(pid) },
    ];
  }

  /* ============================================================ dialogs */

  async function createRelatedToken(t) {
    let tpl = { name: t.name, scryfallId: t.scryfallId };
    try {
      if (t.scryfallId) tpl = await I.getCard(t.scryfallId);
    } catch {
      /* use name + id only */
    }
    act({ type: 'createToken', ...tpl, count: 1 });
  }

  function countersDialog(cardId) {
    const QUICK = ['+1/+1', '-1/-1', 'loyalty', 'charge', 'shield', 'stun', 'lore', 'time', 'oil', 'finality', 'flying', 'deathtouch'];
    dialog({
      title: 'Counters',
      body: `<div id="ctr-list"></div>
        <div class="sect-title">Add a counter</div>
        <div class="quick">${QUICK.map((q) => `<button class="btn small" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="row gap"><input id="ctr-custom" placeholder="Other counter name" maxlength="20" style="flex:1"><button class="btn" id="ctr-add">Add</button></div>`,
      buttons: [{ label: 'Done', value: null, primary: true }],
      onMount(root) {
        const draw = () => {
          const c = getCard(cardId);
          if (!c) return;
          const entries = Object.entries(c.counters || {});
          root.querySelector('#ctr-list').innerHTML = entries.length
            ? `<div class="counter-grid">${entries
                .map(
                  ([k, v]) => `<span>${esc(k)}</span><button class="btn tiny" data-k="${esc(k)}" data-d="-1">−</button><b>${v}</b><button class="btn tiny" data-k="${esc(k)}" data-d="1">+</button>`,
                )
                .join('')}</div>`
            : '<p class="muted" style="margin:0">No counters yet.</p>';
        };
        draw();
        const bump = async (name, delta) => {
          await act({ type: 'cardCounter', cardId, name, delta });
          draw();
        };
        root.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.q) bump(b.dataset.q, 1);
          else if (b.dataset.k) bump(b.dataset.k, Number(b.dataset.d));
          else if (b.id === 'ctr-add') {
            const v = root.querySelector('#ctr-custom').value.trim();
            if (v) bump(v, 1);
          }
        });
      },
    });
  }

  async function noteDialog(c) {
    const t = await askText('Note on card', c.note || '', 'e.g. +2/+2 until end of turn, attacking, enchanted by …', 'Leave empty to remove the note');
    if (t !== null) act({ type: 'note', cardId: c.id, text: t });
  }

  function tokenDialog(pid = S.you) {
    dialog({
      title: 'Create a token',
      wide: true,
      body: `<div class="row gap"><input id="tk-q" placeholder="Search Scryfall tokens, e.g. Treasure, Zombie, Soldier" style="flex:1"><button class="btn primary" id="tk-go">Search</button>
          <label class="row gap small muted">How many <input id="tk-n" type="number" value="1" min="1" max="30" style="width:64px"></label></div>
        <div class="quick">${['Treasure', 'Clue', 'Food', 'Soldier', 'Zombie', 'Goblin', 'Spirit', 'Beast', 'Saproling', 'Blood', 'Map']
          .map((q) => `<button class="btn small" data-q="${q}">${q}</button>`)
          .join('')}</div>
        <div id="tk-res" class="token-results"></div>
        <div class="sect-title">…or make your own</div>
        <div class="row gap"><input id="tk-name" placeholder="Name, e.g. Elemental" style="flex:1"><input id="tk-pt" placeholder="P/T e.g. 3/3" style="width:110px"><button class="btn" id="tk-custom">Create</button></div>`,
      buttons: [{ label: 'Close', value: null }],
      onMount(root, close) {
        let results = [];
        const count = () => clamp(Number.parseInt(root.querySelector('#tk-n').value, 10) || 1, 1, 30);
        const search = async (q) => {
          const box = root.querySelector('#tk-res');
          box.innerHTML = '<p class="muted">Searching…</p>';
          try {
            results = await I.searchTokens(q);
            box.innerHTML = results.length
              ? results.map((t, i) => `<button data-i="${i}" title="${esc(t.name)} ${esc(t.typeLine)}"><img src="${esc(t.img)}" alt="${esc(t.name)}" loading="lazy"></button>`).join('')
              : '<p class="muted">No tokens found. Make your own below.</p>';
          } catch (err) {
            box.innerHTML = `<p class="err">${esc(err.message)}</p>`;
          }
        };
        root.querySelector('#tk-q').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            search(e.target.value);
          }
        });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.id === 'tk-go') search(root.querySelector('#tk-q').value);
          else if (b.dataset.q) {
            root.querySelector('#tk-q').value = b.dataset.q;
            search(b.dataset.q);
          } else if (b.dataset.i) {
            act({ type: 'createToken', ...results[Number(b.dataset.i)], count: count(), playerId: pid });
            close(null);
          } else if (b.id === 'tk-custom') {
            const name = root.querySelector('#tk-name').value.trim();
            if (!name) return;
            const pt = root.querySelector('#tk-pt').value.trim();
            act({ type: 'createToken', name, pt, typeLine: `Token${pt ? ' Creature' : ''}`, count: count(), playerId: pid });
            close(null);
          }
        });
      },
    });
  }

  function savedDecks() {
    return Store.get(DECKS_KEY) || [];
  }
  function rememberDeck(deck) {
    const list = savedDecks().filter((d) => d.name !== deck.name);
    list.unshift({ name: deck.name, cards: deck.cards, savedAt: Date.now() });
    Store.set(DECKS_KEY, list.slice(0, 12));
  }

  function deckDialog() {
    const saved = savedDecks();
    dialog({
      title: 'Load a deck',
      wide: true,
      body: `<p class="muted small" style="margin:0">On Archidekt open your deck → <b>Export</b> → choose the text format that includes set codes
          (lines look like <code>1x Sol Ring (c21) 263</code>) → copy, and paste it below. The set code + number gives you the exact art you picked.
          Lists from Moxfield, MTG Arena or plain <code>1 Sol Ring</code> lines work too. Put commanders under a <code>Commander</code> heading,
          or keep Archidekt's <code>[Commander]</code> tag.</p>
        <label class="form">Deck name <input id="dk-name" placeholder="My deck" maxlength="80"></label>
        <textarea id="dk-text" placeholder="Commander\n1x Atraxa, Praetors' Voice (2x2) 190\n\nDeck\n1x Sol Ring (c21) 263\n1x Command Tower (c21) 284\n..."></textarea>
        <div id="dk-msg"></div>
        ${saved.length ? `<div class="sect-title">Decks you imported before</div><div class="quick">${saved.map((d, i) => `<button class="btn small" data-saved="${i}">${esc(d.name)}</button>`).join('')}</div>` : ''}`,
      buttons: [{ label: 'Cancel', value: null }],
      onMount(root, close) {
        const mf = root.querySelector('.mf');
        const go = document.createElement('button');
        go.className = 'btn primary';
        go.textContent = 'Import';
        mf.appendChild(go);
        const msg = root.querySelector('#dk-msg');
        let imported = null;
        const load = async (deck) => {
          const r = await act({ type: 'loadDeck', deck });
          if (!r.error) {
            toast(`Loaded "${deck.name}". Click "Start / restart game" when everyone is ready.`);
            close(null);
          }
        };
        root.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-saved]');
          if (b) load(saved[Number(b.dataset.saved)]);
        });
        go.addEventListener('click', async () => {
          if (imported) {
            imported.name = root.querySelector('#dk-name').value.trim() || imported.name;
            rememberDeck(imported);
            return load(imported);
          }
          go.disabled = true;
          msg.className = 'muted';
          msg.textContent = 'Importing…';
          try {
            const res = await I.importDeck(root.querySelector('#dk-text').value, (t) => (msg.textContent = t));
            imported = { name: root.querySelector('#dk-name').value.trim() || res.name, cards: res.cards };
            const lines = [`Found ${res.total} cards${res.commanders.length ? ` · Commander: ${res.commanders.join(', ')}` : ''}.`];
            if (res.missing.length) lines.push(`Couldn't find on Scryfall (they'll show as text): ${res.missing.join(', ')}`);
            if (res.warning) lines.push(res.warning);
            if (S.format === 'commander' && !res.commanders.length) lines.push('No commander detected. You can still play; move your commander to the command zone with right-click.');
            msg.className = res.missing.length || res.warning ? 'err' : 'ok';
            msg.textContent = lines.join('\n');
            go.textContent = 'Use this deck';
          } catch (err) {
            msg.className = 'err';
            msg.textContent = err.message;
          }
          go.disabled = false;
        });
        root.querySelector('#dk-text').addEventListener('input', () => {
          imported = null;
          go.textContent = 'Import';
        });
      },
    });
  }

  function diceDialog() {
    dialog({
      title: 'Dice & coins',
      body: `<div class="quick">${[4, 6, 8, 10, 12, 20, 100].map((n) => `<button class="btn" data-d="${n}">d${n}</button>`).join('')}
        <button class="btn" data-coin="1">Flip a coin</button></div><p class="muted small" style="margin:0">Results appear in the log for everyone.</p>`,
      buttons: [{ label: 'Close', value: null }],
      onMount(root) {
        root.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.d) act({ type: 'roll', sides: Number(b.dataset.d) });
          if (b.dataset.coin) act({ type: 'coin' });
        });
      },
    });
  }

  function settingsDialog() {
    const st = S.settings;
    const host = session && session.isHost;
    dialog({
      title: 'Game settings',
      body: `<label class="row gap"><input type="checkbox" id="st-untap" ${st.autoUntap ? 'checked' : ''}> Untap automatically when a turn passes</label>
        <label class="row gap"><input type="checkbox" id="st-draw" ${st.autoDraw ? 'checked' : ''}> Draw automatically when a turn passes</label>
        <label class="row gap">Starting life <input type="number" id="st-life" value="${st.startingLife}" style="width:80px"> <span class="muted small">(used on Start / restart)</span></label>
        ${host
          ? `<div class="sect-title">Players</div>${S.players
              .filter((p) => p.id !== S.you)
              .map((p) => `<div class="row gap"><span style="flex:1">${esc(p.name)}</span><button class="btn small danger" data-remove="${p.id}">Remove</button></div>`)
              .join('') || '<p class="muted small" style="margin:0">No other players yet.</p>'}
             <div class="sect-title">Backup</div><div><button class="btn small" id="st-backup">Download a backup of this game</button></div>`
          : ''}`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
      onMount(root) {
        root.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.remove) {
            const p = playerById(b.dataset.remove);
            if (await confirmBox('Remove player?', `Remove ${esc(p.name)} and all their cards from the game?`, 'Remove', true)) {
              act({ type: 'removePlayer', playerId: p.id });
              b.closest('.row').remove();
            }
          }
          if (b.id === 'st-backup') downloadJSON(session.game, `mtg-game-${S.id}-${new Date().toISOString().slice(0, 10)}.json`);
        });
      },
    }).then(async ({ value, root }) => {
      if (value !== 'ok') return;
      const u = root.querySelector('#st-untap').checked;
      const d = root.querySelector('#st-draw').checked;
      const l = Number.parseInt(root.querySelector('#st-life').value, 10);
      if (u !== st.autoUntap) await act({ type: 'setting', key: 'autoUntap', value: u });
      if (d !== st.autoDraw) await act({ type: 'setting', key: 'autoDraw', value: d });
      if (Number.isFinite(l) && l !== st.startingLife) await act({ type: 'setting', key: 'startingLife', value: l });
    });
  }

  function helpDialog() {
    dialog({
      title: 'How to play',
      wide: true,
      body: `<div class="help-grid">
        <b>Move cards</b><span>Drag them anywhere: battlefield, hand, the stack, your piles, or another player's battlefield (gives them control).</span>
        <b>Tap / untap</b><span>Click a card on the battlefield, or hover it and press <kbd>T</kbd> / <kbd>Space</kbd>.</span>
        <b>Card details</b><span>Hover a card for a big image. Right-click it for every option, including <i>Open on Scryfall</i> for rulings.</span>
        <b>Play from hand</b><span>Double-click a card in your hand, or drag it out. Drag it to the Stack to cast it so your friend can respond.</span>
        <b>Resolve the stack</b><span>Double-click a card on the stack (permanents go to the battlefield, everything else to the graveyard).</span>
        <b>Library</b><span>Click to draw (<kbd>D</kbd>). Right-click it to shuffle, search, scry/look at top X, mill, mulligan…</span>
        <b>Graveyard / exile</b><span>Click to see all cards. Drag cards out of that window.</span>
        <b>Battlefield view</b><span>Mouse wheel zooms, drag an empty spot to scroll around, "fit" resets.</span>
        <b>Counters &amp; notes</b><span>Right-click a permanent → Counters… or Add note. Player counters (poison etc.) are in the side panel.</span>
        <b>Life</b><span>± buttons (hold <kbd>Shift</kbd> for 5). Click the number to type a value.</span>
        <b>Turns</b><span>"Pass turn" moves to the next player, untaps their permanents and draws for them (change in Settings). Click a phase to show where you are.</span>
        <b>Other keys</b><span><kbd>F</kbd> transform hovered card · <kbd>U</kbd> untap all your permanents · <kbd>Enter</kbd> chat · <kbd>Esc</kbd> close windows</span>
      </div>
      <p class="muted small" style="margin:0">Rules aren't enforced. You're in charge, just like at a real table.</p>`,
    });
  }

  /* ============================================================= viewer */

  async function openViewer(pid, zone, count) {
    viewer = { pid, zone, count: count || null, map: null };
    $('#viewer').hidden = false;
    if (zone === 'library' || (zone === 'hand' && pid !== S.you)) {
      const r = await act({ type: 'viewZone', playerId: pid, zone, count: count || undefined });
      if (r.error || !r.private) return closeViewer();
      setPrivate(r.private.cards);
    }
    renderViewer();
  }

  function setPrivate(cards) {
    if (!viewer) return;
    viewer.cards = cards;
    viewer.map = Object.fromEntries(cards.map((c) => [c.id, c]));
  }

  async function refreshPrivateViewer() {
    if (!viewer || !viewer.map || viewer.refreshing) return;
    viewer.refreshing = true;
    const r = await session.act({ type: 'viewZone', playerId: viewer.pid, zone: viewer.zone, count: viewer.count || undefined, silent: true });
    if (viewer) {
      viewer.refreshing = false;
      if (r && r.private) {
        setPrivate(r.private.cards);
        drawViewerCards();
      }
    }
  }

  function closeViewer(shuffleFirst) {
    if (shuffleFirst) act({ type: 'shuffle' });
    viewer = null;
    $('#viewer').hidden = true;
  }

  let lastViewerVersion = -1;
  function renderViewer() {
    if (!viewer) return;
    const p = playerById(viewer.pid);
    if (!p) return closeViewer();
    const v = $('#viewer');
    const mine = viewer.pid === S.you;
    const whose = mine ? 'Your' : `${p.name}'s`;
    const title =
      viewer.zone === 'library' ? (viewer.count ? `Top ${viewer.count} of ${whose.toLowerCase()} library` : `${whose} library`) : `${whose} ${viewer.zone}`;
    let foot = '';
    if (viewer.zone === 'library' && mine) {
      foot = viewer.count
        ? '<span class="muted small" style="flex:1">Top of library is first. Drag cards where they go, or right-click → Top/Bottom of library.</span><button class="btn" data-v="close">Done</button>'
        : '<button class="btn primary" data-v="shuffle">Shuffle &amp; close</button><button class="btn" data-v="close">Close without shuffling</button>';
    } else if (viewer.zone === 'library') foot = '<button class="btn" data-v="close">Done</button>';
    if (!v.dataset.built || v.dataset.title !== title) {
      v.innerHTML = `<div class="vh"><b></b><span class="muted small">double-click → hand · drag anywhere</span><button class="btn small ghost" data-v="close">✕</button></div>
        <div class="vb"></div>${foot ? `<div class="vf">${foot}</div>` : ''}`;
      v.dataset.built = '1';
      v.dataset.title = title;
    }
    v.querySelector('.vh b').textContent = title;
    if (viewer.map && S.version !== lastViewerVersion) {
      lastViewerVersion = S.version;
      refreshPrivateViewer();
    }
    drawViewerCards();
  }

  function drawViewerCards() {
    if (!viewer) return;
    const p = playerById(viewer.pid);
    let ids;
    if (viewer.map) ids = viewer.cards.map((c) => c.id);
    else {
      const z = (p.zones[viewer.zone] || []).slice();
      ids = viewer.zone === 'hand' ? z : z.reverse(); // newest first for graveyard / exile
    }
    const body = $('#viewer .vb');
    reconcile(body, ids, (id, el) => cardEl(getCard(id), el, 'viewer'));
  }

  $('#viewer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    closeViewer(b.dataset.v === 'shuffle');
  });

  /* ======================================================= global clicks */

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !S) return;
    const pid = t.dataset.pid;
    switch (t.dataset.act) {
      case 'life':
        act({ type: 'life', playerId: pid, delta: Number(t.dataset.d) * (e.shiftKey ? 5 : 1) });
        break;
      case 'setlife': {
        const p = playerById(pid);
        const n = await askNumber(`Set ${p.name}'s life`, p.life);
        if (n !== null) act({ type: 'setLife', playerId: pid, value: n });
        break;
      }
      case 'pc':
        act({ type: 'playerCounter', playerId: pid, name: t.dataset.name, delta: Number(t.dataset.d) });
        break;
      case 'pc-add': {
        const name = await askText('Add a player counter', 'poison', 'poison, energy, experience, rad…');
        if (name) act({ type: 'playerCounter', playerId: pid, name, delta: 1 });
        break;
      }
      case 'cmd':
        act({ type: 'cmdDamage', playerId: pid, sourceId: t.dataset.src, delta: Number(t.dataset.d) * (e.shiftKey ? 5 : 1) });
        break;
      case 'zone': {
        const p = playerById(pid);
        const zone = t.dataset.zone;
        if (zone === 'hand' && !p.handRevealed) return toast(`${p.name}'s hand is hidden.`);
        if (zone === 'library') {
          return showMenu(
            [
              { header: `${p.name}'s library (${p.libraryCount})` },
              { label: 'Look at the top X cards…', fn: async () => { const n = await askNumber('How many?', 1); if (n) openViewer(pid, 'library', n); } },
              { label: 'Search it (everyone sees this in the log)', fn: () => openViewer(pid, 'library') },
            ],
            e.clientX,
            e.clientY,
          );
        }
        openViewer(pid, zone);
        break;
      }
      case 'phase':
        act({ type: 'setPhase', phase: Number(t.dataset.i) });
        break;
      default:
        break;
    }
  });

  // pile clicks (library draws, others open viewer) on the empty slot
  $('#piles').addEventListener('click', (e) => {
    if (e.target.closest('.card')) return; // handled by pointerup
    const slot = e.target.closest('[data-pile]');
    if (!slot) return;
    if (slot.dataset.pile === 'library') act({ type: 'draw', n: 1 });
    else openViewer(S.you, slot.dataset.pile);
  });

  /* ============================================================ topbar */

  $('#btn-leave').addEventListener('click', async () => {
    if (session && session.isHost) {
      if (!(await confirmBox('Leave the game?', 'The game is saved in this browser. Your friends will be disconnected until you open it again from the lobby.', 'Leave'))) return;
      session.destroy();
    }
    location.href = location.pathname;
  });
  $('#btn-code').addEventListener('click', async () => {
    const code = S ? S.id : '';
    const link = location.protocol.startsWith('http') ? `${location.origin}${location.pathname}?join=${code}` : null;
    try {
      await navigator.clipboard.writeText(link || code);
      toast(link ? 'Invite link copied. Send it to your friend!' : `Game code ${code} copied. Your friend enters it under "Join a friend's game".`);
    } catch {
      toast(`Game code: ${code}${link ? `  ·  link: ${link}` : ''}`);
    }
  });
  $('#btn-deck').addEventListener('click', deckDialog);
  $('#btn-start').addEventListener('click', async () => {
    if (await confirmBox('Start a new game?', "Everyone's deck is rebuilt and shuffled, life is reset, and everyone draws 7. A random player goes first.", 'Start'))
      act({ type: 'startGame' });
  });
  $('#btn-settings').addEventListener('click', settingsDialog);
  $('#btn-help').addEventListener('click', helpDialog);
  $('#btn-log').addEventListener('click', () => {
    const g = $('#game');
    g.classList.toggle('no-log');
    try {
      localStorage.setItem('mtgtt.hideLog', g.classList.contains('no-log') ? '1' : '0');
    } catch {
      /* ignore */
    }
  });
  $('#btn-pass').addEventListener('click', () => act({ type: 'passTurn' }));
  $('#btn-token').addEventListener('click', () => tokenDialog(S.you));
  $('#btn-dice').addEventListener('click', diceDialog);
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const i = $('#chat-input');
    if (i.value.trim()) act({ type: 'chat', text: i.value });
    i.value = '';
  });

  /* ============================================================ keyboard */

  document.addEventListener('keydown', (e) => {
    if ($('#game').hidden || !S) return;
    if (e.key === 'Escape') {
      hideMenu();
      if (viewer) closeViewer();
      return;
    }
    if (e.target.closest('input, textarea, select') || $('#modal-root').children.length || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const c = hoveredId && getCard(hoveredId);
    if ((k === 't' || k === ' ') && c && c.zone === 'battlefield') {
      e.preventDefault();
      act({ type: 'tap', cardId: c.id });
    } else if (k === 'f' && c && c.backImg) act({ type: 'flip', cardId: c.id });
    else if (k === 'd') act({ type: 'draw', n: 1 });
    else if (k === 'u') act({ type: 'untapAll' });
    else if (k === 'enter') {
      e.preventDefault();
      $('#chat-input').focus();
    }
  });

  window.addEventListener('resize', () => S && renderHandAndPiles(me()));

  /* =============================================================== boot */

  setupLobby();
  const q = new URLSearchParams(location.search);
  if (q.get('host')) startHost(q.get('host').toUpperCase());
  else if (q.get('join')) startJoin(q.get('join').toUpperCase());
  else showLobby();
})();
