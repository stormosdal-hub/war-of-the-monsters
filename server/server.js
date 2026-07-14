// COLOSSAL FURY — relay server.
//
// A dumb message relay + room manager. It runs NO game logic: one client per
// room is the authoritative "host" (its browser runs the full simulation);
// everyone else is a guest that sends inputs up and renders snapshots coming
// down. The server just shuttles messages between them and tracks who's in a
// room / who is host.
//
// Protocol (JSON per WebSocket message, `t` = type):
//   client -> server
//     {t:'create', name, monster}          create a room, become host
//     {t:'join', room, name, monster}       join an existing room as a guest
//     {t:'pick', monster}                   change monster choice (lobby)
//     {t:'ready', ready}                    toggle ready (lobby)
//     {t:'start'}                           host: begin the match
//     {t:'settings', data}                  host: push global settings
//     {t:'state', ...}                      host: authoritative snapshot -> guests
//     {t:'input', ...}                      guest: intents -> host
//     {t:'bye'}                             leave the room
//   server -> client
//     {t:'welcome', id, host, room, players}
//     {t:'roster', host, players}
//     {t:'start', order}                    slot order = [id,...] (index 0 = host)
//     {t:'settings', data} / {t:'state',...} / {t:'input',...}   (relayed)
//     {t:'host', id}                        new host after a migration
//     {t:'peerleft', id}
//     {t:'error', code, msg}
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8090;
const MAX_PLAYERS = 4;                 // free-for-all cap
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable 0/O/1/I

const rooms = new Map();               // code -> { code, hostId, clients: Map<id, client> }
let nextId = 1;

const wss = new WebSocketServer({ port: PORT });
console.log(`[fury-relay] listening on :${PORT}`);

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function roster(room) {
  return [...room.clients.values()].map((c) => ({ id: c.id, name: c.name, monster: c.monster, ready: c.ready, host: c.id === room.hostId }));
}

function broadcast(room, obj, exceptId = null) {
  for (const c of room.clients.values()) if (c.id !== exceptId) send(c.ws, obj);
}

function sendRoster(room) {
  broadcast(room, { t: 'roster', host: room.hostId, players: roster(room) });
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  room.clients.delete(client.id);
  client.room = null;
  if (room.clients.size === 0) { rooms.delete(room.code); return; }
  // host migration: promote the oldest remaining client
  if (room.hostId === client.id) {
    room.hostId = room.clients.keys().next().value;
    broadcast(room, { t: 'host', id: room.hostId });
  }
  broadcast(room, { t: 'peerleft', id: client.id });
  sendRoster(room);
}

wss.on('connection', (ws) => {
  const client = { id: nextId++, ws, room: null, name: 'MONSTER', monster: 0, ready: false };
  ws.on('message', (buf) => {
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    const room = client.room;
    switch (m.t) {
      case 'create': {
        if (room) leaveRoom(client);
        const code = makeCode();
        const r = { code, hostId: client.id, clients: new Map() };
        rooms.set(code, r);
        client.room = r; client.name = (m.name || 'MONSTER').slice(0, 16); client.monster = m.monster | 0; client.ready = false;
        r.clients.set(client.id, client);
        send(ws, { t: 'welcome', id: client.id, host: true, room: code, players: roster(r) });
        sendRoster(r);
        break;
      }
      case 'join': {
        const r = rooms.get((m.room || '').toUpperCase());
        if (!r) { send(ws, { t: 'error', code: 'noroom', msg: 'No such room' }); break; }
        if (r.clients.size >= MAX_PLAYERS) { send(ws, { t: 'error', code: 'full', msg: 'Room is full' }); break; }
        if (room) leaveRoom(client);
        client.room = r; client.name = (m.name || 'MONSTER').slice(0, 16); client.monster = m.monster | 0; client.ready = false;
        r.clients.set(client.id, client);
        send(ws, { t: 'welcome', id: client.id, host: r.hostId === client.id, room: r.code, players: roster(r) });
        sendRoster(r);
        break;
      }
      case 'pick': if (room) { client.monster = m.monster | 0; sendRoster(room); } break;
      case 'ready': if (room) { client.ready = !!m.ready; sendRoster(room); } break;
      case 'start': if (room && room.hostId === client.id) broadcast(room, { t: 'start', order: [...room.clients.keys()], seed: (Math.random() * 2147483647) | 0 }); break;
      case 'settings': if (room && room.hostId === client.id) broadcast(room, { t: 'settings', data: m.data }, client.id); break;
      case 'state': if (room && room.hostId === client.id) broadcast(room, m, client.id); break;      // host -> guests
      case 'input': if (room) send(room.clients.get(room.hostId)?.ws, { ...m, from: client.id }); break; // guest -> host
      case 'bye': leaveRoom(client); break;
    }
  });
  ws.on('close', () => leaveRoom(client));
  ws.on('error', () => leaveRoom(client));
});
