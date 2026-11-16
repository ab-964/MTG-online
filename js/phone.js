/**
 * Phone / touch layout (landscape).
 *
 *  ┌────────────────────────────────────────────────────────┐
 *  │ ☰ │ Sam's turn · Untap Upkeep Draw Main1 … │ Pass ▶    │  ← always visible
 *  ├────────────────────────────────────────────────────────┤
 *  │                battlefield / zones / opponents         │
 *  ├────────────────────────────────────────────────────────┤
 *  │ [card tops of your hand, scroll sideways]              │  ← always visible
 *  └────────────────────────────────────────────────────────┘
 *
 * Gestures
 *  - battlefield: drag = look around, pinch = zoom, tap land = tap it,
 *    tap anything else = options, hold then drag = move it, hold + let go = options.
 *  - hand: tap = view + options, drag up = play (lands → battlefield, else → stack),
 *    hold then slide sideways = re-order, quick swipe = scroll.
 */
(function () {
  'use strict';

  const U = window.MTGUI;
  const E = window.MTGEngine;
  const { $, $$, esc, clamp } = U;

  let built = false;
  let view = 'bf'; // 'bf' | 'zones' | 'grid' | 'watch' | 'log'
  let watchPid = null;
  const bfs = {}; // pid -> phone battlefield element

  const HOLD_MS = 380;

  function init() {
    if (built) return;
    built = true;
    const root = $('#phone');
    root.innerHTML = `
      <div class="pbar">
        <button class="pbtn" id="p-menu" aria-label="Menu">☰</button>
        <div class="pturn" id="p-turn"></div>
        <div class="pphases" id="p-phases"></div>
        <button class="pbtn primary" id="p-pass">Pass ▶</button>
      </div>
      <div class="pmain" id="p-main">
        <div class="pview" data-view="bf"><div class="pslot" id="p-slot-me"></div></div>
        <div class="pview" data-view="zones" hidden><div class="pzones" id="p-zones"></div></div>
        <div class="pview" data-view="grid" hidden><div class="pgrid" id="p-grid"></div></div>
        <div class="pview" data-view="watch" hidden>
          <div class="pwatch">
            <div class="plog log" id="p-watch-log"></div>
            <div class="pslot" id="p-slot-watch"></div>
            <div class="pside" id="p-watch-side"></div>
          </div>
        </div>
        <div class="pview" data-view="log" hidden>
          <div class="plogview"><div class="log" id="p-log"></div>
            <form id="p-chat" class="chat-form"><input maxlength="300" placeholder="Chat…" autocomplete="off"></form></div>
        </div>
        <div class="pstack" id="p-stack" hidden></div>
        <button class="pback" id="p-back" hidden>◀ My battlefield</button>
        <div class="pstatus status status-pill" id="p-status"></div>
      </div>
      <div class="phand" id="p-hand"></div>`;
    if (U.status) {
      const st = $('#p-status');
      st.className = `pstatus status status-pill ${U.status.level}`;
      st.textContent = U.status.text;
    }
    $('#p-menu').addEventListener('click', openMainMenu);
    $('#p-pass').addEventListener('click', () => U.act({ type: 'passTurn' }));
    $('#p-back').addEventListener('click', () => setView('bf'));
    $('#p-phases').addEventListener('click', (e) => {
      const ph = e.target.closest('[data-i]');
      if (ph) U.act({ type: 'setPhase', phase: Number(ph.dataset.i) });
    });
    $('#p-chat').addEventListener('submit', (e) => {
      e.preventDefault();
      const i = e.target.querySelector('input');
      if (i.value.trim()) U.act({ type: 'chat', text: i.value });
      i.value = '';
    });
    $('#p-zones').addEventListener('click', onZoneTap);
    $('#p-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-pid]');
      if (!cell) return;
      if (cell.dataset.pid === U.S.you) setView('bf');
      else {
        watchPid = cell.dataset.pid;
        setView('watch');
      }
    });
    $('#p-watch-side').addEventListener('click', (e) => {
      const b = e.target.closest('[data-zone]');
      if (b) U.openViewer(watchPid, b.dataset.zone);
    });
    $('#p-stack').addEventListener('click', (e) => {
      const el = e.target.closest('[data-id]');
      if (el) cardSheet(U.getCard(el.dataset.id), 'stack');
    });
    setupHand();
    // the zone viewer: tap a card for its options
    $('#viewer').addEventListener('click', (e) => {
      if (!U.phone) return;
      const el = e.target.closest('.card[data-id]');
      if (el) cardSheet(U.getCard(el.dataset.id), 'viewer');
    });
    // life badges
    $('#phone').addEventListener('click', (e) => {
      const lb = e.target.closest('.plife');
      if (lb && !U.mode) lifeSheet(lb.dataset.pid);
    });
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));
    checkOrientation();
    U.renderHooks.push(render);
    if (U.S) render(U.S);
  }

  function checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    $('#rotate').hidden = !(U.phone && portrait);
    for (const pid of Object.keys(bfs)) if (U.views[pid] && U.views[pid].auto) U.views[pid].auto = true;
    requestAnimationFrame(() => {
      for (const pid of Object.keys(bfs)) if (!U.views[pid] || U.views[pid].auto) fitPhone(pid);
    });
  }

  function setView(v) {
    view = v;
    U.hideMenu();
    render(U.S);
    requestAnimationFrame(() => {
      const pid = v === 'watch' ? watchPid : U.S.you;
      if (!U.views[pid] || U.views[pid].auto) fitPhone(pid);
    });
  }

  /* ------------------------------------------------------------ render */

  function render(S) {
    if (!U.phone || !built || !S) return;
    const me = U.me();
    const active = U.playerById(S.turn.active);
    $('#p-turn').textContent = active ? (active.id === S.you ? 'Your turn' : `${active.name}'s turn`) : 'Setting up';
    $('#p-turn').classList.toggle('mine', !!active && active.id === S.you);
    $('#p-phases').innerHTML = S.phases.map((ph, i) => `<span class="phase ${i === S.turn.phase ? 'on' : ''}" data-i="${i}">${esc(ph)}</span>`).join('');
    $('#p-pass').disabled = !active;

    for (const el of $$('#p-main .pview')) el.hidden = el.dataset.view !== view;
    $('#p-main').dataset.view = view;
    $('#p-back').hidden = view === 'bf';

    if (view === 'bf' && me) mountBf($('#p-slot-me'), me);
    if (view === 'watch') {
      const p = U.playerById(watchPid);
      if (!p) return setView('grid');
      mountBf($('#p-slot-watch'), p);
      U.renderLog($('#p-watch-log'));
      const z = p.zones;
      const top = (arr) => (arr.length ? S.cards[arr[arr.length - 1]] : null);
      const pile = (zone, label, arr) => {
        const c = top(arr);
        return `<button class="pmini" data-zone="${zone}">${c && c.img ? `<img src="${esc(c.img)}" alt="">` : ''}<span>${label} <b>${arr.length}</b></span></button>`;
      };
      $('#p-watch-side').innerHTML = pile('graveyard', 'Grave', z.graveyard) + pile('exile', 'Exile', z.exile) + (z.command.length ? pile('command', 'Cmd', z.command) : '');
    }
    if (view === 'zones') renderZones(S, me);
    if (view === 'grid') renderGrid(S);
    if (view === 'log') U.renderLog($('#p-log'));

    // stack
    const stack = $('#p-stack');
    stack.hidden = !S.stack.length;
    U.reconcile(stack, S.stack, (id, el) => U.cardEl(S.cards[id], el, 'stack'));

    renderHand(S, me);
  }

  function lifeBadge(p) {
    const ctr = Object.entries(p.counters || {})
      .map(([k, v]) => `<span class="pc">${esc(k)} ${v}</span>`)
      .join('');
    return `<span class="dot" style="background:${esc(p.color)}"></span><b>${p.life}</b><span class="nm">${esc(p.id === U.S.you ? 'You' : p.name)}</span>${ctr}
      <span class="muted">✋${p.handCount} 📚${p.libraryCount}</span>`;
  }

  function mountBf(slot, p) {
    let bf = bfs[p.id];
    if (!bf) {
      bf = document.createElement('div');
      bf.className = 'bf pbf';
      bf.dataset.pid = p.id;
      bf.innerHTML = `<div class="bf-table" data-drop="bf" data-player="${p.id}" style="width:${U.S.table.w}px;height:${U.S.table.h}px">
          <div class="zone-hint" style="top:82px">CREATURES</div><div class="zone-hint" style="top:332px">OTHER PERMANENTS</div><div class="zone-hint" style="top:582px">LANDS</div>
          <div class="layer"></div></div>
        <button class="plife" data-pid="${p.id}"></button>`;
      bfs[p.id] = bf;
      U.views[p.id] = U.views[p.id] || { x: 0, y: 0, z: 0.4, auto: true };
      setupBfGestures(bf, p.id);
      new ResizeObserver(() => {
        if (U.views[p.id].auto) fitPhone(p.id);
      }).observe(bf);
    }
    if (bf.parentElement !== slot) {
      slot.innerHTML = '';
      slot.appendChild(bf);
      requestAnimationFrame(() => fitPhone(p.id));
    }
    bf.style.setProperty('--felt', p.bfColor || '');
    bf.querySelector('.plife').innerHTML = lifeBadge(p);
    const sel = U.mode && U.mode.kind === 'proliferate' && U.mode.players.has(p.id);
    bf.querySelector('.plife').classList.toggle('selected', !!sel);
    const { ids, pos } = U.paneLayout(p);
    const dice = Object.values(U.S.dice || {}).filter((d) => d.owner === p.id);
    U.reconcile(bf.querySelector('.layer'), ids.concat(dice.map((d) => `die:${d.id}`)), (id, el) =>
      id.startsWith('die:') ? U.dieEl(U.S.dice[id.slice(4)], el, p.id) : U.cardEl(U.S.cards[id], el, 'bf', pos[id]),
    );
  }

  function applyPhoneView(pid) {
    const bf = bfs[pid];
    const v = U.views[pid];
    if (bf && v) bf.querySelector('.bf-table').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }

  /** Fit the whole battlefield on screen; pinch (or the menu) to zoom in. */
  function fitPhone(pid) {
    const bf = bfs[pid];
    if (!bf || !U.S || !bf.offsetParent) return;
    const r = bf.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const z = Math.min(r.width / U.S.table.w, r.height / U.S.table.h);
    U.views[pid] = { z, x: (r.width - U.S.table.w * z) / 2, y: (r.height - U.S.table.h * z) / 2, auto: true };
    applyPhoneView(pid);
  }

  function zoomPhone(pid, factor, cx, cy) {
    const bf = bfs[pid];
    const v = U.views[pid];
    if (!bf || !v) return;
    const r = bf.getBoundingClientRect();
    if (cx == null) {
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
    const px = cx - r.left;
    const py = cy - r.top;
    const nz = clamp(v.z * factor, 0.15, 3);
    v.x = px - ((px - v.x) * nz) / v.z;
    v.y = py - ((py - v.y) * nz) / v.z;
    v.z = nz;
    v.auto = false;
    applyPhoneView(pid);
  }

  /* -------------------------------------------- battlefield gestures */

  function setupBfGestures(bf, pid) {
    const pointers = new Map();
    let g = null; // current gesture

    bf.addEventListener('pointerdown', (e) => {
      if (!U.phone) return;
      bf.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // pinch
        if (g && g.timer) clearTimeout(g.timer);
        if (g && g.ghostEl) restoreCard(g);
        const [a, b] = [...pointers.values()];
        const v = U.views[pid];
        g = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: v.z };
        return;
      }
      if (pointers.size > 2) return;
      const dieEl = e.target.closest('.die');
      if (dieEl) {
        pointers.delete(e.pointerId);
        return onDie(e, dieEl);
      }
      const cardEl = e.target.closest('.card[data-id]');
      const v = U.views[pid];
      g = { kind: 'maybe', sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, cardEl, card: cardEl ? U.getCard(cardEl.dataset.id) : null };
      if (cardEl && g.card) {
        g.timer = setTimeout(() => {
          if (!g || g.kind !== 'maybe') return;
          g.kind = 'held';
          cardEl.classList.add('held');
          if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* ignore */ }
        }, HOLD_MS);
      }
    });

    bf.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !g) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.kind === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const v = U.views[pid];
        zoomPhone(pid, (g.z0 * d) / g.d0 / v.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (g.kind === 'maybe' && Math.hypot(dx, dy) > 9) {
        clearTimeout(g.timer);
        g.kind = 'pan';
      }
      if (g.kind === 'pan') {
        const v = U.views[pid];
        v.x = g.ox + dx;
        v.y = g.oy + dy;
        v.auto = false;
        applyPhoneView(pid);
      } else if (g.kind === 'held' && Math.hypot(dx, dy) > 6) {
        g.kind = 'drag';
        startCardDrag(g, e);
      }
      if (g.kind === 'drag') moveCardDrag(g, e);
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!g) return;
      if (g.kind === 'pinch') {
        if (pointers.size === 0) g = null;
        return;
      }
      clearTimeout(g.timer);
      if (g.cardEl) g.cardEl.classList.remove('held');
      const cur = g;
      g = null;
      if (e.type === 'pointercancel') return cur.ghostEl && restoreCard(cur);
      if (cur.kind === 'maybe' && cur.card) {
        // a tap
        if (U.mode) return U.modeClick(cur.cardEl);
        if (cur.card.zone === 'battlefield' && U.isLandCard(cur.card) && !cur.card.hidden) return U.act({ type: 'tap', cardId: cur.card.id });
        return cardSheet(cur.card, 'bf');
      }
      if (cur.kind === 'held') return U.mode ? U.modeClick(cur.cardEl) : cardSheet(cur.card, 'bf');
      if (cur.kind === 'drag') endCardDrag(cur, e, pid);
    };
    bf.addEventListener('pointerup', end);
    bf.addEventListener('pointercancel', end);
  }

  function startCardDrag(g, e) {
    const el = g.cardEl;
    const r = el.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost card';
    ghost.style.width = `${Math.max(70, r.width)}px`;
    ghost.style.height = `${Math.max(98, r.height)}px`;
    ghost.innerHTML = U.cardInner(g.card);
    document.body.appendChild(ghost);
    g.ghostEl = ghost;
    g.gw = parseFloat(ghost.style.width);
    g.gh = parseFloat(ghost.style.height);
    el.classList.add('dragging-src');
    moveCardDrag(g, e);
  }

  function moveCardDrag(g, e) {
    g.ghostEl.style.left = `${e.clientX - g.gw / 2}px`;
    g.ghostEl.style.top = `${e.clientY - g.gh / 2}px`;
    g.lx = e.clientX;
    g.ly = e.clientY;
  }

  function restoreCard(g) {
    if (g.ghostEl) g.ghostEl.remove();
    if (g.cardEl) g.cardEl.classList.remove('dragging-src', 'held');
  }

  async function endCardDrag(g, e, pid) {
    restoreCard(g);
    const c = g.card;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && under.closest('#p-hand')) return U.act({ type: 'move', cardId: c.id, to: 'hand' });
    const bfEl = under && under.closest('.pbf');
    if (!bfEl) return;
    const target = under.closest('.card[data-id]');
    if (target && target.dataset.id !== c.id && U.isEquipLike(c)) {
      return U.act({ type: 'attach', cardId: c.id, targetId: target.dataset.id });
    }
    const tpid = bfEl.dataset.pid;
    const table = bfEl.querySelector('.bf-table').getBoundingClientRect();
    const z = U.views[tpid].z;
    const x = clamp((e.clientX - table.left) / z - 50, 0, U.S.table.w - 100);
    const y = clamp((e.clientY - table.top) / z - 70, 0, U.S.table.h - 140);
    if (c.zone === 'battlefield' && c.zp === tpid) {
      if (c.attachedTo) await U.act({ type: 'unattach', cardId: c.id });
      g.cardEl.style.left = `${x}px`;
      g.cardEl.style.top = `${y}px`;
      U.act({ type: 'position', cardId: c.id, x, y });
    } else U.act({ type: 'move', cardId: c.id, to: 'battlefield', playerId: tpid, x, y });
  }

  /** Flick your own die to roll it; tap a rolled die to remove it. */
  function onDie(e, el) {
    const d = U.S.dice[el.dataset.die];
    if (!d || d.owner !== U.S.you) return;
    e.preventDefault();
    const z = (U.views[el.dataset.pid] || { z: 1 }).z;
    const ox = d.x;
    const oy = d.y;
    U.trackFlick(
      e,
      (dx, dy) => {
        el.style.left = `${clamp(ox + dx / z, 0, U.S.table.w - 70)}px`;
        el.style.top = `${clamp(oy + dy / z, 0, U.S.table.h - 70)}px`;
      },
      ({ vx, vy, moved, dx, dy }) => {
        const x = clamp(ox + dx / z, 0, U.S.table.w - 70);
        const y = clamp(oy + dy / z, 0, U.S.table.h - 70);
        if (!moved && d.value != null) return U.act({ type: 'removeDie', dieId: d.id });
        let f = { vx: vx / z, vy: vy / z };
        if (Math.hypot(vx, vy) < 250) {
          if (moved) {
            el.style.left = `${ox}px`;
            el.style.top = `${oy}px`;
            return U.toast('Flick the die (a quick swipe) to roll it.');
          }
          const r = U.randomFlick();
          f = { vx: r.vx / 2, vy: r.vy / 2 };
        }
        U.act({ type: 'rollDie', dieId: d.id, x, y, ...f });
      },
    );
  }

  /* ---------------------------------------------------------- sheets */

  function cardHead(c) {
    if (!c || c.hidden) return '<div class="sheet-card"><div class="back big">✦</div></div>';
    const src = c.flipped && c.backImg ? c.backImg : c.img;
    const sum = U.summaryHTML(c);
    return `<div class="sheet-card">${src ? `<img src="${esc(U.large(src))}" alt="">` : `<div class="ptext"><b>${esc(c.name)}</b><p class="small">${esc(c.oracle || '')}</p></div>`}
      ${sum ? `<div class="psum">${sum}</div>` : ''}</div>`;
  }

  function cardSheet(c, ctx) {
    if (!c) return;
    U.showMenu(U.cardMenu(c, ctx), 0, 0, { head: cardHead(c) });
  }

  function lifeSheet(pid) {
    const p = U.playerById(pid);
    if (!p) return;
    const items = [
      { header: `${p.id === U.S.you ? 'Your' : `${p.name}'s`} life: ${p.life}` },
      { label: '−1 life', fn: () => U.act({ type: 'life', playerId: pid, delta: -1 }) },
      { label: '+1 life', fn: () => U.act({ type: 'life', playerId: pid, delta: 1 }) },
      { label: '−5 life', fn: () => U.act({ type: 'life', playerId: pid, delta: -5 }) },
      { label: '+5 life', fn: () => U.act({ type: 'life', playerId: pid, delta: 5 }) },
      { label: 'Set life…', fn: async () => { const n = await U.askNumber('Set life', p.life); if (n !== null) U.act({ type: 'setLife', playerId: pid, value: n }); } },
      { sep: true },
    ];
    for (const [k, v] of Object.entries(p.counters || {})) {
      items.push({ label: `${k} ${v}: +1`, fn: () => U.act({ type: 'playerCounter', playerId: pid, name: k, delta: 1 }) });
      items.push({ label: `${k} ${v}: −1`, fn: () => U.act({ type: 'playerCounter', playerId: pid, name: k, delta: -1 }) });
    }
    items.push({ label: '+ Player counter (poison, energy…)', fn: async () => { const n = await U.askText('Add a player counter', 'poison'); if (n) U.act({ type: 'playerCounter', playerId: pid, name: n, delta: 1 }); } });
    if (U.S.format === 'commander') {
      const cmds = Object.values(U.S.cards).filter((c) => c.isCommander && c.owner !== pid && !c.isToken);
      for (const c of cmds) {
        const owner = U.playerById(c.owner);
        const v = (p.cmdDamage || {})[c.id] || 0;
        items.push({ label: `Commander dmg from ${owner ? owner.name : '?'}'s ${c.name}: ${v}  (+1)`, fn: () => U.act({ type: 'cmdDamage', playerId: pid, sourceId: c.id, delta: 1 }) });
        if (v) items.push({ label: `…remove 1`, fn: () => U.act({ type: 'cmdDamage', playerId: pid, sourceId: c.id, delta: -1 }) });
      }
    }
    U.showMenu(items, 0, 0, {});
  }

  function openMainMenu() {
    const S = U.S;
    const pid = view === 'watch' ? watchPid : S.you;
    const others = U.seatOrder().filter((id) => id !== S.you);
    U.showMenu(
      [
        { header: `${S.name} · code ${S.id}` },
        { label: '🂠 My battlefield', fn: () => setView('bf') },
        { label: '📚 My zones (library, graveyard, exile, command)', fn: () => setView('zones') },
        others.length === 1
          ? { label: `👀 Watch ${U.playerById(others[0]).name}'s battlefield`, fn: () => { watchPid = others[0]; setView('watch'); } }
          : null,
        others.length ? { label: '▦ All battlefields', fn: () => setView('grid') } : null,
        { label: '📜 Log & chat', fn: () => setView('log') },
        { sep: true },
        { label: '＋ Zoom in', fn: () => zoomPhone(pid, 1.3) },
        { label: '－ Zoom out', fn: () => zoomPhone(pid, 0.77) },
        { label: '⤢ Fit battlefield', fn: () => fitPhone(pid) },
        { sep: true },
        { label: '🎲 Drop a d20 on my battlefield', fn: () => { setView('bf'); U.act({ type: 'placeDie' }); } },
        { label: '✦ Create token…', fn: () => U.tokenDialog(S.you) },
        { label: '⟳ Proliferate…', fn: () => { setView('bf'); U.startProliferate(); } },
        { label: '↶ Undo', fn: () => U.act({ type: 'undo' }) },
        { label: '⇄ Untap all my permanents', fn: () => U.act({ type: 'untapAll' }) },
        { sep: true },
        { label: 'Load deck…', fn: () => U.deckDialog() },
        { label: S.setup && S.setup.stage !== 'done' ? 'Restart game…' : 'Start game…', fn: () => U.startGameClick() },
        { label: 'Copy invite link', fn: () => U.copyInvite() },
        { label: 'Settings (colour, layout…)', fn: () => U.settingsDialog() },
        { label: 'Help', fn: () => U.helpDialog() },
        { label: 'Leave to lobby', fn: () => U.leaveGame() },
      ],
      0,
      0,
      { head: `<div class="sheet-status"><div class="status status-pill ${U.status ? U.status.level : ''}">${esc(U.status ? U.status.text : '')}</div></div>` },
    );
  }

  /* ----------------------------------------------------------- zones */

  function renderZones(S, me) {
    if (!me) return;
    const z = me.zones;
    const top = (arr) => (arr.length ? S.cards[arr[arr.length - 1]] : null);
    const col = (zone, label, count, inner) =>
      `<div class="pzone" data-zone="${zone}"><div class="pz-card">${inner || `<span class="muted">${label}</span>`}</div><div class="pz-label">${label} <b>${count}</b></div></div>`;
    const libTop = me.revealTop && me.topCard && S.cards[me.topCard];
    let html = col('library', 'Library', me.libraryCount, me.libraryCount ? (libTop ? `<img src="${esc(libTop.img)}" alt="">` : '<div class="back">✦</div>') : '');
    const gy = top(z.graveyard);
    const ex = top(z.exile);
    html += col('graveyard', 'Graveyard', z.graveyard.length, gy && gy.img ? `<img src="${esc(gy.img)}" alt="">` : gy ? `<span>${esc(gy.name)}</span>` : '');
    html += col('exile', 'Exile', z.exile.length, ex && ex.img && !ex.hidden ? `<img src="${esc(ex.img)}" alt="">` : ex ? '<div class="back">✦</div>' : '');
    if (z.command.length) {
      const cm = S.cards[z.command[0]];
      html += col('command', 'Command', z.command.length, cm && cm.img ? `<img src="${esc(cm.img)}" alt="">` : '');
    }
    $('#p-zones').innerHTML = html;
  }

  function onZoneTap(e) {
    const zEl = e.target.closest('[data-zone]');
    if (!zEl) return;
    const zone = zEl.dataset.zone;
    if (zone === 'library') return U.showMenu(U.libraryMenu(), 0, 0, {});
    if (zone === 'command') {
      const me = U.me();
      if (me.zones.command.length === 1) return cardSheet(U.S.cards[me.zones.command[0]], 'command');
    }
    U.openViewer(U.S.you, zone);
  }

  /* ------------------------------------------------------------ grid */

  function renderGrid(S) {
    const seats = U.seatOrder();
    const grid = $('#p-grid');
    grid.dataset.n = String(seats.length);
    grid.innerHTML = seats
      .map((pid, i) => {
        const p = U.playerById(pid);
        return `<div class="pcell slot-${i} ${S.turn.active === pid ? 'active' : ''}" data-pid="${pid}" ${p.bfColor ? `style="--felt:${esc(p.bfColor)}"` : ''}>
          <div class="mini" data-mini="${pid}"></div>
          <div class="pinfo"><span class="dot" style="background:${esc(p.color)}"></span><b>${esc(pid === S.you ? 'You' : p.name)}</b> ♥ ${p.life}
            <span class="muted">✋${p.handCount} · GY ${p.zones.graveyard.length}</span></div></div>`;
      })
      .join('');
    // static miniature battlefields
    requestAnimationFrame(() => {
      for (const pid of seats) {
        const box = grid.querySelector(`[data-mini="${pid}"]`);
        if (!box) continue;
        const r = box.getBoundingClientRect();
        const z = Math.min(r.width / S.table.w, r.height / S.table.h);
        const p = U.playerById(pid);
        const { ids, pos } = U.paneLayout(p);
        box.innerHTML = `<div class="mini-table" style="width:${S.table.w}px;height:${S.table.h}px;transform:translate(${(r.width - S.table.w * z) / 2}px,${(r.height - S.table.h * z) / 2}px) scale(${z})">${ids
          .map((id) => {
            const c = S.cards[id];
            const at = pos[id] || c;
            return `<div class="card ${c.tapped ? 'tapped' : ''}" style="left:${at.x}px;top:${at.y}px">${U.cardInner(c)}</div>`;
          })
          .join('')}</div>`;
      }
    });
  }

  /* ------------------------------------------------------------ hand */

  function renderHand(S, me) {
    const hand = $('#p-hand');
    const ids = (me && me.zones.hand) || [];
    U.reconcile(hand, ids, (id, el) => {
      const c = S.cards[id];
      if (!el) {
        el = document.createElement('div');
        el.className = 'hcard';
      }
      el.dataset.id = id;
      const sig = `${c.img}|${c.name}|${c.manaCost}`;
      if (el._sig !== sig) {
        el._sig = sig;
        el.innerHTML = c.img
          ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" draggable="false">`
          : `<div class="hfallback"><b>${esc(c.name)}</b><span>${esc(c.manaCost || '')}</span></div>`;
      }
      return el;
    });
  }

  function setupHand() {
    const hand = $('#p-hand');
    let t = null;

    hand.addEventListener('contextmenu', (e) => e.preventDefault());
    hand.addEventListener(
      'touchstart',
      (e) => {
        const el = e.target.closest('.hcard');
        if (!el || e.touches.length > 1) return;
        const touch = e.touches[0];
        t = { el, id: el.dataset.id, sx: touch.clientX, sy: touch.clientY, kind: 'maybe', start: Date.now() };
        t.timer = setTimeout(() => {
          if (t && t.kind === 'maybe') {
            t.kind = 'held';
            el.classList.add('held');
            if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* ignore */ }
          }
        }, HOLD_MS);
      },
      { passive: true },
    );

    hand.addEventListener(
      'touchmove',
      (e) => {
        if (!t) return;
        const touch = e.touches[0];
        const dx = touch.clientX - t.sx;
        const dy = touch.clientY - t.sy;
        if (t.kind === 'maybe') {
          if (dy < -12 && Math.abs(dy) > Math.abs(dx)) {
            clearTimeout(t.timer);
            t.kind = 'play';
            startHandGhost(t, touch);
          } else if (Math.abs(dx) > 10) {
            clearTimeout(t.timer);
            t.kind = 'scroll'; // let the browser scroll the hand
            return;
          }
        } else if (t.kind === 'held' && Math.hypot(dx, dy) > 6) {
          t.kind = 'sort';
          startHandGhost(t, touch);
        }
        if (t.kind === 'play' || t.kind === 'sort') {
          e.preventDefault();
          moveHandGhost(t, touch);
        }
      },
      { passive: false },
    );

    const end = (e) => {
      if (!t) return;
      clearTimeout(t.timer);
      const cur = t;
      t = null;
      cur.el.classList.remove('held', 'dragging-src');
      if (cur.ghost) cur.ghost.remove();
      $('#p-hand').classList.remove('sorting');
      const c = U.getCard(cur.id);
      if (!c || e.type === 'touchcancel') return;
      const touch = e.changedTouches[0];
      if (cur.kind === 'maybe' || cur.kind === 'held') {
        if (e.cancelable) e.preventDefault(); // no extra mouse click afterwards
        return handSheet(c);
      }
      if (cur.kind === 'play') {
        const top = $('#p-hand').getBoundingClientRect().top;
        if (touch.clientY < top - 25) U.playFromHand(c, 'auto');
        return;
      }
      if (cur.kind === 'sort') {
        const index = U.handIndexAt(touch.clientX, c.id, $('#p-hand'));
        U.act({ type: 'reorderHand', cardId: c.id, index });
      }
    };
    hand.addEventListener('touchend', end);
    hand.addEventListener('touchcancel', end);

    // mouse fallback (phone layout on a computer): click = view, drag up = play
    hand.addEventListener('click', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      const el = e.target.closest('.hcard');
      if (el) handSheet(U.getCard(el.dataset.id));
    });
  }

  function startHandGhost(t, touch) {
    const c = U.getCard(t.id);
    const g = document.createElement('div');
    g.className = 'drag-ghost card hand-ghost';
    g.innerHTML = U.cardInner(c);
    document.body.appendChild(g);
    t.ghost = g;
    t.el.classList.add('dragging-src');
    if (t.kind === 'sort') $('#p-hand').classList.add('sorting');
    moveHandGhost(t, touch);
  }

  function moveHandGhost(t, touch) {
    t.ghost.style.left = `${touch.clientX - 55}px`;
    t.ghost.style.top = `${touch.clientY - (t.kind === 'sort' ? 120 : 160)}px`;
    if (t.kind === 'play') {
      const top = $('#p-hand').getBoundingClientRect().top;
      t.ghost.classList.toggle('will-play', touch.clientY < top - 25);
    }
  }

  function handSheet(c) {
    if (!c) return;
    U.showMenu(U.cardMenu(c, 'hand'), 0, 0, { head: cardHead(c) });
  }

  window.MTGPhone = { init, setView, fitPhone };
})();
