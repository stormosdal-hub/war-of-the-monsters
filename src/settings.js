// Player-adjustable settings — turn sensitivity, invert-look, volume — persisted
// to localStorage and applied live to the camera and audio. One place owns both
// the values and the little settings-screen UI so the two never drift apart.
const KEY = 'cf-settings';
const BASE_SENS = 0.0022;              // camera.sens at sensitivity multiplier = 1
const DEFAULTS = { sensitivity: 1, invertY: false, volume: 0.5 };

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ } }

export class Settings {
  constructor(G) {
    this.G = G;
    this.data = { ...DEFAULTS, ...load() };
    this.apply();
    this.bindUI();
  }

  // Push the current values into the game systems. Called on boot and on change.
  apply() {
    this.G.camera.sens = BASE_SENS * this.data.sensitivity;
    this.G.camera.invertY = this.data.invertY;
    this.G.audio.setVolume(this.data.volume);
  }

  set(key, val) {
    this.data[key] = val;
    this.apply();
    save(this.data);
    this.syncLabels();
  }

  bindUI() {
    this.sens = document.getElementById('setSens');
    this.invert = document.getElementById('setInvert');
    this.vol = document.getElementById('setVol');
    this.sensVal = document.getElementById('setSensVal');
    this.volVal = document.getElementById('setVolVal');
    if (!this.sens) return;
    this.sens.addEventListener('input', () => this.set('sensitivity', parseFloat(this.sens.value)));
    this.invert.addEventListener('change', () => this.set('invertY', this.invert.checked));
    this.vol.addEventListener('input', () => this.set('volume', parseFloat(this.vol.value)));
    this.syncUI();
  }

  // Reflect stored values back onto the controls (used when the screen opens).
  syncUI() {
    if (!this.sens) return;
    this.sens.value = this.data.sensitivity;
    this.invert.checked = this.data.invertY;
    this.vol.value = this.data.volume;
    this.syncLabels();
  }

  syncLabels() {
    if (this.sensVal) this.sensVal.textContent = this.data.sensitivity.toFixed(2) + '×';
    if (this.volVal) this.volVal.textContent = Math.round(this.data.volume * 100) + '%';
  }
}
