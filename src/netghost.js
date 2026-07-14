// Guest-side visual "ghosts" for host-authoritative entities the guest does not
// simulate: projectiles (specials + thrown props) and pickup orbs. Each is keyed
// by a stable id from the host snapshot; meshes are created / moved / removed to
// match. Purely cosmetic — no gameplay.
import { C3 } from './util.js';

export class GhostWorld {
  constructor(scene) {
    this.scene = scene;
    this.projs = new Map();   // id -> mesh
    this.orbs = new Map();    // id -> mesh
    this._pmat = {};          // color key -> material
    this.matH = null; this.matE = null;
  }

  _projMat(c) {
    const col = c || [1, 0.6, 0.2];
    const key = col.map((v) => Math.round(v * 10)).join('_');
    if (!this._pmat[key]) {
      const m = new BABYLON.StandardMaterial('gpm_' + key, this.scene);
      m.emissiveColor = C3(col[0], col[1], col[2]);
      m.diffuseColor = C3(0, 0, 0);
      this._pmat[key] = m;
    }
    return this._pmat[key];
  }
  _orbMat(type) {
    if (type === 1) {
      if (!this.matH) { const m = new BABYLON.StandardMaterial('gorbH', this.scene); m.emissiveColor = C3(0.2, 0.95, 0.25); m.diffuseColor = C3(0, 0.2, 0); this.matH = m; }
      return this.matH;
    }
    if (!this.matE) { const m = new BABYLON.StandardMaterial('gorbE', this.scene); m.emissiveColor = C3(0.25, 0.6, 1); m.diffuseColor = C3(0, 0.05, 0.25); this.matE = m; }
    return this.matE;
  }

  syncProjectiles(list = []) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let g = this.projs.get(p.id);
      if (!g) {
        g = BABYLON.MeshBuilder.CreateSphere('gproj', { diameter: (p.r || 1) * 2, segments: 8 }, this.scene);
        g.material = this._projMat(p.c);
        this.projs.set(p.id, g);
      }
      g.position.set(p.x, p.y, p.z);
    }
    for (const [id, g] of this.projs) if (!seen.has(id)) { g.dispose(); this.projs.delete(id); }
  }

  syncPickups(list = []) {
    const seen = new Set();
    for (const o of list) {
      seen.add(o.id);
      let mesh = this.orbs.get(o.id);
      if (!mesh) {
        mesh = BABYLON.MeshBuilder.CreateSphere('gorb', { diameter: 2.4, segments: 8 }, this.scene);
        mesh.material = this._orbMat(o.t);
        const halo = BABYLON.MeshBuilder.CreateTorus('ghalo', { diameter: 3.4, thickness: 0.18, tessellation: 18 }, this.scene);
        halo.material = mesh.material; halo.parent = mesh;
        this.orbs.set(o.id, mesh);
      }
      mesh.position.set(o.x, o.y, o.z);
      mesh.rotation.y += 0.03;
    }
    for (const [id, mesh] of this.orbs) if (!seen.has(id)) { mesh.dispose(); this.orbs.delete(id); }
  }

  clear() {
    for (const g of this.projs.values()) g.dispose();
    for (const m of this.orbs.values()) m.dispose();
    this.projs.clear(); this.orbs.clear();
  }
}
