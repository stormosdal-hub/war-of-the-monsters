// Visual effects: one-shot particle bursts, physical debris chunks, screen shake.
import { V3, C3, rand, clamp } from './util.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeAmt = 0;
    this.chunks = [];      // physical tumbling debris
    this.deadChunks = [];  // pool
    this.flashes = [];     // {mesh, t, dur}

    // Shared blob texture for all particle systems.
    const dt = new BABYLON.DynamicTexture('fxblob', { width: 64, height: 64 }, scene, false);
    const c = dt.getContext();
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    dt.update();
    dt.hasAlpha = true;
    this.blobTex = dt;

    // Shared chunk materials.
    this.chunkMats = [];
    for (const col of [[0.42, 0.4, 0.44], [0.55, 0.52, 0.5], [0.35, 0.33, 0.36], [0.6, 0.58, 0.55]]) {
      const m = new BABYLON.StandardMaterial('chunkMat', scene);
      m.diffuseColor = C3(col[0], col[1], col[2]);
      m.specularColor = C3(0.05, 0.05, 0.05);
      this.chunkMats.push(m);
    }
    this.chunkSrc = BABYLON.MeshBuilder.CreateBox('chunkSrc', { size: 1 }, scene);
    this.chunkSrc.isVisible = false;
  }

  shake(amount) { this.shakeAmt = Math.min(3.5, this.shakeAmt + amount); }

  // Generic one-shot particle burst.
  burst({ pos, count = 40, color1 = [1, 0.8, 0.3], color2 = [1, 0.3, 0.05], size = [1.5, 4], life = [0.3, 0.8], speed = 22, up = 8, gravity = -25, box = 1 }) {
    const ps = new BABYLON.ParticleSystem('fx', count, this.scene);
    ps.particleTexture = this.blobTex;
    ps.emitter = pos.clone();
    ps.minEmitBox = V3(-box, -box * 0.4, -box);
    ps.maxEmitBox = V3(box, box * 0.4, box);
    ps.color1 = new BABYLON.Color4(color1[0], color1[1], color1[2], 1);
    ps.color2 = new BABYLON.Color4(color2[0], color2[1], color2[2], 0.9);
    ps.colorDead = new BABYLON.Color4(color2[0] * 0.4, color2[1] * 0.4, color2[2] * 0.4, 0);
    ps.minSize = size[0]; ps.maxSize = size[1];
    ps.minLifeTime = life[0]; ps.maxLifeTime = life[1];
    ps.emitRate = 100000;
    ps.manualEmitCount = count;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = V3(0, gravity, 0);
    ps.direction1 = V3(-speed, up * 0.4, -speed);
    ps.direction2 = V3(speed, up, speed);
    ps.minAngularSpeed = -4; ps.maxAngularSpeed = 4;
    ps.targetStopDuration = life[1] + 0.1;
    ps.disposeOnStop = true;
    ps.start();
    return ps;
  }

  explosion(pos, radius = 8, hue = 'fire') {
    const cols = hue === 'plasma'
      ? { c1: [0.5, 1, 0.95], c2: [0.1, 0.55, 1] }
      : hue === 'acid'
        ? { c1: [0.75, 1, 0.3], c2: [0.25, 0.7, 0.1] }
        : { c1: [1, 0.9, 0.45], c2: [1, 0.35, 0.05] };
    this.burst({ pos, count: Math.floor(radius * 7), color1: cols.c1, color2: cols.c2, size: [radius * 0.28, radius * 0.75], life: [0.25, 0.7], speed: radius * 2.6, up: radius * 2, gravity: -6, box: radius * 0.25 });
    // smoke
    this.burst({ pos: pos.add(V3(0, radius * 0.3, 0)), count: Math.floor(radius * 3), color1: [0.25, 0.24, 0.25], color2: [0.12, 0.12, 0.13], size: [radius * 0.5, radius * 1.1], life: [0.7, 1.6], speed: radius * 1.1, up: radius * 2.4, gravity: 3, box: radius * 0.3 });
    this.shake(clamp(radius * 0.09, 0.15, 1.4));
  }

  dust(pos, radius = 6, count = 26) {
    this.burst({ pos, count, color1: [0.62, 0.58, 0.52], color2: [0.42, 0.4, 0.37], size: [radius * 0.4, radius * 0.95], life: [0.5, 1.4], speed: radius * 1.7, up: radius * 0.9, gravity: -2, box: radius * 0.4 });
  }

  hitSpark(pos, heavy = false) {
    this.burst({ pos, count: heavy ? 34 : 18, color1: [1, 1, 0.7], color2: [1, 0.5, 0.1], size: [0.7, heavy ? 2.6 : 1.7], life: [0.15, 0.4], speed: heavy ? 30 : 20, up: 14, gravity: -30, box: 0.6 });
  }

  // Physical tumbling box debris; big fast chunks can damage monsters.
  spawnChunks(pos, count, sizeMin, sizeMax, vel = 16, harmful = false) {
    for (let i = 0; i < count; i++) {
      let m = this.deadChunks.pop();
      if (!m) {
        m = this.chunkSrc.clone('chunk');
        m.material = this.chunkMats[Math.floor(rand(this.chunkMats.length))];
      }
      m.isVisible = true;
      const s = rand(sizeMin, sizeMax);
      m.scaling.set(s * rand(0.6, 1.4), s * rand(0.6, 1.4), s * rand(0.6, 1.4));
      m.position.copyFrom(pos);
      m.position.x += rand(-2, 2); m.position.y += rand(-1, 1); m.position.z += rand(-2, 2);
      m.rotation.set(rand(6.28), rand(6.28), rand(6.28));
      this.chunks.push({
        mesh: m,
        vel: V3(rand(-vel, vel), rand(vel * 0.35, vel * 1.1), rand(-vel, vel)),
        spin: V3(rand(-5, 5), rand(-5, 5), rand(-5, 5)),
        life: rand(2.4, 4.2),
        settled: 0,
        harmful,
        hitSet: harmful ? new Set() : null,
        size: s,
      });
    }
  }

  flashMesh(monster, dur = 0.12) {
    this.flashes.push({ monster, t: 0, dur });
    for (const rec of monster.tintable) rec.mat.emissiveColor = C3(0.9, 0.1, 0.05);
  }

  update(dt, monsters) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 4.2);

    // hit flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.dur) {
        for (const rec of f.monster.tintable) rec.mat.emissiveColor = rec.base;
        this.flashes.splice(i, 1);
      }
    }

    // debris chunks
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      c.vel.y -= 55 * (this.gravityScale ?? 1) * dt;
      c.mesh.position.addInPlace(c.vel.scale(dt));
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      const groundY = c.mesh.scaling.y * 0.5;
      if (c.mesh.position.y < groundY) {
        c.mesh.position.y = groundY;
        if (c.vel.y < -6) {
          c.vel.y *= -0.32;
          c.vel.x *= 0.6; c.vel.z *= 0.6;
          c.spin.scaleInPlace(0.5);
        } else {
          c.vel.set(0, 0, 0);
          c.spin.set(0, 0, 0);
          c.settled += dt;
        }
      }
      // harm monsters while moving fast
      if (c.harmful && monsters) {
        const sp = c.vel.length();
        if (sp > 14 && c.size > 1.6) {
          for (const m of monsters) {
            if (!m.alive || c.hitSet.has(m)) continue;
            const d = BABYLON.Vector3.Distance(c.mesh.position, m.pos.add(V3(0, m.height * 0.5, 0)));
            if (d < m.radius + c.size * 0.9 + 1) {
              c.hitSet.add(m);
              m.applyDamage(Math.min(60, 10 + c.size * 7), { knock: c.vel.scale(0.4), hitstun: 0.4 });
            }
          }
        }
      }
      if (c.life <= 0 || c.settled > 1.1) {
        // sink away
        c.mesh.position.y -= dt * 3;
        if (c.life < -0.8 || c.mesh.position.y < -c.mesh.scaling.y) {
          c.mesh.isVisible = false;
          this.deadChunks.push(c.mesh);
          this.chunks.splice(i, 1);
        }
      }
    }
  }
}
