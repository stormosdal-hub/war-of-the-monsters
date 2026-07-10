// Projectiles: monster specials and thrown props share one manager.
import { V3, C3, distToCapsule } from './util.js';

export class ProjectileManager {
  constructor(scene, G) {
    this.scene = scene;
    this.G = G;
    this.list = [];
  }

  // Energy-attack projectile.
  spawn({ pos, vel, owner, dmg, radius = 1, aoe = 4, gravity = 0, hue = 'fire', color = [1, 0.6, 0.2], bDmg = 40, life = 3.5 }) {
    const mesh = BABYLON.MeshBuilder.CreateSphere('proj', { diameter: radius * 2, segments: 8 }, this.scene);
    const m = new BABYLON.StandardMaterial('projMat', this.scene);
    m.emissiveColor = C3(color[0], color[1], color[2]);
    m.diffuseColor = C3(0, 0, 0);
    mesh.material = m;
    mesh.position.copyFrom(pos);
    this.list.push({ type: 'orb', mesh, vel: vel.clone(), owner, dmg, radius, aoe, gravity, hue, bDmg, life, prev: pos.clone() });
  }

  // A grabbed prop hurled by a monster.
  spawnProp(prop, pos, vel, owner) {
    prop.held = true; // stays out of city prop logic
    const mesh = prop.mesh;
    mesh.setParent(null);
    mesh.position.copyFrom(pos);
    this.list.push({ type: 'prop', prop, mesh, vel: vel.clone(), owner, dmg: prop.dmg, radius: 2.2, aoe: prop.explosive ? 7 : 3, gravity: -50, hue: 'fire', bDmg: prop.dmg * 1.4, life: 5, prev: pos.clone(), spin: V3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3) });
  }

  impact(p, at) {
    const G = this.G;
    if (p.type === 'prop') {
      if (p.prop.explosive) { G.effects.explosion(at, p.aoe); G.audio.explosion(1); }
      else { G.effects.dust(at, 4, 14); G.effects.spawnChunks(at, 4, 0.4, 1.2, 10, false); G.audio.hit(true); }
      p.prop.alive = false;
      p.mesh.dispose();
    } else {
      G.effects.explosion(at, p.aoe, p.hue);
      G.audio.explosion(0.5 + p.aoe * 0.05);
      p.mesh.dispose();
    }
    // AoE damage to monsters
    for (const m of G.monsters) {
      if (!m.alive || m === p.owner) continue;
      const d = distToCapsule(at, m.pos.x, m.pos.z, m.pos.y, m.pos.y + m.height);
      if (d < p.aoe + m.radius) {
        const fall = 1 - Math.max(0, (d - m.radius)) / (p.aoe + 0.001) * 0.6;
        const dir = m.pos.subtract(at); dir.y = 0;
        const n = dir.length() > 0.01 ? dir.normalize() : V3(0, 0, 1);
        m.applyDamage(p.dmg * fall, {
          from: p.owner,
          knock: n.scale(10 + p.dmg * 0.12).add(V3(0, p.dmg * 0.1, 0)),
          hitstun: 0.45,
        });
      }
    }
  }

  update(dt) {
    const G = this.G;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.prev.copyFrom(p.mesh.position);
      p.vel.y += (p.gravity || 0) * dt;
      p.mesh.position.addInPlace(p.vel.scale(dt));
      if (p.spin) {
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
      }
      const at = p.mesh.position;
      let hit = false;

      // building sweep
      const bh = G.city.raycast(p.prev, at);
      if (bh) {
        const impactPos = BABYLON.Vector3.Lerp(p.prev, at, bh.t);
        bh.building.applyDamage(p.bDmg, impactPos.y, G);
        this.impact(p, impactPos);
        hit = true;
      }

      // monsters
      if (!hit) {
        for (const m of G.monsters) {
          if (!m.alive || m === p.owner || m.iframes > 0) continue;
          const d = distToCapsule(at, m.pos.x, m.pos.z, m.pos.y, m.pos.y + m.height);
          if (d < p.radius + m.radius) {
            if (m.state === 'block' && p.type === 'orb') {
              G.audio.block();
              G.effects.hitSpark(at.clone(), false);
              m.applyDamage(p.dmg * 0.15, { from: p.owner, knock: p.vel.scale(0.05), hitstun: 0, blocked: true });
              p.mesh.dispose();
              this.list.splice(i, 1);
            } else {
              this.impact(p, at.clone());
              this.list.splice(i, 1);
            }
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }

      // ground
      if (!hit && at.y - p.radius <= 0.1) {
        at.y = p.radius;
        this.impact(p, at.clone());
        hit = true;
      }

      if (hit || p.life <= 0 || Math.abs(at.x) > 900 || Math.abs(at.z) > 900) {
        if (!hit) p.mesh.dispose();
        const idx = this.list.indexOf(p);
        if (idx >= 0) this.list.splice(idx, 1);
      }
    }
  }

  dispose() {
    for (const p of this.list) p.mesh.dispose();
    this.list.length = 0;
  }
}
