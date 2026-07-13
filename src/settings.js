// Player-adjustable settings — look/turn feel, audio, gameplay tuning, and gyro
// steering — persisted to localStorage and applied live to the camera, audio,
// player monster and gyro. One place owns both the values and the little
// settings-screen UI so the two never drift apart.
const KEY = 'cf-settings';
const BASE_SENS = 0.0022;              // camera.sens at sensitivity multiplier = 1
const DEFAULTS = {
  sensitivity: 1, invertY: false, volume: 0.5,
  moveSpeed: 1, jumpHeight: 1,
  gyro: false, gyroSens: 1, gyroInvert: false,
};

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ } }

export class Settings {
  constructor(G) {
    this.G = G;
    this.data = { ...DEFAULTS, ...load() };
    this.bindUI();
    this.apply(false); // boot: not a user gesture, so don't trigger a gyro permission prompt
  }

  // Push the current values into the game systems. viaGesture unlocks the iOS
  // gyro permission request (only legal from a user tap).
  apply(viaGesture = false) {
    const d = this.data;
    this.G.camera.sens = BASE_SENS * d.sensitivity;
    this.G.camera.invertY = d.invertY;
    this.G.audio.setVolume(d.volume);
    // moveSpeed / jumpHeight are read live by the player monster via getters.
    if (this.G.gyro) {
      this.G.gyro.sens = d.gyroSens;
      this.G.gyro.invert = d.gyroInvert;
      this.G.gyro.setEnabled(d.gyro, viaGesture);
    }
  }

  set(key, val) {
    this.data[key] = val;
    this.apply(true);
    save(this.data);
    this.syncLabels();
  }

  bindUI() {
    const $ = (id) => document.getElementById(id);
    this.ui = {
      sens: $('setSens'), invert: $('setInvert'), vol: $('setVol'),
      move: $('setMove'), jump: $('setJump'),
      gyro: $('setGyro'), gyroSens: $('setGyroSens'), gyroInvert: $('setGyroInvert'),
    };
    this.labels = {
      sens: $('setSensVal'), vol: $('setVolVal'), move: $('setMoveVal'),
      jump: $('setJumpVal'), gyroSens: $('setGyroSensVal'),
    };
    if (!this.ui.sens) return;
    const range = (el, key) => el.addEventListener('input', () => this.set(key, parseFloat(el.value)));
    const check = (el, key) => el.addEventListener('change', () => this.set(key, el.checked));
    range(this.ui.sens, 'sensitivity');
    range(this.ui.vol, 'volume');
    range(this.ui.move, 'moveSpeed');
    range(this.ui.jump, 'jumpHeight');
    range(this.ui.gyroSens, 'gyroSens');
    check(this.ui.invert, 'invertY');
    check(this.ui.gyro, 'gyro');
    check(this.ui.gyroInvert, 'gyroInvert');
    this.syncUI();
  }

  // Reflect stored values back onto the controls (used when the screen opens).
  syncUI() {
    if (!this.ui.sens) return;
    const d = this.data;
    this.ui.sens.value = d.sensitivity;
    this.ui.vol.value = d.volume;
    this.ui.move.value = d.moveSpeed;
    this.ui.jump.value = d.jumpHeight;
    this.ui.gyroSens.value = d.gyroSens;
    this.ui.invert.checked = d.invertY;
    this.ui.gyro.checked = d.gyro;
    this.ui.gyroInvert.checked = d.gyroInvert;
    this.syncLabels();
  }

  syncLabels() {
    const d = this.data, L = this.labels;
    if (!L.sens) return;
    L.sens.textContent = d.sensitivity.toFixed(2) + '×';
    L.vol.textContent = Math.round(d.volume * 100) + '%';
    L.move.textContent = d.moveSpeed.toFixed(2) + '×';
    L.jump.textContent = d.jumpHeight.toFixed(2) + '×';
    L.gyroSens.textContent = d.gyroSens.toFixed(2) + '×';
  }
}
