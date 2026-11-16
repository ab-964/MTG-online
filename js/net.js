/**
 * Networking + saving.
 *
 * The HOST's browser keeps the real game state and saves it in that browser's
 * storage after every change. Friends connect straight to the host's browser
 * over WebRTC (via PeerJS). Nothing listens on a port on anyone's PC: the
 * PeerJS cloud service only helps the two browsers find each other.
 */
(function (root) {
  'use strict';

  const E = root.MTGEngine;
  const PEER_PREFIX = 'mtg-tabletop-v1-';
  const GAME_KEY = 'mtgtt.game.';
  const SEAT_KEY = 'mtgtt.seat.';

  /* ------------------------------------------------------------ storage */

  const Store = {
    get(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('Save failed', e);
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    keys(prefix) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) out.push(k);
        }
      } catch {
        /* ignore */
      }
      return out;
    },
    loadGame: (code) => Store.get(GAME_KEY + code),
    saveGame: (g) => Store.set(GAME_KEY + g.id, g),
    deleteGame: (code) => Store.remove(GAME_KEY + code),
    listGames() {
      return Store.keys(GAME_KEY)
        .map((k) => Store.get(k))
        .filter((g) => g && g.id)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    getSeat: (code) => Store.get(SEAT_KEY + code),
    setSeat: (code, seat) => Store.set(SEAT_KEY + code, seat),
  };

  const peerIdFor = (code) => PEER_PREFIX + String(code).toLowerCase();

  function friendlyPeerError(err) {
    switch (err && err.type) {
      case 'browser-incompatible':
        return 'This browser does not support direct connections (WebRTC). Try Chrome, Edge or Firefox.';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        return 'Lost contact with the connection service. Retrying…';
      case 'unavailable-id':
        return 'This game seems to be open in another tab or window. Close it there (or wait a few seconds) and it will retry.';
      default:
        return (err && err.message) || 'Connection problem.';
    }
  }

  /* ---------------------------------------------------------------- host */

  class HostSession {
    constructor(game, { onState, onStatus }) {
      this.game = game;
      this.onState = onState;
      this.onStatus = onStatus;
      this.conns = new Set();
      this.saveTimer = null;
      this.retryTimer = null;
      this.destroyed = false;
      this.isHost = true;
      window.addEventListener('beforeunload', () => this.saveNow());
    }

    get playerId() {
      return this.game.hostPlayerId;
    }

    start() {
      this.publish();
      this.openPeer();
      // heartbeat so friends notice quickly if this page closes
      this.pingTimer = setInterval(() => {
        for (const c of this.conns) if (c.open) try { c.send({ type: 'ping' }); } catch { /* ignore */ }
      }, 5000);
    }

    openPeer() {
      if (this.destroyed) return;
      if (typeof Peer === 'undefined') {
        this.onStatus({ level: 'bad', text: "Couldn't load the connection library (PeerJS). Check your internet and reload." });
        return;
      }
      this.onStatus({ level: 'warn', text: 'Opening game for friends…' });
      const peer = new Peer(peerIdFor(this.game.id), { debug: 1 });
      this.peer = peer;
      peer.on('open', () => this.status());
      peer.on('connection', (conn) => this.attach(conn));
      peer.on('disconnected', () => {
        if (this.destroyed || peer.destroyed) return;
        this.onStatus({ level: 'warn', text: 'Reconnecting to the connection service…' });
        setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
      });
      peer.on('error', (err) => {
        this.onStatus({ level: 'warn', text: friendlyPeerError(err) });
        if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
          try {
            peer.destroy();
          } catch {
            /* ignore */
          }
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => this.openPeer(), err.type === 'unavailable-id' ? 5000 : 3000);
        }
      });
    }

    status() {
      const friends = [...this.conns].filter((c) => c.playerId).length;
      this.onStatus({
        level: 'good',
        text: friends ? `Hosting · ${friends} friend${friends === 1 ? '' : 's'} connected` : 'Hosting · waiting for friends',
      });
    }

    attach(conn) {
      conn.on('open', () => this.conns.add(conn));
      conn.on('data', (msg) => this.handle(conn, msg));
      const gone = () => {
        if (!this.conns.has(conn)) return;
        this.conns.delete(conn);
        this.status();
        this.publish();
      };
      conn.on('close', gone);
      conn.on('error', gone);
    }

    handle(conn, msg) {
      if (!msg || typeof msg !== 'object') return;
      const g = this.game;
      if (msg.type === 'hello') {
        let player = msg.token ? g.players.find((p) => p.token === msg.token && p.id !== g.hostPlayerId) : null;
        if (!player) {
          if (!msg.name) return conn.send({ type: 'need-name' });
          try {
            const r = E.joinGame(g, msg.name);
            player = r.player;
            if (player.id === g.hostPlayerId) {
              return conn.send({ type: 'join-error', error: 'That name is taken by the host. Pick another name.' });
            }
            if (!r.rejoined) this.changed();
          } catch (e) {
            return conn.send({ type: 'join-error', error: e.message });
          }
        }
        conn.playerId = player.id;
        this.conns.add(conn);
        conn.send({ type: 'welcome', playerId: player.id, token: player.token, name: player.name, gameName: g.name });
        this.status();
        this.publish();
        return;
      }
      if (msg.type === 'action') {
        const player = conn.playerId && g.players.find((p) => p.id === conn.playerId);
        if (!player) return conn.send({ type: 'result', reqId: msg.reqId, error: 'You are no longer in this game.' });
        const res = this.apply(player, msg.action);
        conn.send({ type: 'result', reqId: msg.reqId, ...res });
      }
    }

    apply(player, action) {
      if (action && action.type === 'removePlayer' && player.id !== this.game.hostPlayerId) return { error: 'Only the host can remove players.' };
      try {
        const r = E.applyAction(this.game, player, action) || {};
        if (!r.noChange) this.changed();
        return { ok: true, private: r.private || null };
      } catch (e) {
        if (e instanceof E.GameError) return { error: e.message };
        console.error(e);
        return { error: 'Something went wrong: ' + e.message };
      }
    }

    /** Actions made by the host themself. */
    async act(action) {
      const player = this.game.players.find((p) => p.id === this.game.hostPlayerId);
      if (!player) return { error: 'You are not seated in this game.' };
      return this.apply(player, action);
    }

    changed() {
      this.game.version++;
      this.game.updatedAt = Date.now();
      this.scheduleSave();
      this.publish();
    }

    connectedIds() {
      const s = new Set([this.game.hostPlayerId]);
      for (const c of this.conns) if (c.playerId && c.open) s.add(c.playerId);
      return s;
    }

    publish() {
      const ids = this.connectedIds();
      for (const c of this.conns) {
        if (!c.playerId || !c.open) continue;
        try {
          c.send({ type: 'state', view: E.viewFor(this.game, c.playerId, ids) });
        } catch (e) {
          console.warn('send failed', e);
        }
      }
      this.onState(E.viewFor(this.game, this.game.hostPlayerId, ids));
    }

    scheduleSave() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), 300);
    }

    saveNow() {
      clearTimeout(this.saveTimer);
      if (!Store.saveGame(this.game)) this.onStatus({ level: 'bad', text: 'Could not save the game in this browser (storage full or blocked).' });
    }

    destroy() {
      this.destroyed = true;
      this.saveNow();
      clearTimeout(this.retryTimer);
      clearInterval(this.pingTimer);
      if (this.peer) this.peer.destroy();
    }
  }

  /* --------------------------------------------------------------- guest */

  class GuestSession {
    constructor(code, name, { onState, onStatus, onNeedName, onJoinError }) {
      this.code = String(code).toUpperCase();
      this.name = name;
      this.onState = onState;
      this.onStatus = onStatus;
      this.onNeedName = onNeedName;
      this.onJoinError = onJoinError;
      this.pending = new Map();
      this.reqId = 1;
      this.conn = null;
      this.destroyed = false;
      this.isHost = false;
      this.playerId = (Store.getSeat(this.code) || {}).playerId || null;
    }

    start() {
      if (typeof Peer === 'undefined') {
        this.onStatus({ level: 'bad', text: "Couldn't load the connection library (PeerJS). Check your internet and reload." });
        return;
      }
      this.onStatus({ level: 'warn', text: 'Connecting…' });
      if (!this.watchdog) {
        // If the host page closes without a clean goodbye, notice within ~15s and reconnect.
        this.watchdog = setInterval(() => {
          if (this.conn && this.conn.open && Date.now() - (this.lastSeen || 0) > 15000) {
            this.onStatus({ level: 'bad', text: 'Lost connection to the host. Reconnecting…' });
            try { this.conn.close(); } catch { /* ignore */ }
            this.failPending('Lost connection to the host.');
            this.retry(1000);
          }
        }, 3000);
      }
      this.peer = new Peer({ debug: 1 });
      this.peer.on('open', () => this.connect());
      this.peer.on('disconnected', () => {
        if (!this.destroyed && !this.peer.destroyed) setTimeout(() => this.peer.reconnect(), 2000);
      });
      this.peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          this.onStatus({ level: 'bad', text: `The host isn't online right now (game ${this.code}). Waiting for them to open the game…` });
          this.retry(4000);
        } else {
          this.onStatus({ level: 'warn', text: friendlyPeerError(err) });
          if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
            this.retry(4000, true);
          }
        }
      });
    }

    retry(ms, newPeer = false) {
      if (this.destroyed) return;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        if (newPeer) {
          try {
            this.peer.destroy();
          } catch {
            /* ignore */
          }
          this.start();
        } else if (this.peer && this.peer.open) this.connect();
        else if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      }, ms);
    }

    connect() {
      if (this.destroyed) return;
      if (this.conn) {
        try {
          this.conn.close();
        } catch {
          /* ignore */
        }
      }
      const conn = this.peer.connect(peerIdFor(this.code), { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        this.lastSeen = Date.now();
        const seat = Store.getSeat(this.code) || {};
        conn.send({ type: 'hello', token: seat.token || null, name: this.name || seat.name || null });
      });
      conn.on('data', (msg) => this.handle(msg));
      conn.on('close', () => {
        if (this.conn !== conn || this.destroyed) return;
        this.onStatus({ level: 'bad', text: 'Lost connection to the host. Reconnecting…' });
        this.failPending('Lost connection to the host.');
        this.retry(2500);
      });
      conn.on('error', () => {
        /* close handler deals with it */
      });
    }

    handle(msg) {
      if (!msg || typeof msg !== 'object') return;
      this.lastSeen = Date.now();
      switch (msg.type) {
        case 'ping':
          break;
        case 'welcome':
          this.playerId = msg.playerId;
          Store.setSeat(this.code, { token: msg.token, name: msg.name, playerId: msg.playerId, gameName: msg.gameName, joinedAt: Date.now() });
          this.onStatus({ level: 'good', text: 'Connected to host' });
          break;
        case 'need-name':
          this.onNeedName && this.onNeedName();
          break;
        case 'join-error':
          this.onJoinError && this.onJoinError(msg.error);
          break;
        case 'state':
          this.onState(msg.view);
          break;
        case 'result': {
          const p = this.pending.get(msg.reqId);
          if (p) {
            this.pending.delete(msg.reqId);
            clearTimeout(p.timer);
            p.resolve(msg);
          }
          break;
        }
        default:
          break;
      }
    }

    setName(name) {
      this.name = name;
      if (this.conn && this.conn.open) this.conn.send({ type: 'hello', token: null, name });
    }

    act(action) {
      return new Promise((resolve) => {
        if (!this.conn || !this.conn.open) return resolve({ error: "You're not connected to the host right now." });
        const reqId = this.reqId++;
        const timer = setTimeout(() => {
          this.pending.delete(reqId);
          resolve({ error: 'The host took too long to respond.' });
        }, 15000);
        this.pending.set(reqId, { resolve, timer });
        this.conn.send({ type: 'action', reqId, action });
      });
    }

    failPending(error) {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve({ error });
        this.pending.delete(id);
      }
    }

    destroy() {
      this.destroyed = true;
      clearTimeout(this.retryTimer);
      clearInterval(this.watchdog);
      if (this.peer) this.peer.destroy();
    }
  }

  root.MTGNet = { Store, HostSession, GuestSession };
})(window);
