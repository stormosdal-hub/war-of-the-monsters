// Keyboard input → camera-relative intents.
export class PlayerInput {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {};
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  consume(code) {
    const v = !!this.pressed[code];
    this.pressed[code] = false;
    return v;
  }

  // camYaw: yaw of camera forward, so W pushes away from camera.
  intents(camYaw) {
    let ix = 0, iz = 0;
    if (this.keys['KeyW']) iz += 1;
    if (this.keys['KeyS']) iz -= 1;
    if (this.keys['KeyA']) ix -= 1;
    if (this.keys['KeyD']) ix += 1;
    const mag = Math.hypot(ix, iz) || 1;
    ix /= mag; iz /= mag;
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    // rotate input by camera yaw
    const mx = ix * c + iz * s;
    const mz = -ix * s + iz * c;

    const dodgeTap = this.consume('ShiftLeft') || this.consume('ShiftRight');
    const blockHeld = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const hasDir = Math.hypot(mx, mz) > 0.05;

    return {
      mx, mz,
      aimYaw: camYaw, // FPS-style: the monster faces where the camera (mouse) points
      rx: ix, rz: iz, // raw axes (used for climbing so controls don't drift with the camera)
      jump: this.consume('Space'),
      jumpHeld: !!this.keys['Space'],
      light: this.consume('KeyJ'),
      heavy: this.consume('KeyK'),
      grab: this.consume('KeyL'),
      special: this.consume('KeyI'),
      dodge: dodgeTap && hasDir,
      block: blockHeld && !hasDir,
    };
  }

  clearEdges() { this.pressed = {}; }
}
