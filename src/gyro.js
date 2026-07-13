// Optional gyroscope steering for phones. Tilt the device to aim:
//   • left/right tilt ("roll")   → turn the character (yaw)
//   • front/back tilt ("pitch")  → look up / down
// Uses DeviceOrientationEvent — the phone's tilt sensor — mapped to a *rate*
// (hold a tilt and you keep turning/tilting), so you can spin a full 360°.
// iOS 13+ requires a permission prompt fired from a user gesture, so enabling
// from the Settings toggle (a tap) is what unlocks it.
//
// Orientation math: the raw beta/gamma tilt is rotated by the current screen
// angle into two orthogonal screen axes, so left/right (yaw) and front/back
// (pitch) stay separated whichever way the phone is held.
import { clamp } from './util.js';

const DEADZONE = 4;        // degrees of slack around level before we react
const FULL_TILT = 32;      // degrees of tilt that maps to the max rate
const MAX_RATE = 2.4;      // yaw radians/sec at full tilt, sensitivity 1
const PITCH_RATE = 1.1;    // pitch radians/sec at full tilt (range is small, so gentler)
const PITCH_MIN = -0.25, PITCH_MAX = 1.05; // must match camera.js pitch clamp

export class GyroSteer {
  constructor(camera) {
    this.camera = camera;
    this.sens = 1;
    this.invert = false;      // flip horizontal (yaw) direction
    this.pitch = true;        // also tilt front/back to look up/down
    this.pitchInvert = false; // flip vertical (pitch) direction
    this.wanted = false;      // user wants gyro on
    this.granted = false;     // permission granted (or not needed)
    this.listening = false;
    this.tilt = 0;            // latest screen left-right tilt (yaw), degrees
    this.tiltV = 0;           // latest screen front-back tilt (pitch), degrees
    this.baseline = 0;        // "level" yaw reference captured on enable / fight start
    this.baselineV = 0;       // "level" pitch reference
    this.needsRecenter = true;
    this._onOrient = this._onOrient.bind(this);
  }

  get supported() { return typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'; }
  get needsPermission() { return this.supported && typeof DeviceOrientationEvent.requestPermission === 'function'; }

  // on/off; viaGesture must be true for the iOS permission request to be allowed.
  setEnabled(on, viaGesture = false) {
    this.wanted = on;
    if (!on) { this._stop(); return; }
    if (!this.supported) return;
    this.needsRecenter = true;
    if (this.needsPermission && !this.granted) {
      if (viaGesture) this._requestPermission();
      else this._deferToGesture();      // e.g. reloaded with gyro saved on
    } else {
      this.granted = true;
      this._start();
    }
  }

  _requestPermission() {
    DeviceOrientationEvent.requestPermission()
      .then((res) => { if (res === 'granted') { this.granted = true; if (this.wanted) this._start(); } })
      .catch(() => { /* denied / not https — silently stays off */ });
  }

  // If gyro was saved on but we can't prompt without a gesture, grab the next tap.
  _deferToGesture() {
    if (this._deferred) return;
    this._deferred = () => {
      window.removeEventListener('pointerdown', this._deferred);
      window.removeEventListener('touchend', this._deferred);
      this._deferred = null;
      if (this.wanted) this._requestPermission();
    };
    window.addEventListener('pointerdown', this._deferred, { once: true });
    window.addEventListener('touchend', this._deferred, { once: true });
  }

  _start() {
    if (this.listening) return;
    window.addEventListener('deviceorientation', this._onOrient);
    this.listening = true;
  }

  _stop() {
    if (!this.listening) return;
    window.removeEventListener('deviceorientation', this._onOrient);
    this.listening = false;
  }

  _onOrient(e) {
    if (e.gamma === null || e.beta === null) return;
    const ang = (((screen.orientation && screen.orientation.angle) || window.orientation || 0)) * Math.PI / 180;
    const c = Math.cos(ang), s = Math.sin(ang);
    // decompose device tilt into the screen's two orthogonal axes
    this.tilt = e.gamma * c + e.beta * s;   // left-right (yaw)
    this.tiltV = e.beta * c - e.gamma * s;  // front-back (pitch)
    if (this.needsRecenter) { this.baseline = this.tilt; this.baselineV = this.tiltV; this.needsRecenter = false; }
  }

  // Re-capture "level" — call when a fight starts / resumes so the player's
  // natural holding angle becomes neutral.
  recenter() { this.needsRecenter = true; }

  // Tilt past the deadzone -> a rate; returns radians/sec at sensitivity 1.
  _rate(d, maxRate) {
    const mag = Math.abs(d) - DEADZONE;
    if (mag <= 0) return 0;
    return Math.min(mag / (FULL_TILT - DEADZONE), 1) * maxRate * this.sens * Math.sign(d);
  }

  // Called each fight frame: convert tilt beyond the deadzone into yaw + pitch.
  apply(dt) {
    if (!this.wanted || !this.granted || !this.listening) return;
    const yaw = this._rate(this.tilt - this.baseline, MAX_RATE) * (this.invert ? -1 : 1);
    this.camera.camYaw += yaw * dt;
    if (this.pitch) {
      const p = this._rate(this.tiltV - this.baselineV, PITCH_RATE) * (this.pitchInvert ? -1 : 1);
      this.camera.camPitch = clamp(this.camera.camPitch + p * dt, PITCH_MIN, PITCH_MAX);
    }
  }
}
