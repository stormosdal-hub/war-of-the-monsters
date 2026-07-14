// Browser transport for the relay server — a thin WebSocket wrapper + event bus.
// It owns the connection and the room state (roster / who is host) and dispatches
// server messages to listeners. No game logic lives here.
//
// The server URL defaults to a local relay for development; the lobby lets the
// player paste their own (e.g. a Fly.io wss:// URL), persisted to localStorage.
const DEFAULT_URL = 'ws://localhost:8090';
const URL_KEY = 'cf-server';

export function savedServerUrl() {
  try { return localStorage.getItem(URL_KEY) || DEFAULT_URL; } catch { return DEFAULT_URL; }
}
export function saveServerUrl(u) { try { localStorage.setItem(URL_KEY, u); } catch { /* private mode */ } }

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;          // our client id (assigned by the server)
    this.host = false;       // are we the room host?
    this.room = null;        // room code
    this.players = [];       // [{id,name,monster,ready,host}]
    this.listeners = {};     // type -> Set(cb)
  }

  on(type, cb) { (this.listeners[type] ||= new Set()).add(cb); return () => this.listeners[type]?.delete(cb); }
  _emit(type, data) { for (const cb of this.listeners[type] || []) cb(data); }

  get isOpen() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  // Resolves on open, rejects if the socket errors before opening.
  connect(url) {
    return new Promise((resolve, reject) => {
      try { this.ws = new WebSocket(url); } catch (e) { reject(e); return; }
      let settled = false;
      this.ws.addEventListener('open', () => { settled = true; this._emit('open'); resolve(); });
      this.ws.addEventListener('close', () => { this._emit('close'); });
      this.ws.addEventListener('error', (e) => { if (!settled) { settled = true; reject(new Error('Could not reach server')); } this._emit('neterror', e); });
      this.ws.addEventListener('message', (ev) => this._onMessage(ev));
    });
  }

  _onMessage(ev) {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.host = m.host; this.room = m.room; this.players = m.players;
        this._emit('welcome', m); this._emit('roster', { host: m.host ? this.id : this._hostId(), players: this.players });
        break;
      case 'roster':
        this.players = m.players; this.host = (m.host === this.id);
        this._emit('roster', m);
        break;
      case 'host': this.host = (m.id === this.id); this._emit('host', m); break;
      case 'peerleft': this._emit('peerleft', m); break;
      case 'start': this._emit('start', m); break;
      case 'settings': this._emit('settings', m); break;
      case 'state': this._emit('state', m); break;
      case 'input': this._emit('input', m); break;
      case 'error': this._emit('error', m); break;
    }
  }

  _hostId() { return (this.players.find((p) => p.host) || {}).id; }
  slotOf(order, id = this.id) { return order.indexOf(id); }

  send(obj) { if (this.isOpen) this.ws.send(JSON.stringify(obj)); }
  create(name, monster) { this.send({ t: 'create', name, monster }); }
  join(room, name, monster) { this.send({ t: 'join', room: (room || '').toUpperCase(), name, monster }); }
  pick(monster) { this.send({ t: 'pick', monster }); }
  ready(r) { this.send({ t: 'ready', ready: r }); }
  startMatch() { this.send({ t: 'start' }); }
  bye() { this.send({ t: 'bye' }); }
  close() { try { this.ws && this.ws.close(); } catch { /* ignore */ } this.ws = null; this.room = null; this.id = null; this.host = false; this.players = []; }
}
