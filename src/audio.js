// Procedural WebAudio sound effects — no audio assets needed.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.5; // master gain, adjustable via Settings
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (e) {
      this.enabled = false;
      return false;
    }
  }

  // Set master volume 0..1; applies immediately if the context already exists,
  // otherwise it's picked up when ensure() first builds the master gain.
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _noiseBuf(dur = 1) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _noise(dur, { type = 'lowpass', f0 = 800, f1 = 120, peak = 0.5, attack = 0.005 } = {}) {
    if (!this.enabled || !this.ensure()) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf(dur + 0.1);
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, peak, attack, dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.15);
  }

  _tone(freq0, freq1, dur, { type = 'sine', peak = 0.4, attack = 0.005 } = {}) {
    if (!this.enabled || !this.ensure()) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 20), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, peak, attack, dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  // ---- game events ----
  ui() { this._tone(700, 1100, 0.09, { type: 'square', peak: 0.12 }); }
  confirm() { this._tone(500, 1500, 0.2, { type: 'square', peak: 0.15 }); }
  footstep(big = 1) { this._tone(90 * big, 35, 0.16, { type: 'sine', peak: 0.22 }); this._noise(0.1, { f0: 300, f1: 60, peak: 0.08 }); }
  swing() { this._noise(0.18, { type: 'bandpass', f0: 1400, f1: 250, peak: 0.18 }); }
  hit(heavy = false) {
    this._noise(heavy ? 0.4 : 0.22, { f0: heavy ? 900 : 1600, f1: 90, peak: heavy ? 0.6 : 0.42 });
    this._tone(heavy ? 140 : 200, 45, heavy ? 0.35 : 0.2, { type: 'triangle', peak: 0.35 });
  }
  block() { this._tone(320, 180, 0.12, { type: 'square', peak: 0.2 }); this._noise(0.08, { f0: 2500, f1: 800, peak: 0.1 }); }
  explosion(size = 1) {
    this._noise(0.7 * size, { f0: 700, f1: 45, peak: 0.7, attack: 0.01 });
    this._tone(90, 28, 0.6 * size, { type: 'sine', peak: 0.55 });
  }
  crumble() { this._noise(0.9, { f0: 500, f1: 60, peak: 0.5, attack: 0.03 }); }
  collapse() { this._noise(1.6, { f0: 420, f1: 35, peak: 0.75, attack: 0.05 }); this._tone(70, 24, 1.3, { type: 'sine', peak: 0.4 }); }
  roar(basePitch = 90) {
    if (!this.enabled || !this.ensure()) return;
    const t0 = this.ctx.currentTime, dur = 1.1;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(basePitch, t0);
    o.frequency.linearRampToValueAtTime(basePitch * 1.6, t0 + 0.25);
    o.frequency.exponentialRampToValueAtTime(basePitch * 0.6, t0 + dur);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 26;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = basePitch * 0.35;
    lfo.connect(lfoG).connect(o.frequency);
    const sh = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    sh.curve = curve;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.4, 0.06, dur);
    o.connect(sh).connect(filt).connect(g).connect(this.master);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + dur + 0.1); lfo.stop(t0 + dur + 0.1);
    this._noise(dur, { type: 'bandpass', f0: 500, f1: 150, peak: 0.2, attack: 0.08 });
  }
  shoot(kind = 'orb') {
    if (kind === 'rockets') { this._noise(0.5, { f0: 1200, f1: 200, peak: 0.3 }); this._tone(300, 90, 0.4, { type: 'sawtooth', peak: 0.15 }); }
    else if (kind === 'magma') { this._noise(0.5, { f0: 400, f1: 70, peak: 0.4, attack: 0.02 }); this._tone(120, 50, 0.5, { peak: 0.3 }); }
    else this._tone(900, 250, 0.25, { type: 'sawtooth', peak: 0.2 });
  }
  pickup(type = 'health') { this._tone(type === 'health' ? 620 : 500, type === 'health' ? 1240 : 1500, 0.22, { type: 'triangle', peak: 0.22 }); }
  jump() { this._noise(0.15, { type: 'bandpass', f0: 500, f1: 1400, peak: 0.1 }); }
  throwWhoosh() { this._noise(0.35, { type: 'bandpass', f0: 700, f1: 2000, peak: 0.25 }); }
  grab() { this._tone(180, 90, 0.15, { type: 'square', peak: 0.18 }); }
  ko() { this._tone(220, 30, 1.4, { type: 'sawtooth', peak: 0.5 }); this._noise(1.2, { f0: 800, f1: 40, peak: 0.6, attack: 0.02 }); }
}
