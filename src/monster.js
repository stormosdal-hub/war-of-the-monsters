// Monster entity: physics, combat state machine, procedural animation.
import { V3, clamp, lerp, angleLerp, yawTo, fwdOf, distXZ, smoothstep, damp } from './util.js';

const GRAV = -70;
const AIR_CTRL = 0.55;

// Melee move data (per-monster damage scales by def.dmgMul, reach by radius).
const MOVES = {
  light1: { windup: 0.16, active: 0.14, recover: 0.2, dmg: 30, range: 8.5, knock: 7, up: 0, hitstun: 0.32, anim: 'jabR', chain: 'light2', sfx: false },
  light2: { windup: 0.14, active: 0.14, recover: 0.2, dmg: 32, range: 8.5, knock: 8, up: 0, hitstun: 0.34, anim: 'jabL', chain: 'light3', sfx: false },
  light3: { windup: 0.2, active: 0.16, recover: 0.34, dmg: 48, range: 9.5, knock: 17, up: 8, hitstun: 0.5, anim: 'spin', sfx: true },
  heavy: { windup: 0.42, active: 0.18, recover: 0.42, dmg: 80, range: 10, knock: 22, up: 16, hitstun: 0.65, anim: 'smash', launcher: true, sfx: true },
  airslam: { windup: 0.1, active: 99, recover: 0.3, dmg: 65, range: 11, knock: 18, up: 10, hitstun: 0.6, anim: 'slam', aoe: true, sfx: true },
};

export class Monster {
  constructor(G, def, spawnPos, yaw, isPlayer) {
    this.G = G;
    this.def = def;
    this.isPlayer = isPlayer;
    const rig = def.build(G.scene);
    this.rig = rig;
    this.root = rig.root;
    this.nodes = rig.nodes;
    this.tintable = rig.tintable;
    this.meshes = rig.meshes;

    this.pos = spawnPos.clone();
    this.vel = V3();
    this.yaw = yaw;
    this.visYaw = yaw;
    this.aimYaw = null; // when a number (player mouse-look), facing is manual and auto-aim is off
    this.height = def.height;
    this.radius = def.radius;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.energy = 50;
    this.alive = true;
    this.onGround = true;
    this.jumps = 0;

    this.state = 'idle';        // idle|run|air|climb|attack|special|hitstun|launched|down|grab|grabbed|block|dodge|throw|dead
    this.stateT = 0;
    this.move = null;           // current melee move
    this.moveHit = null;        // set of things already hit this swing
    this.chainQueued = false;
    this.animName = 'idle';
    this.animT = 0;
    this.walkPhase = 0;
    this.iframes = 0;
    this.dodgeCd = 0;
    this.heldProp = null;
    this.grabVictim = null;
    this.grabbedBy = null;
    this.climb = null;          // {building, nx, nz}
    this.target = null;
    this.stepT = 0;
    this.landDust = false;

    this.root.position.copyFrom(this.pos);
    this.root.rotation.y = this.yaw;
  }

  get center() { return this.pos.add(V3(0, this.height * 0.55, 0)); }
  get fwd() { return fwdOf(this.yaw); }
  busy() { return ['attack', 'special', 'hitstun', 'launched', 'down', 'grab', 'grabbed', 'dodge', 'throw', 'dead'].includes(this.state); }

  // ============================== damage / health ==============================
  applyDamage(dmg, { from = null, knock = null, hitstun = 0.35, launch = false, blocked = false } = {}) {
    if (!this.alive || this.iframes > 0) return 0;
    if (this.state === 'block' && !blocked && from) {
      // frontal block check
      const toAtk = from.pos.subtract(this.pos); toAtk.y = 0;
      if (toAtk.length() > 0.1 && BABYLON.Vector3.Dot(toAtk.normalize(), this.fwd) > -0.2) {
        dmg *= 0.15;
        blocked = true;
        this.G.audio.block();
      }
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.G.hud.poke(this);
    if (from) from.gainEnergy(dmg * 0.08);
    this.gainEnergy(dmg * 0.05);

    if (!blocked) {
      this.G.effects.flashMesh(this);
      if (this.grabVictim) this.releaseGrab();
      if (knock) {
        this.vel.x = knock.x / this.def.weight;
        this.vel.z = knock.z / this.def.weight;
        if (knock.y > 0) this.vel.y = Math.max(this.vel.y, knock.y / this.def.weight);
      }
      this.climb = null;
      if (this.heldProp) this.dropProp();
      if (this.hp <= 0) { this.die(from); return dmg; }
      if (launch || (knock && knock.y > 12)) {
        this.setState('launched');
        this.onGround = false;
      } else if (hitstun > 0) {
        this.setState('hitstun');
        this.hitstunT = hitstun;
      }
    } else if (knock) {
      this.vel.x += knock.x * 0.4; this.vel.z += knock.z * 0.4;
    }
    return dmg;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); this.G.hud.poke(this); }
  gainEnergy(amount) { this.energy = clamp(this.energy + amount, 0, 100); }

  die(killer) {
    this.alive = false;
    this.setState('dead');
    this.G.audio.ko();
    this.G.effects.shake(1.4);
    this.G.effects.dust(this.pos.clone(), 8, 40);
    if (this.heldProp) this.dropProp();
    if (this.grabVictim) this.releaseGrab();
    this.G.onKO && this.G.onKO(this, killer);
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  playAnim(name) { this.animName = name; this.animT = 0; }

  // ============================== main update ==============================
  update(dt, intents) {
    const G = this.G;
    this.stateT += dt;
    this.animT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.alive) this.gainEnergy(this.def.energyRegen * dt);

    if (this.state === 'dead') { this.updateDead(dt); this.syncMesh(dt); return; }
    if (this.state === 'grabbed') { this.syncMesh(dt); return; } // grabber drives us

    const i = intents || {};

    // FPS-style mouse look: the character's facing is driven by the camera aim.
    // Snap yaw to it up front so melee/special/grab all fire where you point;
    // auto-facing and auto-aim (below) are gated off while aimYaw is set.
    this.aimYaw = (typeof i.aimYaw === 'number') ? i.aimYaw : null;
    if (this.aimYaw !== null && this.state !== 'climb' && this.state !== 'grabbed') {
      this.yaw = this.aimYaw;
    }

    switch (this.state) {
      case 'idle': case 'run': case 'air': case 'block':
        this.updateLocomotion(dt, i);
        break;
      case 'climb': this.updateClimb(dt, i); break;
      case 'dodge':
        if (this.stateT > 0.28) { this.iframes = 0; this.setState(this.onGround ? 'idle' : 'air'); }
        break;
      case 'attack': case 'special': this.updateAttack(dt, i); break;
      case 'throw':
        if (this.stateT > 0.32) this.setState('idle');
        break;
      case 'grab': this.updateGrabHold(dt, i); break;
      case 'hitstun':
        if (this.stateT >= this.hitstunT) this.setState(this.onGround ? 'idle' : 'air');
        break;
      case 'launched': break; // physics resolves it
      case 'down':
        if (this.stateT > 1.15) { this.setState('idle'); this.iframes = 0.6; }
        break;
    }

    // physics for everything except climbing/grabbed
    if (this.state !== 'climb') this.updatePhysics(dt);
    this.updateAnimation(dt);
    this.syncMesh(dt);
  }

  // ============================== locomotion ==============================
  updateLocomotion(dt, i) {
    const def = this.def;
    const mx = i.mx || 0, mz = i.mz || 0;
    const mag = Math.min(1, Math.hypot(mx, mz));
    const wantYaw = mag > 0.05 ? Math.atan2(mx, mz) : this.yaw;

    // --- block ---
    if (i.block && this.onGround) {
      if (this.state !== 'block') this.setState('block');
      this.vel.x = lerp(this.vel.x, 0, damp(12, dt));
      this.vel.z = lerp(this.vel.z, 0, damp(12, dt));
      // face the enemy while blocking (unless the player is aiming manually)
      if (this.aimYaw === null && this.target && this.target.alive) this.yaw = angleLerp(this.yaw, yawTo(this.pos, this.target.pos), damp(10, dt));
      if (!i.block) this.setState('idle');
      return;
    } else if (this.state === 'block') this.setState('idle');

    // --- dodge ---
    if (i.dodge && this.dodgeCd <= 0 && mag > 0.05) {
      this.setState('dodge');
      this.iframes = 0.3;
      this.dodgeCd = 0.8;
      const spd = 34;
      this.vel.x = (mx / mag) * spd;
      this.vel.z = (mz / mag) * spd;
      this.G.audio.jump();
      this.playAnim('dodge');
      return;
    }

    // --- steering ---
    const accel = this.onGround ? 90 : 90 * AIR_CTRL;
    const maxSpd = def.speed * (this.onGround ? 1 : 1.05);
    this.vel.x = clamp(this.vel.x + mx * accel * dt, -maxSpd * 1.4, maxSpd * 1.4);
    this.vel.z = clamp(this.vel.z + mz * accel * dt, -maxSpd * 1.4, maxSpd * 1.4);
    if (this.onGround && mag < 0.05) {
      this.vel.x = lerp(this.vel.x, 0, damp(10, dt));
      this.vel.z = lerp(this.vel.z, 0, damp(10, dt));
    }
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    if (hsp > maxSpd && this.onGround) {
      this.vel.x *= maxSpd / hsp;
      this.vel.z *= maxSpd / hsp;
    }
    if (this.aimYaw === null && mag > 0.05) this.yaw = angleLerp(this.yaw, wantYaw, damp(11, dt));

    // --- jump / glide ---
    if (i.jump) {
      if (this.onGround) {
        this.vel.y = def.jump;
        this.onGround = false;
        this.jumps = 1;
        this.G.audio.jump();
        this.G.effects.dust(this.pos.clone(), 3.5, 10);
      } else if (this.jumps < 2) {
        this.vel.y = def.jump * 0.85;
        this.jumps = 2;
        this.G.audio.jump();
      }
    }
    if (def.glide && !this.onGround && i.jumpHeld && this.vel.y < -6) this.vel.y = -6;

    // --- actions ---
    if (i.special && this.energy >= def.special.cost && !this.heldProp) { this.startSpecial(); return; }
    if (i.light || i.heavy) {
      if (this.heldProp) { this.throwProp(); return; }
      if (!this.onGround && i.heavy) { this.startMove('airslam'); return; }
      this.startMove(i.heavy ? 'heavy' : 'light1');
      return;
    }
    if (i.grab) {
      if (this.heldProp) { this.throwProp(); return; }
      this.tryGrab();
      return;
    }

    this.setState(this.onGround ? (hsp > 1.5 ? 'run' : 'idle') : 'air');
  }

  // ============================== physics ==============================
  updatePhysics(dt) {
    const G = this.G;
    if (!this.onGround) this.vel.y += GRAV * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // walls
    const hit = G.city.resolveCollision(this.pos, this.radius, this.height);
    if (hit) {
      const hspeed = Math.hypot(this.vel.x, this.vel.z);
      if (this.state === 'launched' && hspeed > 18) {
        // slammed into a building — the WotM special
        hit.building.applyDamage(60 + hspeed * 2.2, this.pos.y + this.height * 0.5, G);
        G.effects.dust(this.center, 6, 24);
        G.effects.shake(0.8);
        G.audio.hit(true);
        this.hp = Math.max(0, this.hp - 25);
        G.hud.poke(this);
        if (this.hp <= 0) { this.die(null); return; }
        this.vel.x *= -0.3; this.vel.z *= -0.3;
      } else if (!this.onGround && this.state === 'air' && this.intentTowardWall(hit)) {
        // latch on and climb
        this.climb = hit;
        this.setState('climb');
        this.vel.set(0, 0, 0);
        this.playAnim('climb');
      } else {
        if (hit.nx) this.vel.x = 0;
        if (hit.nz) this.vel.z = 0;
      }
    }

    // ground / roofs
    const gy = G.city.groundHeightAt(this.pos.x, this.pos.z, this.pos.y + 0.1);
    if (this.pos.y <= gy + 0.01) {
      const fallSpeed = -this.vel.y;
      this.pos.y = gy;
      this.vel.y = 0;
      if (!this.onGround) {
        this.onGround = true;
        this.jumps = 0;
        if (fallSpeed > 25) {
          G.effects.dust(this.pos.clone(), 5 + fallSpeed * 0.06, 18);
          G.audio.footstep(this.def.weight * 1.6);
          G.effects.shake(clamp(fallSpeed * 0.012, 0.1, 0.9));
        }
        if (this.state === 'launched') {
          const impact = fallSpeed > 30 || Math.hypot(this.vel.x, this.vel.z) > 22;
          this.vel.x *= 0.25; this.vel.z *= 0.25;
          this.setState('down');
          this.iframes = 1.4;
          if (impact) G.effects.dust(this.pos.clone(), 7, 24);
        }
        if (this.state === 'attack' && this.move === MOVES.airslam) this.resolveAirslam();
      }
    } else if (this.pos.y > gy + 0.6 && this.onGround) {
      this.onGround = false;
      if (this.jumps === 0) this.jumps = 1;
    }

    // footstep thumps
    if (this.onGround && (this.state === 'run')) {
      this.stepT -= dt * Math.hypot(this.vel.x, this.vel.z) * 0.09;
      if (this.stepT <= 0) {
        this.stepT = 1;
        this.G.audio.footstep(this.def.weight);
        if (this.def.weight > 1.3) this.G.effects.shake(0.06);
      }
    }
  }

  intentTowardWall(hit) {
    // pushing into the wall (velocity or intent toward it)?
    const inward = -(this.lastIntent?.mx || 0) * hit.nx - (this.lastIntent?.mz || 0) * hit.nz;
    return inward > 0.3;
  }

  // ============================== climbing ==============================
  updateClimb(dt, i) {
    const b = this.climb?.building;
    if (!b || !b.alive) { this.climb = null; this.setState('air'); this.onGround = false; return; }
    const { nx, nz } = this.climb;
    this.yaw = Math.atan2(-nx, -nz); // face the wall

    const climbSpd = this.def.speed * 0.55;
    // raw axes when available (player): W=up, S=down, A/D=strafe.
    // Fallback (AI): project world intent onto the wall.
    let upIn, sideIn;
    if (i.rz !== undefined) {
      upIn = i.rz;
      sideIn = i.rx;
    } else {
      upIn = -(i.mx || 0) * nx - (i.mz || 0) * nz;
      sideIn = (i.mx || 0) * -nz + (i.mz || 0) * nx;
    }
    this.pos.y += upIn * climbSpd * dt;
    this.pos.x += -nz * sideIn * climbSpd * dt;
    this.pos.z += nx * sideIn * climbSpd * dt;

    // clamp to the face
    const pad = this.radius;
    if (nx) this.pos.z = clamp(this.pos.z, b.z - b.d / 2 + 1, b.z + b.d / 2 - 1);
    else this.pos.x = clamp(this.pos.x, b.x - b.w / 2 + 1, b.x + b.w / 2 - 1);
    this.pos.x = b.x + (b.w / 2 + pad) * (nx || 0) + (nx ? 0 : this.pos.x - b.x);
    if (!nx) this.pos.x = clamp(this.pos.x, b.x - b.w / 2 + 1, b.x + b.w / 2 - 1);
    this.pos.z = nz ? b.z + (b.d / 2 + pad) * nz : clamp(this.pos.z, b.z - b.d / 2 + 1, b.z + b.d / 2 - 1);

    // top-out
    if (this.pos.y >= b.topY - 1) {
      this.pos.y = b.topY + 0.1;
      this.pos.x += -nx * (pad + 1.2);
      this.pos.z += -nz * (pad + 1.2);
      this.climb = null;
      this.onGround = true;
      this.jumps = 0;
      this.setState('idle');
      return;
    }
    if (this.pos.y <= 0.5) {
      this.pos.y = 0;
      this.climb = null;
      this.onGround = true;
      this.setState('idle');
      return;
    }
    // leap off
    if (i.jump) {
      this.climb = null;
      this.setState('air');
      this.onGround = false;
      this.jumps = 1;
      this.vel.set(nx * 22, this.def.jump * 0.9, nz * 22);
      this.G.audio.jump();
      return;
    }
    if (i.light || i.heavy) {
      // punch the building while hanging on
      b.applyDamage(45, this.pos.y + this.height * 0.5, this.G);
      this.G.audio.hit(false);
      this.playAnim('jabR');
    }
  }

  // ============================== melee ==============================
  startMove(name) {
    const mv = MOVES[name];
    this.move = mv;
    this.moveName = name;
    this.moveHit = new Set();
    this.chainQueued = false;
    this.setState('attack');
    this.playAnim(mv.anim);
    // face target if close (unless the player is aiming manually)
    if (this.aimYaw === null && this.target && this.target.alive && distXZ(this.pos, this.target.pos) < mv.range + 14) {
      this.yaw = yawTo(this.pos, this.target.pos);
    }
    if (this.onGround) { this.vel.x *= 0.3; this.vel.z *= 0.3; }
    this.G.audio.swing();
  }

  updateAttack(dt, i) {
    // Specials run their own timeline and don't use this.move, so handle them
    // first. Otherwise firing a special from a clean idle (move === null) would
    // hit the guard below and bail after startSpecial already spent the energy.
    if (this.state === 'special') { this.updateSpecial(dt); return; }
    const mv = this.move;
    if (!mv) { this.setState('idle'); return; }

    const t = this.stateT;
    if (mv === MOVES.airslam) {
      // dive until landing (resolved in physics)
      this.vel.y = Math.min(this.vel.y, -55);
      if (this.onGround) this.resolveAirslam();
      return;
    }
    if ((i.light || i.heavy) && mv.chain && t > mv.windup) this.chainQueued = i.heavy ? 'heavy' : mv.chain;

    if (t >= mv.windup && t < mv.windup + mv.active) this.meleeSweep(mv);

    if (t >= mv.windup + mv.active + mv.recover) {
      if (this.chainQueued) this.startMove(this.chainQueued);
      else { this.move = null; this.setState('idle'); }
    }
  }

  meleeSweep(mv) {
    const G = this.G;
    const reach = mv.range + this.radius;
    const hitPos = this.pos.add(this.fwd.scale(reach * 0.62)).add(V3(0, this.height * 0.55, 0));
    const r = mv.range * 0.62;

    // enemy
    const e = this.target;
    if (e && e.alive && !this.moveHit.has(e) && e.iframes <= 0 && e.state !== 'grabbed') {
      const d = BABYLON.Vector3.Distance(hitPos, e.center);
      if (d < r + e.radius) {
        this.moveHit.add(e);
        const dmg = mv.dmg * this.def.dmgMul;
        const dir = e.pos.subtract(this.pos); dir.y = 0;
        const n = dir.length() > 0.1 ? dir.normalize() : this.fwd;
        const dealt = e.applyDamage(dmg, {
          from: this,
          knock: n.scale(mv.knock).add(V3(0, mv.up, 0)),
          hitstun: mv.hitstun,
          launch: !!mv.launcher,
        });
        if (dealt > 0) {
          G.audio.hit(mv.sfx);
          G.effects.hitSpark(e.center, mv.sfx);
          G.effects.shake(mv.sfx ? 0.4 : 0.15);
        }
      }
    }
    // buildings
    for (const b of G.city.buildings) {
      if (!b.alive || this.moveHit.has(b)) continue;
      if (b.containsXZ(hitPos.x, hitPos.z, r * 0.7) && hitPos.y < b.topY + 2) {
        this.moveHit.add(b);
        b.applyDamage(mv.dmg * this.def.dmgMul * 0.9, hitPos.y, G);
      }
    }
    // props (smack cars into oblivion)
    for (const p of G.city.props) {
      if (!p.alive || p.held || this.moveHit.has(p)) continue;
      if (BABYLON.Vector3.Distance(p.pos, hitPos) < r + 3) {
        this.moveHit.add(p);
        p.destroy(G, true);
      }
    }
  }

  resolveAirslam() {
    const G = this.G;
    const mv = MOVES.airslam;
    this.move = null;
    this.setState('idle');
    G.effects.dust(this.pos.clone(), 10, 30);
    G.effects.shake(0.9);
    G.audio.explosion(0.8);
    const e = this.target;
    if (e && e.alive && e.onGround !== false && distXZ(this.pos, e.pos) < mv.range + e.radius && Math.abs(e.pos.y - this.pos.y) < 6) {
      const dir = e.pos.subtract(this.pos); dir.y = 0;
      const n = dir.length() > 0.1 ? dir.normalize() : this.fwd;
      e.applyDamage(mv.dmg * this.def.dmgMul, { from: this, knock: n.scale(mv.knock).add(V3(0, mv.up, 0)), hitstun: mv.hitstun });
    }
    for (const b of G.city.buildings) {
      if (b.alive && b.containsXZ(this.pos.x, this.pos.z, mv.range * 0.8)) b.applyDamage(70, this.pos.y, G);
    }
  }

  // ============================== special ==============================
  startSpecial() {
    const sp = this.def.special;
    this.energy -= sp.cost;
    this.setState('special');
    this.playAnim('special');
    this.specialFired = 0;
    this.specialTimer = 0.34; // windup
    if (this.aimYaw === null && this.target && this.target.alive) this.yaw = yawTo(this.pos, this.target.pos);
    this.G.audio.roar(this.def.roarPitch * 1.4);
  }

  updateSpecial(dt) {
    const sp = this.def.special;
    this.specialTimer -= dt;
    this.vel.x *= 0.9; this.vel.z *= 0.9;
    if (this.specialTimer <= 0 && this.specialFired < sp.count) {
      this.specialFired++;
      this.specialTimer = sp.interval;
      const world = this.rig.muzzle.getAbsolutePosition();
      let aim;
      if (this.aimYaw === null && this.target && this.target.alive) {
        aim = this.target.center.subtract(world);
        // lead the shot slightly and lob for gravity arcs
        if (sp.gravity) {
          const d = aim.length();
          aim.y += -sp.gravity * d / sp.speed * 0.5 * (d / sp.speed);
        }
        aim.normalize();
      } else aim = this.fwd;
      const spread = sp.count > 2 ? 0.06 : 0.02;
      aim.x += (Math.random() - 0.5) * spread * 2;
      aim.y += (Math.random() - 0.5) * spread;
      aim.z += (Math.random() - 0.5) * spread * 2;
      aim.normalize();
      this.G.projectiles.spawn({ pos: world, vel: aim.scale(sp.speed), owner: this, dmg: sp.dmg * this.def.dmgMul, radius: sp.radius, aoe: sp.aoe, gravity: sp.gravity, hue: sp.hue, color: sp.color, bDmg: sp.bDmg });
      this.G.audio.shoot(sp.kind);
    }
    if (this.specialFired >= sp.count && this.specialTimer <= -0.3) this.setState('idle');
  }

  // ============================== grabbing ==============================
  tryGrab() {
    const G = this.G;
    // 1) a prop in front?
    const grabPos = this.pos.add(this.fwd.scale(this.radius + 4));
    const prop = G.city.nearestProp(grabPos, 8);
    if (prop) {
      this.heldProp = prop;
      prop.held = true;
      prop.mesh.setParent(this.rig.handR);
      prop.mesh.position.set(0, -1, 1.5);
      prop.mesh.rotation.set(0, 0, 0);
      G.audio.grab();
      this.playAnim('lift');
      return;
    }
    // 2) the enemy?
    const e = this.target;
    if (e && e.alive && e.state !== 'grabbed' && e.state !== 'down' && e.iframes <= 0 && distXZ(this.pos, e.pos) < this.radius + e.radius + 5.5 && Math.abs(e.pos.y - this.pos.y) < 5) {
      const dot = BABYLON.Vector3.Dot(this.fwd, e.pos.subtract(this.pos).normalize());
      if (dot > 0.3) {
        this.grabVictim = e;
        e.grabbedBy = this;
        e.setState('grabbed');
        e.climb = null;
        this.setState('grab');
        this.playAnim('lift');
        G.audio.grab();
        return;
      }
    }
    // whiff
    this.playAnim('jabR');
  }

  updateGrabHold(dt, i) {
    const e = this.grabVictim;
    if (!e || !e.alive) { this.releaseGrab(); this.setState('idle'); return; }
    // hold victim in front
    const holdPos = this.pos.add(this.fwd.scale(this.radius + e.radius + 1.5)).add(V3(0, this.height * 0.35, 0));
    e.pos.copyFrom(holdPos);
    e.vel.set(0, 0, 0);
    // victim can mash? (keep simple: auto-throw after hold)
    if (this.stateT > 0.55 || i.grab || i.light || i.heavy) this.throwVictim();
  }

  throwVictim() {
    const e = this.grabVictim;
    if (!e) return;
    this.releaseGrab();
    const dir = this.fwd;
    e.iframes = 0;
    e.applyDamage(55 * this.def.dmgMul, { from: this, hitstun: 0 });
    if (e.alive) {
      e.setState('launched');
      e.onGround = false;
      e.vel.set(dir.x * 42 / e.def.weight, 16, dir.z * 42 / e.def.weight);
    }
    this.setState('throw');
    this.playAnim('throw');
    this.G.audio.throwWhoosh();
  }

  releaseGrab() {
    if (this.grabVictim) {
      const e = this.grabVictim;
      e.grabbedBy = null;
      if (e.state === 'grabbed') e.setState('idle');
      this.grabVictim = null;
    }
  }

  dropProp() {
    if (!this.heldProp) return;
    const p = this.heldProp;
    p.mesh.setParent(null);
    p.mesh.position.copyFrom(this.pos.add(this.fwd.scale(3)).add(V3(0, 1, 0)));
    p.held = false;
    this.heldProp = null;
  }

  throwProp() {
    const p = this.heldProp;
    if (!p) return;
    this.heldProp = null;
    const world = p.mesh.getAbsolutePosition().clone();
    let dir;
    if (this.aimYaw === null && this.target && this.target.alive) {
      this.yaw = yawTo(this.pos, this.target.pos);
      const to = this.target.center.subtract(world);
      const d = to.length();
      to.normalize();
      // ballistic compensation
      to.y += d * 0.011;
      dir = to.normalize();
    } else {
      dir = this.fwd.add(V3(0, 0.25, 0)).normalize();
    }
    this.G.projectiles.spawnProp(p, world, dir.scale(52), this);
    this.setState('throw');
    this.playAnim('throw');
    this.G.audio.throwWhoosh();
  }

  // ============================== death ==============================
  updateDead(dt) {
    if (this.pos.y > 0.05) {
      this.vel.y += GRAV * dt;
      this.pos.y = Math.max(0, this.pos.y + this.vel.y * dt);
    }
    if (this.stateT > 2.2) this.pos.y = Math.max(-this.height, this.pos.y - dt * 1.2); // sink
  }

  // ============================== animation ==============================
  updateAnimation(dt) {
    const n = this.nodes;
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * (4 + hsp * 0.55);
    const wp = this.walkPhase;
    const moving = hsp > 1.5 && this.onGround;
    const idleB = Math.sin(this.animT * 2.2) * 0.04;

    // --- baseline locomotion pose ---
    let legAmp = moving ? clamp(hsp * 0.045, 0.2, 0.75) : 0;
    let armSwing = legAmp * 0.6;
    const set = (node, x, y = 0, z = 0, rate = 14) => {
      if (!node) return;
      node.rotation.x = lerp(node.rotation.x, x, damp(rate, dt));
      node.rotation.y = lerp(node.rotation.y, y, damp(rate, dt));
      node.rotation.z = lerp(node.rotation.z, z, damp(rate, dt));
    };

    let hipsY = 0;
    let pose = {
      legL: [Math.sin(wp) * legAmp], legR: [Math.sin(wp + Math.PI) * legAmp],
      armL: [Math.sin(wp + Math.PI) * armSwing, 0, 0.12], armR: [Math.sin(wp) * armSwing, 0, -0.12],
      torso: [0.06 + idleB * 0.5, Math.sin(wp) * legAmp * 0.12, 0],
      head: [-0.05, 0, 0],
      tail: [0, Math.sin(wp * 0.7) * 0.25, 0],
    };
    if (moving) hipsY = Math.abs(Math.sin(wp)) * 0.25;

    if (!this.onGround && this.state !== 'climb') {
      pose.legL = [0.5]; pose.legR = [0.3];
      pose.armL = [-0.5, 0, 0.35]; pose.armR = [-0.5, 0, -0.35];
      pose.torso = [0.18, 0, 0];
    }

    // --- state/anim overlays ---
    const t = this.animT;
    const ov = (p) => smoothstep(clamp(p, 0, 1));
    switch (this.state) {
      case 'attack': {
        const mv = this.move;
        if (mv) {
          const total = mv.windup + mv.active + mv.recover;
          const p = clamp(this.stateT / total, 0, 1);
          const wEnd = mv.windup / total, aEnd = (mv.windup + mv.active) / total;
          const strike = p < wEnd ? -ov(p / wEnd) : p < aEnd ? -1 + 2 * ov((p - wEnd) / (aEnd - wEnd)) : 1 - ov((p - aEnd) / (1 - aEnd));
          // strike goes -1 (wound up) → +1 (extended) → 0
          if (this.animName === 'jabR') { pose.armR = [strike * -1.9, 0, -0.15]; pose.torso[1] = strike * -0.35; }
          else if (this.animName === 'jabL') { pose.armL = [strike * -1.9, 0, 0.15]; pose.torso[1] = strike * 0.35; }
          else if (this.animName === 'spin') { pose.armR = [strike * -1.6, 0, -0.7]; pose.armL = [strike * -1.6, 0, 0.7]; pose.torso[1] = strike * -0.8; }
          else if (this.animName === 'smash') { pose.armR = [strike * -2.4, 0, -0.3]; pose.armL = [strike * -2.4, 0, 0.3]; pose.torso[0] = 0.1 + Math.max(0, strike) * 0.5; }
          else if (this.animName === 'slam') { pose.armR = [-2.6, 0, -0.4]; pose.armL = [-2.6, 0, 0.4]; pose.torso[0] = 0.5; pose.legL = [0.8]; pose.legR = [0.8]; }
        }
        break;
      }
      case 'special': {
        const k = ov(t / 0.3);
        pose.armR = [-2.2 * k, 0, -0.5 * k];
        pose.armL = [-2.2 * k, 0, 0.5 * k];
        pose.torso[0] = -0.15 * k;
        pose.head = [-0.25 * k, 0, 0];
        break;
      }
      case 'block': pose.armR = [-1.4, 0, -0.6]; pose.armL = [-1.4, 0, 0.6]; pose.torso[0] = 0.22; break;
      case 'hitstun': {
        const sh = Math.sin(t * 40) * 0.12 * (1 - t * 2);
        pose.torso = [-0.3 + sh, sh, 0]; pose.head = [0.3, sh * 2, 0];
        pose.armL = [0.6, 0, 0.5]; pose.armR = [0.6, 0, -0.5];
        break;
      }
      case 'launched': pose.torso = [-0.7, 0, 0]; pose.armL = [-1.8, 0, 0.9]; pose.armR = [-1.8, 0, -0.9]; pose.legL = [-0.7]; pose.legR = [-0.4]; break;
      case 'grab': case 'throw': pose.armR = [-1.9, 0, -0.35]; pose.armL = [-1.9, 0, 0.35]; pose.torso[0] = 0.12; break;
      case 'grabbed': pose.legL = [0.6]; pose.legR = [0.4]; pose.armL = [-1, 0, 1]; pose.armR = [-1, 0, -1]; break;
      case 'climb': {
        const c = Math.sin(wp * 1.4);
        pose.torso = [0.5, 0, 0];
        pose.armL = [-2.2 + c * 0.4, 0, 0.3]; pose.armR = [-2.2 - c * 0.4, 0, -0.3];
        pose.legL = [0.9 + c * 0.3]; pose.legR = [0.9 - c * 0.3];
        break;
      }
      case 'dodge': pose.torso = [0.35, 0, 0]; break;
      case 'dead': break;
    }

    if (this.heldProp) { pose.armR = [-2.5, 0, -0.2]; }

    set(n.legL, ...pose.legL);
    set(n.legR, ...pose.legR);
    set(n.armL, ...pose.armL);
    set(n.armR, ...pose.armR);
    set(n.torso, ...pose.torso);
    set(n.head, ...pose.head);
    if (n.tail) set(n.tail, ...(pose.tail || [0, 0, 0]), 6);
    if (n.jaw) set(n.jaw, this.state === 'special' ? 0.5 : 0.05);
    if (n.wingL) {
      const flap = this.onGround ? Math.sin(this.animT * 6) * 0.12 : Math.sin(this.animT * 34) * 0.7;
      n.wingL.rotation.z = 0.25 + flap;
      n.wingR.rotation.z = -0.25 - flap;
    }
    this.hipsYOffset = hipsY;
  }

  syncMesh(dt) {
    // body orientation states
    let pitch = 0, deadRot = 0;
    if (this.state === 'down') pitch = -Math.PI / 2 * Math.min(1, this.stateT * 5);
    if (this.state === 'down' && this.stateT > 0.75) pitch = -Math.PI / 2 * Math.max(0, 1 - (this.stateT - 0.75) * 2.6);
    if (this.state === 'dead') deadRot = -Math.PI / 2 * Math.min(1, this.stateT * 1.6);
    if (this.state === 'launched') pitch = -0.5;

    this.visYaw = angleLerp(this.visYaw, this.yaw, damp(16, dt));
    this.root.position.copyFrom(this.pos);
    this.root.position.y += (this.hipsYOffset || 0);
    this.root.rotation.set(pitch + deadRot, this.visYaw, 0);
  }

  dispose() {
    this.root.dispose(false, true);
  }
}
