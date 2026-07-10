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
  }

  get yaw() {
    const f = this.cam.getForwardRay().direction;
    return Math.atan2(f.x, f.z);
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
      const height = 7 + sep * 0.16 + Math.max(0, (pc.y + ec.y) * 0.25);
      desiredPos = pc.add(axis.scale(dist));
      desiredPos.y = Math.max(pc.y + height * 0.4, mid.y + height * 0.5, 6);
      desiredLook = mid.add(V3(0, 2 + sep * 0.05, 0));

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
