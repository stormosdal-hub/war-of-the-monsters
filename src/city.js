// Meridian City downtown — procedural destructible arena.
// Layout: 5x5 blocks (96u each) separated by 24u streets → ~600u square playfield,
// ringed by a raised highway berm + distant skyline backdrop.
import { V3, C3, rand, randi, pick, clamp, segmentVsAABB } from './util.js';

const ROAD = 24, BLOCK = 96, N = 5;
const SPAN = N * BLOCK + (N + 1) * ROAD;     // 624
export const HALF = SPAN / 2;                 // 312
export const ARENA = HALF - 6;                // playable clamp

// ---------------------------------------------------------------- textures
function makeWindowTexture(scene, tint, lit) {
  const size = 256;
  const dt = new BABYLON.DynamicTexture('winTex', { width: size, height: size }, scene, true);
  const c = dt.getContext();
  c.fillStyle = tint;
  c.fillRect(0, 0, size, size);
  const cols = 6, rows = 8, mx = 10, my = 8;
  const w = (size - mx * (cols + 1)) / cols, h = (size - my * (rows + 1)) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const on = Math.random() < lit;
      c.fillStyle = on ? (Math.random() < 0.5 ? '#ffd98a' : '#ffedbe') : (Math.random() < 0.5 ? '#131b2b' : '#1d2738');
      c.fillRect(mx + i * (w + mx), my + j * (h + my), w, h);
    }
  }
  dt.update();
  return dt;
}

function makeGroundTexture(scene) {
  const size = 2048;
  const dt = new BABYLON.DynamicTexture('groundTex', { width: size, height: size }, scene, true);
  const c = dt.getContext();
  const px = size / SPAN; // world unit → pixel
  // asphalt base
  c.fillStyle = '#33343a';
  c.fillRect(0, 0, size, size);
  // blocks (sidewalk + inner lot)
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const x0 = (ROAD + bx * (BLOCK + ROAD)) * px;
      const z0 = (ROAD + bz * (BLOCK + ROAD)) * px;
      const s = BLOCK * px;
      c.fillStyle = '#6d6a63';                       // sidewalk
      c.fillRect(x0, z0, s, s);
      if (bx === 2 && bz === 2) c.fillStyle = '#39572e'; // central park lawn
      else c.fillStyle = '#4a4640';                   // lot concrete
      c.fillRect(x0 + 6 * px, z0 + 6 * px, s - 12 * px, s - 12 * px);
    }
  }
  // lane dashes
  c.strokeStyle = '#c9b25a';
  c.lineWidth = Math.max(2, 0.7 * px);
  c.setLineDash([6 * px, 5 * px]);
  for (let i = 0; i <= N; i++) {
    const p = (ROAD / 2 + i * (BLOCK + ROAD)) * px;
    if (i < N + 1) {
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(size, p); c.stroke();
    }
  }
  c.setLineDash([]);
  // grime
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(${randi(10, 40)},${randi(10, 40)},${randi(10, 40)},${rand(0.04, 0.16)})`;
    c.beginPath();
    c.arc(rand(size), rand(size), rand(2, 26), 0, 6.28);
    c.fill();
  }
  dt.update();
  return dt;
}

// ---------------------------------------------------------------- building
let bldgCounter = 0;
export class Building {
  constructor(city, x, z, w, d, segHeights, matPool) {
    this.city = city;
    this.id = bldgCounter++;
    this.x = x; this.z = z; this.w = w; this.d = d;
    this.alive = true;
    this.rubble = null;
    this.segs = [];
    let y = 0;
    for (let i = 0; i < segHeights.length; i++) {
      const h = segHeights[i];
      const shrink = 1 - i * 0.045;
      const sw = w * shrink, sd = d * shrink;
      const mesh = BABYLON.MeshBuilder.CreateBox('bseg', { width: sw, height: h, depth: sd }, city.scene);
      mesh.position.set(x, y + h / 2, z);
      mesh.material = pick(matPool);
      mesh.receiveShadows = true;
      mesh.freezeWorldMatrix();
      this.segs.push({ mesh, h, y0: y, y1: y + h, hp: 90 + sw * sd * h * 0.012, w: sw, d: sd, alive: true });
      y += h;
    }
    this.topY = y;
    this.maxHp = this.segs.reduce((s, g) => s + g.hp, 0);
  }

  get min() { return V3(this.x - this.w / 2, 0, this.z - this.d / 2); }
  get max() { return V3(this.x + this.w / 2, this.topY, this.z + this.d / 2); }

  containsXZ(px, pz, pad = 0) {
    return px > this.x - this.w / 2 - pad && px < this.x + this.w / 2 + pad &&
           pz > this.z - this.d / 2 - pad && pz < this.z + this.d / 2 + pad;
  }

  segAt(y) {
    for (const s of this.segs) if (s.alive && y >= s.y0 - 1 && y < s.y1 + 1) return s;
    for (const s of this.segs) if (s.alive) return s;
    return null;
  }

  // Apply damage near height hitY. Returns true if something broke.
  applyDamage(amount, hitY, G) {
    if (!this.alive) return false;
    const seg = this.segAt(hitY);
    if (!seg) return false;
    seg.hp -= amount;
    const center = V3(this.x, clamp(hitY, seg.y0, seg.y1), this.z);
    if (seg.hp <= 0) {
      this.destroyFrom(this.segs.indexOf(seg), G);
      return true;
    } else if (amount > 25) {
      G.effects.spawnChunks(center, 4, 0.5, 1.4, 12, false);
      G.effects.dust(center, 4, 12);
      G.audio.crumble();
    }
    return false;
  }

  destroyFrom(idx, G) {
    const isBase = idx === 0;
    let destroyed = 0;
    for (let i = idx; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (!s.alive) continue;
      s.alive = false;
      destroyed++;
      const c = V3(this.x, (s.y0 + s.y1) / 2, this.z);
      G.effects.spawnChunks(c, Math.min(10, 3 + Math.floor(s.w * s.d / 200)), 1.2, 3.4, 14 + i * 3, true);
      G.effects.dust(c, Math.max(s.w, s.d) * 0.55, 20);
      s.mesh.dispose();
      // chance of a pickup falling out
      if (Math.random() < 0.4) {
        G.pickups.spawn(V3(this.x + rand(-this.w / 2, this.w / 2), s.y0 + 2, this.z + rand(-this.d / 2, this.d / 2)), Math.random() < 0.5 ? 'health' : 'energy');
      }
    }
    const firstAlive = this.segs.find(s => s.alive);
    this.topY = firstAlive ? this.segs.filter(s => s.alive).reduce((m, s) => Math.max(m, s.y1), 0) : 0;
    if (isBase || !firstAlive) {
      this.collapse(G);
    } else {
      G.audio.crumble();
      G.effects.shake(0.5 + destroyed * 0.2);
    }
  }

  collapse(G) {
    if (!this.alive) return;
    this.alive = false;
    for (const s of this.segs) {
      if (s.alive) { s.alive = false; s.mesh.dispose(); }
    }
    this.topY = 0;
    const c = V3(this.x, 3, this.z);
    G.effects.spawnChunks(c, 14, 1.5, 4, 20, true);
    G.effects.dust(V3(this.x, 2, this.z), Math.max(this.w, this.d) * 0.8, 60);
    G.audio.collapse();
    G.effects.shake(1.6);
    // rubble mound
    const rub = BABYLON.MeshBuilder.CreateBox('rubble', { width: this.w * 0.95, height: 3.2, depth: this.d * 0.95 }, this.city.scene);
    rub.position.set(this.x, 1.6, this.z);
    rub.rotation.y = rand(-0.2, 0.2);
    rub.material = this.city.rubbleMat;
    rub.freezeWorldMatrix();
    this.rubble = rub;
    // guaranteed pickups from a full collapse
    G.pickups.spawn(V3(this.x + rand(-4, 4), 6, this.z + rand(-4, 4)), 'health');
    if (Math.random() < 0.6) G.pickups.spawn(V3(this.x + rand(-6, 6), 6, this.z + rand(-6, 6)), 'energy');
  }
}

// ---------------------------------------------------------------- props (cars etc.)
export class Prop {
  constructor(mesh, kind, mass, dmg, hp = 30) {
    this.mesh = mesh; this.kind = kind; this.mass = mass; this.dmg = dmg;
    this.alive = true; this.held = false; this.hp = hp;
    this.explosive = kind === 'car' || kind === 'bus' || kind === 'tanker';
  }
  get pos() { return this.mesh.position; }
  destroy(G, explode = true) {
    if (!this.alive) return;
    this.alive = false;
    if (explode && this.explosive) {
      G.effects.explosion(this.mesh.position, this.kind === 'car' ? 5 : 9);
      G.audio.explosion(this.kind === 'car' ? 0.7 : 1.2);
    } else {
      G.effects.dust(this.mesh.position, 3, 10);
    }
    this.mesh.dispose();
  }
}

// ---------------------------------------------------------------- city
export class City {
  constructor(scene, G) {
    this.scene = scene;
    this.G = G;
    this.buildings = [];
    this.props = [];
    this.disposables = [];

    this.rubbleMat = new BABYLON.StandardMaterial('rubbleMat', scene);
    this.rubbleMat.diffuseColor = C3(0.34, 0.32, 0.33);
    this.rubbleMat.specularColor = C3(0.02, 0.02, 0.02);

    this.buildGround();
    this.buildSky();
    this.buildBoundary();
    this.buildBlocks();
    this.buildCars();
  }

  track(m) { this.disposables.push(m); return m; }

  buildGround() {
    const g = BABYLON.MeshBuilder.CreateGround('ground', { width: SPAN + 800, height: SPAN + 800 }, this.scene);
    const mat = new BABYLON.StandardMaterial('groundMat', this.scene);
    mat.diffuseColor = C3(0.22, 0.22, 0.24);
    mat.specularColor = C3(0.03, 0.03, 0.03);
    g.material = mat;
    g.receiveShadows = true;
    this.track(g);

    const inner = BABYLON.MeshBuilder.CreateGround('groundCity', { width: SPAN, height: SPAN }, this.scene);
    inner.position.y = 0.05;
    const mat2 = new BABYLON.StandardMaterial('groundCityMat', this.scene);
    mat2.diffuseTexture = makeGroundTexture(this.scene);
    mat2.specularColor = C3(0.04, 0.04, 0.05);
    inner.material = mat2;
    inner.receiveShadows = true;
    this.track(inner);
  }

  buildSky() {
    const sky = BABYLON.MeshBuilder.CreateSphere('sky', { diameter: 2600, segments: 12, sideOrientation: BABYLON.Mesh.BACKSIDE }, this.scene);
    const mat = new BABYLON.StandardMaterial('skyMat', this.scene);
    const dt = new BABYLON.DynamicTexture('skyTex', { width: 32, height: 256 }, this.scene, false);
    const c = dt.getContext();
    const grad = c.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1a1030');   // zenith
    grad.addColorStop(0.42, '#3d2154');
    grad.addColorStop(0.58, '#a34a2e'); // dusk band
    grad.addColorStop(0.66, '#e8933f');
    grad.addColorStop(0.76, '#2a1a2e');
    grad.addColorStop(1, '#140d18');
    c.fillStyle = grad;
    c.fillRect(0, 0, 32, 256);
    dt.update();
    mat.emissiveTexture = dt;
    mat.diffuseColor = C3(0, 0, 0);
    mat.specularColor = C3(0, 0, 0);
    mat.disableLighting = true;
    sky.material = mat;
    sky.applyFog = false;
    this.track(sky);
  }

  buildBoundary() {
    // Raised highway berm ring at arena edge + distant skyline silhouettes.
    const bermMat = new BABYLON.StandardMaterial('bermMat', this.scene);
    bermMat.diffuseColor = C3(0.3, 0.28, 0.3);
    bermMat.specularColor = C3(0.02, 0.02, 0.02);
    const mk = (w, d, x, z) => {
      const b = BABYLON.MeshBuilder.CreateBox('berm', { width: w, height: 14, depth: d }, this.scene);
      b.position.set(x, 7, z);
      b.material = bermMat;
      b.freezeWorldMatrix();
      this.track(b);
    };
    const off = HALF + 8;
    mk(SPAN + 60, 16, 0, off);
    mk(SPAN + 60, 16, 0, -off);
    mk(16, SPAN + 60, off, 0);
    mk(16, SPAN + 60, -off, 0);

    // distant skyline (non-interactive)
    const farMat = new BABYLON.StandardMaterial('farMat', this.scene);
    farMat.diffuseColor = C3(0.1, 0.07, 0.14);
    farMat.emissiveColor = C3(0.05, 0.03, 0.08);
    farMat.specularColor = C3(0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * Math.PI * 2 + rand(-0.04, 0.04);
      const r = rand(HALF + 130, HALF + 420);
      const h = rand(50, 190);
      const b = BABYLON.MeshBuilder.CreateBox('farB', { width: rand(24, 60), height: h, depth: rand(24, 60) }, this.scene);
      b.position.set(Math.sin(ang) * r, h / 2, Math.cos(ang) * r);
      b.material = farMat;
      b.freezeWorldMatrix();
      this.track(b);
    }
  }

  buildBlocks() {
    const scene = this.scene;
    // window material pool
    const matPool = [];
    const tints = [['#2e2e38', 0.5], ['#3a2f2a', 0.4], ['#28323c', 0.6], ['#39333d', 0.35], ['#2c3630', 0.45]];
    for (const [tint, lit] of tints) {
      const m = new BABYLON.StandardMaterial('bmat', scene);
      m.diffuseTexture = makeWindowTexture(scene, tint, lit);
      m.emissiveTexture = m.diffuseTexture;
      m.emissiveColor = C3(0.32, 0.3, 0.26);
      m.specularColor = C3(0.06, 0.06, 0.08);
      matPool.push(m);
    }
    this.buildingMats = matPool;

    const blockCenter = (b) => -HALF + ROAD + BLOCK / 2 + b * (BLOCK + ROAD);

    for (let bx = 0; bx < N; bx++) {
      for (let bz = 0; bz < N; bz++) {
        const cx = blockCenter(bx), cz = blockCenter(bz);
        if (bx === 2 && bz === 2) { this.buildPark(cx, cz); continue; }
        // distance from center drives height (downtown core is tallest)
        const distC = Math.max(Math.abs(bx - 2), Math.abs(bz - 2));
        const nLots = pick([2, 3, 4, 4]);
        const lots = this.splitLots(cx, cz, nLots);
        for (const lot of lots) {
          const w = clamp(lot.w * rand(0.62, 0.8), 16, 46);
          const d = clamp(lot.d * rand(0.62, 0.8), 16, 46);
          let hMin, hMax;
          if (distC === 0) { hMin = 55; hMax = 95; }
          else if (distC === 1) { hMin = 32; hMax = 70; }
          else { hMin = 18; hMax = 46; }
          const total = rand(hMin, hMax);
          const segH = rand(9, 13);
          const nSeg = Math.max(2, Math.round(total / segH));
          const segs = [];
          for (let i = 0; i < nSeg; i++) segs.push(segH * rand(0.85, 1.15));
          this.buildings.push(new Building(this, lot.x, lot.z, w, d, segs, matPool));
        }
      }
    }
  }

  splitLots(cx, cz, n) {
    const S = BLOCK - 14;
    if (n === 2) {
      return Math.random() < 0.5
        ? [{ x: cx - S / 4, z: cz, w: S / 2, d: S }, { x: cx + S / 4, z: cz, w: S / 2, d: S }]
        : [{ x: cx, z: cz - S / 4, w: S, d: S / 2 }, { x: cx, z: cz + S / 4, w: S, d: S / 2 }];
    }
    if (n === 3) {
      const lots = [{ x: cx - S / 4, z: cz - S / 4, w: S / 2, d: S / 2 }, { x: cx + S / 4, z: cz - S / 4, w: S / 2, d: S / 2 }, { x: cx, z: cz + S / 4, w: S, d: S / 2 }];
      return lots;
    }
    return [
      { x: cx - S / 4, z: cz - S / 4, w: S / 2, d: S / 2 },
      { x: cx + S / 4, z: cz - S / 4, w: S / 2, d: S / 2 },
      { x: cx - S / 4, z: cz + S / 4, w: S / 2, d: S / 2 },
      { x: cx + S / 4, z: cz + S / 4, w: S / 2, d: S / 2 },
    ];
  }

  buildPark(cx, cz) {
    const scene = this.scene;
    // pond
    const pond = BABYLON.MeshBuilder.CreateDisc('pond', { radius: 16, tessellation: 24 }, scene);
    pond.rotation.x = Math.PI / 2;
    pond.position.set(cx + 14, 0.12, cz - 10);
    const pm = new BABYLON.StandardMaterial('pondMat', scene);
    pm.diffuseColor = C3(0.1, 0.25, 0.32);
    pm.emissiveColor = C3(0.06, 0.14, 0.2);
    pm.specularColor = C3(0.5, 0.5, 0.5);
    pond.material = pm;
    this.track(pond);

    // trees — grabbable props
    const trunkMat = new BABYLON.StandardMaterial('trunkMat', scene);
    trunkMat.diffuseColor = C3(0.3, 0.2, 0.12);
    const leafMat = new BABYLON.StandardMaterial('leafMat', scene);
    leafMat.diffuseColor = C3(0.16, 0.34, 0.14);
    leafMat.specularColor = C3(0.02, 0.04, 0.02);
    for (let i = 0; i < 9; i++) {
      const tx = cx + rand(-38, 38), tz = cz + rand(-38, 38);
      if (Math.hypot(tx - (cx + 14), tz - (cz - 10)) < 18) continue;
      const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk', { height: 9, diameterBottom: 1.6, diameterTop: 1.1, tessellation: 7 }, scene);
      trunk.position.set(0, 4.5, 0);
      trunk.material = trunkMat;
      const crown = BABYLON.MeshBuilder.CreateSphere('crown', { diameter: 8, segments: 6 }, scene);
      crown.position.set(0, 10.5, 0);
      crown.material = leafMat;
      const tree = BABYLON.Mesh.MergeMeshes([trunk, crown], true, true, undefined, false, true);
      tree.position.set(tx, 0, tz);
      tree.rotation.y = rand(6.28);
      this.props.push(new Prop(tree, 'tree', 3, 35, 20));
    }

    // monument obelisk
    const ob = BABYLON.MeshBuilder.CreateCylinder('obelisk', { height: 22, diameterBottom: 4.5, diameterTop: 1.2, tessellation: 4 }, scene);
    ob.position.set(cx - 18, 11, cz + 16);
    const om = new BABYLON.StandardMaterial('obMat', scene);
    om.diffuseColor = C3(0.75, 0.72, 0.65);
    ob.material = om;
    this.props.push(new Prop(ob, 'monument', 6, 70, 60));
  }

  buildCars() {
    const scene = this.scene;
    const carCols = [C3(0.7, 0.15, 0.1), C3(0.15, 0.3, 0.6), C3(0.75, 0.7, 0.6), C3(0.2, 0.5, 0.3), C3(0.55, 0.5, 0.15), C3(0.4, 0.4, 0.45)];

    const mkCar = (x, z, rotY) => {
      const col = pick(carCols);
      const bodyMat = new BABYLON.StandardMaterial('carMat', scene);
      bodyMat.diffuseColor = col;
      bodyMat.specularColor = C3(0.5, 0.5, 0.5);
      const body = BABYLON.MeshBuilder.CreateBox('carB', { width: 2.2, height: 1, depth: 4.6 }, scene);
      body.position.y = 0.9;
      body.material = bodyMat;
      const cab = BABYLON.MeshBuilder.CreateBox('carC', { width: 2, height: 0.8, depth: 2.4 }, scene);
      cab.position.y = 1.75;
      cab.position.z = -0.2;
      cab.material = bodyMat;
      const car = BABYLON.Mesh.MergeMeshes([body, cab], true, true, undefined, false, false);
      car.material = bodyMat;
      car.position.set(x, 0, z);
      car.rotation.y = rotY;
      this.props.push(new Prop(car, 'car', 2, 55, 10));
    };

    const mkBus = (x, z, rotY) => {
      const m = new BABYLON.StandardMaterial('busMat', scene);
      m.diffuseColor = pick([C3(0.85, 0.6, 0.1), C3(0.5, 0.55, 0.6)]);
      m.specularColor = C3(0.4, 0.4, 0.4);
      const bus = BABYLON.MeshBuilder.CreateBox('bus', { width: 2.6, height: 2.6, depth: 10 }, scene);
      bus.position.set(x, 1.3, z);
      bus.rotation.y = rotY;
      bus.material = m;
      this.props.push(new Prop(bus, 'bus', 4, 95, 25));
    };

    // scatter along the street grid lines
    const roads = [];
    for (let i = 0; i <= N; i++) roads.push(-HALF + ROAD / 2 + i * (BLOCK + ROAD));
    for (let i = 0; i < 46; i++) {
      const alongX = Math.random() < 0.5;
      const road = pick(roads);
      const t = rand(-HALF + 20, HALF - 20);
      const lane = rand(-6, 6);
      const x = alongX ? t : road + lane;
      const z = alongX ? road + lane : t;
      const rot = (alongX ? Math.PI / 2 : 0) + rand(-0.25, 0.25) + (Math.random() < 0.5 ? Math.PI : 0);
      if (Math.random() < 0.12) mkBus(x, z, rot);
      else mkCar(x, z, rot);
    }
  }

  // ---------------- queries ----------------
  groundHeightAt(x, z, footY) {
    let g = 0;
    for (const b of this.buildings) {
      if (!b.alive) {
        if (b.rubble && b.containsXZ(x, z, 0) && footY > 1.5) g = Math.max(g, 3.2);
        continue;
      }
      if (b.containsXZ(x, z, 0.4) && footY > b.topY - 2.5) g = Math.max(g, b.topY);
    }
    return g;
  }

  // Push a capsule (pos at feet, radius r, height h) out of building walls.
  // Returns {building, nx, nz} of the wall hit, or null.
  resolveCollision(pos, r, h) {
    let hit = null;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (pos.y > b.topY - 0.5) continue;                 // above the roof — no wall
      if (pos.y + h < 0) continue;
      const minX = b.x - b.w / 2 - r, maxX = b.x + b.w / 2 + r;
      const minZ = b.z - b.d / 2 - r, maxZ = b.z + b.d / 2 + r;
      if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
      // find smallest push-out axis
      const dxl = pos.x - minX, dxr = maxX - pos.x;
      const dzl = pos.z - minZ, dzr = maxZ - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      let nx = 0, nz = 0;
      if (m === dxl) { pos.x = minX; nx = -1; }
      else if (m === dxr) { pos.x = maxX; nx = 1; }
      else if (m === dzl) { pos.z = minZ; nz = -1; }
      else { pos.z = maxZ; nz = 1; }
      hit = { building: b, nx, nz };
    }
    // arena bounds
    if (pos.x < -ARENA) pos.x = -ARENA;
    if (pos.x > ARENA) pos.x = ARENA;
    if (pos.z < -ARENA) pos.z = -ARENA;
    if (pos.z > ARENA) pos.z = ARENA;
    return hit;
  }

  // For projectiles: first building hit along a segment, or null.
  raycast(from, to) {
    let best = null, bestT = 1.01;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const t = segmentVsAABB(from, to, b.min, b.max);
      if (t !== null && t < bestT) { bestT = t; best = b; }
    }
    return best ? { building: best, t: bestT } : null;
  }

  nearestProp(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.props) {
      if (!p.alive || p.held) continue;
      const d = BABYLON.Vector3.Distance(p.pos, pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  update(dt, G) {
    // crush cars under monsters' feet
    for (const p of this.props) {
      if (!p.alive || p.held || p.kind !== 'car' && p.kind !== 'bus') continue;
      for (const m of G.monsters) {
        if (!m.alive || m.pos.y > 3) continue;
        const d = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
        if (d < m.radius + 2.2) { p.destroy(G, true); break; }
      }
    }
    for (let i = this.props.length - 1; i >= 0; i--) if (!this.props[i].alive) this.props.splice(i, 1);
  }

  dispose() {
    for (const b of this.buildings) {
      for (const s of b.segs) if (s.alive) s.mesh.dispose();
      if (b.rubble) b.rubble.dispose();
    }
    for (const p of this.props) if (p.alive) p.mesh.dispose();
    for (const m of this.disposables) m.dispose();
    this.buildings.length = 0;
    this.props.length = 0;
  }
}
