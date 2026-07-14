// COLOSSAL FURY — entry point, game states, match manager.
import { V3, C3, rand } from './util.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { City, ARENA } from './city.js';
import { ROSTER } from './monsters.js';
import { Monster } from './monster.js';
import { ProjectileManager } from './projectiles.js';
import { PickupManager } from './pickups.js';
import { PlayerInput } from './player.js';
import { AIController } from './ai.js';
import { DuelCamera } from './camera.js';
import { TouchControls } from './touch.js';
import { GyroSteer } from './gyro.js';
import { Settings } from './settings.js';
import { Net, savedServerUrl, saveServerUrl } from './net.js';
import { GhostWorld } from './netghost.js';
import { HUD, screens } from './hud.js';

// Small seeded PRNG so the host and guests build the identical procedural city.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { stencil: false, doNotHandleContextLost: true });
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.08, 0.05, 0.09, 1);
scene.ambientColor = C3(0.3, 0.25, 0.3);
scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
scene.fogStart = 260;
scene.fogEnd = 900;
scene.fogColor = C3(0.23, 0.13, 0.15);
scene.skipPointerMovePicking = true;

// dusk lighting
const hemi = new BABYLON.HemisphericLight('hemi', V3(0.2, 1, 0.1), scene);
hemi.intensity = 0.55;
hemi.diffuse = C3(0.75, 0.62, 0.72);
hemi.groundColor = C3(0.25, 0.15, 0.12);
const sun = new BABYLON.DirectionalLight('sun', V3(-0.45, -0.62, 0.35), scene);
sun.intensity = 1.15;
sun.diffuse = C3(1, 0.62, 0.38);
sun.position = V3(200, 300, -180);

const glow = new BABYLON.GlowLayer('glow', scene);
glow.intensity = 0.55;

// ------------------------------------------------------------------ globals
const G = {
  scene, engine, canvas,
  audio: new AudioSys(),
  effects: new Effects(scene),
  hud: new HUD(),
  city: null,
  projectiles: null,
  pickups: null,
  camera: new DuelCamera(scene, canvas),
  monsters: [],
  ais: [],          // AI controllers, index-aligned to monsters (null for the local player)
  playerSlot: 0,    // which monster the local player controls (0 in single-player)
  net: null,        // relay transport when online
  online: false,    // true while a networked match is set up
  netOrder: null,   // [clientId,...] mapping slot index -> player id (online)
  remoteInputs: {}, // slot -> latest intent received from that guest (host side)
  onKO: null,
  // physics scales driven by Settings (1 = current tuning)
  gravityScale: 1, throwScale: 1, specialScale: 1,
};
const input = new PlayerInput(canvas);
const touch = new TouchControls(input, G.camera);
G.touch = touch;
G.input = input;
const gyro = new GyroSteer(G.camera);
G.gyro = gyro;
const settings = new Settings(G);
G.settings = settings;
// center aiming crosshair — visible only while actively fighting
const setReticle = (on) => document.getElementById('reticle').classList.toggle('hidden', !on);

// Open the settings overlay from whatever menu we're on; BACK returns there.
let settingsReturn = 'titleScreen';
function openSettings() {
  settingsReturn = screens.all.find(s => s !== 'settingsScreen' && !document.getElementById(s).classList.contains('hidden')) || 'titleScreen';
  settings.syncUI();
  screens.show('settingsScreen');
}

// ------------------------------------------------------------------ multiplayer lobby
const net = new Net();
G.net = net;
let myPick = 0;          // monster this client picked in the lobby
let lobbyBusy = false;
const $id = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function openLobby() {
  gameState = 'lobby';
  $id('lobbyServer').value = savedServerUrl();
  $id('lobbyName').value = (() => { try { return localStorage.getItem('cf-name') || 'MONSTER'; } catch { return 'MONSTER'; } })();
  showLobbyEntry();
  screens.show('lobbyScreen');
}
function leaveLobby() {
  net.bye(); net.close();
  G.online = false;
  gameState = 'title';
  screens.show('titleScreen');
}
function showLobbyEntry() {
  $id('lobbyEntry').classList.remove('hidden');
  $id('lobbyRoom').classList.add('hidden');
  $id('lobbyMsg').textContent = '';
}
function showLobbyRoom() {
  $id('lobbyEntry').classList.add('hidden');
  $id('lobbyRoom').classList.remove('hidden');
  buildMonsterChips();
  renderRoster();
}
function buildMonsterChips() {
  const wrap = $id('roomMonsters');
  wrap.innerHTML = '';
  ROSTER.forEach((def, idx) => {
    const chip = document.createElement('div');
    chip.className = 'mchip' + (idx === myPick ? ' sel' : '');
    chip.textContent = def.name;
    chip.addEventListener('click', () => { myPick = idx; net.pick(idx); buildMonsterChips(); });
    wrap.appendChild(chip);
  });
}
function renderRoster() {
  const wrap = $id('roomRoster');
  wrap.innerHTML = '';
  for (const p of net.players) {
    const row = document.createElement('div');
    row.className = 'prow' + (p.id === net.id ? ' me' : '');
    const mon = ROSTER[p.monster] ? ROSTER[p.monster].name : '—';
    row.innerHTML = `<span>${p.host ? '<span class="pstar">★</span> ' : ''}${escapeHtml(p.name)}</span><span class="pmon">${mon}</span>`;
    wrap.appendChild(row);
  }
  $id('roomCode').textContent = net.room || '----';
  $id('roomStart').style.display = net.host ? '' : 'none';
  $id('roomMsg').textContent = net.host ? 'Press START MATCH when everyone has joined.' : 'Waiting for the host to start…';
  $id('roomMsg').style.color = '#8a7ba8';
}

async function lobbyConnect() {
  const url = ($id('lobbyServer').value.trim()) || savedServerUrl();
  saveServerUrl(url);
  const name = ($id('lobbyName').value.trim() || 'MONSTER').slice(0, 16);
  try { localStorage.setItem('cf-name', name); } catch { /* private mode */ }
  if (!net.isOpen) { $id('lobbyMsg').textContent = 'Connecting…'; await net.connect(url); }
  return name;
}

net.on('welcome', () => { if (gameState === 'lobby') showLobbyRoom(); });
net.on('roster', () => { if (gameState === 'lobby') renderRoster(); });
net.on('host', () => { if (gameState === 'lobby') renderRoster(); });
net.on('peerleft', () => { if (gameState === 'lobby') renderRoster(); });
net.on('error', (m) => { $id('lobbyMsg').textContent = m.msg || 'Server error'; });
net.on('close', () => { if (gameState === 'lobby') { showLobbyEntry(); $id('lobbyMsg').textContent = 'Disconnected from server.'; } });
net.on('start', (m) => {
  const slot = net.slotOf(m.order);
  if (slot < 0) return; // not in this match
  const defList = m.order.map((id) => {
    const p = net.players.find((pp) => pp.id === id);
    return ROSTER[p && ROSTER[p.monster] ? p.monster : 0];
  });
  G.online = true;
  G.netOrder = m.order;
  G.remoteInputs = {};
  startMatch(defList, slot, m.seed);
});

// ---- live sync (Phase 3) ----
const NET_STATE_DT = 1 / 15;   // host snapshot rate
const NET_INPUT_DT = 1 / 30;   // guest input rate
let netStateT = 0, netInputT = 0;

const snapMon = (m) => {
  const o = {
    x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2),
    yaw: +m.yaw.toFixed(3), st: m.state, an: m.animName,
    hp: Math.round(m.hp), en: Math.round(m.energy), al: m.alive ? 1 : 0, og: m.onGround ? 1 : 0,
  };
  if (m.state === 'attack' && m.move) o.mv = [m.move.windup, m.move.active, m.move.recover];
  return o;
};
function broadcastState() {
  const msg = { t: 'state', mons: G.monsters.map(snapMon), ph: gameState };
  msg.projs = G.projectiles.list.map((p) => ({
    id: p.id, x: +p.mesh.position.x.toFixed(1), y: +p.mesh.position.y.toFixed(1), z: +p.mesh.position.z.toFixed(1),
    r: p.radius, c: p.color || [1, 0.55, 0.2],
  }));
  msg.orbs = G.pickups.list.map((it) => ({
    id: it.id, x: +it.mesh.position.x.toFixed(1), y: +it.mesh.position.y.toFixed(1), z: +it.mesh.position.z.toFixed(1),
    t: it.type === 'health' ? 1 : 0,
  }));
  if (G.city && G.city.dmgEvents.length) { msg.bd = G.city.dmgEvents; G.city.dmgEvents = []; }
  net.send(msg);
}
function clearIntentEdges(i) { if (i) { i.jump = i.light = i.heavy = i.grab = i.special = i.dodge = false; } }

// guest: whenever the host says the match ended (or a KO landed), follow it
function applyNetPhase(m) {
  if (m.ph === 'victory') {
    if (gameState !== 'victory') {
      const wname = (G.monsters[m.winner] && G.monsters[m.winner].def.name) || '—';
      endToVictory(wname, m.winner === G.playerSlot);
    }
  } else if (m.ph === 'ko' && gameState === 'fight') {
    gameState = 'ko';
  }
}

net.on('state', (m) => {                       // guest applies host snapshots
  if (!G.online || net.host) return;
  for (let i = 0; i < G.monsters.length && i < m.mons.length; i++) G.monsters[i].applyNet(m.mons[i]);
  if (m.bd && G.city) for (const e of m.bd) { const b = G.city.buildings[e.i]; if (b) b.applyDamage(e.a, e.y, G); }
  if (G.ghost) { G.ghost.syncProjectiles(m.projs); G.ghost.syncPickups(m.orbs); }
  applyNetPhase(m);
});
net.on('input', (m) => {                        // host stores each guest's intents
  if (!G.online || !net.host || !G.netOrder) return;
  const slot = G.netOrder.indexOf(m.from);
  if (slot >= 0 && slot !== G.playerSlot) G.remoteInputs[slot] = m.i;
});

$id('titleMP').addEventListener('click', (e) => { e.stopPropagation(); G.audio.ensure(); G.audio.ui(); openLobby(); });
$id('lobbyHost').addEventListener('click', async () => {
  if (lobbyBusy) return; lobbyBusy = true;
  try { const name = await lobbyConnect(); net.create(name, myPick); }
  catch { $id('lobbyMsg').textContent = 'Could not reach the server. Check the address.'; }
  lobbyBusy = false;
});
$id('lobbyJoin').addEventListener('click', async () => {
  if (lobbyBusy) return;
  const code = $id('lobbyCode').value.trim().toUpperCase();
  if (code.length !== 4) { $id('lobbyMsg').textContent = 'Enter the 4-letter room code.'; return; }
  lobbyBusy = true;
  try { const name = await lobbyConnect(); net.join(code, name, myPick); }
  catch { $id('lobbyMsg').textContent = 'Could not reach the server. Check the address.'; }
  lobbyBusy = false;
});
$id('roomStart').addEventListener('click', () => { if (net.host) net.startMatch(); });
$id('roomLeave').addEventListener('click', () => { net.bye(); net.close(); showLobbyEntry(); });

let gameState = 'title'; // title | select | vs | intro | fight | ko | victory | paused
// Free-for-all: the player plus this many AI (or, later, remote humans).
const FFA_TOTAL = 4;
const SPAWNS = [
  { pos: V3(-70, 0, -70), yaw: Math.PI * 0.25 },
  { pos: V3(70, 0, 70), yaw: Math.PI * 1.25 },
  { pos: V3(70, 0, -70), yaw: Math.PI * 0.75 },
  { pos: V3(-70, 0, 70), yaw: Math.PI * 1.75 },
];
let selection = { p1: null, list: null, focus: 0, phase: 'p1' };
let preview = null;
let koTimer = 0;
let shadowGen = null;

function setupShadows() {
  if (shadowGen) shadowGen.dispose();
  shadowGen = new BABYLON.ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurScale = 2;
  shadowGen.darkness = 0.45;
}

// ------------------------------------------------------------------ match lifecycle
function buildWorld(seed = null) {
  disposeWorld();
  // With a shared seed, host and guests generate the same city so building
  // indices line up and destruction can be relayed and replayed faithfully.
  let orig = null;
  if (seed != null) { orig = Math.random; Math.random = mulberry32(seed >>> 0); }
  G.city = new City(scene, G);
  if (orig) Math.random = orig;
  G.projectiles = new ProjectileManager(scene, G);
  G.pickups = new PickupManager(scene, G);
  G.pickups.addSpawnPoints([
    V3(0, 2, 0), V3(-140, 2, -140), V3(140, 2, 140), V3(-140, 2, 140), V3(140, 2, -140),
    V3(0, 2, -250), V3(0, 2, 250), V3(-250, 2, 0), V3(250, 2, 0),
  ]);
  if (!G.ghost) G.ghost = new GhostWorld(scene);
  setupShadows();
}

function disposeWorld() {
  if (G.city) { G.city.dispose(); G.city = null; }
  if (G.projectiles) { G.projectiles.dispose(); G.projectiles = null; }
  if (G.pickups) { G.pickups.dispose(); G.pickups = null; }
  if (G.ghost) G.ghost.clear();
  for (const m of G.monsters) m.dispose();
  G.monsters.length = 0;
}

// defList maps 1:1 to arena slots; playerSlot is the monster the local human
// controls. Every other slot is AI here (online play swaps some for remote humans).
let lastMatch = null;
function startMatch(defList, playerSlot = 0, seed = null) {
  clearPreview();
  buildWorld(seed);
  lastMatch = { defList, playerSlot, seed };
  G.playerSlot = playerSlot;
  G.monsters = defList.map((def, idx) => {
    const s = SPAWNS[idx % SPAWNS.length];
    const m = new Monster(G, def, s.pos.clone(), s.yaw, idx === playerSlot);
    for (const mesh of m.meshes) shadowGen.addShadowCaster(mesh);
    return m;
  });
  // one AI per non-player slot, index-aligned; nearest-enemy targeting kicks in live
  G.ais = G.monsters.map((m, idx) => (idx === playerSlot ? null : new AIController(m, G.monsters[playerSlot], G, 1)));
  for (const m of G.monsters) m.target = m.nearestEnemy();
  G.hud.bind(G.monsters, playerSlot);

  // Free-for-all: a KO only ends the match once one fighter is left standing.
  G.onKO = (dead) => {
    if (gameState !== 'fight' && gameState !== 'ko') return;
    const alive = G.monsters.filter((m) => m.alive);
    G.hud.announce(dead.def.name + ' DOWN', 1.6);
    if (alive.length <= 1 && gameState === 'fight') {
      gameState = 'ko';
      koTimer = 0;
      setTimeout(() => { if (gameState === 'ko') G.hud.announce('K.O.!', 2.2); }, 450);
    }
  };

  gameState = 'intro';
  introT = 0;
  screens.hideAll();
  document.getElementById('hud').classList.remove('hidden');
  G.camera.startOrbit(G.monsters[playerSlot].pos.add(V3(0, 4, 0)));
  G.audio.roar(defList[playerSlot].roarPitch);
  G.hud.announce(defList[playerSlot].name + '  HAS RISEN', 2);
}

let introT = 0;

function endToVictory(winnerName, playerWon) {
  gameState = 'victory';
  G.camera.setLook(false);
  touch.setVisible(false);
  setReticle(false);
  document.getElementById('victoryText').textContent = playerWon ? 'CITY CONQUERED' : `${winnerName} REIGNS`;
  document.getElementById('victoryText').style.color = playerWon ? 'var(--marquee)' : 'var(--hot)';
  screens.show('victoryScreen');
  if (G.online && net.host) {
    const winner = G.monsters.findIndex((m) => m.alive);
    net.send({ t: 'state', mons: G.monsters.map(snapMon), ph: 'victory', winner });
  }
}

// ------------------------------------------------------------------ character select
function buildSelectUI() {
  const roster = document.getElementById('roster');
  roster.innerHTML = '';
  ROSTER.forEach((def, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.idx = idx;
    const bars = [['POWER', def.stats.power], ['SPEED', def.stats.speed], ['ARMOR', def.stats.tough], ['RANGE', def.stats.range]]
      .map(([n, v]) => `<div class="statrow"><b>${n}</b><div class="meter"><i style="width:${v * 100}%"></i></div></div>`).join('');
    card.innerHTML = `<h3>${def.name}</h3><span class="tag">${def.tag}</span>${bars}
      <div class="statrow" style="margin-top:.5rem"><b>SPCL</b><span style="color:var(--marquee);font-size:.62rem;letter-spacing:.1em">${def.special.name}</span></div>`;
    card.addEventListener('click', () => { selection.focus = idx; refreshSelectFocus(); confirmSelect(); });
    card.addEventListener('mouseenter', () => { selection.focus = idx; refreshSelectFocus(); });
    roster.appendChild(card);
  });
}

function refreshSelectFocus() {
  document.querySelectorAll('#roster .card').forEach((c, i) => c.classList.toggle('focus', i === selection.focus));
  showPreview(ROSTER[selection.focus]);
  G.audio.ui();
}

function showPreview(def) {
  clearPreview();
  const rig = def.build(scene);
  rig.root.position.set(0, 6, 0);
  preview = { rig, def, t: 0 };
}

function clearPreview() {
  if (preview) { preview.rig.root.dispose(false, true); preview = null; }
}

function enterSelect(phase) {
  gameState = 'select';
  selection.phase = phase;
  document.getElementById('selectWhom').textContent =
    phase === 'p1' ? 'PLAYER — WHO WILL YOU UNLEASH?' : 'OPPONENT — WHO DEFENDS THE CITY?';
  screens.show('selectScreen');
  refreshSelectFocus();
}

function confirmSelect() {
  G.audio.confirm();
  G.online = false;
  const def = ROSTER[selection.focus];
  selection.p1 = def;
  // Fill the rest of the free-for-all with random monsters (AI-controlled for now).
  const bots = [];
  for (let k = 1; k < FFA_TOTAL; k++) bots.push(ROSTER[Math.floor(Math.random() * ROSTER.length)]);
  selection.list = [def, ...bots];

  gameState = 'vs';
  document.getElementById('vsP1').textContent = def.name;
  document.getElementById('vsP2').textContent = bots.map((b) => b.name).join(' · ');
  screens.show('vsScreen');
  G.audio.roar(def.roarPitch);
  setTimeout(() => G.audio.roar(bots[0].roarPitch), 500);
  setTimeout(() => { if (gameState === 'vs') startMatch(selection.list); }, 2200);
}

// ------------------------------------------------------------------ menu wiring
document.querySelectorAll('.opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const act = opt.dataset.act;
    G.audio.confirm();
    if (act === 'rematch') { if (lastMatch) startMatch(lastMatch.defList, lastMatch.playerSlot, lastMatch.seed); }
    else if (act === 'select') { disposeWorld(); document.getElementById('hud').classList.add('hidden'); setReticle(false); enterSelect('p1'); }
    else if (act === 'title') { if (G.online) { net.bye(); net.close(); G.online = false; } disposeWorld(); document.getElementById('hud').classList.add('hidden'); setReticle(false); gameState = 'title'; screens.show('titleScreen'); }
    else if (act === 'resume') { gameState = 'fight'; G.camera.setLook(true); gyro.recenter(); touch.setVisible(true); setReticle(true); screens.hideAll(); }
    else if (act === 'settings') openSettings();
    else if (act === 'settings-back') screens.show(settingsReturn);
    else if (act === 'lobby-back') leaveLobby();
  });
});

window.addEventListener('keydown', (e) => {
  G.audio.ensure();
  // Settings overlay is modal: Esc/Enter close it, everything else is ignored.
  if (!document.getElementById('settingsScreen').classList.contains('hidden')) {
    if (e.code === 'Escape' || e.code === 'Enter') { G.audio.ui(); screens.show(settingsReturn); }
    return;
  }
  if (gameState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    G.audio.confirm();
    enterSelect('p1');
  } else if (gameState === 'select') {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { selection.focus = (selection.focus + ROSTER.length - 1) % ROSTER.length; refreshSelectFocus(); }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { selection.focus = (selection.focus + 1) % ROSTER.length; refreshSelectFocus(); }
    if (e.code === 'Enter' || e.code === 'KeyJ') confirmSelect();
    if (e.code === 'Escape') { gameState = 'title'; clearPreview(); screens.show('titleScreen'); }
  } else if (gameState === 'fight' && (e.code === 'KeyP' || e.code === 'Escape')) {
    gameState = 'paused';
    G.camera.setLook(false);
    touch.setVisible(false);
    setReticle(false);
    screens.show('pauseScreen');
  } else if (gameState === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    gameState = 'fight';
    G.camera.setLook(true);
    gyro.recenter();
    touch.setVisible(true);
    setReticle(true);
    screens.hideAll();
  } else if (gameState === 'victory' && e.code === 'Enter') {
    if (lastMatch) startMatch(lastMatch.defList, lastMatch.playerSlot, lastMatch.seed);
  } else if (gameState === 'lobby' && e.code === 'Escape') {
    leaveLobby();
  }
});
window.addEventListener('pointerdown', () => G.audio.ensure(), { once: true });

// ------------------------------------------------------------------ main loop
scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);

  if (preview && gameState === 'select') {
    preview.t += dt;
    preview.rig.root.rotation.y += dt * 0.8;
    preview.rig.root.position.y = 6 + Math.sin(preview.t * 1.7) * 0.4;
    G.camera.cam.position = V3(Math.sin(0.4) * 26, 12, -Math.cos(0.4) * 26);
    G.camera.cam.setTarget(V3(0, 8, 0));
  }

  if (gameState === 'intro') {
    introT += dt;
    G.effects.update(dt, G.monsters);
    for (const m of G.monsters) m.update(dt, {});
    G.camera.update(dt, G);
    if (introT > 2.6) {
      gameState = 'fight';
      G.camera.enterFollow(G.monsters[G.playerSlot].yaw);
      gyro.recenter();
      touch.setVisible(true);
      setReticle(true);
      G.hud.announce('DESTROY!', 1.1);
      input.clearEdges();
    }
  } else if (gameState === 'fight' || gameState === 'ko') {
    if (G.online && !net.host) {
      // GUEST: stream input up, render everyone from the host's snapshots
      if (gameState === 'fight') {
        netInputT += dt;
        if (netInputT >= NET_INPUT_DT) { netInputT = 0; net.send({ t: 'input', i: input.intents(G.camera.camYaw) }); }
      }
      for (const m of G.monsters) m.netRender(dt);
      G.effects.update(dt, G.monsters);
      if (gameState === 'fight') gyro.apply(dt);
      G.camera.update(dt, G);
      G.hud.update();
    } else {
      // HOST / single-player: authoritative simulation
      for (let idx = 0; idx < G.monsters.length; idx++) {
        const m = G.monsters[idx];
        let intent = {};
        if (gameState === 'fight' && m.alive) {
          if (idx === G.playerSlot) intent = input.intents(G.camera.camYaw);
          else if (G.online) intent = G.remoteInputs[idx] || {};   // remote human
          else intent = G.ais[idx].intents(dt);                    // bot
        }
        m.lastIntent = intent;
        m.update(dt, intent);
        if (G.online && idx !== G.playerSlot) clearIntentEdges(G.remoteInputs[idx]); // one-shot edges
      }
      G.city.update(dt, G);
      G.projectiles.update(dt);
      G.pickups.update(dt);
      G.effects.update(dt, G.monsters);
      if (gameState === 'fight') gyro.apply(dt); // tilt-to-turn feeds camYaw before the camera reads it
      G.camera.update(dt, G);
      G.hud.update();

      if (G.online && net.host) { netStateT += dt; if (netStateT >= NET_STATE_DT) { netStateT = 0; broadcastState(); } }

      if (gameState === 'ko') {
        koTimer += dt;
        if (koTimer > 3) {
          const winner = G.monsters.find((m) => m.alive);
          const playerWon = G.monsters[G.playerSlot].alive;
          endToVictory(winner ? winner.def.name : '—', playerWon);
        }
      }
    }
  } else if (gameState === 'victory' || gameState === 'paused') {
    G.effects.update(dt, G.monsters);
    if (G.city) G.camera.update(dt, G);
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());

// debug/testing handle
window.__CF = { G, state: () => gameState, setState: (s) => { gameState = s; } };

// tap the title to start (phones have no Enter key)
document.getElementById('titleScreen').addEventListener('click', () => {
  if (gameState !== 'title') return;
  G.audio.ensure(); G.audio.confirm();
  enterSelect('p1');
});
// gear opens settings; stopPropagation keeps the title's tap-to-start from firing
document.getElementById('titleSettings').addEventListener('click', (e) => {
  e.stopPropagation();
  G.audio.ensure(); G.audio.ui();
  openSettings();
});
if (touch.isTouch) document.querySelector('.title-press').textContent = 'TAP TO START';

// boot
document.getElementById('loadNote').classList.add('hidden');
buildSelectUI();
screens.show('titleScreen');
