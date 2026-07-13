// On-screen touch controls for phones/tablets.
//   • left half  → dynamic thumbstick that feeds the analog move axis
//   • right half → drag-to-aim zone that feeds camera.steer() (FPS look)
//   • buttons    → drive the same key maps the keyboard does, so every combat
//                  action (chains, hold-to-block, dodge, glide) works unchanged.
// Desktop is untouched: if the device isn't touch-capable nothing binds or shows.
export class TouchControls {
  constructor(input, camera) {
    this.input = input;
    this.camera = camera;
    this.isTouch = typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0);

    this.root = document.getElementById('touchControls');
    if (!this.root) return;
    this.stick = document.getElementById('touchStick');
    this.knob = document.getElementById('touchKnob');
    this.lookZone = document.getElementById('lookZone');
    this.moveZone = document.getElementById('moveZone');

    this.stickId = null;                 // touch identifier owning the joystick
    this.stickOrigin = { x: 0, y: 0 };
    this.radius = 55;                     // px throw of the stick
    this.lookId = null;                   // touch identifier owning the aim drag
    this.lookLast = { x: 0, y: 0 };

    if (this.isTouch) {
      document.body.classList.add('is-touch'); // CSS swaps desktop hints for touch
      this.bindStick();
      this.bindLook();
      this.bindButtons();
    }
  }

  setVisible(on) {
    if (!this.root || !this.isTouch) return;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.resetStick();
  }

  resetStick() {
    this.stickId = null;
    this.input.setMoveAxis(0, 0);
    if (this.stick) this.stick.style.display = 'none';
  }

  bindStick() {
    this.moveZone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this.stickId !== null) break;
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stick.style.display = 'block';
        this.stick.style.left = t.clientX + 'px';
        this.stick.style.top = t.clientY + 'px';
        this.knob.style.transform = 'translate(-50%,-50%)';
      }
      e.preventDefault();
    }, { passive: false });

    this.moveZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        let dx = t.clientX - this.stickOrigin.x;
        let dy = t.clientY - this.stickOrigin.y;
        const mag = Math.hypot(dx, dy), r = this.radius;
        if (mag > r) { dx *= r / mag; dy *= r / mag; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.input.setMoveAxis(dx / r, -dy / r); // screen-down is -forward
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.stickId) this.resetStick();
    };
    this.moveZone.addEventListener('touchend', end);
    this.moveZone.addEventListener('touchcancel', end);
  }

  bindLook() {
    this.lookZone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this.lookId !== null) break;
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });

    this.lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        this.camera.steer(t.clientX - this.lookLast.x, t.clientY - this.lookLast.y);
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.lookId) this.lookId = null;
    };
    this.lookZone.addEventListener('touchend', end);
    this.lookZone.addEventListener('touchcancel', end);
  }

  bindButtons() {
    // Hold buttons (data-btn = key code) press/release a key. Tap buttons
    // (data-key) fire a one-shot keydown (e.g. pause), reusing existing handlers.
    for (const el of this.root.querySelectorAll('[data-btn]')) {
      const code = el.dataset.btn;
      const down = (e) => { el.classList.add('active'); this.input.pressButton(code); e.preventDefault(); };
      const up = (e) => { el.classList.remove('active'); this.input.releaseButton(code); e.preventDefault(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    for (const el of this.root.querySelectorAll('[data-key]')) {
      const code = el.dataset.key;
      el.addEventListener('touchstart', (e) => {
        el.classList.add('active');
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
        e.preventDefault();
      }, { passive: false });
      el.addEventListener('touchend', (e) => { el.classList.remove('active'); e.preventDefault(); }, { passive: false });
    }
  }
}
