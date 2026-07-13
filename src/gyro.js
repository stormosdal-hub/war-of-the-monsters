// Optional gyroscope steering for phones: tilt the device left/right ("roll") to
// turn the character. Uses DeviceOrientationEvent — the phone's tilt sensor —
// mapped to a *turn rate* (hold a tilt and you keep turning), so you can spin a
// full 360°. iOS 13+ requires a permission prompt fired from a user gesture, so
// enabling from the Settings toggle (a tap) is what unlocks it.
//
// Orientation math: gamma is left-right tilt in portrait; in landscape the
// screen's left-right tilt lives in beta. Combining them with the current screen
// angle yields one "screen tilt" value that works whichever way the phone is held.
const DEADZONE = 4;     // degrees of slack around level before we start turning
const FULL_TILT = 32;   // degrees of tilt that maps to the max turn rate
const MAX_RATE = 2.4;   // radians/sec at full tilt, sensitivity 1

export class GyroSteer {
  constructor(camera) {
    this.camera = camera;
    this.sens = 1;
    this.invert = false;
    this.wanted = false;      // user wants gyro on
    this.granted = false;     // permission granted (or not needed)
    this.listening = false;
    this.tilt = 0;            // latest screen left-right tilt, degrees
    this.baseline = 0;        // "level" reference captured on enable / fight start
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
    // project device tilt onto the current screen's left-right axis
    this.tilt = e.gamma * Math.cos(ang) + e.beta * Math.sin(ang);
    if (this.needsRecenter) { this.baseline = this.tilt; this.needsRecenter = false; }
  }

  // Re-capture "level" — call when a fight starts / resumes so the player's
  // natural holding angle becomes neutral.
  recenter() { this.needsRecenter = true; }

  // Called each fight frame: convert tilt beyond the deadzone into yaw.
  apply(dt) {
    if (!this.wanted || !this.granted || !this.listening) return;
    const d = this.tilt - this.baseline;
    const mag = Math.abs(d) - DEADZONE;
    if (mag <= 0) return;
    const norm = Math.min(mag / (FULL_TILT - DEADZONE), 1);
    const rate = norm * MAX_RATE * this.sens * Math.sign(d) * (this.invert ? -1 : 1);
    this.camera.camYaw += rate * dt;
  }
}
