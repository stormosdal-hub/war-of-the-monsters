// Serverless multiplayer transport over WebRTC (PeerJS). No server you host:
// the room HOST is the hub — it plays the "server" role (assigns ids, owns the
// roster, routes messages) and every guest opens a DataChannel straight to it.
// A free public PeerJS broker is used only for the initial handshake, so the
// whole game can live on GitHub Pages with nothing to deploy.
//
// The wire protocol matches the old relay exactly, so the lobby, sync and
// settings code is unchanged — only how bytes travel is different.
//
// window.Peer comes from lib/peerjs.min.js (loaded before the module).
const ID_PREFIX = 'colossalfury-';   // namespaces our room codes on the shared public broker
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 4;

function makeCode() { return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }

// Optional broker override (advanced / tests): localStorage 'cf-peer' = JSON of
// PeerJS options ({host,port,path,secure}). Absent → PeerJS public cloud.
function brokerOpts() {
  try { const v = localStorage.getItem('cf-peer'); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
}

function peerErrMsg(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'No such room — check the code.';
    case 'unavailable-id': return 'That room code is taken — try again.';
    case 'browser-incompatible': return 'This browser lacks WebRTC support.';
    case 'network': case 'server-error': case 'socket-error': case 'ssl-unavailable': return 'Cannot reach the matchmaking broker.';
    default: return 'Connection error.';
  }
}

export class Net {
  constructor() {
    this.peer = null;
    this.host = false;
    this.room = null;
    this.id = null;
    this.players = [];
    this.listeners = {};
    this._conns = new Map();   // host: guestId -> DataConnection
    this._nextId = 1;          // host: id allocator (host = 1)
    this._hostConn = null;     // guest: connection to the host
    this._me = null;           // host: own roster entry
  }

  on(type, cb) { (this.listeners[type] ||= new Set()).add(cb); return () => this.listeners[type]?.delete(cb); }
  _emit(type, data) { for (const cb of this.listeners[type] || []) cb(data); }
  get isOpen() { return !!this.peer && !this.peer.destroyed; }
  slotOf(order, id = this.id) { return order.indexOf(id); }
  _roster() { return this.players.map((p) => ({ id: p.id, name: p.name, monster: p.monster, ready: p.ready, host: p.host })); }

  // Create a PeerJS peer; resolves once it's registered with the broker.
  _newPeer(id) {
    return new Promise((resolve, reject) => {
      const opts = brokerOpts();
      const p = id ? new Peer(id, opts) : (opts ? new Peer(opts) : new Peer());
      let settled = false;
      p.on('open', () => { settled = true; resolve(p); });
      p.on('error', (err) => {
        if (!settled) { settled = true; reject(err); }
        else this._emit('error', { code: (err && err.type) || 'peer', msg: peerErrMsg(err) });
      });
    });
  }

  // ---- host a room ----
  async create(name, monster) {
    let err = null;
    for (let i = 0; i < 5; i++) {
      const code = makeCode();
      try { this.peer = await this._newPeer(ID_PREFIX + code); this.room = code; err = null; break; }
      catch (e) { err = e; if (e && e.type !== 'unavailable-id') throw e; }
    }
    if (err) throw err;
    this.host = true;
    this.id = this._nextId++;   // host id = 1
    this._me = { id: this.id, name: (name || 'MONSTER').slice(0, 16), monster: monster | 0, ready: false, host: true };
    this.players = [this._me];
    this.peer.on('connection', (conn) => this._onGuestConn(conn));
    this._emit('welcome', { id: this.id, host: true, room: this.room, players: this._roster() });
    this._emit('roster', { host: this.id, players: this._roster() });
  }

  // ---- join a room ----
  async join(room, name, monster) {
    room = (room || '').toUpperCase();
    this.peer = await this._newPeer(null);   // random id
    this.host = false; this.room = room;
    const conn = this.peer.connect(ID_PREFIX + room, { reliable: true });
    this._hostConn = conn;
    let opened = false;
    const info = { name: (name || 'MONSTER').slice(0, 16), monster: monster | 0 };
    conn.on('open', () => { opened = true; conn.send({ t: 'hello', name: info.name, monster: info.monster }); });
    conn.on('data', (m) => this._onHostData(m));
    conn.on('close', () => this._emit('close'));
    conn.on('error', () => { if (!opened) this._emit('error', { code: 'noroom', msg: 'No such room — check the code.' }); });
  }

  // ================= host side =================
  _onGuestConn(conn) {
    conn.on('data', (m) => this._onGuestData(conn, m));
    conn.on('close', () => this._removeGuest(conn));
    conn.on('error', () => this._removeGuest(conn));
  }
  _onGuestData(conn, m) {
    if (!m || !m.t) return;
    if (m.t === 'hello') {
      if (this.players.length >= MAX_PLAYERS) { try { conn.send({ t: 'error', code: 'full', msg: 'Room is full' }); } catch { /* noop */ } setTimeout(() => conn.close(), 60); return; }
      const id = this._nextId++;
      conn._cfId = id;
      this._conns.set(id, conn);
      this.players.push({ id, name: (m.name || 'MONSTER').slice(0, 16), monster: m.monster | 0, ready: false, host: false });
      try { conn.send({ t: 'welcome', id, host: false, room: this.room, players: this._roster() }); } catch { /* noop */ }
      this._broadcastRoster();
      return;
    }
    const id = conn._cfId;
    if (id == null) return;
    const p = this.players.find((x) => x.id === id);
    switch (m.t) {
      case 'pick': if (p) { p.monster = m.monster | 0; this._broadcastRoster(); } break;
      case 'ready': if (p) { p.ready = !!m.ready; this._broadcastRoster(); } break;
      case 'input': this._emit('input', { i: m.i, from: id }); break;
      case 'bye': this._removeGuest(conn); break;
    }
  }
  _removeGuest(conn) {
    const id = conn._cfId;
    if (id == null) return;
    conn._cfId = null;
    this._conns.delete(id);
    this.players = this.players.filter((x) => x.id !== id);
    try { conn.close(); } catch { /* noop */ }
    this._emit('peerleft', { id });
    this._broadcastRoster();
  }
  _broadcast(msg) { for (const conn of this._conns.values()) { try { conn.send(msg); } catch { /* noop */ } } }
  _broadcastRoster() {
    const msg = { t: 'roster', host: this.id, players: this._roster() };
    this._broadcast(msg);
    this._emit('roster', msg);
  }

  // ================= guest side =================
  _onHostData(m) {
    if (!m || !m.t) return;
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.host = false; this.room = m.room; this.players = m.players || [];
        this._emit('welcome', m);
        this._emit('roster', { host: (this.players.find((p) => p.host) || {}).id, players: this.players });
        break;
      case 'roster': this.players = m.players || []; this._emit('roster', m); break;
      case 'start': this._emit('start', m); break;
      case 'settings': this._emit('settings', m); break;
      case 'state': this._emit('state', m); break;
      case 'error': this._emit('error', m); break;
      case 'closed': this._emit('close'); break;   // host ended the room
    }
  }

  // ================= shared API (matches the old relay) =================
  send(obj) {
    if (this.host) this._broadcast(obj);
    else if (this._hostConn && this._hostConn.open) { try { this._hostConn.send(obj); } catch { /* noop */ } }
  }
  pick(monster) {
    monster = monster | 0;
    if (this.host) { if (this._me) { this._me.monster = monster; this._broadcastRoster(); } }
    else if (this._hostConn) { try { this._hostConn.send({ t: 'pick', monster }); } catch { /* noop */ } }
  }
  ready(r) {
    r = !!r;
    if (this.host) { if (this._me) { this._me.ready = r; this._broadcastRoster(); } }
    else if (this._hostConn) { try { this._hostConn.send({ t: 'ready', ready: r }); } catch { /* noop */ } }
  }
  startMatch() {
    if (!this.host) return;
    const order = this.players.map((p) => p.id);   // host first
    const seed = (Math.random() * 2147483647) | 0;
    const msg = { t: 'start', order, seed };
    this._broadcast(msg);
    this._emit('start', msg);
  }
  bye() {
    if (this.host) this._broadcast({ t: 'closed' });
    else if (this._hostConn) { try { this._hostConn.send({ t: 'bye' }); } catch { /* noop */ } }
  }
  close() {
    try { for (const c of this._conns.values()) c.close(); } catch { /* noop */ }
    try { if (this._hostConn) this._hostConn.close(); } catch { /* noop */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* noop */ }
    this.peer = null; this._hostConn = null; this._conns.clear();
    this.host = false; this.room = null; this.id = null; this.players = [];
  }
}
