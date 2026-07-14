// AI opponent: simple utility state machine emitting the same intents a player does.
import { V3, rand, distXZ, yawTo, clamp, pick } from './util.js';

export class AIController {
  constructor(monster, target, G, difficulty = 1) {
    this.m = monster;
    this.target = target;
    this.G = G;
    this.diff = difficulty;
    this.mode = 'approach';
    this.thinkT = 0;
    this.comboLeft = 0;
    this.strafeDir = 1;
    this.modeT = 0;
    this.wantProp = null;
    this.lastPos = monster.pos.clone();
    this.stuckJump = false;
  }

  think() {
    // FFA: fixate on whoever is closest right now
    const ne = this.m.nearestEnemy();
    if (ne) this.target = ne;
    // unstuck check: intending to move but going nowhere → hop (may latch & climb)
    const moved = BABYLON.Vector3.Distance(this.m.pos, this.lastPos);
    this.lastPos.copyFrom(this.m.pos);
    if (['approach', 'fetch', 'armThrow'].includes(this.mode) && moved < 1.5 && this.m.onGround) {
      this.stuckJump = true;
    }
    this._think();
  }

  _think() {
    const m = this.m, e = this.target, G = this.G;
    const d = distXZ(m.pos, e.pos);
    const hpFrac = m.hp / m.maxHp;

    // panic retreat toward a health orb when hurt
    if (hpFrac < 0.32 && Math.random() < 0.5) {
      const orb = G.pickups.list.find(p => p.type === 'health');
      if (orb) { this.mode = 'fetch'; this.fetchTarget = orb; this.modeT = 0; return; }
    }
    // enemy climbing a wall? shoot them down or wait
    if (e.state === 'climb' && m.energy >= m.def.special.cost) { this.mode = 'shoot'; return; }

    if (d > 90) {
      // far: grab a car and hurl it, or close distance
      const prop = G.city.nearestProp(m.pos, 26);
      if (prop && Math.random() < 0.45) { this.mode = 'armThrow'; this.wantProp = prop; return; }
      this.mode = Math.random() < 0.3 && m.energy >= m.def.special.cost ? 'shoot' : 'approach';
      return;
    }
    if (d > 30) {
      const r = Math.random();
      if (r < 0.3 && m.energy >= m.def.special.cost) this.mode = 'shoot';
      else if (r < 0.5) { const prop = G.city.nearestProp(m.pos, 20); this.mode = prop ? 'armThrow' : 'approach'; this.wantProp = prop; }
      else this.mode = 'approach';
      return;
    }
    // close range
    const r = Math.random();
    if (e.state === 'attack' && Math.random() < 0.3 * this.diff) { this.mode = 'evade'; return; }
    if (r < 0.62) { this.mode = 'attack'; this.comboLeft = pick([1, 2, 3, 3]); }
    else if (r < 0.72 && m.energy >= m.def.special.cost) this.mode = 'shoot';
    else if (r < 0.84) this.mode = 'grabEnemy';
    else { this.mode = 'strafe'; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
  }

  intents(dt) {
    const m = this.m, G = this.G;
    const out = { mx: 0, mz: 0, jump: false, jumpHeld: false, light: false, heavy: false, grab: false, special: false, dodge: false, block: false };
    if (!this.target || !this.target.alive) this.target = m.nearestEnemy();
    const e = this.target;
    if (!m.alive || !e) return out;

    this.thinkT -= dt;
    this.modeT += dt;
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.35, 0.8) / this.diff;
      this.think();
    }

    const d = distXZ(m.pos, e.pos);
    const toE = e.pos.subtract(m.pos); toE.y = 0;
    if (toE.length() > 0.01) toE.normalize();

    // stuck against wall? jump (also lets AI mount low roofs / start climbing)
    if (e.pos.y > m.pos.y + 8 && d < 40 && Math.random() < 0.01) out.jump = true;
    if (this.stuckJump) { out.jump = true; this.stuckJump = false; }

    switch (this.mode) {
      case 'approach': {
        out.mx = toE.x; out.mz = toE.z;
        if (d < 14) { this.mode = 'attack'; this.comboLeft = 2; }
        if (Math.random() < 0.006) out.jump = true;
        break;
      }
      case 'strafe': {
        out.mx = -toE.z * this.strafeDir + toE.x * 0.15;
        out.mz = toE.x * this.strafeDir + toE.z * 0.15;
        if (this.modeT > 1.4) this.mode = 'approach';
        break;
      }
      case 'attack': {
        if (d > 13) { out.mx = toE.x; out.mz = toE.z; }
        else if (m.state !== 'attack' && this.comboLeft > 0) {
          this.comboLeft--;
          if (this.comboLeft === 0 && Math.random() < 0.5) out.heavy = true;
          else out.light = true;
        } else if (this.comboLeft <= 0) this.mode = 'strafe';
        break;
      }
      case 'grabEnemy': {
        if (d > 9) { out.mx = toE.x; out.mz = toE.z; }
        else { out.grab = true; this.mode = 'strafe'; }
        if (this.modeT > 2.5) this.mode = 'approach';
        break;
      }
      case 'shoot': {
        if (m.energy >= m.def.special.cost && m.state !== 'special') out.special = true;
        else if (m.state !== 'special') this.mode = 'approach';
        break;
      }
      case 'armThrow': {
        const p = this.wantProp;
        if (m.heldProp) {
          // face and throw
          if (Math.random() < 0.5 || d < 60) out.grab = true;
        } else if (p && p.alive && !p.held) {
          const dp = distXZ(m.pos, p.pos);
          const toP = p.pos.subtract(m.pos); toP.y = 0;
          if (toP.length() > 0.01) toP.normalize();
          if (dp > 7) { out.mx = toP.x; out.mz = toP.z; }
          else out.grab = true;
        } else this.mode = 'approach';
        if (this.modeT > 5) this.mode = 'approach';
        break;
      }
      case 'fetch': {
        const orb = this.fetchTarget;
        if (!orb || !G.pickups.list.includes(orb)) { this.mode = 'approach'; break; }
        const toO = orb.mesh.position.subtract(m.pos); toO.y = 0;
        if (toO.length() > 1) { toO.normalize(); out.mx = toO.x; out.mz = toO.z; }
        if (this.modeT > 4) this.mode = 'approach';
        break;
      }
      case 'evade': {
        out.mx = -toE.x + toE.z * this.strafeDir;
        out.mz = -toE.z - toE.x * this.strafeDir;
        if (Math.random() < 0.35 * this.diff) out.dodge = true;
        else if (Math.random() < 0.4) out.block = Math.hypot(out.mx, out.mz) < 0.1;
        if (this.modeT > 0.8) this.mode = 'strafe';
        break;
      }
    }

    // incoming projectile? occasionally dodge
    if (m.onGround && Math.random() < 0.02 * this.diff) {
      for (const p of G.projectiles.list) {
        if (p.owner === m) continue;
        const dp = BABYLON.Vector3.Distance(p.mesh.position, m.center);
        if (dp < 26) {
          out.dodge = true;
          out.mx = -toE.z; out.mz = toE.x;
          break;
        }
      }
    }
    return out;
  }
}
