// Follow camera: FPS-style third-person rig that sits directly behind the player
// and is aimed by the mouse. The player's monster faces camYaw, so moving the
// mouse turns the character; WASD is relative to that facing. Still raycasts to
// avoid clipping through buildings. (Intro/victory use the 'orbit' fly-around.)
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
    this.mode = 'follow'; // follow | orbit
    this.orbitT = 0;
    this.shakeSeed = 0;

    // mouse look: absolute facing (yaw) + camera tilt (pitch), driven by the mouse.
    this.camYaw = 0;       // character + camera facing (radians)
    this.camPitch = 0.16;  // camera elevation above the player (radians)
    this.sens = 0.0022;    // look sensitivity (radians per pixel); tuned via Settings
    this.invertY = false;  // flip vertical look (Settings)
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
      this.steer(e.movementX, e.movementY);
    });
  }

  // Apply a look delta in pixels. Shared by mouse-look and touch drag-to-aim.
  // dx turns the character (yaw); dy tilts the view (pitch).
  steer(dx, dy) {
    if (!this.lookEnabled) return;
    this.camYaw += dx * this.sens;
    const dyy = this.invertY ? -dy : dy;
    this.camPitch = clamp(this.camPitch + dyy * this.sens, -0.25, 1.05);
  }

  // Enable/disable mouse steering; releases the pointer when turned off.
  setLook(on) {
    this.lookEnabled = on;
    if (!on && this.pointerLocked && typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  // Enter combat: face the way the player already faces and allow steering.
  enterFollow(startYaw = 0) {
    this.mode = 'follow';
    this.camYaw = startYaw;
    this.camPitch = 0.16;
    this.setLook(true);
  }

  startOrbit(center) {
    this.mode = 'orbit';
    this.orbitT = 0;
    this.orbitCenter = center.clone();
  }

  update(dt, G) {
    const [p] = G.monsters;
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
      // third-person behind the player, aimed by camYaw / camPitch
      const h = p.height;
      const head = p.pos.add(V3(0, h * 0.72, 0));
      const az = this.camYaw;
      const el = clamp(this.camPitch, -0.25, 1.05);
      const dist = h * 1.5 + 11;
      const fwd = V3(Math.sin(az), 0, Math.cos(az));
      const horiz = Math.cos(el) * dist;

      // sit behind (opposite facing) and above; look slightly ahead so the
      // monster sits low-center and you can see where you're heading
      desiredPos = head.add(fwd.scale(-horiz)).add(V3(0, Math.sin(el) * dist + h * 0.15, 0));
      desiredLook = head.add(fwd.scale(h * 0.5)).add(V3(0, h * 0.05, 0));

      // keep the camera out of buildings: pull in along look → pos if blocked
      const hit = this.raycastCity(G, desiredLook, desiredPos);
      if (hit !== null) {
        const t = Math.max(0.12, hit - 0.05);
        desiredPos = BABYLON.Vector3.Lerp(desiredLook, desiredPos, t);
        desiredPos.y += (1 - t) * 10; // rise over the obstacle a bit
      }
      // never below rooftops we're standing near, never underground
      const gy = G.city.groundHeightAt(desiredPos.x, desiredPos.z, desiredPos.y);
      desiredPos.y = Math.max(desiredPos.y, gy + 3, 3);

      // snappy follow so turning tracks the mouse without feeling glued
      this.pos = BABYLON.Vector3.Lerp(this.pos, desiredPos, damp(13, dt));
      this.look = BABYLON.Vector3.Lerp(this.look, desiredLook, damp(20, dt));
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
