// Health / energy orbs: fixed respawn points plus drops from destroyed buildings.
import { V3, C3, rand, pick } from './util.js';

const RESPAWN = 16;

export class PickupManager {
  constructor(scene, G) {
    this.scene = scene;
    this.G = G;
    this.list = [];
    this.spawnPoints = [];
    this.t = 0;

    this.matHealth = new BABYLON.StandardMaterial('pkH', scene);
    this.matHealth.emissiveColor = C3(0.2, 0.95, 0.25);
    this.matHealth.diffuseColor = C3(0, 0.2, 0);
    this.matEnergy = new BABYLON.StandardMaterial('pkE', scene);
    this.matEnergy.emissiveColor = C3(0.25, 0.6, 1);
    this.matEnergy.diffuseColor = C3(0, 0.05, 0.25);
  }

  addSpawnPoints(points) {
    for (const p of points) this.spawnPoints.push({ pos: p, timer: rand(3, 10), item: null });
  }

  spawn(pos, type, permanentPoint = null) {
    const mesh = BABYLON.MeshBuilder.CreateSphere('pickup', { diameter: 2.4, segments: 8 }, this.scene);
    mesh.material = type === 'health' ? this.matHealth : this.matEnergy;
    mesh.position.copyFrom(pos);
    const halo = BABYLON.MeshBuilder.CreateTorus('halo', { diameter: 3.4, thickness: 0.18, tessellation: 18 }, this.scene);
    halo.material = mesh.material;
    halo.parent = mesh;
    const item = { mesh, type, baseY: Math.max(pos.y, 1.6), t: rand(6.28), point: permanentPoint, life: permanentPoint ? Infinity : 25 };
    this.list.push(item);
    return item;
  }

  update(dt) {
    const G = this.G;
    this.t += dt;

    for (const sp of this.spawnPoints) {
      if (!sp.item) {
        sp.timer -= dt;
        if (sp.timer <= 0) sp.item = this.spawn(sp.pos.clone(), Math.random() < 0.55 ? 'health' : 'energy', sp);
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      it.life -= dt;
      // settle drops onto whatever is below
      const gy = G.city.groundHeightAt(it.mesh.position.x, it.mesh.position.z, it.mesh.position.y);
      it.baseY = Math.max(it.baseY - dt * 8, gy + 1.6);
      it.mesh.position.y = it.baseY + Math.sin(it.t * 2.4) * 0.5;
      it.mesh.rotation.y += dt * 1.8;

      let taken = false;
      for (const m of G.monsters) {
        if (!m.alive) continue;
        const d = BABYLON.Vector3.Distance(it.mesh.position, m.pos.add(V3(0, m.height * 0.4, 0)));
        if (d < m.radius + 3.2) {
          if (it.type === 'health') m.heal(140);
          else m.gainEnergy(40);
          G.audio.pickup(it.type);
          G.effects.burst({ pos: it.mesh.position.clone(), count: 16, color1: it.type === 'health' ? [0.4, 1, 0.4] : [0.4, 0.7, 1], color2: it.type === 'health' ? [0.1, 0.5, 0.1] : [0.1, 0.2, 0.6], size: [0.8, 1.8], life: [0.2, 0.5], speed: 14, up: 10, gravity: -10 });
          taken = true;
          break;
        }
      }
      if (taken || it.life <= 0) {
        it.mesh.dispose();
        if (it.point) { it.point.item = null; it.point.timer = RESPAWN; }
        this.list.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const it of this.list) it.mesh.dispose();
    this.list.length = 0;
    this.spawnPoints.length = 0;
  }
}
