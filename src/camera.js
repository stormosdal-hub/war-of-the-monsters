// Duel camera: sits behind the player, keeps both monsters framed,
// zooms with separation, avoids clipping through buildings.
import { V3, clamp, lerp, damp, segmentVsAABB } from './util.js';

export class DuelCamera {
  constructor(scene, canvas) {
    this.cam = new BABYLON.FreeCamera('duelCam', V3(0, 40, -120), scene);
    this.cam.minZ = 0.6;
    this.cam.maxZ = 3200;
    this.cam.fov = 0.85;
    scene.activeCamera = this.cam;
    this.scene = scene;
    this.pos = this.cam.position.clone();
    this.look = V3(0, 10, 0);
    this.mode = 'duel'; // duel | orbit
    this.orbitT = 0;
    this.shakeSeed = 0;

    // mouse look: offsets layered on top of the auto-framed duel angle.
    this.userYaw = 0;      // azimuth offset (radians)
    this.userPitch = 0;    // elevation offset (radians)
    this.sens = 0.0022;    // mouse sensitivity (radians per pixel)
    this.lookEnabled = false;
    this.pointerLocked = false;
    this.bindMouse(canvas);
  }

  get yaw() {
    const f = this.cam.getForwardRay().direction;
    return Math.atan2(f.x, f.z);
  }

  // Click the canvas during a fight to capture the mouse; move to steer, Esc to release.
  bindMouse(canvas) {
    if (!canvas || typeof document === 'undefined') return;
    canvas.addEventListener('click', () => {
      if (this.lookEnabled && !this.pointerLocked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = (document.pointerLockElement === canvas);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.lookEnabled) return;
      this.userYaw += e.movementX * this.sens;
      this.userPitch = clamp(this.userPitch + e.movementY * this.sens, -0.5, 0.85);
    });
  }

  // Enable/disable mouse steering; releases the pointer when turned off.
  setLook(on) {
    this.lookEnabled = on;
    if (!on && this.pointerLocked && typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  // Enter combat framing: recenter the mouse offsets and allow steering.
  enterDuel() {
    this.mode = 'duel';
    this.userYaw = 0;
    this.userPitch = 0;
    this.setLook(true);
  }

  startOrbit(center) {
    this.mode = 'orbit';
    this.orbitT = 0;
    this.orbitCenter = center.clone();
  }

  update(dt, G) {
    const [p, e] = G.monsters;
    let desiredPos, desiredLook;

    if (this.mode === 'orbit') {
      this.orbitT += dt;
      const a = this.orbitT * 0.55 + 2.2;
      const r = 46 - this.orbitT * 4;
      desiredPos = this.orbitCenter.add(V3(Math.sin(a) * r, 16 + this.orbitT * 2, Math.cos(a) * r));
      desiredLook = this.orbitCenter.add(V3(0, 10, 0));
      this.pos = BABYLON.Vector3.Lerp(this.pos, desiredPos, damp(4, dt));
      this.look = BABYLON.Vector3.Lerp(this.look, desiredLook, damp(6, dt));
    } else {
      const pc = p.pos.add(V3(0, p.height * 0.55, 0));
      const ec = e && e.alive !== undefined ? e.pos.add(V3(0, e.height * 0.55, 0)) : pc;
      const mid = BABYLON.Vector3.Lerp(pc, ec, 0.42);
      const sep = BABYLON.Vector3.Distance(pc, ec);

      let axis = pc.subtract(ec); axis.y = 0;
      if (axis.length() < 0.5) axis = V3(0, 0, -1);
      else axis.normalize();

      const dist = clamp(15 + sep * 0.42, 17, 68);
      // Orbit the look-point: auto-framed azimuth + mouse yaw; base elevation + mouse pitch.
      const az = Math.atan2(axis.x, axis.z) + this.userYaw;
      const el = clamp(0.30 + clamp(sep * 0.004, 0, 0.28) + this.userPitch, 0.05, 1.28);
      desiredLook = mid.add(V3(0, 2 + sep * 0.05, 0));
      const horiz = Math.cos(el) * dist;
      desiredPos = desiredLook.add(V3(Math.sin(az) * horiz, Math.sin(el) * dist, Math.cos(az) * horiz));

      // keep the camera out of buildings: walk back along the ray from look → pos
      const hit = this.raycastCity(G, desiredLook, desiredPos);
      if (hit !== null) {
        const t = Math.max(0.15, hit - 0.04);
        desiredPos = BABYLON.Vector3.Lerp(desiredLook, desiredPos, t);
        desiredPos.y += (1 - t) * 14; // rise over the obstacle a bit
      }
      // never below rooftops we're standing near, never underground
      const gy = G.city.groundHeightAt(desiredPos.x, desiredPos.z, desiredPos.y);
      desiredPos.y = Math.max(desiredPos.y, gy + 4, 4);

      this.pos = BABYLON.Vector3.Lerp(this.pos, desiredPos, damp(6.5, dt));
      this.look = BABYLON.Vector3.Lerp(this.look, desiredLook, damp(9, dt));
    }

    // screen shake
    const s = G.effects.shakeAmt;
    this.shakeSeed += dt * 43;
    const sx = Math.sin(this.shakeSeed * 2.1) * s * 0.55;
    const sy = Math.sin(this.shakeSeed * 2.7 + 1.3) * s * 0.45;

    this.cam.position.copyFrom(this.pos).addInPlace(V3(sx, sy, 0));
    this.cam.setTarget(this.look.add(V3(sx * 0.4, sy * 0.4, 0)));
  }

  raycastCity(G, from, to) {
    let best = null;
    for (const b of G.city.buildings) {
      if (!b.alive) continue;
      const t = segmentVsAABB(from, to, b.min, b.max);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best;
  }
}
