/**
 * Shared interface + the computer (mouse) layout: lobby, battlefields, hand,
 * menus, dialogs, dice, permission prompts. The phone layout lives in phone.js
 * and reuses the helpers exported at the bottom as window.MTGUI.
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
  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const large = (url) => (url ? url.replace('/normal/', '/large/') : url);
  const NAME_KEY = 'mtgtt.name';
  const DECKS_KEY = 'mtgtt.decks';
  const LAYOUT_KEY = 'mtgtt.layout';
  const VIEW_KEY = 'mtgtt.boardView';
  const BOLT = '<svg viewBox="0 0 16 16" class="ic"><path d="M9.5 1 3 9h4l-1 6 6.5-8h-4z" fill="currentColor"/></svg>';
  const SPARK = '<svg viewBox="0 0 16 16" class="ic"><path d="M8 1l1.6 5.4L15 8l-5.4 1.6L8 15l-1.6-5.4L1 8l5.4-1.6z" fill="currentColor"/></svg>';
  const ic = (d, extra = '') => `<svg viewBox="0 0 24 24" class="mic" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICONS = {
    field: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>'),
    zones: ic('<rect x="4" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>'),
    eye: ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    grid: ic('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
    log: ic('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    zoomIn: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
    zoomOut: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>'),
    fit: ic('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    die: ic('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 7l5 9H7z"/>'),
    token: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7l1.5 3.2 3.5.4-2.6 2.4.7 3.5L12 14.8 8.9 16.5l.7-3.5L7 10.6l3.5-.4z"/>'),
    prolif: ic('<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4M6 22v-4h4"/>'),
    undo: ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    untap: ic('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    deck: ic('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 2h9a2 2 0 0 1 2 2v14"/>'),
    play: ic('<path d="M7 4l13 8-13 8z"/>'),
    link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
    leave: ic('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    sword: ic('<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>'),
    hand: ic('<rect x="3" y="6" width="9" height="13" rx="1.5" transform="rotate(-10 7 12)"/><rect x="11" y="5" width="9" height="13" rx="1.5" transform="rotate(8 15 11)"/>'),
    library: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6"/>'),
    back: ic('<path d="M15 18l-6-6 6-6"/>'),
  };
  const D20_SVG =
    '<svg viewBox="0 0 100 100" class="d20svg"><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" class="d-out"/>' +
    '<polygon points="50,24 79,71 21,71" class="d-in"/>' +
    '<path d="M50,3L50,24M93,27L50,24M7,27L50,24M93,27L79,71M7,27L21,71M93,73L79,71M7,73L21,71M50,97L79,71M50,97L21,71" class="d-lines"/></svg>';

  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 5000 : 3200);
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

  const isEquipLike = (c) => /\b(Equipment|Aura)\b/.test((c && c.typeLine) || '');
  const isLandCard = (c) => /\bLand\b/.test((c && (c.flipped && c.backTypeLine ? c.backTypeLine : c.typeLine)) || '') && !/\bCreature\b/.test((c && c.typeLine) || '');
  const isPermanentCard = (c) => /\b(Creature|Artifact|Enchantment|Planeswalker|Land|Battle)\b/.test((c && c.typeLine) || '');

  /* ============================================================= dialogs */

  /**
   * dialog({ title, body, buttons: [{label, value, primary, danger, cls}], wide, onMount(root, close) })
   * Resolves with { value, root } (value null if dismissed).
   */
  function dialog({ title, body = '', buttons = [{ label: 'Close', value: null }], wide = false, onMount, noDismiss = false }) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">
        <h3>${esc(title)}</h3><div class="mb">${body}</div>
        <div class="mf">${buttons
          .map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''} ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`)
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
        if (!document.body.contains(bg) || bg !== $('#modal-root').lastElementChild) return;
        if (e.key === 'Escape' && !noDismiss) {
          e.stopPropagation();
          close(null);
        } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.dataset.noenter) {
          const p = buttons.findIndex((b) => b.primary);
          if (p >= 0) {
            e.preventDefault();
            close(buttons[p].value);
          }
        }
      };
      if (!noDismiss)
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
      const first = root.querySelector('input:not([type=checkbox]):not([type=color]), textarea, select');
      if (first && !U.phone) setTimeout(() => first.focus(), 30);
    });
  }

  async function askNumber(title, def = 1, label = '') {
    const { value, root } = await dialog({
      title,
      body: `<label class="form">${esc(label)}<input type="number" inputmode="numeric" value="${def}" id="dlg-num" /></label>`,
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
    $('#phone').hidden = true;
    document.body.classList.remove('in-game');
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
              <button class="btn ghost" data-del="${esc(g.id)}" title="Delete">Delete</button>
            </div>`,
          )
          .join('')
      : '<p class="muted">No hosted games yet.</p>';

    const seats = Store.keys('mtgtt.seat.')
      .map((k) => ({ code: k.slice('mtgtt.seat.'.length).split('.')[0], ...(Store.get(k) || {}) }))
      .filter((s) => !Store.loadGame(s.code))
      .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))
      .slice(0, 6);
    $('#recent-joins').innerHTML = seats.length
      ? `<div class="recent muted">Rejoin: ${seats
          .map((s) => `<button class="btn small" data-rejoin="${esc(s.code)}" data-name="${esc(s.name || '')}">${esc(s.gameName || s.code)} (${esc(s.name || '')})</button>`)
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
      if (b.dataset.rejoin) {
        if (b.dataset.name) Store.set(NAME_KEY, b.dataset.name);
        location.href = `?join=${b.dataset.rejoin}`;
      }
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
  let firstState = true;
  const views = {}; // battlefield camera per player id: {x, y, z, auto}
  let viewer = null; // open zone viewer state
  let hoveredId = null;
  let lastLogId = 0;
  let selectedOpp = null; // focus layout: which opponent is shown
  let boardView = Store.get(VIEW_KEY) || 'focus'; // 'focus' | 'grid'
  let mode = null; // { kind: 'proliferate'|'attach', ... }
  const renderHooks = [];

  function onStatus({ level, text }) {
    for (const el of $$('.status-pill')) {
      el.classList.remove('good', 'warn', 'bad');
      el.classList.add(level);
      el.textContent = text;
      el.title = text;
    }
    U.status = { level, text };
  }

  function onState(view) {
    S = view;
    render();
    firstState = false;
  }

  function onMessage(msg) {
    if (msg.type === 'notify') toast(msg.text, 'error');
    if (msg.type === 'private' && msg.private) openViewerPrivate(msg.private);
    if (msg.type === 'effects') updateSavedDeckEffects(msg.name, msg.effects);
  }

  const HINTED = new Set(['move', 'createToken', 'placeDie', 'clone', 'resolveReveal', 'unattach']);

  async function act(action) {
    if (!session) return { error: 'Not connected.' };
    if (S && HINTED.has(action.type) && action.x == null && !action.hint && (action.type !== 'move' || action.to === 'battlefield')) {
      const c = action.cardId ? getCard(action.cardId) : null;
      const pid = action.playerId || (c && c.zone === 'battlefield' ? c.zp : S.you);
      const h = viewCenter(pid);
      if (h) action.hint = h;
    }
    const r = (await session.act(action)) || {};
    if (r.error) toast(r.error, 'error');
    if (r.pending) toast(`Asked ${r.pending.waitingFor} for permission…`);
    return r;
  }

  function startHost(code) {
    const g = Store.loadGame(code);
    if (!g) {
      showLobby();
      return toast(`No saved game with code ${code} in this browser. To join a friend's game, use "Join a friend's game".`, 'error');
    }
    session = new HostSession(g, { onState, onStatus, onMessage });
    U.session = session;
    showGame();
    session.start();
  }

  async function startJoin(code) {
    let name = Store.get(NAME_KEY) || (Store.getSeat(code) || {}).name;
    U.myName = name;
    if (!name) {
      name = await askText('Your name', '', 'e.g. Sam', 'Pick a name for this game');
      if (!name) return showLobby();
      Store.set(NAME_KEY, name);
    }
    showGame();
    session = new GuestSession(code, name, {
      onState,
      onStatus,
      onMessage,
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
    U.session = session;
    session.start();
  }

  function wantPhone() {
    const pref = Store.get(LAYOUT_KEY);
    if (pref === 'phone') return true;
    if (pref === 'desktop') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }

  function showGame() {
    $('#lobby').hidden = true;
    document.body.classList.add('in-game');
    U.phone = wantPhone();
    document.body.classList.toggle('phone-mode', U.phone);
    $('#game').hidden = U.phone;
    $('#phone').hidden = !U.phone;
    if (U.phone && window.MTGPhone) window.MTGPhone.init();
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

  /** Players in turn order starting with you. */
  function seatOrder() {
    const order = (S.order || S.players.map((p) => p.id)).filter((id) => playerById(id));
    const i = order.indexOf(S.you);
    return i < 0 ? order : order.slice(i).concat(order.slice(0, i));
  }

  function render() {
    if (!S) return;
    document.title = `${S.name} · MTG Tabletop`;
    if (!U.phone) renderDesktop();
    renderCombat();
    renderSetup();
    renderReveal();
    animateShuffles();
    renderRequests();
    renderModeBanner();
    if (viewer) renderViewer();
    for (const fn of renderHooks) fn(S);
  }

  function renderDesktop() {
    $('#game-name').textContent = S.name;
    $('#btn-code').textContent = S.id;
    $('#btn-start').textContent = S.setup && S.setup.stage !== 'done' ? 'Restart game' : 'Start game';
    const mine = me();
    const seats = seatOrder();
    const opps = seats.filter((id) => id !== S.you).map(playerById);
    if (!opps.some((p) => p.id === selectedOpp)) selectedOpp = opps[0] ? opps[0].id : null;

    const grid = boardView === 'grid';
    $('#btn-grid').textContent = grid ? 'One opponent' : 'All battlefields';
    $('#grid').hidden = !grid;
    $('#opponents').hidden = grid;
    $('#me-area').hidden = grid;
    $('#table').classList.toggle('grid-mode', grid);

    // build / update every player's area
    for (const p of S.players) ensureArea(p);
    for (const el of $$('.player-area')) if (!playerById(el.dataset.pid)) el.remove();

    const park = $('#park');
    if (grid) {
      const n = seats.length;
      $('#grid').dataset.n = String(n);
      const cells = $$('#grid .cell');
      for (const c of cells) {
        c.classList.remove('log-cell');
        c.hidden = false;
      }
      seats.forEach((pid, i) => {
        const cell = $(`#grid .cell[data-slot="${i}"]`);
        const area = areaEl(pid);
        area.className = `player-area in-grid slot-${i}`;
        if (area.parentElement !== cell) cell.appendChild(area);
      });
      for (let i = n; i < 4; i++) {
        const cell = $(`#grid .cell[data-slot="${i}"]`);
        cell.hidden = !(n === 3 && i === 3);
      }
      const logCell = $('#grid .cell[data-slot="3"]');
      if (n === 3) {
        logCell.classList.add('log-cell');
        if ($('#sidebar').parentElement !== logCell) logCell.appendChild($('#sidebar'));
      } else if ($('#sidebar').parentElement !== $('#game')) $('#game').appendChild($('#sidebar'));
    } else {
      if ($('#sidebar').parentElement !== $('#game')) $('#game').appendChild($('#sidebar'));
      for (const p of S.players) {
        const area = areaEl(p.id);
        area.className = 'player-area';
        let home = park;
        if (p.id === S.you) home = $('#me-area');
        else if (p.id === selectedOpp) home = $('#opponents');
        if (area.parentElement !== home) home.appendChild(area);
      }
    }
    for (const p of S.players) fillArea(p, opps.length);
    for (const p of S.players) if (views[p.id] && views[p.id].auto) fitView(p.id, true);
    for (const p of S.players) {
      const a = areaEl(p.id);
      a.classList.toggle('active', S.turn.active === p.id);
    }
    if (!mine) $('#me-area').innerHTML = '<p class="muted" style="margin:auto">You are not seated in this game.</p>';
    renderCenter();
    renderHandAndPiles(mine);
    renderLog($('#log'));
  }

  const areaEl = (pid) => $(`.player-area[data-pid="${pid}"]`);

  function ensureArea(p) {
    if (areaEl(p.id)) return;
    const area = document.createElement('div');
    area.className = 'player-area';
    area.dataset.pid = p.id;
    area.innerHTML = `<div class="ppanel"></div>
      <div class="bf" data-pid="${p.id}">
        <div class="bf-table" data-drop="bf" data-player="${p.id}">
          <div class="layer"></div>
        </div>
        <div class="bf-owner"></div>
        <div class="bf-controls">
          <button class="btn tiny" data-zoom="out" title="Zoom out">−</button>
          <button class="btn tiny" data-zoom="fit" title="Fit whole battlefield">fit</button>
          <button class="btn tiny" data-zoom="in" title="Zoom in">+</button>
        </div>
      </div>`;
    $('#park').appendChild(area);
    const table = $('.bf-table', area);
    table.style.width = `${S.table.w}px`;
    table.style.height = `${S.table.h}px`;
    setupBattlefield($('.bf', area), p.id);
  }

  function fillArea(p, oppCount) {
    const area = areaEl(p.id);
    const isMe = p.id === S.you;
    $('.ppanel', area).innerHTML = panelHTML(p, isMe, { compact: area.classList.contains('in-grid'), oppCount });
    $('.bf-owner', area).textContent = isMe ? 'Your battlefield' : `${p.name}'s battlefield`;
    $('.bf', area).style.setProperty('--felt', p.bfColor || '');
    $('.bf', area).classList.toggle('custom-felt', !!p.bfColor);
    renderBattlefieldCards($('.layer', area), p);
  }

  /** Battlefield cards for one pane, with attachments tucked behind their host. */
  function paneLayout(p) {
    const onBf = new Set();
    for (const pl of S.players) for (const id of pl.zones.battlefield) onBf.add(id);
    const hostOf = (id) => {
      const c = S.cards[id];
      return c && c.attachedTo && onBf.has(c.attachedTo) ? c.attachedTo : null;
    };
    const attached = {};
    for (const pl of S.players)
      for (const id of pl.zones.battlefield) {
        const h = hostOf(id);
        if (h) (attached[h] = attached[h] || []).push(id);
      }
    const ids = [];
    const pos = {};
    for (const id of p.zones.battlefield) {
      if (hostOf(id)) continue;
      const host = S.cards[id];
      (attached[id] || []).forEach((aid, k) => {
        ids.push(aid);
        pos[aid] = { x: clamp(host.x + 18 * (k + 1), 0, S.table.w - 100), y: clamp(host.y - 28 * (k + 1), 0, S.table.h - 140) };
      });
      ids.push(id);
    }
    return { ids, pos };
  }

  function renderBattlefieldCards(layer, p) {
    const { ids, pos } = paneLayout(p);
    const dice = Object.values(S.dice || {}).filter((d) => d.owner === p.id);
    reconcile(layer, ids.concat(dice.map((d) => `die:${d.id}`)), (id, el) =>
      id.startsWith('die:') ? dieEl(S.dice[id.slice(4)], el, p.id) : cardEl(S.cards[id], el, 'bf', pos[id]),
    );
  }

  function counterLabel(name, n) {
    if (name === '+1/+1') return `+${n}/+${n}`;
    if (name === '-1/-1') return `-${n}/-${n}`;
    return `${name} ${n}`;
  }

  function panelHTML(p, isMe, { compact = false, oppCount = 1 } = {}) {
    const rows = [];
    const sel = mode && mode.kind === 'proliferate' && mode.players.has(p.id) ? 'selected' : '';
    rows.push(`<div class="pname ${sel}" data-act="pick-player" data-pid="${p.id}"><span class="dot" style="background:${esc(p.color)}"></span><span class="nm">${esc(p.name)}${isMe ? ' (you)' : ''}</span>
      <span class="online ${p.connected ? 'on' : ''}" title="${p.connected ? 'online' : 'offline'}">${p.connected ? '●' : '○'}</span></div>`);
    if (!isMe && oppCount > 1 && !compact) {
      const seats = seatOrder().filter((id) => id !== S.you);
      const next = playerById(seats[(seats.indexOf(p.id) + 1) % seats.length]);
      rows.push(`<button class="btn small switch" data-act="switch-opp">⇄ Switch to ${esc(next ? next.name : '')}</button>`);
    }
    rows.push(`<div class="life" title="Click ± to change life (Shift = 5). Click the number to set it.">
      <button class="btn" data-act="life" data-pid="${p.id}" data-d="-1">−</button>
      <span class="val" data-act="setlife" data-pid="${p.id}">${p.life}</span>
      <button class="btn" data-act="life" data-pid="${p.id}" data-d="1">+</button></div>`);
    if (!compact && p.deckName) rows.push(`<div class="deckname" title="${esc(p.deckName)}">${esc(p.deckName)}</div>`);
    for (const [k, v] of Object.entries(p.counters || {}))
      rows.push(`<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span>
        <button class="btn tiny" data-act="pc" data-pid="${p.id}" data-name="${esc(k)}" data-d="-1">−</button>
        <button class="btn tiny" data-act="pc" data-pid="${p.id}" data-name="${esc(k)}" data-d="1">+</button></div>`);
    if (!compact) rows.push(`<button class="btn small" data-act="pc-add" data-pid="${p.id}">+ player counter</button>`);

    if (S.format === 'commander' && !compact) {
      const sources = new Map();
      for (const c of Object.values(S.cards)) if (c.isCommander && c.owner !== p.id && !c.isToken) sources.set(c.id, c);
      for (const id of Object.keys(p.cmdDamage || {})) if (S.cards[id]) sources.set(id, S.cards[id]);
      if (sources.size) {
        rows.push('<div class="sect-title">Commander damage taken</div>');
        for (const c of sources.values()) {
          const v = (p.cmdDamage || {})[c.id] || 0;
          const owner = playerById(c.owner);
          rows.push(`<div class="kv" title="${esc(c.name)}"><span class="k">${esc(owner ? owner.name : '?')} · ${esc(c.name)}</span><span class="v" style="${v >= 21 ? 'color:var(--bad)' : ''}">${v}</span>
            <button class="btn tiny" data-act="cmd" data-pid="${p.id}" data-src="${c.id}" data-d="-1">−</button>
            <button class="btn tiny" data-act="cmd" data-pid="${p.id}" data-src="${c.id}" data-d="1">+</button></div>`);
        }
      }
    }

    if (!isMe || compact) {
      const z = p.zones;
      const zb = (zone, label, count) =>
        `<button class="zbtn" data-act="zone" data-pid="${p.id}" data-zone="${zone}" data-drop="zone" data-zone-target="${zone}" ${zone === 'library' ? `data-lib="${p.id}"` : ''}>${label} <b>${count}</b></button>`;
      rows.push(`<div class="zones">${zb('hand', 'Hand', p.handCount)}${zb('library', 'Library', p.libraryCount)}${zb('graveyard', 'Grave', z.graveyard.length)}${zb(
        'exile',
        'Exile',
        z.exile.length,
      )}${S.format === 'commander' || z.command.length ? zb('command', 'Cmd', z.command.length) : ''}</div>`);
      const flags = [];
      if (p.handRevealed) flags.push('hand revealed');
      if (p.revealTop) flags.push('top of library revealed');
      if (flags.length) rows.push(`<div class="muted small">${flags.join(' · ')}</div>`);
    } else {
      rows.push(`<div class="muted small">Hand ${p.handCount} · Library ${p.libraryCount}${p.handRevealed ? ' · hand revealed' : ''}</div>`);
    }
    return rows.join('');
  }

  function renderCenter() {
    const active = playerById(S.turn.active);
    const mineTurn = S.turn.active === S.you;
    $('#turn-label').innerHTML = active
      ? `Turn ${S.turn.number} · ${mineTurn ? '<span style="color:var(--accent)">Your turn</span>' : `${esc(active.name)}'s turn`}`
      : '<span class="muted">Load decks, then Start game</span>';
    $('#btn-pass').disabled = !active;
    $('#phases').innerHTML = S.phases.map((ph, i) => `<span class="phase ${i === S.turn.phase ? 'on' : ''}" data-act="phase" data-i="${i}">${esc(ph)}</span>`).join('');
    $('#btn-pass').textContent = !active || mineTurn ? 'Pass turn ▶' : `End ${active.name}'s turn ▶`;
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
    const libInner = mine.libraryCount ? (libTop ? cardHTML(libTop, 'libtop') : '<div class="back">✦</div>') : '';
    const gy = top(z.graveyard);
    const ex = top(z.exile);
    const cmd = z.command.map((id) => S.cards[id]).filter(Boolean);
    let html = pile('library', 'Library', mine.libraryCount, libInner).replace('data-pile="library"', `data-pile="library" data-lib="${mine.id}"`);
    html += pile('graveyard', 'Graveyard', z.graveyard.length, gy ? cardHTML(gy, 'pile') : '');
    html += pile('exile', 'Exile', z.exile.length, ex ? cardHTML(ex, 'pile') : '');
    if (S.format === 'commander' || cmd.length) html += pile('command', 'Command', cmd.length, cmd.length ? cardHTML(cmd[0], 'pile') : '', 'cmd');
    $('#piles').innerHTML = html;
  }

  function reactionsHTML(e) {
    const r = e.reactions || {};
    const chips = Object.entries(r)
      .filter(([, ids]) => ids.length)
      .map(([emo, ids]) => {
        const names = ids.map((id) => (id === S.you ? 'You' : (playerById(id) || {}).name || '?')).join(', ');
        return `<button class="rx-chip ${ids.includes(S.you) ? 'mine' : ''}" data-rx="${emo}" data-log="${e.id}" title="${esc(names)}">${emo}<b>${ids.length}</b></button>`;
      })
      .join('');
    return `${chips}<button class="rx-add" data-rxpick="${e.id}" title="React">☺︎+</button>`;
  }

  function renderLog(log) {
    if (!log) return;
    const entries = S.log || [];
    const firstId = entries.length ? entries[0].id : 0;
    let last = Number(log.dataset.last || 0);
    if (!entries.length || firstId > last + 1 || entries[entries.length - 1].id < last) {
      log.innerHTML = '';
      last = 0;
    }
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    for (const e of entries) {
      const sig = JSON.stringify(e.reactions || {});
      if (e.id <= last) {
        // reactions can change on lines already shown
        const row = log.querySelector(`.e[data-log="${e.id}"]`);
        if (row && row.dataset.rxsig !== sig) {
          row.dataset.rxsig = sig;
          row.querySelector('.rx').innerHTML = reactionsHTML(e);
        }
        continue;
      }
      const d = document.createElement('div');
      d.className = `e ${e.kind ? `k-${e.kind}` : ''}`;
      d.dataset.log = e.id;
      d.dataset.rxsig = sig;
      const time = new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      d.innerHTML =
        (e.kind === 'chat'
          ? `<span class="t">${time}</span><b style="color:${esc(e.color)}">${esc(e.who)}:</b> ${esc(e.text)}`
          : `<span class="t">${time}</span>${esc(e.text)}`) + `<div class="rx">${reactionsHTML(e)}</div>`;
      log.appendChild(d);
      last = e.id;
    }
    log.dataset.last = String(last);
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  /** Reactions: tap a chip to add/remove yours, ☺︎+ to pick one. */
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.rx-chip[data-rx]');
    if (chip) return act({ type: 'react', logId: Number(chip.dataset.log), emoji: chip.dataset.rx });
    const add = e.target.closest('[data-rxpick]');
    const old = $('#rx-pick');
    if (old && !e.target.closest('#rx-pick')) old.remove();
    if (!add) return;
    const box = document.createElement('div');
    box.id = 'rx-pick';
    box.className = 'rx-pick';
    box.innerHTML = E.REACTIONS.map((emo) => `<button data-rxgo="${emo}">${emo}</button>`).join('');
    document.body.appendChild(box);
    const r = add.getBoundingClientRect();
    const w = box.getBoundingClientRect().width;
    box.style.left = `${clamp(r.left - w / 2, 6, innerWidth - w - 6)}px`;
    box.style.top = `${Math.max(6, r.top - 50)}px`;
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rxgo]');
      if (b) act({ type: 'react', logId: Number(add.dataset.rxpick), emoji: b.dataset.rxgo });
      box.remove();
    });
  });

  /* -------------------------------------------------------------- cards */

  function faceBadges(c) {
    const out = [];
    const net = ((c.counters || {})['+1/+1'] || 0) - ((c.counters || {})['-1/-1'] || 0);
    if (net) out.push(`<span class="cb ctr ${net < 0 ? 'neg' : ''}"><i class="dot"></i>${sign(net)}/${sign(net)}</span>`);
    if ((c.counters || {}).charge) out.push(`<span class="cb chg">${BOLT}${c.counters.charge}</span>`);
    const fx = c.stats && c.stats.fx;
    if (fx && (fx.p || fx.t)) out.push(`<span class="cb fx">${SPARK}${sign(fx.p)}/${sign(fx.t)}</span>`);
    for (const [k, v] of Object.entries(c.counters || {}))
      if (!['+1/+1', '-1/-1', 'charge', 'loyalty'].includes(k)) out.push(`<span class="cb misc">${esc(k)} ${v}</span>`);
    let html = out.length ? `<div class="cbadges">${out.join('')}</div>` : '';
    const isPw = /\bPlaneswalker\b/.test((c.flipped && c.backTypeLine) || c.typeLine || '');
    const loyal = (c.counters || {}).loyalty;
    if (loyal != null || (isPw && c.loyalty)) html += `<div class="loyal">${loyal != null ? loyal : esc(c.loyalty)}</div>`;
    return html;
  }

  function cardInner(c) {
    if (!c) return '<div class="back">?</div>';
    if (c.hidden) return `<div class="back">✦</div>${faceBadges(c)}`;
    const src = c.flipped && c.backImg ? c.backImg : c.img;
    const shownName = c.flipped && c.backName ? c.backName : c.name;
    let html = src
      ? `<img src="${esc(src)}" alt="${esc(shownName)}" draggable="false" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:this.alt}))" ${c.faceDown ? 'style="opacity:.45;filter:grayscale(1)"' : ''}>`
      : `<div class="fallback">${esc(shownName)}<span class="tl">${esc(c.manaCost || '')}</span><span class="tl">${esc(c.typeLine || '')}</span>${c.pt ? `<span class="tl">${esc(c.pt)}</span>` : ''}</div>`;
    const tags = [];
    if (c.faceDown) tags.push('<span class="tag">face-down</span>');
    if (c.isToken) tags.push('<span class="tag token">token</span>');
    if (c.isCommander && c.zone === 'command' && c.castCount) tags.push(`<span class="tag tax">tax +${c.castCount * 2}</span>`);
    if (tags.length) html += `<div class="tags">${tags.join('')}</div>`;
    if (c.zone === 'battlefield') html += faceBadges(c);
    if (c.note) html += `<div class="note">${esc(c.note)}</div>`;
    return html;
  }

  function cardHTML(c, ctx) {
    return `<div class="card" data-id="${esc(c.id)}" data-ctx="${ctx}">${cardInner(c)}</div>`;
  }

  /** Create or update a card element (keeps the same element so images don't reload). */
  function cardEl(c, el, ctx, posOverride) {
    if (!el || !el.classList.contains('card')) {
      el = document.createElement('div');
      el.className = 'card';
    }
    if (!c) return el;
    el.dataset.id = c.id;
    el.dataset.ctx = ctx;
    if (ctx === 'bf') {
      const pos = posOverride || c;
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.classList.toggle('attached', !!posOverride);
    }
    el.classList.toggle('tapped', ctx === 'bf' && !!c.tapped);
    el.classList.toggle('selected', !!(mode && mode.kind === 'proliferate' && mode.cards.has(c.id)));
    const ci = S && S.combat ? combatInfo() : null;
    el.classList.toggle('attacking', ctx === 'bf' && !!ci && ci.attacking.has(c.id));
    el.classList.toggle('blocking', ctx === 'bf' && !!ci && ci.blocking.has(c.id));
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

  /* ---------------------------------------------------------- summaries */

  /** The detailed info shown beside a hovered (or tapped) card. */
  function summaryHTML(c) {
    if (!c || c.hidden) return '';
    const rows = [`<b class="sn">${esc(c.flipped && c.backName ? c.backName : c.name)}</b>`];
    const tl = c.flipped && c.backTypeLine ? c.backTypeLine : c.typeLine;
    if (tl) rows.push(`<div class="muted">${esc(tl)}${c.manaCost && !c.flipped ? ` · ${esc(c.manaCost)}` : ''}</div>`);
    const st = c.stats;
    if (st && st.total) {
      rows.push(`<div class="pt-total">${esc(st.total)}${st.parts.length ? ` <span class="muted">(printed ${esc(st.base)})</span>` : ''}</div>`);
      for (const part of st.parts) rows.push(`<div class="small">${sign(part.p)}/${sign(part.t)} <span class="muted">${esc(part.src)}</span></div>`);
    }
    const ctr = Object.entries(c.counters || {});
    if (ctr.length) rows.push(`<div class="sect-title">Counters</div>${ctr.map(([k, v]) => `<div class="small">${esc(counterLabel(k, v))}${k === '+1/+1' || k === '-1/-1' ? '' : ''}</div>`).join('')}`);
    if (st && st.keywords && st.keywords.length)
      rows.push(`<div class="sect-title">Has</div>${st.keywords.map((k) => `<div class="small"><b>${esc(k.keyword)}</b> <span class="muted">from ${esc(k.src)}</span></div>`).join('')}`);
    if (c.attachedTo && S.cards[c.attachedTo]) rows.push(`<div class="small">Attached to <b>${esc(S.cards[c.attachedTo].name)}</b></div>`);
    const att = Object.values(S.cards).filter((x) => x.attachedTo === c.id);
    if (att.length) rows.push(`<div class="small">Attached: ${att.map((x) => `<b>${esc(x.name)}</b>`).join(', ')}</div>`);
    if ((c.effects || []).length)
      rows.push(`<div class="sect-title">This card's effects</div>${c.effects.map((e) => `<div class="small ${e.on ? '' : 'muted'}">${esc(E.describeEffect(e))}${e.on ? '' : ' (off)'}</div>`).join('')}`);
    if (c.isCommander && c.castCount) rows.push(`<div class="small">Commander tax: <b>+${c.castCount * 2}</b></div>`);
    if (c.note) rows.push(`<div class="small">Note: ${esc(c.note)}</div>`);
    return rows.join('');
  }

  /* -------------------------------------------------------- battlefield */

  const DEFAULT_Z = 1.15; // cards about 115px wide on a computer
  const FIT_PAD = 60; // screen pixels of breathing room when fitting

  function setupBattlefield(bf, pid) {
    views[pid] = views[pid] || { x: 0, y: 0, z: DEFAULT_Z, auto: true };
    const ro = new ResizeObserver(() => {
      if (views[pid].auto) fitView(pid, true);
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

  const bfEls = (pid) => $$(`.bf[data-pid="${pid}"]`).filter((b) => b.offsetParent !== null);

  function applyView(pid) {
    const v = views[pid];
    for (const bf of $$(`.bf[data-pid="${pid}"]`)) bf.querySelector('.bf-table').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }

  /** Bounding box of everything on a player's battlefield (table units), or null. */
  function cardsBox(pid) {
    const p = playerById(pid);
    if (!p) return null;
    const items = p.zones.battlefield.map((id) => S.cards[id]).filter(Boolean).map((c) => ({ x: c.x, y: c.y, w: 100, h: 140 }));
    for (const d of Object.values(S.dice || {})) if (d.owner === pid) items.push({ x: d.x, y: d.y, w: 70, h: 70 });
    if (!items.length) return null;
    const x0 = Math.min(...items.map((i) => i.x));
    const y0 = Math.min(...items.map((i) => i.y));
    const x1 = Math.max(...items.map((i) => i.x + i.w));
    const y1 = Math.max(...items.map((i) => i.y + i.h));
    return { x0, y0, x1, y1 };
  }

  /**
   * Fit every card on that battlefield on screen with a border around it.
   * soft = the automatic view: never zooms in past the default card size.
   */
  function fitView(pid, soft = false, rectOverride) {
    if (!S) return;
    const bf = bfEls(pid)[0];
    const r = rectOverride || (bf && bf.getBoundingClientRect());
    if (!r || !r.width || !r.height) return;
    const box = cardsBox(pid);
    let z = DEFAULT_Z * (U.phone ? 0.75 : 1);
    let cx = S.table.w / 2;
    let cy = S.table.h / 2;
    if (box) {
      const zw = (r.width - FIT_PAD * 2) / (box.x1 - box.x0);
      const zh = (r.height - FIT_PAD * 2) / (box.y1 - box.y0);
      // the automatic view keeps cards big (pan or press Fit to see everything); Fit shows it all
      z = soft ? clamp(Math.min(zw, zh), z * 0.8, z) : clamp(Math.min(zw, zh, z * 1.6), 0.12, 3);
      cx = (box.x0 + box.x1) / 2;
      cy = (box.y0 + box.y1) / 2;
    }
    views[pid] = { z, x: r.width / 2 - cx * z, y: r.height / 2 - cy * z, auto: true };
    applyView(pid);
    if (U.phone && window.MTGPhone) window.MTGPhone.applyView(pid);
  }

  /** The table point at the middle of what this player is looking at (used to place new cards). */
  function viewCenter(pid) {
    if (U.phone && window.MTGPhone) return window.MTGPhone.viewCenter(pid);
    const bf = bfEls(pid)[0];
    const v = views[pid];
    if (!bf || !v) return null;
    const r = bf.getBoundingClientRect();
    return { x: Math.round((r.width / 2 - v.x) / v.z), y: Math.round((r.height / 2 - v.y) / v.z) };
  }

  function zoomAt(pid, factor, cx, cy) {
    const bf = bfEls(pid)[0];
    const v = views[pid];
    if (!bf || !v) return;
    const r = bf.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    const nz = clamp(v.z * factor, 0.12, 3);
    v.x = px - ((px - v.x) * nz) / v.z;
    v.y = py - ((py - v.y) * nz) / v.z;
    v.z = nz;
    v.auto = false;
    applyView(pid);
  }

  /* =============================================================== dice */

  const diceSeen = {};
  const animating = new Set();

  function dieEl(d, el, pid) {
    if (!el || !el.classList.contains('die')) {
      el = document.createElement('div');
      el.className = 'die';
      el.innerHTML = `${D20_SVG}<span class="dn"></span>`;
    }
    if (!d) return el;
    el.dataset.die = d.id;
    el.dataset.pid = pid;
    el.classList.toggle('mine', d.owner === S.you);
    el.style.setProperty('--dc', (playerById(d.owner) || {}).color || '#d6a531');
    if (d.seq && diceSeen[d.id] !== d.seq) {
      diceSeen[d.id] = d.seq;
      if (!firstState) {
        animateDie(el, E.simulateDie(d.sx, d.sy, d.vx, d.vy, d.rw || S.table.w, d.rh || S.table.h, 70, d.rx || 0, d.ry || 0), d.value, `bf:${d.id}`);
        return el;
      }
    }
    if (!animating.has(`bf:${d.id}`)) {
      el.style.left = `${d.x}px`;
      el.style.top = `${d.y}px`;
      el.querySelector('.dn').textContent = d.value == null ? '?' : String(d.value);
      el.classList.toggle('rolled', d.value != null);
    }
    return el;
  }

  /** Play a die's tumble: positions from the shared simulation, numbers flicker until it stops. */
  function animateDie(el, frames, value, key) {
    if (document.hidden) {
      // tab not visible: just show where it landed
      const [x, y] = frames[frames.length - 1];
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.querySelector('.dn').textContent = String(value);
      el.classList.add('rolled');
      return;
    }
    animating.add(key);
    el.classList.add('rolling');
    el.classList.remove('rolled');
    const num = el.querySelector('.dn');
    const start = performance.now();
    let lastFlip = -1;
    const step = (now) => {
      const i = Math.max(0, Math.min(frames.length - 1, Math.floor(((now - start) / 1000) * 60)));
      const [x, y, rot] = frames[i];
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = `rotate(${rot}deg)`;
      const remaining = frames.length - i;
      const every = remaining > 40 ? 3 : remaining > 15 ? 6 : 10;
      if (Math.floor(i / every) !== lastFlip) {
        lastFlip = Math.floor(i / every);
        num.textContent = String(1 + Math.floor(Math.random() * 20));
      }
      if (i < frames.length - 1) requestAnimationFrame(step);
      else {
        num.textContent = String(value);
        el.style.transform = '';
        el.classList.remove('rolling');
        el.classList.add('rolled', 'landed');
        setTimeout(() => el.classList.remove('landed'), 600);
        animating.delete(key);
      }
    };
    requestAnimationFrame(step);
  }

  /** Track a flick gesture on an element; calls done({vx, vy, moved, dx, dy}) in px/second. */
  function trackFlick(e, onMove, done) {
    const samples = [[performance.now(), e.clientX, e.clientY]];
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev) => {
      samples.push([performance.now(), ev.clientX, ev.clientY]);
      if (samples.length > 12) samples.shift();
      if (onMove) onMove(ev.clientX - sx, ev.clientY - sy);
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      const now = performance.now();
      const recent = samples.filter((s) => now - s[0] < 110);
      const first = recent[0] || samples[0];
      const dt = Math.max(16, now - first[0]);
      const vx = ((ev.clientX - first[1]) / dt) * 1000;
      const vy = ((ev.clientY - first[2]) / dt) * 1000;
      done({ vx, vy, moved: Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8, dx: ev.clientX - sx, dy: ev.clientY - sy });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function randomFlick() {
    const a = Math.random() * Math.PI * 2;
    const sp = 1400 + Math.random() * 1400;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
  }

  /** Pointer down on a battlefield die. */
  function onDieDown(e, el) {
    const d = S.dice[el.dataset.die];
    if (!d || d.owner !== S.you || animating.has(`bf:${d.id}`)) return;
    e.preventDefault();
    e.stopPropagation();
    const z = (views[el.dataset.pid] || { z: 1 }).z;
    const ox = d.x;
    const oy = d.y;
    trackFlick(
      e,
      (dx, dy) => {
        el.style.left = `${clamp(ox + dx / z, 0, S.table.w - 70)}px`;
        el.style.top = `${clamp(oy + dy / z, 0, S.table.h - 70)}px`;
      },
      ({ vx, vy, moved, dx, dy }) => {
        const x = clamp(ox + dx / z, 0, S.table.w - 70);
        const y = clamp(oy + dy / z, 0, S.table.h - 70);
        const speed = Math.hypot(vx, vy);
        if (!moved && d.value != null) return act({ type: 'removeDie', dieId: d.id });
        if (speed < 250) {
          if (!moved) {
            const f = randomFlick();
            return act({ type: 'rollDie', dieId: d.id, x, y, vx: f.vx / z / 2, vy: f.vy / z / 2 });
          }
          el.style.left = `${ox}px`;
          el.style.top = `${oy}px`;
          return toast('Flick the die (a quick swipe) to roll it.');
        }
        act({ type: 'rollDie', dieId: d.id, x, y, vx: vx / z, vy: vy / z });
      },
    );
  }

  /* ========================================== opening hands + turn order */

  let setupDismissedKey = null;
  const traySeen = {};

  function setupKey() {
    return S.setup ? `${S.setup.rollers.join()}|${JSON.stringify(S.setup.results)}` : null;
  }

  function renderSetup() {
    const box = $('#setup');
    const st = S.setup;
    if (!st || (st.stage === 'done' && setupDismissedKey === setupKey())) {
      box.hidden = true;
      box.innerHTML = '';
      box.dataset.stage = '';
      return;
    }
    box.hidden = false;
    if (st.stage === 'mulligan') {
      box.className = 'setup mull';
      const mine = st.rollers.includes(S.you);
      const kept = st.kept[S.you];
      box.dataset.stage = 'mulligan';
      box.innerHTML = `<div class="setup-card">
        <b>Opening hands</b>
        <div class="who">${st.rollers
          .map((id) => {
            const p = playerById(id);
            const m = st.mulls[id] || 0;
            return `<span class="${st.kept[id] ? 'ok' : ''}">${esc(p ? p.name : '?')}: ${st.kept[id] ? 'kept ✓' : 'deciding…'}${m ? ` (${m} mulligan${m === 1 ? '' : 's'})` : ''}</span>`;
          })
          .join('')}</div>
        ${mine && !kept ? '<div class="row gap"><button class="btn" data-setup="mulligan">Mulligan (shuffle &amp; draw 7)</button><button class="btn primary" data-setup="keep">Keep hand</button></div>' : mine ? '<div class="muted small">Waiting for everyone to keep…</div>' : ''}
      </div>`;
      return;
    }
    // roll / done: the dice tray
    box.className = 'setup tray-mode';
    if (box.dataset.stage !== 'tray') {
      box.dataset.stage = 'tray';
      box.innerHTML = `<div class="tray-wrap"><div class="tray-head"></div>
        <div class="tray-box"><div class="tray" style="width:${S.tray.w}px;height:${S.tray.h}px"></div></div>
        <div class="tray-foot"></div></div>`;
      fitTray();
    }
    const tray = $('.tray', box);
    st.rollers.forEach((id, idx) => {
      let el = tray.querySelector(`.die[data-roller="${id}"]`);
      const p = playerById(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'die big';
        el.dataset.roller = id;
        el.innerHTML = `${D20_SVG}<span class="dn">?</span><span class="dname"></span>`;
        el.style.left = `${60 + idx * ((S.tray.w - 200) / Math.max(1, st.rollers.length - 1 || 1))}px`;
        el.style.top = `${S.tray.h - 110}px`;
        tray.appendChild(el);
      }
      el.style.setProperty('--dc', p ? p.color : '#888');
      el.querySelector('.dname').textContent = p ? (id === S.you ? 'You' : p.name) : '?';
      const anim = st.anims[id];
      const can = st.stage === 'roll' && st.eligible.includes(id);
      el.classList.toggle('mine', id === S.you && can);
      el.classList.toggle('waiting', can);
      if (anim && traySeen[id] !== anim.seq) {
        traySeen[id] = anim.seq;
        if (!firstState) animateDie(el, E.simulateDie(anim.sx, anim.sy, anim.vx, anim.vy, S.tray.w, S.tray.h), anim.value, `tray:${id}`);
        else {
          const last = E.simulateDie(anim.sx, anim.sy, anim.vx, anim.vy, S.tray.w, S.tray.h).pop();
          el.style.left = `${last[0]}px`;
          el.style.top = `${last[1]}px`;
          el.querySelector('.dn').textContent = String(anim.value);
          el.classList.add('rolled');
        }
      } else if (can && anim && !animating.has(`tray:${id}`)) {
        el.querySelector('.dn').textContent = '?';
        el.classList.remove('rolled');
      }
    });
    const head = $('.tray-head', box);
    const foot = $('.tray-foot', box);
    if (st.stage === 'roll') {
      const myTurn = st.eligible.includes(S.you);
      head.innerHTML = `<b>Roll for turn order${st.round > 1 ? ' (tie, roll again!)' : ''}</b><span class="muted">${myTurn ? 'Flick your die. Swipe it quickly in any direction.' : 'Waiting for the others to roll…'}</span>`;
      foot.innerHTML = '';
    } else {
      const names = S.order.map((id) => esc((playerById(id) || {}).name || '?'));
      head.innerHTML = `<b>${names[0]} goes first!</b><span class="muted">Turn order: ${names.join(' → ')}</span>`;
      if (!foot.innerHTML) foot.innerHTML = '<button class="btn primary" data-setup="close">Let\'s play</button>';
    }
  }

  function fitTray() {
    const box = $('#setup .tray-box');
    const tray = $('#setup .tray');
    if (!box || !tray || !S) return;
    const r = box.getBoundingClientRect();
    const z = Math.min(r.width / S.tray.w, r.height / S.tray.h);
    tray.style.transform = `scale(${z})`;
    tray.dataset.z = String(z);
    box.style.setProperty('--tz', z);
  }
  window.addEventListener('resize', fitTray);

  $('#setup').addEventListener('click', (e) => {
    const b = e.target.closest('[data-setup]');
    if (!b) return;
    if (b.dataset.setup === 'mulligan') act({ type: 'mulligan' });
    if (b.dataset.setup === 'keep') act({ type: 'keep' });
    if (b.dataset.setup === 'close') {
      setupDismissedKey = setupKey();
      renderSetup();
    }
  });

  $('#setup').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.die.mine');
    if (!el || !S.setup || S.setup.stage !== 'roll') return;
    e.preventDefault();
    const tray = $('#setup .tray');
    const z = Number(tray.dataset.z || 1);
    const ox = parseFloat(el.style.left);
    const oy = parseFloat(el.style.top);
    trackFlick(
      e,
      (dx, dy) => {
        el.style.left = `${clamp(ox + dx / z, 0, S.tray.w - 70)}px`;
        el.style.top = `${clamp(oy + dy / z, 0, S.tray.h - 70)}px`;
      },
      ({ vx, vy, moved }) => {
        el.style.left = `${ox}px`;
        el.style.top = `${oy}px`;
        let f = { vx: vx / z, vy: vy / z };
        if (Math.hypot(vx, vy) < 250) {
          if (moved) return toast('Flick it! A quick swipe rolls the die.');
          f = randomFlick();
        }
        act({ type: 'rollInitiative', ...f });
      },
    );
  });

  /* ============================================================= combat */

  let combatDef = null; // which defending player's side of combat we're looking at

  function combatInfo() {
    const cb = S.combat;
    if (!cb) return null;
    const attacking = new Set(cb.attacks.map((a) => a.cardId));
    const blocking = new Set();
    for (const a of cb.attacks) for (const b of a.blockers) blocking.add(b);
    return { cb, attacking, blocking };
  }

  /** Defenders you can flip between in the combat box. */
  function combatDefenders() {
    const cb = S.combat;
    return seatOrder().filter((id) => id !== cb.attacker);
  }

  function currentCombatDef() {
    const cb = S.combat;
    const list = combatDefenders();
    if (!U.phone && cb.attacker === S.you && boardView !== 'grid' && list.includes(selectedOpp)) combatDef = selectedOpp;
    if (!list.includes(combatDef)) combatDef = list.includes(S.you) ? S.you : list[0];
    return combatDef;
  }

  function setCombatDef(id) {
    combatDef = id;
  }

  function switchCombatDef(dir) {
    const list = combatDefenders();
    const i = list.indexOf(currentCombatDef());
    combatDef = list[(i + dir + list.length) % list.length];
    if (S.combat.attacker === S.you) selectedOpp = combatDef;
    render();
  }

  /**
   * One attacker's column. Your own creatures are always nearest you:
   * attacking → blockers come from above; defending → the attacker comes from above.
   */
  function combatColumnHTML(at, cb) {
    const iAttack = cb.attacker === S.you;
    const iDefend = at.defender === S.you;
    const att = S.cards[at.cardId];
    const mods = at.mods
      .map((m, i) => `<button class="cb-mod" data-cb="mod" data-at="${at.id}" data-i="${i}" title="Tap to re-order or remove">${m.op === 'x' ? `×${m.n}` : sign(m.n)}</button>`)
      .join('<span class="cb-arrow">→</span>');
    const blockers = at.blockers
      .map(
        (bid, i) => `<div class="cb-blocker">${S.cards[bid] ? cardHTML(S.cards[bid], 'combat') : ''}
          ${(iAttack || iDefend) && at.blockers.length > 1 ? `<div class="cb-bbtns"><button class="btn tiny" data-cb="bup" data-at="${at.id}" data-i="${i}" title="Earlier">‹</button><button class="btn tiny" data-cb="bdown" data-at="${at.id}" data-i="${i}" title="Later">›</button></div>` : ''}
          ${iDefend ? `<button class="btn tiny cb-x" data-cb="unblock" data-card="${bid}" title="Stop blocking">✕</button>` : ''}</div>`,
      )
      .join('');
    const blockSec = `<div class="cb-blockers">${blockers || `<div class="cb-noblock">${iDefend ? 'drop a blocker' : 'unblocked'}</div>`}</div>`;
    const attSec = `<div class="cb-att">${att ? cardHTML(att, 'combat') : ''}${iAttack ? `<button class="btn tiny cb-x" data-cb="unattack" data-at="${at.id}" title="Stop attacking">✕</button>` : ''}</div>`;
    return `<div class="cb-col" data-drop="block" data-attack="${at.id}">
      <div class="cb-dmg" title="Damage if it connects">${at.dmg == null ? '?' : at.dmg}</div>
      ${mods ? `<div class="cb-mods">${mods}</div>` : ''}
      ${iAttack ? blockSec + attSec : attSec + blockSec}
      ${iAttack ? `<div class="cb-btns"><button class="btn tiny" data-cb="plus" data-at="${at.id}">+X</button><button class="btn tiny" data-cb="times" data-at="${at.id}">×N</button>${at.mods.length ? `<button class="btn tiny" data-cb="reset" data-at="${at.id}">reset</button>` : ''}</div>` : ''}
    </div>`;
  }

  /** Targets (player + their planeswalkers/battles) with their columns. Shared by computer and phone. */
  function combatTargetsHTML(def) {
    const cb = S.combat;
    const defP = playerById(def);
    const iAttack = cb.attacker === S.you;
    const targets = [{ kind: 'player', id: def }];
    for (const id of defP ? defP.zones.battlefield : []) {
      const c = S.cards[id];
      if (c && /\b(Planeswalker|Battle)\b/.test(c.typeLine || '')) targets.push({ kind: 'pw', id });
    }
    const atFor = (t) => cb.attacks.filter((a) => a.target.kind === t.kind && a.target.id === t.id);
    const total = (list) => list.reduce((s, a) => s + (a.dmg || 0), 0);
    const html = targets
      .map((t) => {
        const list = atFor(t);
        const cols = list.map((a) => combatColumnHTML(a, cb)).join('');
        if (t.kind === 'player')
          return `<div class="cb-target player" data-drop="attack" data-tkind="player" data-tid="${t.id}" style="flex:${Math.max(2, list.length + 1)} 1 0">
            <div class="cb-tlabel"><span class="dot" style="background:${esc(defP ? defP.color : '#888')}"></span>${esc(def === S.you ? 'You' : defP ? defP.name : '?')}
              <span class="muted">${defP ? defP.life : '?'} life</span><span class="cb-sum" title="Damage at the player if everything connects">${total(list)}</span></div>
            <div class="cb-cols">${cols || `<div class="cb-empty">${iAttack ? 'drop attackers here' : 'no attackers'}</div>`}</div></div>`;
        const pw = S.cards[t.id];
        // planeswalkers / battles use their card as the header; their area grows with each attacker
        return `<div class="cb-target pw" data-drop="attack" data-tkind="pw" data-tid="${t.id}" style="flex:${list.length || 0.01} 0 auto">
          <div class="cb-pwhead">${cardHTML(pw, 'combat')}<span class="cb-sum">${total(list)}</span></div>
          <div class="cb-cols">${cols}</div></div>`;
      })
      .join('');
    return { html, playerTotal: total(atFor(targets[0])) };
  }

  /** Creatures you could still attack or block with (computer overlay's bottom row). */
  function combatAvailable() {
    const cb = S.combat;
    const mine = me();
    if (!mine) return [];
    const iAttack = cb.attacker === S.you;
    const defending = cb.attacks.some((a) => a.defender === S.you);
    if (!iAttack && !defending) return [];
    const busy = new Set(iAttack ? cb.attacks.map((a) => a.cardId) : cb.attacks.flatMap((a) => a.blockers));
    return mine.zones.battlefield.map((id) => S.cards[id]).filter((c) => c && !c.hidden && /\bCreature\b/.test(c.typeLine || '') && !c.tapped && !busy.has(c.id));
  }

  function combatBarHTML(playerTotal) {
    const cb = S.combat;
    const iAttack = cb.attacker === S.you;
    const inIt = cb.participants.includes(S.you);
    const ready = cb.participants
      .map((id) => `<span class="cb-chip ${cb.done[id] ? 'ok' : ''}">${esc(id === S.you ? 'You' : (playerById(id) || {}).name || '?')} ${cb.done[id] ? '✓' : '…'}</span>`)
      .join('');
    return `<span class="cb-total">Total <b>${playerTotal}</b></span><span class="cb-ready">${ready}</span><span class="spacer"></span>
      ${U.phone ? '' : '<button class="btn small" data-cb="hide">View field</button>'}
      ${iAttack && !U.phone ? '<button class="btn small ghost" data-cb="cancel">Cancel combat</button>' : ''}
      ${inIt ? `<button class="btn ${cb.done[S.you] ? '' : 'primary'} cb-donebtn" data-cb="done">${cb.done[S.you] ? 'Not done yet' : 'Done ✓'}</button>` : ''}`;
  }

  let combatHidden = false;
  let lastCombatKey = null;

  /** Computer: combat is a see-through layer over the whole table. */
  function renderCombat() {
    const box = $('#combat');
    const cb = S.combat;
    const isActive = S.turn.active === S.you;
    $('#btn-combat').hidden = !isActive || !!cb;
    const key = cb ? cb.attacker : null;
    if (key !== lastCombatKey) combatHidden = false; // a new combat always opens the overlay
    lastCombatKey = key;
    let back = $('#combat-back');
    if (!cb || U.phone) {
      box.hidden = true;
      box.innerHTML = '';
      if (back) back.hidden = true;
      return;
    }
    if (!back) {
      back = document.createElement('button');
      back.id = 'combat-back';
      back.className = 'btn primary combat-back';
      back.innerHTML = `${ICONS.sword}<span>Back to combat</span>`;
      back.addEventListener('click', () => {
        combatHidden = false;
        render();
      });
      document.body.appendChild(back);
    }
    box.hidden = combatHidden;
    back.hidden = !combatHidden;
    if (combatHidden) return;
    const def = currentCombatDef();
    const defP = playerById(def);
    const attP = playerById(cb.attacker);
    const defs = combatDefenders();
    const t = combatTargetsHTML(def);
    const avail = combatAvailable();
    const iAttack = cb.attacker === S.you;
    box.className = 'combat combat-ov';
    box.innerHTML = `<div class="cbo-top">
        ${defs.length > 1 ? '<button class="btn small" data-cb="prev">◀</button>' : ''}
        <span>${esc(iAttack ? 'You' : attP ? attP.name : '?')} attacking <b>${esc(def === S.you ? 'you' : defP ? defP.name : '?')}</b></span>
        ${defs.length > 1 ? '<button class="btn small" data-cb="next">▶</button>' : ''}
      </div>
      <div class="cbo-main">${t.html}</div>
      ${avail.length ? `<div class="cbo-avail"><span class="cbo-lbl">${iAttack ? 'Drag up to attack' : 'Drag up to block'}</span><div class="cbo-cards">${avail.map((c) => cardHTML(c, 'avail')).join('')}</div></div>` : ''}
      <div class="cbo-bar">${combatBarHTML(t.playerTotal)}</div>`;
  }

  $('#combat').addEventListener('click', (e) => combatClick(e));

  async function combatClick(e) {
    const b = e.target.closest('[data-cb]');
    if (!b || !S.combat) return;
    const at = S.combat.attacks.find((a) => a.id === b.dataset.at);
    switch (b.dataset.cb) {
      case 'hide':
        combatHidden = true;
        return render();
      case 'prev':
        return switchCombatDef(-1);
      case 'next':
        return switchCombatDef(1);
      case 'done':
        return act({ type: 'combatDone', value: !S.combat.done[S.you] });
      case 'cancel':
        if (await confirmBox('Cancel combat?', 'All attackers and blockers are cleared and nothing is tapped.', 'Cancel combat', true)) act({ type: 'combatCancel' });
        return;
      case 'unattack':
        return act({ type: 'removeAttack', attackId: b.dataset.at });
      case 'unblock':
        return act({ type: 'unblock', cardId: b.dataset.card });
      case 'plus': {
        const n = await askNumber('Add how much damage? (use a minus number to reduce)', 1);
        if (n) act({ type: 'combatMod', attackId: b.dataset.at, op: '+', n });
        return;
      }
      case 'times': {
        const n = await askNumber('Multiply the damage by?', 2);
        if (n != null) act({ type: 'combatMod', attackId: b.dataset.at, op: 'x', n });
        return;
      }
      case 'reset':
        return act({ type: 'combatMod', attackId: b.dataset.at, op: 'reset' });
      case 'mod': {
        const i = Number(b.dataset.i);
        const r = b.getBoundingClientRect();
        return showMenu(
          [
            { header: 'Damage change (applied left to right)' },
            { label: '◀ Apply earlier', disabled: i === 0, fn: () => act({ type: 'combatMod', attackId: at.id, op: 'move', index: i, dir: 'left' }) },
            { label: 'Apply later ▶', disabled: i === at.mods.length - 1, fn: () => act({ type: 'combatMod', attackId: at.id, op: 'move', index: i, dir: 'right' }) },
            S.combat.attacker === S.you ? { label: 'Remove', fn: () => act({ type: 'combatMod', attackId: at.id, op: 'remove', index: i }) } : null,
          ],
          r.left,
          r.bottom,
        );
      }
      case 'bup':
      case 'bdown': {
        const i = Number(b.dataset.i);
        const j = b.dataset.cb === 'bup' ? i - 1 : i + 1;
        if (j < 0 || j >= at.blockers.length) return;
        const order = at.blockers.slice();
        [order[i], order[j]] = [order[j], order[i]];
        return act({ type: 'orderBlockers', attackId: at.id, order });
      }
      default:
    }
  }

  /** Dropping a creature into the combat box. */
  function combatDrop(c, t) {
    const cb = S.combat;
    if (!cb || !c || c.zone !== 'battlefield') return false;
    if (t.dataset.drop === 'attack') {
      if (cb.attacker !== S.you) return toast('Drop your creature on an attacker\'s column to block it.'), true;
      act({ type: 'declareAttack', cardId: c.id, target: { kind: t.dataset.tkind, id: t.dataset.tid } });
      return true;
    }
    if (t.dataset.drop === 'block') {
      const at = cb.attacks.find((a) => a.id === t.dataset.attack);
      if (!at) return true;
      if (cb.attacker === S.you && c.zp === S.you) act({ type: 'declareAttack', cardId: c.id, target: at.target });
      else act({ type: 'block', attackId: at.id, cardId: c.id });
      return true;
    }
    return false;
  }

  /* =========================================================== requests */

  const shownRequests = new Set();

  function renderRequests() {
    const mineOut = (S.requests || []).filter((r) => r.from === S.you);
    const incoming = (S.requests || []).filter((r) => r.to === S.you);
    const banners = $('#banners');
    for (const el of $$('.req-out', banners)) if (!mineOut.some((r) => r.id === el.dataset.req)) el.remove();
    for (const r of mineOut) {
      if ($(`.req-out[data-req="${r.id}"]`, banners)) continue;
      const to = playerById(r.to);
      const div = document.createElement('div');
      div.className = 'banner req-out';
      div.dataset.req = r.id;
      div.innerHTML = `<span>Waiting for <b>${esc(to ? to.name : '?')}</b> to allow: ${esc(r.text)}</span><button class="btn small" data-cancel="${r.id}">Cancel</button>`;
      banners.appendChild(div);
    }
    for (const r of incoming) {
      if (shownRequests.has(r.id)) continue;
      shownRequests.add(r.id);
      const from = playerById(r.from);
      dialog({
        title: `${from ? from.name : 'Someone'} is asking`,
        body: `<p class="req-text">${esc(from ? from.name : 'Someone')} wants to <b>${esc(r.text)}</b>.</p>`,
        buttons: [
          { label: 'Deny', value: 'deny', cls: 'deny' },
          { label: 'Allow', value: 'allow', cls: 'allow' },
        ],
        noDismiss: true,
        onMount(root, close) {
          root.dataset.req = r.id;
          root.classList.add('req-modal');
          // close automatically if the request disappears (cancelled / answered elsewhere)
          const timer = setInterval(() => {
            if (!S || !(S.requests || []).some((x) => x.id === r.id)) {
              clearInterval(timer);
              close('gone');
            }
          }, 500);
        },
      }).then(({ value }) => {
        if (value === 'allow' || value === 'deny') act({ type: 'respond', requestId: r.id, allow: value === 'allow' });
      });
    }
  }

  $('#banners').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cancel]');
    if (b) act({ type: 'cancelRequest', requestId: b.dataset.cancel });
    const m = e.target.closest('[data-mode]');
    if (m) {
      if (m.dataset.mode === 'done') finishMode();
      else cancelMode();
    }
  });

  /* ======================================== proliferate / attach modes */

  function startProliferate() {
    mode = { kind: 'proliferate', cards: new Set(), players: new Set() };
    hideMenu();
    render();
  }

  function startAttach(c) {
    mode = { kind: 'attach', cardId: c.id, name: c.name };
    hideMenu();
    render();
  }

  function cancelMode() {
    mode = null;
    render();
  }

  function finishMode() {
    if (mode && mode.kind === 'proliferate') act({ type: 'proliferate', cardIds: [...mode.cards], playerIds: [...mode.players] });
    mode = null;
    render();
  }

  /** Returns true if the click was used by a mode. */
  function modeClick(target) {
    if (!mode) return false;
    if (mode.kind === 'proliferate') {
      const cardEl2 = target.closest('.card[data-id]');
      const pl = target.closest('[data-act="pick-player"], .plife[data-pid]');
      if (cardEl2) {
        const c = getCard(cardEl2.dataset.id);
        if (c && c.zone === 'battlefield') mode.cards.has(c.id) ? mode.cards.delete(c.id) : mode.cards.add(c.id);
      } else if (pl) {
        const id = pl.dataset.pid;
        mode.players.has(id) ? mode.players.delete(id) : mode.players.add(id);
      } else return false;
      render();
      return true;
    }
    if (mode.kind === 'attach') {
      const cardEl2 = target.closest('.card[data-id]');
      if (!cardEl2) return false;
      const t = getCard(cardEl2.dataset.id);
      if (!t || t.zone !== 'battlefield' || t.id === mode.cardId) return true;
      act({ type: 'attach', cardId: mode.cardId, targetId: t.id });
      mode = null;
      render();
      return true;
    }
    return false;
  }

  function renderModeBanner() {
    const banners = $('#banners');
    let el = $('.mode-banner', banners);
    if (!mode) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'banner mode-banner';
      banners.prepend(el);
    }
    el.innerHTML =
      mode.kind === 'proliferate'
        ? `<span><b>Proliferate:</b> ${U.phone ? 'tap' : 'click'} permanents and players with counters (${mode.cards.size + mode.players.size} picked)</span>
           <button class="btn small primary" data-mode="done">Done</button><button class="btn small" data-mode="cancel">Cancel</button>`
        : `<span><b>Attach ${esc(mode.name)}:</b> ${U.phone ? 'tap' : 'click'} the creature to attach it to</span><button class="btn small" data-mode="cancel">Cancel</button>`;
  }

  /* ================================================== pointer: drag / pan */

  let drag = null;
  let pan = null;

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-drop]') : null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (U.phone || e.button !== 0 || $('#game').hidden) return;
    hideMenu(e);
    const dieE = e.target.closest('.bf .die');
    if (dieE) return onDieDown(e, dieE);
    const el = e.target.closest('.card[data-id]');
    if (el && !el.closest('.token-results') && !el.closest('.modal')) {
      if (mode) return;
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
    if (bf && !e.target.closest('.bf-controls') && !e.target.closest('.ppanel')) {
      const v = views[bf.dataset.pid];
      pan = { pid: bf.dataset.pid, bf, sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y };
      bf.classList.add('panning');
      e.preventDefault();
    }
    const vh = e.target.closest('.viewer .vh');
    if (vh && !e.target.closest('button, input')) {
      const box = $('#viewer').getBoundingClientRect();
      pan = { viewer: true, sx: e.clientX, sy: e.clientY, ox: box.left, oy: box.top };
      e.preventDefault();
    }
  });

  let lastHoverTarget = null;
  document.addEventListener('pointermove', (e) => {
    if (U.phone) return;
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
    if (U.phone) return;
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
      if (d.ctx === 'bf') act({ type: 'tap', cardId: d.id });
      else if (d.ctx === 'pile') {
        const pileEl = d.el.closest('[data-pile]');
        if (pileEl) openViewer(S.you, pileEl.dataset.pile);
      } else if (d.ctx === 'libtop') libraryClick(e.clientX, e.clientY);
      return;
    }
    d.el.classList.remove('dragging-src');
    if (d.ghost) d.ghost.remove();
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const t = under ? under.closest('[data-drop]') : null;
    if (t) dropOn(d, t, e.clientX, e.clientY, under);
  });

  async function dropOn(d, t, cx, cy, under) {
    const c = d.card;
    switch (t.dataset.drop) {
      case 'bf': {
        const pid = t.dataset.player;
        const targetCard = under && under.closest('.card[data-id]');
        if (targetCard && targetCard.dataset.id !== c.id && isEquipLike(c)) {
          const host = getCard(targetCard.dataset.id);
          if (host && host.zone === 'battlefield') {
            if (c.zone !== 'battlefield') {
              const r = await act({ type: 'move', cardId: c.id, to: 'battlefield', playerId: S.you });
              if (r.error) return;
            }
            return act({ type: 'attach', cardId: c.id, targetId: host.id });
          }
        }
        const r = t.getBoundingClientRect();
        const z = views[pid].z;
        const x = clamp((cx - r.left) / z - d.offX, 0, S.table.w - S.table.cardW);
        const y = clamp((cy - r.top) / z - d.offY, 0, S.table.h - S.table.cardH);
        if (c.zone === 'battlefield' && c.zp === pid) {
          if (c.attachedTo) await act({ type: 'unattach', cardId: c.id });
          d.el.style.left = `${x}px`;
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
      case 'hand': {
        const index = handIndexAt(cx, c.id);
        if (c.zone === 'hand' && c.zp === S.you) act({ type: 'reorderHand', cardId: c.id, index });
        else act({ type: 'move', cardId: c.id, to: 'hand', pos: index });
        break;
      }
      case 'stack':
        if (c.zone !== 'stack') act({ type: 'move', cardId: c.id, to: 'stack' });
        break;
      case 'attack':
      case 'block':
        combatDrop(c, t);
        break;
      default:
        break;
    }
  }

  /** Where in the hand a card dropped at screen x should go. */
  function handIndexAt(cx, skipId, container = $('#hand')) {
    const els = $$('.card[data-id]', container).filter((el) => el.dataset.id !== skipId);
    let i = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (cx > r.left + r.width / 2) i++;
    }
    return i;
  }

  document.addEventListener('dblclick', (e) => {
    if (U.phone || mode) return;
    const el = e.target.closest('.card[data-id]');
    if (!el) return;
    const c = getCard(el.dataset.id);
    if (!c) return;
    const ctx = el.dataset.ctx;
    if (ctx === 'hand') playFromHand(c, 'battlefield');
    else if (ctx === 'stack') resolveStack(c, true);
    else if (ctx === 'viewer') act({ type: 'move', cardId: c.id, to: 'hand' });
  });

  function playFromHand(c, where) {
    if (where === 'auto') where = isLandCard(c) ? 'battlefield' : 'stack';
    return act({ type: 'move', cardId: c.id, to: where });
  }

  function resolveStack(c, resolves) {
    if (!resolves) return act({ type: 'move', cardId: c.id, to: 'graveyard' });
    const permanent = isPermanentCard(c);
    return act({ type: 'move', cardId: c.id, to: permanent ? 'battlefield' : 'graveyard' });
  }

  /* ============================================================ preview */

  document.addEventListener('pointerover', (e) => {
    if (U.phone || e.pointerType !== 'mouse' || drag) return;
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
    const sum = c.zone === 'battlefield' || c.isCommander || c.note ? summaryHTML(c) : '';
    p.innerHTML =
      (sum ? `<div class="psum">${sum}</div>` : '') +
      (imgs.length
        ? imgs.map((u) => `<img src="${esc(large(u))}" alt="">`).join('')
        : `<div class="ptext"><b>${esc(c.name)}</b><br><span class="muted">${esc(c.typeLine || '')}</span>${c.pt ? `<br>${esc(c.pt)}` : ''}<p class="small">${esc(c.oracle || '')}</p></div>`);
    p.hidden = false;
    const w = p.getBoundingClientRect().width;
    const side = $('#game').classList.contains('no-log') ? 0 : 290;
    const left = cx < innerWidth / 2 ? innerWidth - w - side - 16 : 16;
    p.style.left = `${Math.max(8, left)}px`;
    p.style.top = '60px';
  }
  function hidePreview() {
    $('#preview').hidden = true;
  }

  /* ======================================================= context menus */

  function showMenu(items, x, y, opts = {}) {
    const m = $('#menu');
    m.classList.toggle('sheet', !!U.phone);
    let host = m;
    if (U.phone) {
      m.innerHTML = `<div class="sheet-bg"></div><div class="sheet-body">${opts.head ? `<div class="sheet-left">${opts.head}</div>` : ''}<div class="sheet-items"></div></div>`;
      host = m.querySelector('.sheet-items');
      m.querySelector('.sheet-bg').addEventListener('click', () => (m.hidden = true));
      const close = document.createElement('button');
      close.className = 'mi sheet-close';
      close.textContent = '✕ Close';
      close.addEventListener('click', () => (m.hidden = true));
      host.appendChild(close);
    } else m.innerHTML = opts.head || '';
    for (const it of items) {
      if (!it) continue;
      if (it.sep) {
        host.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
        continue;
      }
      if (it.header) {
        host.insertAdjacentHTML('beforeend', `<div class="mh">${esc(it.header)}</div>`);
        continue;
      }
      if (it.href) {
        host.insertAdjacentHTML('beforeend', `<a class="mi" href="${esc(it.href)}" target="_blank" rel="noopener">${esc(it.label)}</a>`);
        continue;
      }
      if (it.row) {
        const row = document.createElement('div');
        row.className = 'mrow2';
        for (const sub of it.row) {
          const b = document.createElement('button');
          b.className = `mi ${sub.cls || ''}`;
          b.textContent = sub.label;
          b.addEventListener('click', () => {
            m.hidden = true;
            sub.fn();
          });
          row.appendChild(b);
        }
        host.appendChild(row);
        continue;
      }
      const b = document.createElement('button');
      b.className = `mi ${it.disabled ? 'disabled' : ''} ${it.cls || ''}`;
      if (it.icon) b.innerHTML = `${it.icon}<span>${esc(it.label)}</span>`;
      else b.textContent = it.label;
      b.addEventListener('click', () => {
        m.hidden = true;
        it.fn();
      });
      host.appendChild(b);
    }
    m.hidden = false;
    if (U.phone) {
      m.style.left = '';
      m.style.top = '';
      return;
    }
    const r = m.getBoundingClientRect();
    m.style.left = `${clamp(x, 4, innerWidth - r.width - 4)}px`;
    m.style.top = `${clamp(y, 4, innerHeight - r.height - 4)}px`;
  }
  function hideMenu(e) {
    if (e && e.target && e.target.closest && e.target.closest('#menu')) return;
    $('#menu').hidden = true;
  }
  document.addEventListener('scroll', (e) => {
    if (!(e.target && e.target.closest && e.target.closest('#menu'))) hideMenu();
  }, true);

  document.addEventListener('contextmenu', (e) => {
    if (U.phone) {
      e.preventDefault();
      return;
    }
    if ($('#game').hidden) return;
    if (e.target.closest('input, textarea')) return;
    const cardElm = e.target.closest('.card[data-id]');
    let items = null;
    if (cardElm) {
      const c = getCard(cardElm.dataset.id);
      if (c) items = cardMenu(c, cardElm.dataset.ctx);
      if (c && c.zone === 'battlefield' && Object.keys(c.counters || {}).length) openCounterPanel(c.id, cardElm);
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
    if (c.zone === 'stack') {
      items.push({ label: '✓ Resolves', cls: 'go', fn: () => resolveStack(c, true) });
      items.push({ label: "✗ Doesn't resolve (to graveyard)", cls: 'stop', fn: () => resolveStack(c, false) });
    }
    if (ctx === 'hand' && U.phone) {
      items.push({ label: isLandCard(c) ? 'Play land' : 'Cast (to the stack)', cls: 'go', fn: () => playFromHand(c, 'auto') });
      if (!isLandCard(c)) items.push({ label: 'Put straight onto the battlefield', fn: () => playFromHand(c, 'battlefield') });
    }
    if (onBf) {
      items.push({ label: c.tapped ? 'Untap  (T)' : 'Tap  (T)', fn: () => act({ type: 'tap', cardId: c.id }) });
      items.push({ label: 'Counters…', fn: () => countersDialog(c.id) });
      items.push({ label: 'Power/toughness bonus…', fn: () => ptDialog(c) });
      if (c.backImg) items.push({ label: 'Transform / flip  (F)', fn: () => act({ type: 'flip', cardId: c.id }) });
      items.push({ label: c.faceDown ? 'Turn face up' : 'Turn face down', fn: () => act({ type: 'faceDown', cardId: c.id }) });
      if (c.attachedTo) items.push({ label: 'Unattach', fn: () => act({ type: 'unattach', cardId: c.id }) });
      else items.push({ label: 'Attach to…', fn: () => startAttach(c) });
      items.push({ label: c.note ? 'Edit note…' : 'Add note…', fn: () => noteDialog(c) });
      if (!c.hidden) items.push({ label: 'Create a token copy', fn: () => act({ type: 'clone', cardId: c.id }) });
      if (U.phone)
        for (const p of S.players)
          if (p.id !== c.zp) items.push({ label: `Give control to ${p.name}`, fn: () => act({ type: 'move', cardId: c.id, to: 'battlefield', playerId: p.id }) });
    } else if (c.backImg && !c.hidden && c.zone !== 'library') {
      items.push({ label: 'Transform / flip', fn: () => act({ type: 'flip', cardId: c.id }) });
    }
    if (!c.hidden && c.zone !== 'library') items.push({ label: 'Effects…', fn: () => effectsDialog(c) });
    if (c.tokens && c.tokens.length) {
      items.push({ sep: true });
      for (const t of c.tokens.slice(0, 6)) items.push({ label: `Create token: ${t.name}`, fn: () => createRelatedToken(t) });
    }
    items.push({ sep: true });
    items.push({ header: 'Move to' });
    const mv = (label, to, extra = {}) => ({ label, fn: () => act({ type: 'move', cardId: c.id, to, ...extra }) });
    // On a computer you drag cards to the battlefield, hand, stack, graveyard, exile and library,
    // so only the moves dragging can't do are listed. Phones keep the full list.
    const full = U.phone;
    if (!onBf && full) items.push(mv('Battlefield', 'battlefield', { playerId: S.you }));
    if (ctx === 'hand') items.push(mv('Battlefield face down', 'battlefield', { playerId: S.you, faceDown: true }));
    if (c.zone !== 'stack' && full) items.push(mv('Stack', 'stack'));
    if (c.zone !== 'hand' && full) items.push(mv("Owner's hand", 'hand'));
    if (c.zone !== 'graveyard' && full) items.push(mv('Graveyard', 'graveyard'));
    if (c.zone !== 'exile' && full) items.push(mv('Exile', 'exile'));
    if (c.zone !== 'exile') items.push(mv('Exile face down', 'exile', { faceDown: true }));
    if (full) items.push(mv('Top of library', 'library', { pos: 'top' }));
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
    const ask = (title, def, fn) => async () => {
      const n = await askNumber(title, def);
      if (n) fn(n);
    };
    return [
      { header: `Your library (${m ? m.libraryCount : 0}) · double-click to draw` },
      { row: [{ label: 'Draw', fn: () => act({ type: 'draw', n: 1 }) }, { label: 'Draw X…', cls: 'x', fn: ask('Draw how many?', 2, (n) => act({ type: 'draw', n })) }] },
      { row: [{ label: 'Mill', fn: () => act({ type: 'mill', n: 1 }) }, { label: 'Mill X…', cls: 'x', fn: ask('Mill how many?', 2, (n) => act({ type: 'mill', n })) }] },
      { row: [{ label: 'Peek', fn: () => openViewer(S.you, 'library', 1) }, { label: 'Peek X…', cls: 'x', fn: ask('Look at how many cards from the top?', 3, (n) => openViewer(S.you, 'library', n)) }] },
      { label: 'Reveal until…', fn: revealDialog },
      { label: 'Search…', fn: () => openViewer(S.you, 'library') },
      { label: 'Shuffle', fn: () => act({ type: 'shuffle' }) },
      { sep: true },
      { label: 'Exile top card', fn: () => act({ type: 'exileTop', n: 1 }) },
      { label: 'Exile top card face down', fn: () => act({ type: 'exileTop', n: 1, faceDown: true }) },
      { label: m && m.revealTop ? 'Stop revealing top card' : 'Play with top card revealed', fn: () => act({ type: 'revealTop' }) },
      {
        label: 'Shuffle hand in & draw 7',
        fn: async () => {
          if (await confirmBox('Shuffle hand in and draw 7?', 'Your hand is shuffled into your library and you draw a new 7.', 'Do it')) act({ type: 'mulligan' });
        },
      },
    ];
  }

  /** Single click = menu, double click = draw (the first click waits a moment to tell them apart). */
  let libClickTimer = null;
  function libraryClick(x, y) {
    if (libClickTimer) {
      clearTimeout(libClickTimer);
      libClickTimer = null;
      return act({ type: 'draw', n: 1 });
    }
    libClickTimer = setTimeout(() => {
      libClickTimer = null;
      showMenu(libraryMenu(), x, y);
    }, 260);
  }

  async function revealDialog() {
    const { value, root } = await dialog({
      title: 'Reveal until…',
      body: `<p class="muted small" style="margin:0">Cards are revealed from the top of your library, one at a time, until one matches everything you set. Everyone sees them.</p>
        <label class="form">Card type or word <input id="rv-type" placeholder="e.g. creature, land, Dragon, Equipment"></label>
        <label class="form">Colour <select id="rv-color"><option value="">any</option>${['W', 'U', 'B', 'R', 'G', 'C', 'M']
          .map((c) => `<option value="${c}">${{ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless', M: 'multicolored' }[c]}</option>`)
          .join('')}</select></label>
        <label class="form">Mana value <span class="row gap"><select id="rv-op"><option value="">any</option><option value="<=">at most</option><option value="=">exactly</option><option value=">=">at least</option></select>
          <input id="rv-mv" type="number" min="0" value="3" style="width:80px"></span></label>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Reveal', value: 'ok', primary: true }],
    });
    if (value !== 'ok') return;
    act({
      type: 'revealUntil',
      typeWord: root.querySelector('#rv-type').value.trim(),
      color: root.querySelector('#rv-color').value,
      mvOp: root.querySelector('#rv-op').value,
      mv: Number(root.querySelector('#rv-mv').value) || 0,
    });
  }

  /** Everyone sees revealed cards; the revealer chooses where they go. */
  function renderReveal() {
    let box = $('#reveal');
    const rv = S.reveal;
    if (!rv) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'reveal';
      box.className = 'reveal';
      document.body.appendChild(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rv]');
        if (b) b.parentElement.querySelectorAll('[data-rv]').forEach((x) => x.classList.toggle('on', x === b));
        if (e.target.closest('.rv-go')) {
          const f = box.querySelector('[data-grp="found"] .on');
          const r = box.querySelector('[data-grp="rest"] .on');
          act({ type: 'resolveReveal', found: f ? f.dataset.rv : 'hand', rest: r ? r.dataset.rv : 'bottom' });
        }
      });
    }
    const who = playerById(rv.pid);
    const mine = rv.pid === S.you;
    const key = `${rv.ids.join()}|${mine}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.innerHTML = `<div class="rv-head"><b>${esc(who ? (mine ? 'You' : who.name) : '?')} revealed until ${esc(rv.crit)}</b>
        <span class="muted">${rv.found ? 'Found one!' : 'Nothing matched.'}</span></div>
      <div class="rv-cards">${rv.ids.map((id) => `<div class="rv-card ${id === rv.found ? 'found' : ''}">${cardHTML(S.cards[id], 'reveal')}</div>`).join('')}</div>
      ${
        mine
          ? `<div class="rv-choose">${rv.found ? '<div class="grp" data-grp="found"><span>Found card →</span><button class="btn small on" data-rv="hand">Hand</button><button class="btn small" data-rv="battlefield">Battlefield</button><button class="btn small" data-rv="top">Top of library</button></div>' : ''}
            <div class="grp" data-grp="rest"><span>The rest →</span><button class="btn small on" data-rv="bottom">Bottom (random order)</button><button class="btn small" data-rv="graveyard">Graveyard</button><button class="btn small" data-rv="exile">Exile</button></div>
            <button class="btn primary rv-go">Done</button></div>`
          : `<div class="muted small">Waiting for ${esc(who ? who.name : '?')} to decide where they go…</div>`
      }`;
  }

  /** A little riffle on a library whenever its owner shuffles. */
  const shuffleSeen = {};
  function animateShuffles() {
    for (const p of S.players) {
      const seq = p.shuffleSeq || 0;
      if (shuffleSeen[p.id] === undefined || firstState) {
        shuffleSeen[p.id] = seq;
        continue;
      }
      if (seq === shuffleSeen[p.id]) continue;
      shuffleSeen[p.id] = seq;
      const els = $$(`[data-lib="${p.id}"]`);
      for (const el of els) {
        el.classList.remove('shuffling');
        void el.offsetWidth;
        el.classList.add('shuffling');
        setTimeout(() => el.classList.remove('shuffling'), 900);
      }
    }
  }

  function zoneBulkMenu(zone) {
    return [
      { header: `Your ${zone}` },
      { label: 'View / search', fn: () => openViewer(S.you, zone) },
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
      pid === S.you ? { label: 'Drop a d20 here', fn: () => act({ type: 'placeDie' }) } : null,
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

  const QUICK_COUNTERS = ['+1/+1', '-1/-1', 'charge', 'loyalty', 'shield', 'stun', 'lore', 'time', 'oil', 'fire', 'finality'];

  /** Edit a permanent's counters. Nothing is logged until you press Save; ✕ discards. */
  function openCounterPanel(cardId, anchor) {
    const c = getCard(cardId);
    if (!c) return;
    closeCounterPanel();
    const draft = { ...(c.counters || {}) };
    const box = document.createElement('div');
    box.className = 'cpanel';
    box.id = 'cpanel';
    box.innerHTML = `<div class="cp-head"><b>Counters</b><span class="muted small">${esc(c.faceDown ? 'face-down card' : c.name)}</span><button class="cp-x" title="Close without saving">✕</button></div>
      <div class="cp-rows"></div>
      <div class="quick cp-quick">${QUICK_COUNTERS.map((q) => `<button class="btn tiny" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="row gap"><input class="cp-custom" placeholder="Other counter (e.g. fire)" maxlength="20" data-noenter="1" style="flex:1;min-width:0"><button class="btn small cp-add">Add</button></div>
      <button class="btn primary cp-save">Save</button>`;
    document.body.appendChild(box);
    const draw = () => {
      const keys = Object.keys(draft);
      box.querySelector('.cp-rows').innerHTML = keys.length
        ? keys
            .map(
              (k) => `<div class="cp-row"><span class="nm">${esc(k)}</span><button class="btn tiny" data-k="${esc(k)}" data-d="-1">−</button>
                <input type="number" inputmode="numeric" data-in="${esc(k)}" value="${draft[k]}"><button class="btn tiny" data-k="${esc(k)}" data-d="1">+</button></div>`,
            )
            .join('')
        : '<p class="muted small" style="margin:0">No counters. Add some below.</p>';
    };
    draw();
    box.addEventListener('input', (e) => {
      const k = e.target.dataset.in;
      if (k != null) draft[k] = Number.parseInt(e.target.value, 10) || 0;
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('cp-x')) return closeCounterPanel();
      if (b.classList.contains('cp-save')) {
        act({ type: 'setCounters', cardId, counters: draft });
        return closeCounterPanel();
      }
      if (b.dataset.k) {
        draft[b.dataset.k] = Math.max(0, (draft[b.dataset.k] || 0) + Number(b.dataset.d));
        draw();
      }
      const add = (name) => {
        if (!name) return;
        draft[name] = (draft[name] || 0) + 1;
        draw();
      };
      if (b.dataset.q) add(b.dataset.q);
      if (b.classList.contains('cp-add')) {
        add(box.querySelector('.cp-custom').value.trim());
        box.querySelector('.cp-custom').value = '';
      }
    });
    // place it to the left of the card (or the right if there's no room)
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    const w = box.getBoundingClientRect().width;
    const h = box.getBoundingClientRect().height;
    if (U.phone || !r) {
      box.classList.add('centered');
    } else {
      let left = r.left - w - 10;
      if (left < 6) left = Math.min(innerWidth - w - 6, r.right + 10);
      box.style.left = `${left}px`;
      box.style.top = `${clamp(r.top, 54, innerHeight - h - 6)}px`;
    }
  }
  function closeCounterPanel() {
    const old = $('#cpanel');
    if (old) old.remove();
  }

  function countersDialog(cardId) {
    const el = $(`.card[data-id="${cardId}"]`);
    return openCounterPanel(cardId, el);
  }

  function oldCountersDialog(cardId) {
    const QUICK = ['+1/+1', '-1/-1', 'charge', 'loyalty', 'shield', 'stun', 'lore', 'time', 'oil', 'finality', 'flying', 'deathtouch'];
    dialog({
      title: 'Counters',
      body: `<div id="ctr-list"></div>
        <div class="sect-title">Add a counter</div>
        <div class="quick">${QUICK.map((q) => `<button class="btn small" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="row gap"><input id="ctr-custom" placeholder="Other counter name" maxlength="20" style="flex:1" data-noenter="1"><button class="btn" id="ctr-add">Add</button></div>
        <p class="muted small" style="margin:0">+1/+1 and -1/-1 counters cancel each other out.</p>`,
      buttons: [{ label: 'Done', value: null, primary: true }],
      onMount(root) {
        const draw = () => {
          const c = getCard(cardId);
          if (!c) return;
          const entries = Object.entries(c.counters || {});
          root.querySelector('#ctr-list').innerHTML = entries.length
            ? `<div class="counter-grid">${entries
                .map(
                  ([k, v]) =>
                    `<span>${esc(counterLabel(k, v))}</span><button class="btn tiny" data-k="${esc(k)}" data-d="-1">−</button><b>${v}</b><button class="btn tiny" data-k="${esc(k)}" data-d="1">+</button>`,
                )
                .join('')}</div>`
            : '<p class="muted" style="margin:0">No counters yet.</p>';
        };
        draw();
        const bump = async (name, delta) => {
          await act({ type: 'cardCounter', cardId, name, delta });
          setTimeout(draw, 60);
        };
        renderHooks.push(function hook() {
          if (!document.body.contains(root)) renderHooks.splice(renderHooks.indexOf(hook), 1);
          else draw();
        });
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

  async function ptDialog(c) {
    const cur = c.ptMod || { p: 0, t: 0 };
    const { value, root } = await dialog({
      title: `Power/toughness bonus: ${c.name}`,
      body: `<p class="muted small" style="margin:0">For boosts that aren't counters or saved effects (e.g. an equipment you haven't set up, or "+2/+2 until end of turn"). Type 0 and 0 to clear it.</p>
        <div class="row gap pt-inputs"><label>Power <input type="number" inputmode="numeric" id="pt-p" value="${cur.p}"></label><span class="slash">/</span><label>Toughness <input type="number" inputmode="numeric" id="pt-t" value="${cur.t}"></label></div>`,
      buttons: [{ label: 'Clear', value: 'clear' }, { label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
    });
    if (value === 'clear') return act({ type: 'setPtMod', cardId: c.id, p: 0, t: 0 });
    if (value !== 'ok') return;
    act({ type: 'setPtMod', cardId: c.id, p: Number(root.querySelector('#pt-p').value) || 0, t: Number(root.querySelector('#pt-t').value) || 0 });
  }

  async function noteDialog(c) {
    const t = await askText('Note on card', c.note || '', 'e.g. attacking, monstrous, chosen: Dragons', 'Leave empty to remove the note');
    if (t !== null) act({ type: 'note', cardId: c.id, text: t });
  }

  /* ---------------------------------------------------- effect builder */

  const KIND_LABEL = {
    pt: 'Creatures get +X/+Y',
    forEach: 'This gets +X/+Y for each…',
    etb: 'Creatures enter with extra counters',
    keyword: 'Creatures have a keyword',
  };

  function effectFormHTML(e) {
    const who = (v) => `<select data-f="who">${[
      ['self', 'This creature'],
      ['attached', 'Equipped/enchanted creature'],
      ['yours', 'Creatures you control'],
      ['yoursOther', 'Other creatures you control'],
      ['opponents', 'Creatures your opponents control'],
      ['all', 'All creatures'],
    ]
      .map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>`;
    const filter = `<input data-f="filter" placeholder="Only this type (optional), e.g. Dragon" value="${esc(e.filter || '')}">`;
    const pt = `<span class="row gap"><input data-f="p" type="number" value="${e.p || 0}" style="width:70px"> / <input data-f="t" type="number" value="${e.t || 0}" style="width:70px"></span>`;
    let body = `<label class="form">Kind <select data-f="kind">${Object.entries(KIND_LABEL)
      .map(([k, l]) => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${l}</option>`)
      .join('')}</select></label>`;
    const extra = `<div class="row gap ef-extra"><label class="form">Colour <select data-f="color"><option value="">any</option>${['W', 'U', 'B', 'R', 'G', 'C', 'M']
      .map((c) => `<option value="${c}" ${e.color === c ? 'selected' : ''}>${{ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless', M: 'multicolored' }[c]}</option>`)
      .join('')}</select></label>
      <label class="form">Mana value <span class="row gap"><select data-f="mvOp"><option value="">any</option>${[['<=', 'at most'], ['=', 'exactly'], ['>=', 'at least']]
        .map(([k, l]) => `<option value="${k}" ${e.mvOp === k ? 'selected' : ''}>${l}</option>`)
        .join('')}</select><input data-f="mv" type="number" min="0" value="${e.mv != null ? e.mv : 3}" style="width:64px"></span></label></div>`;
    if (e.kind === 'pt') body += `<label class="form">Who ${who(e.who)}</label><label class="form">Type filter ${filter}</label>${extra}<label class="form">Get +X / +Y ${pt}</label>`;
    if (e.kind === 'forEach')
      body += `<label class="form">Gets +X / +Y ${pt}</label>
        <label class="form">for each <input data-f="count" value="${esc(e.count || 'artifact')}" placeholder="artifact, creature, land, Elf…"></label>
        <label class="form">… <select data-f="where">${[
          ['you', 'you control'],
          ['opp', 'your opponents control'],
          ['all', 'on the battlefield'],
          ['yourGraveyard', 'in your graveyard'],
        ]
          .map(([k, l]) => `<option value="${k}" ${e.where === k ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></label>
        <label class="row gap"><input type="checkbox" data-f="other" ${e.other ? 'checked' : ''}> don't count this card itself ("each other…")</label>${extra}`;
    if (e.kind === 'etb')
      body += `<label class="form">Who ${who(e.who)}</label><label class="form">Type filter ${filter}</label>${extra}
        <label class="form">Enter with <span class="row gap"><input data-f="n" type="number" min="1" value="${e.n || 1}" style="width:70px"> extra <input data-f="counter" value="${esc(e.counter || '+1/+1')}" style="width:110px"> counter(s)</span></label>`;
    if (e.kind === 'keyword')
      body += `<label class="form">Who ${who(e.who)}</label><label class="form">Type filter ${filter}</label>${extra}<label class="form">Have <input data-f="keyword" value="${esc(e.keyword || '')}" placeholder="Flying, Trample, Haste…"></label>`;
    return body;
  }

  function readEffectForm(root, kind) {
    const v = (f) => {
      const el = root.querySelector(`[data-f="${f}"]`);
      if (!el) return undefined;
      return el.type === 'checkbox' ? el.checked : el.value;
    };
    return E.cleanEffects([{ kind, who: v('who'), filter: v('filter'), p: v('p'), t: v('t'), count: v('count'), where: v('where'), other: v('other'), n: v('n'), counter: v('counter'), keyword: v('keyword'), color: v('color'), mvOp: v('mvOp'), mv: v('mv') }])[0];
  }

  /** Build / edit one effect. Resolves with the effect or null. */
  async function editEffect(initial) {
    let eff = { kind: 'pt', who: 'self', p: 1, t: 1, ...(initial || {}) };
    const { value, root } = await dialog({
      title: initial ? 'Edit effect' : 'Add effect',
      body: '<div id="ef-form" class="ef-form"></div><div class="ef-preview muted"></div>',
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save effect', value: 'ok', primary: true }],
      onMount(r) {
        const form = r.querySelector('#ef-form');
        const draw = () => {
          form.innerHTML = effectFormHTML(eff);
          preview();
        };
        const preview = () => {
          const e = readEffectForm(form, eff.kind);
          r.querySelector('.ef-preview').textContent = e ? `“${E.describeEffect(e)}”` : '';
        };
        form.addEventListener('change', (ev) => {
          if (ev.target.dataset.f === 'kind') {
            eff = { ...readEffectForm(form, eff.kind), kind: ev.target.value };
            draw();
          } else preview();
        });
        form.addEventListener('input', preview);
        draw();
      },
    });
    if (value !== 'ok') return null;
    const kind = root.querySelector('[data-f="kind"]').value;
    const out = readEffectForm(root.querySelector('#ef-form'), kind);
    if (out && initial) {
      out.on = initial.on !== false;
      if (initial.note) out.note = initial.note;
    }
    return out;
  }

  function effectsDialog(c) {
    let list = JSON.parse(JSON.stringify(c.effects || []));
    dialog({
      title: `Effects: ${c.name}`,
      wide: true,
      body: `<p class="muted small" style="margin:0">Effects you set here are saved with your deck and apply to every copy of ${esc(c.name)}. They only work while the card is on the battlefield.</p>
        <div id="ef-list" class="ef-list"></div>
        <div class="row gap"><button class="btn" id="ef-add">+ Add effect</button>${c.oracle ? '<button class="btn ghost" id="ef-suggest">Suggest from card text</button>' : ''}</div>
        ${c.oracle ? `<details><summary class="muted small">Card text</summary><p class="small oracle">${esc(c.oracle)}${c.backOracle ? `<br><br>${esc(c.backOracle)}` : ''}</p></details>` : ''}`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
      onMount(root) {
        const draw = () => {
          root.querySelector('#ef-list').innerHTML = list.length
            ? list
                .map(
                  (e, i) => `<div class="ef-row ${e.on ? '' : 'off'}">
                    <label class="switch" title="On/off"><input type="checkbox" data-on="${i}" ${e.on ? 'checked' : ''}><span></span></label>
                    <span class="ef-text">${esc(E.describeEffect(e))}${e.note ? `<br><span class="muted small">${esc(e.note)}</span>` : ''}</span>
                    <button class="btn tiny" data-edit="${i}">Edit</button><button class="btn tiny" data-del="${i}">Remove</button></div>`,
                )
                .join('')
            : '<p class="muted" style="margin:0">No effects yet.</p>';
        };
        draw();
        root.addEventListener('change', (e) => {
          if (e.target.dataset.on) {
            list[Number(e.target.dataset.on)].on = e.target.checked;
            draw();
          }
        });
        root.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.id === 'ef-add') {
            const eff = await editEffect(null);
            if (eff) list.push(eff);
          } else if (b.id === 'ef-suggest') {
            const sug = I.suggestEffects(c).suggestions;
            if (!sug.length) toast("I couldn't find anything I recognise in this card's text. Use + Add effect instead.");
            for (const s of sug) if (!list.some((x) => JSON.stringify({ ...x, on: true, note: undefined }) === JSON.stringify({ ...s.effect, on: true, note: undefined }))) list.push(s.effect);
          } else if (b.dataset.edit) {
            const i = Number(b.dataset.edit);
            const eff = await editEffect(list[i]);
            if (eff) list[i] = eff;
          } else if (b.dataset.del) list.splice(Number(b.dataset.del), 1);
          draw();
        });
      },
    }).then(({ value }) => {
      if (value === 'ok') act({ type: 'setEffects', cardId: c.id, effects: list });
    });
  }

  /* ------------------------------------------------------- tokens etc. */

  function tokenDialog(pid = S.you) {
    dialog({
      title: 'Create a token',
      wide: true,
      body: `<div class="row gap"><input id="tk-q" placeholder="Search Scryfall tokens, e.g. Treasure, Zombie, Soldier" style="flex:1" data-noenter="1"><button class="btn primary" id="tk-go">Search</button>
          <label class="row gap small muted">How many <input id="tk-n" type="number" value="1" min="1" max="30" style="width:64px"></label></div>
        <div class="quick">${['Treasure', 'Clue', 'Food', 'Soldier', 'Zombie', 'Goblin', 'Spirit', 'Beast', 'Saproling', 'Blood', 'Map']
          .map((q) => `<button class="btn small" data-q="${q}">${q}</button>`)
          .join('')}</div>
        <div id="tk-res" class="token-results"></div>
        <div class="sect-title">…or make your own</div>
        <div class="row gap"><input id="tk-name" placeholder="Name, e.g. Elemental" style="flex:1" data-noenter="1"><input id="tk-pt" placeholder="P/T e.g. 3/3" style="width:110px" data-noenter="1"><button class="btn" id="tk-custom">Create</button></div>`,
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

  /* ---------------------------------------------------------- deck dialog */

  function savedDecks() {
    return Store.get(DECKS_KEY) || [];
  }
  function saveDecks(list) {
    Store.set(DECKS_KEY, list.slice(0, 20));
  }
  function rememberDeck(deck) {
    const list = savedDecks().filter((d) => d.name !== deck.name);
    list.unshift({ name: deck.name, cards: deck.cards, savedAt: Date.now() });
    saveDecks(list);
  }
  /** Keep the saved copy of a deck in sync when effects are edited mid-game. */
  function updateSavedDeckEffects(cardName, effects) {
    const mine = me();
    const list = savedDecks();
    let changed = false;
    for (const d of list) {
      if (mine && mine.deckName && d.name !== mine.deckName) continue;
      for (const c of d.cards) if (c.name === cardName) {
        c.effects = effects;
        changed = true;
      }
    }
    if (changed) saveDecks(list);
  }
  /** Effects you already set up for a card in any of your saved decks. */
  function knownEffects(cardName) {
    for (const d of savedDecks()) for (const c of d.cards) if (c.name === cardName && c.effects && c.effects.length) return { effects: c.effects, deck: d.name };
    return null;
  }

  function deckDialog() {
    dialog({
      title: 'Load a deck',
      wide: true,
      body: `<div id="dk-saved"></div>
        <div class="sect-title">Import a new deck</div>
        <p class="muted small" style="margin:0">On Archidekt open your deck → <b>Export</b> → choose the text format that includes set codes
          (lines look like <code>1x Sol Ring (c21) 263</code>) → copy, and paste it below. Lists from Moxfield, MTG Arena or plain <code>1 Sol Ring</code> lines work too.
          Put commanders under a <code>Commander</code> heading, or keep Archidekt's <code>[Commander]</code> tag.</p>
        <label class="form">Deck name <input id="dk-name" placeholder="My deck" maxlength="80"></label>
        <textarea id="dk-text" placeholder="Commander\n1x Atraxa, Praetors' Voice (2x2) 190\n\nDeck\n1x Sol Ring (c21) 263\n..."></textarea>
        <div id="dk-msg"></div>
        <div id="dk-report"></div>`,
      buttons: [{ label: 'Cancel', value: null }],
      onMount(root, close) {
        const mf = root.querySelector('.mf');
        const go = document.createElement('button');
        go.className = 'btn primary';
        go.textContent = 'Import';
        mf.appendChild(go);
        const msg = root.querySelector('#dk-msg');
        let imported = null;
        let report = [];

        const drawSaved = () => {
          const saved = savedDecks();
          root.querySelector('#dk-saved').innerHTML = saved.length
            ? `<div class="sect-title">Decks you imported before</div><div class="saved-decks">${saved
                .map(
                  (d, i) => `<div class="saved-deck"><span class="nm">${esc(d.name)}</span><span class="muted small">${d.cards.reduce((s, c) => s + (c.qty || 1), 0)} cards</span>
                    <button class="btn small primary" data-use="${i}">Use</button><button class="btn small" data-rename="${i}">Rename</button><button class="btn small" data-remove="${i}">Remove</button></div>`,
                )
                .join('')}</div>`
            : '';
        };
        drawSaved();

        const load = async (deck) => {
          const r = await act({ type: 'loadDeck', deck });
          if (!r.error) {
            toast(`Loaded "${deck.name}". Click "Start game" when everyone is ready.`);
            close(null);
          }
        };

        root.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          const saved = savedDecks();
          if (b.dataset.use) {
            const d = saved[Number(b.dataset.use)];
            if (d.cards.some((c) => c.cmc === undefined || c.colors === undefined)) {
              b.disabled = true;
              b.textContent = 'Updating card data…';
              try {
                await I.refreshTemplates(d.cards);
                saveDecks(saved);
              } catch (err) {
                toast(`Couldn't update card data (${err.message}). Loading the deck anyway.`, 'error');
              }
            }
            load(d);
          }
          if (b.dataset.rename) {
            const d = saved[Number(b.dataset.rename)];
            const n = await askText('Rename deck', d.name, '', 'New name');
            if (n && n !== d.name) {
              d.name = n;
              saveDecks(saved);
              drawSaved();
            }
          }
          if (b.dataset.remove) {
            const d = saved[Number(b.dataset.remove)];
            if (await confirmBox('Remove deck?', `Remove "${esc(d.name)}" from your saved decks? (Games already using it aren't affected.)`, 'Remove', true)) {
              saved.splice(Number(b.dataset.remove), 1);
              saveDecks(saved);
              drawSaved();
            }
          }
          if (b.dataset.editsug) {
            const i = Number(b.dataset.editsug);
            const eff = await editEffect(report[i].effect);
            if (eff) {
              report[i].effect = eff;
              report[i].text = E.describeEffect(eff);
              report[i].checked = true;
              drawReport();
            }
          }
        });
        root.addEventListener('change', (e) => {
          if (e.target.dataset.sug) report[Number(e.target.dataset.sug)].checked = e.target.checked;
        });

        const drawReport = () => {
          const box = root.querySelector('#dk-report');
          if (!report.length) return (box.innerHTML = '');
          box.innerHTML = `<div class="sect-title">Automation report: effects I can set up for you</div>
            <p class="muted small" style="margin:0">Tick the ones that are right. You can change any of them later (right-click a card → Effects…).</p>
            <div class="report">${report
              .map((r, i) =>
                r.warn
                  ? `<div class="rep warn">⚠ <b>${esc(r.card)}</b>: ${esc(r.warn)}</div>`
                  : `<label class="rep"><input type="checkbox" data-sug="${i}" ${r.checked ? 'checked' : ''}> <b>${esc(r.card)}</b>: ${esc(r.text)}${
                      r.conditional ? ' <span class="muted">(conditional, switch it on/off in game)</span>' : ''
                    }${r.from ? ` <span class="muted">(from your deck "${esc(r.from)}")</span>` : ''} <button class="btn tiny" data-editsug="${i}">Edit</button></label>`,
              )
              .join('')}</div>`;
        };

        go.addEventListener('click', async () => {
          if (imported) {
            imported.name = root.querySelector('#dk-name').value.trim() || imported.name;
            for (const c of imported.cards) c.effects = [];
            for (const r of report) if (!r.warn && r.checked) imported.cards[r.idx].effects.push(r.effect);
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
            // automation report
            report = [];
            res.cards.forEach((c, idx) => {
              const known = knownEffects(c.name);
              if (known) {
                for (const e of known.effects) report.push({ idx, card: c.name, effect: e, text: E.describeEffect(e), checked: true, from: known.deck });
                return;
              }
              const sug = I.suggestEffects(c);
              for (const s of sug.suggestions) report.push({ idx, card: c.name, effect: s.effect, text: s.text, conditional: s.conditional, checked: true });
              if (sug.unhandled) report.push({ idx, card: c.name, warn: "has power/toughness text I can't set up automatically. Use Effects… or the P/T bonus in game." });
            });
            drawReport();
            go.textContent = 'Use this deck';
          } catch (err) {
            msg.className = 'err';
            msg.textContent = err.message;
          }
          go.disabled = false;
        });
        root.querySelector('#dk-text').addEventListener('input', () => {
          imported = null;
          report = [];
          drawReport();
          go.textContent = 'Import';
        });
      },
    });
  }

  /* ------------------------------------------------------------ settings */

  const FELTS = ['#1a2a24', '#1d2a3a', '#2b1f33', '#3a1f1f', '#3b3220', '#1f3333', '#2a2a2a', '#0f3d24'];

  function settingsDialog() {
    const st = S.settings;
    const host = session && session.isHost;
    const mine = me();
    const pref = Store.get(LAYOUT_KEY) || 'auto';
    dialog({
      title: 'Settings',
      body: `<div class="sect-title">Your battlefield colour</div>
        <div class="felts">${FELTS.map((c) => `<button class="felt ${mine && mine.bfColor === c ? 'on' : ''}" data-felt="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          <label class="felt custom" title="Pick any colour"><input type="color" id="st-felt" value="${(mine && mine.bfColor) || '#1a2a24'}"></label>
          <button class="btn small" data-felt="">Default</button></div>
        <div class="sect-title">Game</div>
        <label class="row gap"><input type="checkbox" id="st-untap" ${st.autoUntap ? 'checked' : ''}> Untap automatically when a turn passes</label>
        <label class="row gap"><input type="checkbox" id="st-draw" ${st.autoDraw ? 'checked' : ''}> Draw automatically when a turn passes</label>
        <label class="row gap">Starting life <input type="number" id="st-life" value="${st.startingLife}" style="width:80px"></label>
        <div class="sect-title">This device</div>
        <label class="row gap"><input type="checkbox" id="st-arrows" ${Store.get('mtgtt.phoneArrows') === false ? '' : 'checked'}> Phone: show the map arrows</label>
        <label class="row gap"><input type="checkbox" id="st-piles" ${Store.get('mtgtt.phonePiles') === false ? '' : 'checked'}> Phone: show library &amp; graveyard at the side</label>
        <label class="row gap">Layout <select id="st-layout">
          <option value="auto" ${pref === 'auto' ? 'selected' : ''}>Automatic (phone layout on touch screens)</option>
          <option value="phone" ${pref === 'phone' ? 'selected' : ''}>Phone / touch layout</option>
          <option value="desktop" ${pref === 'desktop' ? 'selected' : ''}>Computer layout</option></select></label>
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
          if (b.dataset.felt !== undefined) {
            act({ type: 'setColor', color: b.dataset.felt });
            for (const x of $$('.felt', root)) x.classList.toggle('on', x === b);
          }
          if (b.dataset.remove) {
            const p = playerById(b.dataset.remove);
            if (await confirmBox('Remove player?', `Remove ${esc(p.name)} and all their cards from the game?`, 'Remove', true)) {
              act({ type: 'removePlayer', playerId: p.id });
              b.closest('.row').remove();
            }
          }
          if (b.id === 'st-backup') downloadJSON(session.game, `mtg-game-${S.id}-${new Date().toISOString().slice(0, 10)}.json`);
        });
        root.querySelector('#st-felt').addEventListener('change', (e) => act({ type: 'setColor', color: e.target.value }));
      },
    }).then(async ({ value, root }) => {
      if (value !== 'ok') return;
      const u = root.querySelector('#st-untap').checked;
      const d = root.querySelector('#st-draw').checked;
      const l = Number.parseInt(root.querySelector('#st-life').value, 10);
      const layout = root.querySelector('#st-layout').value;
      Store.set('mtgtt.phoneArrows', root.querySelector('#st-arrows').checked);
      Store.set('mtgtt.phonePiles', root.querySelector('#st-piles').checked);
      render();
      if (u !== st.autoUntap) await act({ type: 'setting', key: 'autoUntap', value: u });
      if (d !== st.autoDraw) await act({ type: 'setting', key: 'autoDraw', value: d });
      if (Number.isFinite(l) && l !== st.startingLife) await act({ type: 'setting', key: 'startingLife', value: l });
      if (layout !== pref) {
        Store.set(LAYOUT_KEY, layout);
        location.reload();
      }
    });
  }

  function helpDialog() {
    const phone = U.phone;
    dialog({
      title: 'How to play',
      wide: true,
      body: phone
        ? `<div class="help-grid">
        <b>Your hand</b><span>Tap a card to see it. Drag it up to play it (lands go to the battlefield, everything else to the stack). Hold, then slide sideways to re-order.</span>
        <b>Battlefield</b><span>Drag to look around, pinch to zoom. Tap a land to tap it. Tap anything else for its options. Hold a card, then drag to move it. Hold and let go for the menu.</span>
        <b>Stack</b><span>Tap a spell on the stack for Resolves / Doesn't resolve.</span>
        <b>Moving cards</b><span>While dragging, Graveyard / Exile / Hand / Library / Command targets appear at the sides of the screen.</span>
        <b>Getting around</b><span>The ▲ ▼ ◀ ▶ buttons move between your battlefield, opponents (in turn order) and, during combat, the combat zone. <i>Current player</i> at the top jumps to whoever's turn it is; <i>Return</i> brings you back.</span>
        <b>Combat</b><span>Tap the Combat phase. Drag creatures to the top edge to attack (or block), or tap the combat zone. Done is in the bar at the bottom.</span>
        <b>Library &amp; graveyard</b><span>They peek in from the right edge. Tap the library for its menu, double-tap to draw. <i>Other zones</i> shows exile and the command zone.</span>
        <b>Life</b><span>Tap a life badge. Slide right for damage, left for gain, ±1 to fine-tune; it's applied when you close the window (Undo fixes mistakes).</span>
        <b>Log</b><span>The Log button at the top shows the log beside the battlefield.</span>
        <b>Menu ☰</b><span>All battlefields, zoom, d20, tokens, proliferate, undo and settings (hide the arrows or the side piles there).</span>
        <b>Phases</b><span>Tap the phases along the top as you go. Pass turn is at the end. Portrait or landscape both work.</span>
      </div>`
        : `<div class="help-grid">
        <b>Move cards</b><span>Drag them anywhere: battlefield, hand (drop between cards to sort), the stack, your piles, or another player's battlefield.</span>
        <b>Tap / untap</b><span>Click a card on the battlefield, or hover it and press <kbd>T</kbd> / <kbd>Space</kbd>.</span>
        <b>Card details</b><span>Hover a card for a big image plus its total power/toughness, counters and effects. Right-click for every option, including <i>Open on Scryfall</i>.</span>
        <b>Play from hand</b><span>Double-click a card in your hand, or drag it out. Drag it to the Stack to cast it so others can respond.</span>
        <b>Stack</b><span>Double-click to resolve. Right-click for Resolves / Doesn't resolve.</span>
        <b>Equipment &amp; auras</b><span>Drag one onto a creature to attach it (or right-click → Attach to…).</span>
        <b>Effects</b><span>Right-click → Effects… to set up what a card does (anthems, "for each" bonuses, extra counters, keywords). Totals update automatically.</span>
        <b>Library</b><span>Click for the menu (draw, mill, peek, reveal until…, search, shuffle). Double-click (or <kbd>D</kbd>) to draw.</span>
        <b>Counters</b><span>Right-click a permanent → Counters…: type numbers or use ± and press Save (✕ throws changes away). Permanents with counters show them when right-clicked.</span>
        <b>Combat</b><span>Click the Combat phase (or Combat). Drag creatures up from the bottom row onto the player or a planeswalker; defenders drag blockers onto a column. <i>View field</i> hides the combat screen for a moment. +X / ×N change a column's damage; everyone presses Done when ready.</span>
        <b>Reactions</b><span>Hover a chat or log line and click ☺︎+.</span>
        <b>Opponents' stuff</b><span>Changing anything on another player's battlefield, hand, library or life asks them first.</span>
        <b>Battlefields</b><span>Wheel zooms, drag an empty spot to scroll. "All battlefields" shows everyone in turn order.</span>
        <b>d20</b><span>Click d20 to drop a die on your battlefield, then flick it (quick drag &amp; release). Click a rolled die to remove it.</span>
        <b>Other keys</b><span><kbd>F</kbd> transform · <kbd>U</kbd> untap all · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Enter</kbd> chat · <kbd>Esc</kbd> close</span>
      </div>`,
    });
  }

  /* ============================================================= viewer */

  async function openViewer(pid, zone, count) {
    viewer = { pid, zone, count: count || null, map: null, q: '' };
    $('#viewer').hidden = false;
    $('#viewer').dataset.built = '';
    if (zone === 'library' || (zone === 'hand' && pid !== S.you)) {
      const r = await act({ type: 'viewZone', playerId: pid, zone, count: count || undefined });
      if (r.pending) {
        toast(`Waiting for ${r.pending.waitingFor} to let you look…`);
        return closeViewer();
      }
      if (r.error || !r.private) return closeViewer();
      setPrivate(r.private.cards);
    }
    renderViewer();
  }

  /** A private result arriving later (after the other player approved). */
  function openViewerPrivate(priv) {
    viewer = { pid: priv.playerId, zone: priv.zone, count: priv.cards.length || null, map: null, q: '', foreign: priv.playerId !== S.you };
    setPrivate(priv.cards);
    $('#viewer').hidden = false;
    $('#viewer').dataset.built = '';
    renderViewer();
  }

  function setPrivate(cards) {
    if (!viewer) return;
    viewer.cards = cards;
    viewer.map = Object.fromEntries(cards.map((c) => [c.id, c]));
  }

  async function refreshPrivateViewer() {
    if (!viewer || !viewer.map || viewer.refreshing || viewer.pid !== S.you) return;
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
    if (!viewer || !S) return;
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
        ? '<span class="muted small" style="flex:1">Top of library is first. Move cards where they go, or use Top/Bottom of library.</span><button class="btn" data-v="close">Done</button>'
        : '<button class="btn primary" data-v="shuffle">Shuffle &amp; close</button><button class="btn" data-v="close">Close without shuffling</button>';
    } else if (viewer.zone === 'library') foot = '<button class="btn" data-v="close">Done</button>';
    if (!v.dataset.built || v.dataset.title !== title) {
      v.innerHTML = `<div class="vh"><b></b><input class="vsearch" placeholder="Search name, type or rules text…" value="${esc(viewer.q)}">
        <button class="btn small ghost" data-v="close">✕</button></div>
        <div class="vb"></div>${foot ? `<div class="vf">${foot}</div>` : ''}`;
      v.dataset.built = '1';
      v.dataset.title = title;
      v.querySelector('.vsearch').addEventListener('input', (e) => {
        viewer.q = e.target.value;
        drawViewerCards();
      });
    }
    v.querySelector('.vh b').textContent = title;
    if (viewer.map && S.version !== lastViewerVersion) {
      lastViewerVersion = S.version;
      refreshPrivateViewer();
    }
    drawViewerCards();
  }

  /**
   * Search: first the cards whose NAME matches, then (after a gap) the cards whose
   * type line or rules text matches. Each group is alphabetical.
   */
  function searchGroups(cards, q) {
    q = q.trim().toLowerCase();
    if (!q) return null;
    const name = [];
    const other = [];
    for (const c of cards) {
      if (!c || c.hidden) continue;
      const n = `${c.name} ${c.backName || ''}`.toLowerCase();
      const t = `${c.typeLine || ''} ${c.backTypeLine || ''} ${c.oracle || ''} ${c.backOracle || ''}`.toLowerCase();
      if (n.includes(q)) name.push(c);
      else if (t.includes(q)) other.push(c);
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    return { name: name.sort(byName), other: other.sort(byName) };
  }

  function viewerCards() {
    if (!viewer) return [];
    if (viewer.map) return viewer.cards;
    const p = playerById(viewer.pid);
    const z = (p.zones[viewer.zone] || []).slice();
    return (viewer.zone === 'hand' ? z : z.reverse()).map((id) => S.cards[id]).filter(Boolean);
  }

  function drawViewerCards() {
    if (!viewer) return;
    const body = $('#viewer .vb');
    const cards = viewerCards();
    const groups = searchGroups(cards, viewer.q || '');
    let ids;
    if (groups) {
      ids = groups.name.map((c) => c.id);
      if (groups.name.length && groups.other.length) ids.push('gap:1');
      ids = ids.concat(groups.other.map((c) => c.id));
      if (!ids.length) ids = ['gap:none'];
    } else ids = cards.map((c) => c.id);
    reconcile(body, ids, (id, el) => {
      if (id.startsWith('gap:')) {
        if (!el || !el.classList.contains('vgap')) {
          el = document.createElement('div');
          el.className = 'vgap';
        }
        el.textContent = id === 'gap:none' ? 'Nothing matches.' : 'Type line / rules text matches';
        return el;
      }
      return cardEl(getCard(id), el && el.classList.contains('card') ? el : null, 'viewer');
    });
  }

  $('#viewer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    closeViewer(b.dataset.v === 'shuffle');
  });

  /* ======================================================= global clicks */

  document.addEventListener(
    'click',
    (e) => {
      if (!S || !mode) return;
      if (e.target.closest('#banners, #menu, .modal')) return;
      if (U.phone && e.target.closest('.pbf .card')) return; // phone battlefield handles its own taps
      if (modeClick(e.target)) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );

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
      case 'switch-opp': {
        const seats = seatOrder().filter((id) => id !== S.you);
        selectedOpp = seats[(seats.indexOf(selectedOpp) + 1) % seats.length];
        render();
        break;
      }
      case 'zone': {
        const p = playerById(pid);
        const zone = t.dataset.zone;
        if (zone === 'hand' && !p.handRevealed && pid !== S.you) return toast(`${p.name}'s hand is hidden.`);
        if (zone === 'library') {
          if (pid === S.you) return libraryClick(e.clientX, e.clientY);
          return showMenu(
            [
              { header: `${p.name}'s library (${p.libraryCount})` },
              { label: 'Look at the top X cards… (asks them)', fn: async () => { const n = await askNumber('How many?', 1); if (n) openViewer(pid, 'library', n); } },
              { label: 'Search it (asks them)', fn: () => openViewer(pid, 'library') },
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
    if (slot.dataset.pile === 'library') libraryClick(e.clientX, e.clientY);
    else openViewer(S.you, slot.dataset.pile);
  });

  /* ============================================================ topbar */

  async function leaveGame() {
    if (session && session.isHost) {
      if (!(await confirmBox('Leave the game?', 'The game is saved in this browser. Your friends will be disconnected until you open it again from the lobby.', 'Leave'))) return;
      session.destroy();
    }
    location.href = location.pathname;
  }

  async function copyInvite() {
    const code = S ? S.id : '';
    const link = location.protocol.startsWith('http') ? `${location.origin}${location.pathname}?join=${code}` : null;
    try {
      await navigator.clipboard.writeText(link || code);
      toast(link ? 'Invite link copied. Send it to your friends!' : `Game code ${code} copied. Friends enter it under "Join a friend's game".`);
    } catch {
      toast(`Game code: ${code}${link ? `  ·  link: ${link}` : ''}`);
    }
  }

  async function startGameClick() {
    if (await confirmBox('Start a new game?', "Everyone's deck is rebuilt and shuffled, life is reset, and everyone draws 7. Then everyone mulligans or keeps, and you roll a d20 for turn order.", 'Start'))
      act({ type: 'startGame' });
  }

  function toggleBoardView() {
    boardView = boardView === 'grid' ? 'focus' : 'grid';
    Store.set(VIEW_KEY, boardView);
    for (const pid of Object.keys(views)) views[pid].auto = true;
    render();
    requestAnimationFrame(() => {
      for (const p of S.players) fitView(p.id);
    });
  }

  $('#btn-leave').addEventListener('click', leaveGame);
  $('#btn-code').addEventListener('click', copyInvite);
  $('#btn-deck').addEventListener('click', deckDialog);
  $('#btn-start').addEventListener('click', startGameClick);
  $('#btn-settings').addEventListener('click', settingsDialog);
  $('#btn-help').addEventListener('click', helpDialog);
  $('#btn-undo').addEventListener('click', () => act({ type: 'undo' }));
  $('#btn-grid').addEventListener('click', toggleBoardView);
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
  $('#btn-d20').addEventListener('click', () => act({ type: 'placeDie' }));
  $('#btn-prolif').addEventListener('click', startProliferate);
  $('#btn-combat').addEventListener('click', () => act({ type: 'combatStart' }));
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const i = $('#chat-input');
    if (i.value.trim()) act({ type: 'chat', text: i.value });
    i.value = '';
  });
  $('#status').classList.add('status-pill');

  /* ============================================================ keyboard */

  document.addEventListener('keydown', (e) => {
    if (U.phone || $('#game').hidden || !S) return;
    if (e.key === 'Escape') {
      hideMenu();
      if (mode) cancelMode();
      else if (viewer) closeViewer();
      return;
    }
    if (e.target.closest('input, textarea, select') || $('#modal-root').children.length || e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      act({ type: 'undo' });
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
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

  window.addEventListener('resize', () => S && !U.phone && renderHandAndPiles(me()));

  /* ========================================================= shared API */

  const U = {
    phone: false,
    session: null,
    status: null,
    get S() {
      return S;
    },
    get mode() {
      return mode;
    },
    get firstState() {
      return firstState;
    },
    views,
    renderHooks,
    $, $$, esc, clamp, sign, large, toast, dialog, askNumber, askText, confirmBox,
    act, me, playerById, getCard, seatOrder, render, reconcile, cardEl, cardInner, faceBadges, summaryHTML, scryfallUrl,
    cardMenu, libraryMenu, zoneBulkMenu, handMenu, showMenu, hideMenu,
    countersDialog, ptDialog, effectsDialog, tokenDialog, deckDialog, settingsDialog, helpDialog,
    openViewer, closeViewer, renderLog, startProliferate, startAttach, cancelMode, finishMode, modeClick,
    dieEl, animateDie, trackFlick, randomFlick, D20_SVG,
    leaveGame, copyInvite, startGameClick, playFromHand, resolveStack, isLandCard, handIndexAt, isEquipLike,
    paneLayout, fitTray, fitView, viewCenter, cardsBox, openCounterPanel, closeCounterPanel, libraryClick, revealDialog,
    ICONS,
    combatInfo, combatColumnHTML, combatTargetsHTML, combatBarHTML, combatDrop, combatDefenders, cardHTML, DEFAULT_Z, combatClick, setCombatDef, currentCombatDef, switchCombatDef,
  };
  window.MTGUI = U;

  /* =============================================================== boot */

  setupLobby();
  window.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search);
    if (q.get('host')) startHost(q.get('host').toUpperCase());
    else if (q.get('join')) startJoin(q.get('join').toUpperCase());
    else showLobby();
  });
})();
