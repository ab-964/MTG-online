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
  let mapCol = null; // which opponent the map is pointing at
  let logOn = !!(window.MTGNet.Store.get('mtgtt.phoneLog'));
  let lastCombat = false;
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
        <button class="pbtn ptext" id="p-logbtn">Log</button>
        <div class="pturn" id="p-turn"></div>
        <div class="pphases" id="p-phases"></div>
        <button class="pbtn ptext" id="p-cur" hidden></button>
        <button class="pbtn primary" id="p-pass">Pass ▶</button>
      </div>
      <div class="pmain" id="p-main">
        <div class="pview" data-view="bf">
          <div class="pwatch mine">
            <div class="plog log" id="p-me-log"></div>
            <div class="pslot" id="p-slot-me"></div>
            <div class="ppiles" id="p-piles"></div>
          </div>
        </div>
        <div class="pview" data-view="zones" hidden><div class="pzones" id="p-zones"></div></div>
        <div class="pview" data-view="grid" hidden><div class="pgrid" id="p-grid"></div></div>
        <div class="pview" data-view="watch" hidden>
          <div class="pwatch">
            <div class="plog log" id="p-watch-log"></div>
            <div class="pslot" id="p-slot-watch"></div>
            <div class="pside" id="p-watch-side"></div>
          </div>
        </div>
        <div class="pview" data-view="combat" hidden>
          <div class="pcombat"><div class="pcb-head" id="p-combat-head"></div><div class="pcb-main cbo-main" id="p-combat"></div><div class="pcb-bar" id="p-combat-bar"></div></div>
        </div>
        <div class="pview" data-view="log" hidden>
          <div class="plogview"><div class="log" id="p-log"></div>
            <form id="p-chat" class="chat-form"><input maxlength="300" placeholder="Chat…" autocomplete="off"></form></div>
        </div>
        <div class="pstack" id="p-stack" hidden></div>
        <button class="pback" id="p-back" hidden>◀ My battlefield</button>
        <div class="pstatus status status-pill" id="p-status"></div>
        <div class="pnav" id="p-nav"></div>
      </div>
      <div class="pedges" id="p-edges" hidden></div>
      <div class="phand" id="p-hand"></div>`;
    if (U.status) {
      const st = $('#p-status');
      st.className = `pstatus status status-pill ${U.status.level}`;
      st.textContent = U.status.text;
    }
    $('#p-menu').addEventListener('click', openMainMenu);
    $('#p-logbtn').addEventListener('click', () => {
      logOn = !logOn;
      window.MTGNet.Store.set('mtgtt.phoneLog', logOn);
      render(U.S);
      requestAnimationFrame(() => {
        for (const pid of Object.keys(bfs)) if (U.views[pid] && U.views[pid].auto) fitPhone(pid);
      });
    });
    $('#p-cur').addEventListener('click', () => {
      const S = U.S;
      if (!S) return;
      if (view !== 'bf') return setView('bf');
      const act = S.turn.active;
      if (act && act !== S.you) goWatch(act);
    });
    $('#p-piles').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pile]');
      if (!b) return;
      if (b.dataset.pile === 'library') return U.libraryClick(e.clientX, e.clientY);
      if (b.dataset.pile === 'graveyard') return U.openViewer(U.S.you, 'graveyard');
      setView('zones');
    });
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
      else goWatch(cell.dataset.pid);
    });
    $('#p-watch-side').addEventListener('click', (e) => {
      const b = e.target.closest('[data-zone]');
      if (b) U.openViewer(watchPid, b.dataset.zone);
    });
    $('#p-combat').addEventListener('click', onCombatTap);
    $('#p-combat-bar').addEventListener('click', (e) => U.combatClick(e));
    $('#p-nav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav]');
      const t = $('#p-nav')._t || {};
      if (b && t[b.dataset.nav]) t[b.dataset.nav].go();
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
    $('#rotate').hidden = true;
    document.body.classList.toggle('portrait', U.phone && portrait);
    for (const pid of Object.keys(bfs)) if (U.views[pid] && U.views[pid].auto) U.views[pid].auto = true;
    requestAnimationFrame(() => {
      for (const pid of Object.keys(bfs)) if (!U.views[pid] || U.views[pid].auto) fitPhone(pid);
    });
  }

  function setView(v) {
    if (!U.S) return;
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
    if (view === 'combat' && !S.combat) view = 'bf';
    const me = U.me();
    const active = U.playerById(S.turn.active);
    $('#p-turn').textContent = !active ? 'Setting up' : active.id === S.you ? 'Your turn' : '';
    $('#p-turn').classList.toggle('mine', !!active && active.id === S.you);
    $('#p-logbtn').classList.toggle('on', logOn);
    const cur = $('#p-cur');
    if (view !== 'bf') {
      cur.hidden = false;
      cur.innerHTML = `${U.ICONS.back}<span>Return</span>`;
    } else if (active && active.id !== S.you) {
      cur.hidden = false;
      cur.textContent = `${active.name}'s turn ›`;
    } else cur.hidden = true;
    $('#phone').classList.toggle('log-on', logOn);
    $('#phone').classList.toggle('no-arrows', window.MTGNet.Store.get('mtgtt.phoneArrows') === false);
    $('#phone').classList.toggle('no-piles', window.MTGNet.Store.get('mtgtt.phonePiles') === false);
    $('#p-phases').innerHTML = S.phases.map((ph, i) => `<span class="phase ${i === S.turn.phase ? 'on' : ''}" data-i="${i}">${esc(ph)}</span>`).join('');
    $('#p-pass').disabled = !active;

    for (const el of $$('#p-main .pview')) el.hidden = el.dataset.view !== view;
    $('#p-main').dataset.view = view;
    $('#p-back').hidden = view === 'bf';

    if (view === 'bf' && me) {
      mountBf($('#p-slot-me'), me);
      renderPiles(S, me);
      if (logOn) U.renderLog($('#p-me-log'));
    }
    if (view === 'watch') {
      const p = U.playerById(watchPid);
      if (!p) return setView('grid');
      mountBf($('#p-slot-watch'), p);
      if (logOn) U.renderLog($('#p-watch-log'));
      const z = p.zones;
      const top = (arr) => (arr.length ? S.cards[arr[arr.length - 1]] : null);
      const pile = (zone, label, arr) => {
        const c = top(arr);
        return `<button class="pmini" data-zone="${zone}">${c && c.img ? `<img src="${esc(c.img)}" alt="">` : ''}<span>${label} <b>${arr.length}</b></span></button>`;
      };
      $('#p-watch-side').innerHTML = pile('graveyard', 'Grave', z.graveyard) + pile('exile', 'Exile', z.exile) + (z.command.length ? pile('command', 'Cmd', z.command) : '');
    }
    if (view === 'combat') renderPhoneCombat(S);
    renderNav(S);
    if (S.combat && !lastCombat)
      U.toast(S.combat.attacker === S.you ? 'Combat! Tap ▲ for the combat zone, or drag creatures to the top of the screen.' : `${(U.playerById(S.combat.attacker) || {}).name || 'Someone'} is attacking! Tap ▲ to see the combat zone.`);
    lastCombat = !!S.combat;
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
      <span class="muted pcount">${U.ICONS.hand}${p.handCount} ${U.ICONS.library}${p.libraryCount}</span>`;
  }

  function mountBf(slot, p) {
    let bf = bfs[p.id];
    if (!bf) {
      bf = document.createElement('div');
      bf.className = 'bf pbf';
      bf.dataset.pid = p.id;
      bf.innerHTML = `<div class="bf-table" data-drop="bf" data-player="${p.id}" style="width:${U.S.table.w}px;height:${U.S.table.h}px">
          <div class="layer"></div></div>
        <button class="plife" data-pid="${p.id}"></button>`;
      bfs[p.id] = bf;
      U.views[p.id] = U.views[p.id] || { x: 0, y: 0, z: U.DEFAULT_Z * 0.75, auto: true };
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
    if (U.views[p.id] && U.views[p.id].auto && bf.offsetParent) fitPhone(p.id);
  }

  function applyPhoneView(pid) {
    const bf = bfs[pid];
    const v = U.views[pid];
    if (bf && v) bf.querySelector('.bf-table').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }

  /** Fit every card with a border around them (soft = never zoom in past normal card size). */
  function fitPhone(pid, soft = true) {
    const bf = bfs[pid];
    if (!bf || !U.S || !bf.offsetParent) return;
    U.fitView(pid, soft);
  }

  /** Middle of what you're looking at, in table units (new cards land here). */
  function viewCenter(pid) {
    const bf = bfs[pid];
    const v = U.views[pid];
    if (!bf || !v || !bf.offsetParent) return null;
    const r = bf.getBoundingClientRect();
    return { x: Math.round((r.width / 2 - v.x) / v.z), y: Math.round((r.height / 2 - v.y) / v.z) };
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
      if (e.target.closest('button')) return; // life badge etc. get a normal tap
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
    showEdges('perm', g.card);
    moveCardDrag(g, e);
  }

  function moveCardDrag(g, e) {
    g.ghostEl.style.left = `${e.clientX - g.gw / 2}px`;
    g.ghostEl.style.top = `${e.clientY - g.gh / 2}px`;
    g.lx = e.clientX;
    g.ly = e.clientY;
    highlightEdge(e.clientX, e.clientY);
  }

  function restoreCard(g) {
    hideEdges();
    if (g.ghostEl) g.ghostEl.remove();
    if (g.cardEl) g.cardEl.classList.remove('dragging-src', 'held');
  }

  async function endCardDrag(g, e, pid) {
    if (g.ghostEl) g.ghostEl.remove();
    if (g.cardEl) g.cardEl.classList.remove('dragging-src', 'held');
    const c = g.card;
    if (dropOnEdge(c, e.clientX, e.clientY)) return;
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

  /* ------------------------------------------------------ combat map */

  // The map during combat:   [opponent battlefields]
  //                          [combat with each opponent]  (← →)
  //                          [            me            ]
  // The map:   [ opponents' battlefields, left to right in turn order ]
  //            [ combat zone with each of them (only during combat)    ]
  //            [                         you                           ]
  function opponents() {
    return U.seatOrder().filter((id) => id !== U.S.you);
  }
  function homeCol() {
    const S = U.S;
    const opps = opponents();
    const cb = S.combat;
    if (cb) {
      const target = cb.attacker === S.you ? U.currentCombatDef() : cb.attacker;
      const i = opps.indexOf(target);
      if (i >= 0) return i;
    }
    if (mapCol != null && mapCol < opps.length) return mapCol;
    return opps.length === 3 ? 1 : 0;
  }
  /** Does this opponent have a combat zone with you right now? */
  function hasCombatWith(pid) {
    const cb = U.S.combat;
    if (!cb) return false;
    return cb.attacker === U.S.you ? U.combatDefenders().includes(pid) : pid === cb.attacker;
  }
  function goWatch(pid) {
    watchPid = pid;
    mapCol = opponents().indexOf(pid);
    setView('watch');
  }
  function goCombat(pid) {
    if (U.S.combat.attacker === U.S.you) U.setCombatDef(pid);
    mapCol = opponents().indexOf(pid);
    setView('combat');
  }

  function navTargets(S) {
    const opps = opponents();
    if (!opps.length) return {};
    const name = (id) => (U.playerById(id) || {}).name || '?';
    const t = {};
    const col = homeCol();
    if (view === 'bf') {
      const pid = opps[col];
      t.up = hasCombatWith(pid) ? { label: 'Combat', icon: U.ICONS.sword, go: () => goCombat(pid) } : { label: name(pid), go: () => goWatch(pid) };
    }
    if (view === 'combat') {
      const pid = S.combat.attacker === S.you ? U.currentCombatDef() : S.combat.attacker;
      t.down = { label: 'You', go: () => setView('bf') };
      t.up = { label: name(pid), go: () => goWatch(pid) };
      const cells = opps.filter(hasCombatWith);
      const i = cells.indexOf(pid);
      if (cells.length > 1) {
        if (i > 0) t.left = { label: name(cells[i - 1]), go: () => goCombat(cells[i - 1]) };
        if (i < cells.length - 1) t.right = { label: name(cells[i + 1]), go: () => goCombat(cells[i + 1]) };
      }
    }
    if (view === 'watch') {
      const i = opps.indexOf(watchPid);
      t.down = hasCombatWith(watchPid) ? { label: 'Combat', icon: U.ICONS.sword, go: () => goCombat(watchPid) } : { label: 'You', go: () => setView('bf') };
      if (i > 0) t.left = { label: name(opps[i - 1]), go: () => goWatch(opps[i - 1]) };
      if (i >= 0 && i < opps.length - 1) t.right = { label: name(opps[i + 1]), go: () => goWatch(opps[i + 1]) };
    }
    return t;
  }

  function renderNav(S) {
    const nav = $('#p-nav');
    const t = navTargets(S);
    const arrow = { up: '▲', down: '▼', left: '◀', right: '▶' };
    nav.innerHTML = ['up', 'down', 'left', 'right']
      .filter((k) => t[k])
      .map((k) => `<button class="pnav-btn ${k}" data-nav="${k}"><span class="ar">${arrow[k]}</span>${t[k].icon || ''}<span>${esc(t[k].label)}</span></button>`)
      .join('');
    nav._t = t;
  }

  /** Library and graveyard peeking in from the right edge, plus a tiny "Other zones" button. */
  function renderPiles(S, me) {
    const box = $('#p-piles');
    const gy = me.zones.graveyard.length ? S.cards[me.zones.graveyard[me.zones.graveyard.length - 1]] : null;
    const libTop = me.revealTop && me.topCard && S.cards[me.topCard];
    const sig = `${me.libraryCount}|${gy ? gy.id : ''}|${libTop ? libTop.id : ''}|${me.zones.exile.length}|${me.zones.command.length}`;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = `<button class="ppile" data-pile="library" data-lib="${me.id}">${libTop && libTop.img ? `<img src="${esc(libTop.img)}" alt="">` : '<div class="back">✦</div>'}<span class="pp-n">${me.libraryCount}</span></button>
      <button class="ppile" data-pile="graveyard">${gy ? (gy.img ? `<img src="${esc(gy.img)}" alt="">` : `<span class="pp-t">${esc(gy.name)}</span>`) : '<span class="pp-t">Graveyard</span>'}<span class="pp-n">${me.zones.graveyard.length}</span></button>
      <button class="pother" data-pile="other">Other zones</button>`;
  }

  function renderPhoneCombat(S) {
    const cb = S.combat;
    const def = U.currentCombatDef();
    const defP = U.playerById(def);
    const attP = U.playerById(cb.attacker);
    const iAttack = cb.attacker === S.you;
    const t = U.combatTargetsHTML(def);
    $('#p-combat-head').innerHTML = `${U.ICONS.sword}<span>${esc(iAttack ? 'You' : attP ? attP.name : '?')} attacking <b>${esc(def === S.you ? 'you' : defP ? defP.name : '?')}</b></span>
      ${iAttack ? '<span class="muted small">tap a target to add attackers</span>' : ''}`;
    $('#p-combat').innerHTML = t.html;
    $('#p-combat-bar').innerHTML = U.combatBarHTML(t.playerTotal);
  }

  /** Taps in the phone combat zone. */
  function onCombatTap(e) {
    const S = U.S;
    const cb = S && S.combat;
    if (!cb) return;
    if (e.target.closest('[data-cb]')) return U.combatClick(e);
    const me = S.you;
    const col = e.target.closest('.cb-col');
    const target = e.target.closest('.cb-target');
    const cardEl = e.target.closest('.card[data-id]');
    const myCreatures = (filter) =>
      U.me()
        .zones.battlefield.map((id) => S.cards[id])
        .filter((c) => c && /\bCreature\b/.test(c.typeLine || '') && filter(c));
    const attacking = new Set(cb.attacks.map((a) => a.cardId));
    const blocking = new Set(cb.attacks.flatMap((a) => a.blockers));
    if (cardEl && col && cb.attacker === me) {
      const at = cb.attacks.find((a) => a.id === col.dataset.attack);
      if (at && at.cardId === cardEl.dataset.id) {
        const defP = U.playerById(U.currentCombatDef());
        const items = [{ header: S.cards[at.cardId].name }, { label: `Attack ${defP ? defP.name : 'player'}`, fn: () => U.act({ type: 'declareAttack', cardId: at.cardId, target: { kind: 'player', id: defP.id } }) }];
        for (const t of $$('#p-combat .cb-target.pw')) items.push({ label: `Attack ${S.cards[t.dataset.tid].name}`, fn: () => U.act({ type: 'declareAttack', cardId: at.cardId, target: { kind: 'pw', id: t.dataset.tid } }) });
        items.push({ label: 'Remove from combat', cls: 'stop', fn: () => U.act({ type: 'removeAttack', attackId: at.id }) });
        return U.showMenu(items, 0, 0, {});
      }
    }
    if (col) {
      const at = cb.attacks.find((a) => a.id === col.dataset.attack);
      if (at && at.defender === me) {
        const list = myCreatures((c) => !c.tapped && !blocking.has(c.id));
        return U.showMenu(
          [{ header: `Block ${S.cards[at.cardId].name} with…` }].concat(list.length ? list.map((c) => ({ label: c.name, fn: () => U.act({ type: 'block', attackId: at.id, cardId: c.id }) })) : [{ label: 'No untapped creatures', disabled: true, fn() {} }]),
          0,
          0,
          {},
        );
      }
    }
    if (target && cb.attacker === me) {
      const list = myCreatures((c) => !c.tapped && !attacking.has(c.id));
      const t = { kind: target.dataset.tkind, id: target.dataset.tid };
      return U.showMenu(
        [{ header: 'Attack with…' }].concat(list.length ? list.map((c) => ({ label: c.name, fn: () => U.act({ type: 'declareAttack', cardId: c.id, target: t }) })) : [{ label: 'No untapped creatures', disabled: true, fn() {} }]),
        0,
        0,
        {},
      );
    }
  }

  /* --------------------------------------------- edge targets while dragging */

  function showEdges(kind, card) {
    const S = U.S;
    const edges = $('#p-edges');
    const left = [['graveyard', 'Graveyard'], ['exile', 'Exile']];
    const right = [];
    if (kind === 'perm') right.push(['hand', 'Hand']);
    right.push(['library', 'Library (top)']);
    if (S.format === 'commander' || card.isCommander) right.push(['command', 'Command']);
    let top = [];
    const cb = S.combat;
    if (kind === 'perm' && cb && card.zp === S.you && /\bCreature\b/.test(card.typeLine || '')) {
      if (cb.attacker === S.you) top = U.combatDefenders().map((id) => [`attack:${id}`, `⚔ Attack ${(U.playerById(id) || {}).name || '?'}`]);
      else if (cb.attacks.some((a) => a.defender === S.you)) top = [['block', '🛡 Block…']];
    }
    const zone = (list, cls) => `<div class="pedge ${cls}">${list.map(([k, l]) => `<div class="pedge-t" data-edge="${k}">${esc(l)}</div>`).join('')}</div>`;
    edges.innerHTML = zone(left, 'left') + zone(right, 'right') + (top.length ? zone(top, 'top') : '');
    edges.hidden = false;
  }

  function hideEdges() {
    $('#p-edges').hidden = true;
  }

  function edgeAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-edge]') : null;
  }

  function highlightEdge(x, y) {
    const t = edgeAt(x, y);
    for (const el of $$('#p-edges .pedge-t')) el.classList.toggle('hot', el === t);
    return t;
  }

  /** Returns true if the card was dropped on an edge target. */
  function dropOnEdge(card, x, y) {
    const t = edgeAt(x, y);
    hideEdges();
    if (!t) return false;
    const k = t.dataset.edge;
    const S = U.S;
    if (k.startsWith('attack:')) U.act({ type: 'declareAttack', cardId: card.id, target: { kind: 'player', id: k.slice(7) } });
    else if (k === 'block') {
      const list = S.combat.attacks.filter((a) => a.defender === S.you);
      if (list.length === 1) U.act({ type: 'block', attackId: list[0].id, cardId: card.id });
      else
        U.showMenu(
          [{ header: `Block which attacker with ${card.name}?` }].concat(
            list.map((a) => ({ label: `${S.cards[a.cardId].name} (${a.dmg == null ? '?' : a.dmg} dmg)`, fn: () => U.act({ type: 'block', attackId: a.id, cardId: card.id }) })),
          ),
          0,
          0,
          {},
        );
    } else U.act({ type: 'move', cardId: card.id, to: k, pos: 'top' });
    return true;
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

  /** Life: slide right for damage, left for gain, ±1 to fine-tune. Applied when you close the window. */
  function lifeSheet(pid) {
    if (!U.S) return;
    const p = U.playerById(pid);
    if (!p) return;
    let delta = 0;
    const counters = Object.entries(p.counters || {});
    const cmds = U.S.format === 'commander' ? Object.values(U.S.cards).filter((c) => c.isCommander && c.owner !== pid && !c.isToken) : [];
    U.dialog({
      title: `${p.id === U.S.you ? 'Your' : `${p.name}'s`} life`,
      body: `<div class="lf-now"><span class="lf-old">${p.life}</span><span class="lf-arrow">→</span><b class="lf-new">${p.life}</b><span class="lf-desc muted"></span></div>
        <div class="lf-slide"><span class="muted small">gain</span><input type="range" min="-20" max="20" step="1" value="0" class="lf-range"><span class="muted small">damage</span></div>
        <div class="row gap lf-btns"><button class="btn" data-lf="-1">−1</button><button class="btn" data-lf="1">+1</button></div>
        ${counters.length || cmds.length ? '<div class="sect-title">Counters &amp; commander damage</div>' : ''}
        ${counters.map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span><button class="btn tiny" data-pc="${esc(k)}" data-d="-1">−</button><button class="btn tiny" data-pc="${esc(k)}" data-d="1">+</button></div>`).join('')}
        ${cmds
          .map((c) => {
            const owner = U.playerById(c.owner);
            const v = (p.cmdDamage || {})[c.id] || 0;
            return `<div class="kv"><span class="k">${esc(owner ? owner.name : '?')} · ${esc(c.name)}</span><span class="v">${v}</span><button class="btn tiny" data-cmd="${c.id}" data-d="-1">−</button><button class="btn tiny" data-cmd="${c.id}" data-d="1">+</button></div>`;
          })
          .join('')}
        <button class="btn small" data-pcadd="1">+ Player counter (poison, energy…)</button>`,
      buttons: [{ label: 'Done', value: 'ok', primary: true }],
      onMount(root) {
        const range = root.querySelector('.lf-range');
        const draw = () => {
          root.querySelector('.lf-new').textContent = String(p.life + delta);
          root.querySelector('.lf-desc').textContent = delta < 0 ? `${-delta} damage` : delta > 0 ? `gain ${delta}` : '';
          range.value = String(clamp(-delta, -20, 20));
        };
        range.addEventListener('input', () => {
          delta = -Number(range.value);
          draw();
        });
        root.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.lf) {
            delta += Number(b.dataset.lf);
            draw();
          }
          if (b.dataset.pc) U.act({ type: 'playerCounter', playerId: pid, name: b.dataset.pc, delta: Number(b.dataset.d) });
          if (b.dataset.cmd) U.act({ type: 'cmdDamage', playerId: pid, sourceId: b.dataset.cmd, delta: Number(b.dataset.d) });
          if (b.dataset.pcadd) {
            const n = await U.askText('Add a player counter', 'poison');
            if (n) U.act({ type: 'playerCounter', playerId: pid, name: n, delta: 1 });
          }
        });
      },
    }).then(() => {
      // closing the window (Done, or tapping outside) applies the change; Undo fixes mistakes
      if (delta) U.act({ type: 'life', playerId: pid, delta });
    });
  }

  function openMainMenu() {
    const S = U.S;
    if (!S) return U.toast('Still loading the game… one moment.');
    const pid = view === 'watch' ? watchPid : S.you;
    const I = U.ICONS;
    const others = opponents();
    U.showMenu(
      [
        { header: `${S.name} · code ${S.id}` },
        { label: 'My battlefield', icon: I.field, fn: () => setView('bf') },
        { label: 'Other zones (library, graveyard, exile, command)', icon: I.zones, fn: () => setView('zones') },
        others.length ? { label: 'All battlefields', icon: I.grid, fn: () => setView('grid') } : null,
        { label: 'Log & chat', icon: I.log, fn: () => setView('log') },
        { sep: true },
        { label: 'Zoom in', icon: I.zoomIn, fn: () => zoomPhone(pid, 1.3) },
        { label: 'Zoom out', icon: I.zoomOut, fn: () => zoomPhone(pid, 0.77) },
        { label: 'Fit battlefield', icon: I.fit, fn: () => fitPhone(pid, false) },
        { sep: true },
        { label: 'Drop a d20 on my battlefield', icon: I.die, fn: () => { setView('bf'); U.act({ type: 'placeDie' }); } },
        { label: 'Create token…', icon: I.token, fn: () => U.tokenDialog(S.you) },
        { label: 'Proliferate…', icon: I.prolif, fn: () => { setView('bf'); U.startProliferate(); } },
        { label: 'Undo', icon: I.undo, fn: () => U.act({ type: 'undo' }) },
        { label: 'Untap all my permanents', icon: I.untap, fn: () => U.act({ type: 'untapAll' }) },
        { sep: true },
        { label: 'Load deck…', icon: I.deck, fn: () => U.deckDialog() },
        { label: S.setup && S.setup.stage !== 'done' ? 'Restart game…' : 'Start game…', icon: I.play, fn: () => U.startGameClick() },
        { label: 'Copy invite link', icon: I.link, fn: () => U.copyInvite() },
        { label: 'Settings', icon: I.gear, fn: () => U.settingsDialog() },
        { label: 'Help', icon: I.help, fn: () => U.helpDialog() },
        { label: 'Leave to lobby', icon: I.leave, fn: () => U.leaveGame() },
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
    if (zone === 'library') return U.libraryClick(e.clientX, e.clientY);
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
      if (cur.kind !== 'play') hideEdges();
      const c = U.getCard(cur.id);
      if (!c || e.type === 'touchcancel') return hideEdges();
      const touch = e.changedTouches[0];
      if (cur.kind === 'maybe' || cur.kind === 'held') {
        if (e.cancelable) e.preventDefault(); // no extra mouse click afterwards
        return handSheet(c);
      }
      if (cur.kind === 'play') {
        if (dropOnEdge(c, touch.clientX, touch.clientY)) return;
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
    if (t.kind === 'play') showEdges('hand', c);
    moveHandGhost(t, touch);
  }

  function moveHandGhost(t, touch) {
    t.ghost.style.left = `${touch.clientX - 55}px`;
    t.ghost.style.top = `${touch.clientY - (t.kind === 'sort' ? 120 : 160)}px`;
    if (t.kind === 'play') {
      const top = $('#p-hand').getBoundingClientRect().top;
      const onEdge = highlightEdge(touch.clientX, touch.clientY);
      t.ghost.classList.toggle('will-play', !onEdge && touch.clientY < top - 25);
    }
  }

  function handSheet(c) {
    if (!c) return;
    U.showMenu(U.cardMenu(c, 'hand'), 0, 0, { head: cardHead(c) });
  }

  window.MTGPhone = { init, setView, fitPhone, applyView: applyPhoneView, viewCenter };
})();
