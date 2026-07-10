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
import { HUD, screens } from './hud.js';

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
  onKO: null,
};
const input = new PlayerInput(canvas);

let gameState = 'title'; // title | select | vs | intro | fight | ko | victory | paused
let ai = null;
let selection = { p1: null, p2: null, focus: 0, phase: 'p1' };
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
function buildWorld() {
  disposeWorld();
  G.city = new City(scene, G);
  G.projectiles = new ProjectileManager(scene, G);
  G.pickups = new PickupManager(scene, G);
  G.pickups.addSpawnPoints([
    V3(0, 2, 0), V3(-140, 2, -140), V3(140, 2, 140), V3(-140, 2, 140), V3(140, 2, -140),
    V3(0, 2, -250), V3(0, 2, 250), V3(-250, 2, 0), V3(250, 2, 0),
  ]);
  setupShadows();
}

function disposeWorld() {
  if (G.city) { G.city.dispose(); G.city = null; }
  if (G.projectiles) { G.projectiles.dispose(); G.projectiles = null; }
  if (G.pickups) { G.pickups.dispose(); G.pickups = null; }
  for (const m of G.monsters) m.dispose();
  G.monsters.length = 0;
}

function startMatch(defP, defE) {
  clearPreview();
  buildWorld();
  const p = new Monster(G, defP, V3(-70, 0, -70), Math.PI / 4, true);
  const e = new Monster(G, defE, V3(70, 0, 70), Math.PI + Math.PI / 4, false);
  p.target = e; e.target = p;
  G.monsters = [p, e];
  for (const mesh of p.meshes) shadowGen.addShadowCaster(mesh);
  for (const mesh of e.meshes) shadowGen.addShadowCaster(mesh);
  ai = new AIController(e, p, G, 1);
  G.hud.bind(p, e);

  G.onKO = (dead, killer) => {
    if (gameState !== 'fight') return;
    gameState = 'ko';
    koTimer = 0;
    G.hud.announce('K.O.!', 2.2);
  };

  gameState = 'intro';
  introT = 0;
  screens.hideAll();
  document.getElementById('hud').classList.remove('hidden');
  G.camera.startOrbit(p.pos.add(V3(0, 4, 0)));
  G.audio.roar(defP.roarPitch);
  G.hud.announce(defP.name + '  HAS RISEN', 2);
}

let introT = 0;

function endToVictory(winnerName, playerWon) {
  gameState = 'victory';
  document.getElementById('victoryText').textContent = playerWon ? 'CITY CONQUERED' : 'YOU ARE EXTINCT';
  document.getElementById('victoryText').style.color = playerWon ? 'var(--marquee)' : 'var(--hot)';
  screens.show('victoryScreen');
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
  const def = ROSTER[selection.focus];
  if (selection.phase === 'p1') {
    selection.p1 = def;
    enterSelect('p2');
  } else {
    selection.p2 = def;
    gameState = 'vs';
    document.getElementById('vsP1').textContent = selection.p1.name;
    document.getElementById('vsP2').textContent = selection.p2.name;
    screens.show('vsScreen');
    G.audio.roar(selection.p1.roarPitch);
    setTimeout(() => G.audio.roar(selection.p2.roarPitch), 500);
    setTimeout(() => { if (gameState === 'vs') startMatch(selection.p1, selection.p2); }, 2200);
  }
}

// ------------------------------------------------------------------ menu wiring
document.querySelectorAll('.opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const act = opt.dataset.act;
    G.audio.confirm();
    if (act === 'rematch') startMatch(selection.p1, selection.p2);
    else if (act === 'select') { disposeWorld(); document.getElementById('hud').classList.add('hidden'); enterSelect('p1'); }
    else if (act === 'title') { disposeWorld(); document.getElementById('hud').classList.add('hidden'); gameState = 'title'; screens.show('titleScreen'); }
    else if (act === 'resume') { gameState = 'fight'; screens.hideAll(); }
  });
});

window.addEventListener('keydown', (e) => {
  G.audio.ensure();
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
    screens.show('pauseScreen');
  } else if (gameState === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    gameState = 'fight';
    screens.hideAll();
  } else if (gameState === 'victory' && e.code === 'Enter') {
    startMatch(selection.p1, selection.p2);
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
      G.camera.mode = 'duel';
      G.hud.announce('DESTROY!', 1.1);
      input.clearEdges();
    }
  } else if (gameState === 'fight' || gameState === 'ko') {
    const [p, e] = G.monsters;
    const pIntents = gameState === 'fight' && p.alive ? input.intents(G.camera.yaw) : {};
    p.lastIntent = pIntents;
    const eIntents = gameState === 'fight' && e.alive ? ai.intents(dt) : {};
    e.lastIntent = eIntents;

    p.update(dt, pIntents);
    e.update(dt, eIntents);
    G.city.update(dt, G);
    G.projectiles.update(dt);
    G.pickups.update(dt);
    G.effects.update(dt, G.monsters);
    G.camera.update(dt, G);
    G.hud.update();

    if (gameState === 'ko') {
      koTimer += dt;
      if (koTimer > 3) {
        const playerWon = p.alive;
        endToVictory(playerWon ? p.def.name : e.def.name, playerWon);
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

// boot
document.getElementById('loadNote').classList.add('hidden');
buildSelectUI();
screens.show('titleScreen');
