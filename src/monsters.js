// Original monster roster. Each def supplies stats + a procedural mesh builder
// that returns a shared "rig" contract of TransformNodes the animator drives:
//   root, hips, torso, head, armL, armR, legL, legR, (tail, wingL, wingR, jaw optional), handR
import { V3, C3, rand } from './util.js';

function mat(scene, r, g, b, opts = {}) {
  const m = new BABYLON.StandardMaterial('mm', scene);
  m.diffuseColor = C3(r, g, b);
  m.specularColor = C3(opts.spec ?? 0.15, opts.spec ?? 0.15, opts.spec ?? 0.15);
  if (opts.emissive) m.emissiveColor = C3(opts.emissive[0], opts.emissive[1], opts.emissive[2]);
  return m;
}

function node(scene, parent, x, y, z, name = 'n') {
  const n = new BABYLON.TransformNode(name, scene);
  n.parent = parent;
  n.position.set(x, y, z);
  return n;
}

function box(scene, parent, w, h, d, x, y, z, material) {
  const m = BABYLON.MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scene);
  m.parent = parent; m.position.set(x, y, z); m.material = material;
  return m;
}
function sph(scene, parent, dia, x, y, z, material, sy = 1, sz = 1) {
  const m = BABYLON.MeshBuilder.CreateSphere('p', { diameter: dia, segments: 8 }, scene);
  m.parent = parent; m.position.set(x, y, z); m.material = material;
  m.scaling.y = sy; m.scaling.z = sz;
  return m;
}
function cyl(scene, parent, h, dTop, dBot, x, y, z, material, tess = 8) {
  const m = BABYLON.MeshBuilder.CreateCylinder('p', { height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: tess }, scene);
  m.parent = parent; m.position.set(x, y, z); m.material = material;
  return m;
}

// Collect all child meshes + unique materials for tinting/dispose.
function finishRig(root, rig) {
  const meshes = root.getChildMeshes(false);
  for (const m of meshes) m.receiveShadows = false;
  const mats = new Map();
  for (const m of meshes) if (m.material && !mats.has(m.material)) mats.set(m.material, m.material.emissiveColor.clone());
  rig.meshes = meshes;
  rig.tintable = [...mats.entries()].map(([mm, base]) => ({ mat: mm, base }));
  return rig;
}

// ============================================================ RYZOR — reptile titan
function buildRyzor(scene) {
  const root = new BABYLON.TransformNode('ryzor', scene);
  const hide = mat(scene, 0.18, 0.42, 0.2);
  const belly = mat(scene, 0.65, 0.62, 0.38);
  const spine = mat(scene, 0.9, 0.42, 0.08, { emissive: [0.35, 0.1, 0] });
  const eye = mat(scene, 1, 0.6, 0.1, { emissive: [0.8, 0.4, 0] });

  const hips = node(scene, root, 0, 5.6, 0, 'hips');
  const torso = node(scene, hips, 0, 0.4, 0, 'torso');
  sph(scene, torso, 4.6, 0, 1.6, 0, hide, 1.25, 0.95);           // chest
  sph(scene, torso, 3.4, 0, 1.4, 0.9, belly, 1.1, 0.7);          // belly plate
  sph(scene, hips, 3.6, 0, -0.4, 0, hide, 0.9, 0.9);             // pelvis
  // dorsal spikes
  for (let i = 0; i < 5; i++) {
    const s = cyl(scene, torso, 1.6 + (2 - Math.abs(i - 2)) * 0.7, 0.05, 0.9, 0, 2.6 - i * 1.1, -1.5, spine, 4);
    s.rotation.x = -0.5;
  }
  const neck = node(scene, torso, 0, 3.4, 0.3, 'neck');
  const head = node(scene, neck, 0, 1.2, 0.4, 'head');
  sph(scene, head, 2.6, 0, 0.2, 0, hide, 0.9, 1.1);
  const jaw = node(scene, head, 0, -0.4, 0.7, 'jaw');
  sph(scene, jaw, 1.6, 0, -0.1, 0.7, hide, 0.5, 1.3);            // snout/jaw
  sph(scene, head, 1.7, 0, 0.5, 0.9, hide, 0.6, 1.2);            // upper snout
  sph(scene, head, 0.5, 0.75, 0.55, 0.6, eye);
  sph(scene, head, 0.5, -0.75, 0.55, 0.6, eye);
  const hornL = cyl(scene, head, 1.5, 0.05, 0.5, 0.9, 1.1, -0.4, spine, 4); hornL.rotation.z = -0.5;
  const hornR = cyl(scene, head, 1.5, 0.05, 0.5, -0.9, 1.1, -0.4, spine, 4); hornR.rotation.z = 0.5;

  const mkArm = (side) => {
    const arm = node(scene, torso, side * 2.6, 2.6, 0, side > 0 ? 'armR' : 'armL');
    sph(scene, arm, 2, 0, 0, 0, hide);                            // shoulder
    cyl(scene, arm, 3.4, 1, 1.3, side * 0.2, -1.8, 0, hide);      // upper+fore
    const hand = node(scene, arm, side * 0.3, -3.8, 0.2, side > 0 ? 'handR' : 'handL');
    sph(scene, hand, 1.7, 0, 0, 0, hide, 0.8, 1.1);
    for (let f = -1; f <= 1; f++) {
      const claw = cyl(scene, hand, 1.1, 0.03, 0.4, f * 0.55, -0.5, 0.7, belly, 4);
      claw.rotation.x = 1.2;
    }
    return { arm, hand };
  };
  const aR = mkArm(1), aL = mkArm(-1);

  const mkLeg = (side) => {
    const leg = node(scene, hips, side * 1.5, -0.6, 0, side > 0 ? 'legR' : 'legL');
    cyl(scene, leg, 3.2, 1.5, 1.9, 0, -1.4, 0, hide);
    cyl(scene, leg, 2.2, 1.1, 1.4, 0, -3.9, 0.15, hide);
    sph(scene, leg, 2.2, 0, -5, 0.6, hide, 0.55, 1.4);            // foot
    return leg;
  };
  const tail = node(scene, hips, 0, 0, -1.6, 'tail');
  let tp = tail;
  for (let i = 0; i < 4; i++) {
    sph(scene, tp, 2.4 - i * 0.45, 0, 0, -1.1, hide, 0.85, 1.3);
    tp = node(scene, tp, 0, -0.05, -2.1, 'tailSeg');
  }
  cyl(scene, tp, 1.8, 0.02, 0.8, 0, 0, -0.6, spine, 4).rotation.x = 1.5;

  return finishRig(root, { root, nodes: { hips, torso, head, neck, jaw, armL: aL.arm, armR: aR.arm, legL: mkLeg(-1), legR: mkLeg(1), tail }, handR: aR.hand, muzzle: node(scene, head, 0, 0, 1.8, 'muzzle') });
}

// ============================================================ MEGATON MK-7 — atomic-age robot
function buildMegaton(scene) {
  const root = new BABYLON.TransformNode('megaton', scene);
  const steel = mat(scene, 0.52, 0.55, 0.6, { spec: 0.7 });
  const dark = mat(scene, 0.25, 0.27, 0.32, { spec: 0.5 });
  const red = mat(scene, 0.75, 0.12, 0.08, { spec: 0.4 });
  const glow = mat(scene, 1, 0.85, 0.3, { emissive: [0.9, 0.6, 0.1] });

  const hips = node(scene, root, 0, 6.2, 0, 'hips');
  const torso = node(scene, hips, 0, 0.6, 0, 'torso');
  box(scene, torso, 5.6, 4.4, 3.6, 0, 2, 0, steel);               // chest block
  box(scene, torso, 4.2, 1.6, 3, 0, -0.6, 0, dark);               // waist
  sph(scene, torso, 2.2, 0, 2.2, 1.75, glow);                     // reactor core
  cyl(scene, torso, 1.2, 2.6, 2.6, 0, 4.6, 0, dark);              // neck ring
  // rivets
  for (const rx of [-2.5, 2.5]) for (const ry of [0.8, 3.2]) sph(scene, torso, 0.4, rx, ry, 1.85, red);

  const head = node(scene, torso, 0, 5.6, 0, 'head');
  cyl(scene, head, 2.2, 2.4, 2.8, 0, 0, 0, steel, 10);            // dome
  sph(scene, head, 2.6, 0, 1, 0, steel, 0.55, 1);
  box(scene, head, 2.2, 0.55, 0.3, 0, 0.2, 1.42, glow);           // visor
  cyl(scene, head, 1.6, 0.06, 0.22, 0, 2.2, 0, red, 6);           // antenna
  sph(scene, head, 0.45, 0, 3, 0, glow);

  const mkArm = (side) => {
    const arm = node(scene, torso, side * 3.6, 3.4, 0, side > 0 ? 'armR' : 'armL');
    sph(scene, arm, 2.6, 0, 0, 0, dark);
    box(scene, arm, 1.9, 3.4, 1.9, 0, -2, 0, steel);
    cyl(scene, arm, 2.4, 2.2, 1.7, 0, -4.6, 0, dark);
    const hand = node(scene, arm, 0, -6, 0, side > 0 ? 'handR' : 'handL');
    box(scene, hand, 2.2, 1.6, 2.2, 0, 0, 0, red);
    return { arm, hand };
  };
  const aR = mkArm(1), aL = mkArm(-1);
  // shoulder rocket pods
  box(scene, aR.arm, 2.4, 1.4, 2.4, 0, 1.4, 0, red);
  box(scene, aL.arm, 2.4, 1.4, 2.4, 0, 1.4, 0, red);

  const mkLeg = (side) => {
    const leg = node(scene, hips, side * 1.8, -0.5, 0, side > 0 ? 'legR' : 'legL');
    box(scene, leg, 2.2, 3, 2.4, 0, -1.5, 0, steel);
    cyl(scene, leg, 2.4, 1.9, 2.4, 0, -4.1, 0, dark);
    box(scene, leg, 2.6, 1.1, 3.4, 0, -5.2, 0.4, steel);          // foot
    return leg;
  };

  return finishRig(root, { root, nodes: { hips, torso, head, armL: aL.arm, armR: aR.arm, legL: mkLeg(-1), legR: mkLeg(1) }, handR: aR.hand, muzzle: node(scene, torso, 0, 3.5, 2, 'muzzle') });
}

// ============================================================ KRAGMOR — magma golem
function buildKragmor(scene) {
  const root = new BABYLON.TransformNode('kragmor', scene);
  const rock = mat(scene, 0.2, 0.17, 0.16, { spec: 0.05 });
  const rock2 = mat(scene, 0.28, 0.23, 0.2, { spec: 0.05 });
  const magma = mat(scene, 1, 0.45, 0.05, { emissive: [0.95, 0.3, 0.02] });

  const hips = node(scene, root, 0, 6, 0, 'hips');
  const torso = node(scene, hips, 0, 0.5, 0, 'torso');
  sph(scene, torso, 6.4, 0, 2, 0, rock, 1.05, 0.95);              // massive chest boulder
  sph(scene, torso, 4.4, 0, -0.4, 0, rock2, 0.8, 0.9);
  sph(scene, torso, 2, 0, 2.2, 2.5, magma);                        // molten heart
  // shoulder boulders + cracks
  sph(scene, torso, 3.4, 2.9, 3.4, 0, rock2);
  sph(scene, torso, 3.4, -2.9, 3.4, 0, rock2);
  for (let i = 0; i < 6; i++) sph(scene, torso, rand(0.5, 0.9), rand(-2.4, 2.4), rand(0.5, 3.6), rand(1.9, 2.6), magma, 0.5, 0.5);

  const head = node(scene, torso, 0, 4.6, 0.6, 'head');
  sph(scene, head, 2.4, 0, 0.3, 0, rock, 0.85, 1);
  box(scene, head, 1.7, 0.4, 0.4, 0, 0.35, 1.05, magma);          // burning gaze
  sph(scene, head, 1.4, 0, -0.5, 0.6, rock2, 0.6, 1);

  const mkArm = (side) => {
    const arm = node(scene, torso, side * 3.8, 3.2, 0, side > 0 ? 'armR' : 'armL');
    sph(scene, arm, 2.8, 0, -0.6, 0, rock);
    sph(scene, arm, 2.4, side * 0.3, -2.6, 0.1, rock2);
    const hand = node(scene, arm, side * 0.4, -4.6, 0.2, side > 0 ? 'handR' : 'handL');
    sph(scene, hand, 3, 0, 0, 0, rock);                            // boulder fist
    sph(scene, hand, 0.8, side * 0.9, 0.4, 0.9, magma, 0.5, 0.5);
    return { arm, hand };
  };
  const aR = mkArm(1), aL = mkArm(-1);

  const mkLeg = (side) => {
    const leg = node(scene, hips, side * 1.9, -0.7, 0, side > 0 ? 'legR' : 'legL');
    sph(scene, leg, 2.8, 0, -1.4, 0, rock2);
    sph(scene, leg, 2.5, 0, -3.6, 0.2, rock);
    sph(scene, leg, 2.8, 0, -5, 0.5, rock2, 0.5, 1.2);
    return leg;
  };

  return finishRig(root, { root, nodes: { hips, torso, head, armL: aL.arm, armR: aR.arm, legL: mkLeg(-1), legR: mkLeg(1) }, handR: aR.hand, muzzle: node(scene, torso, 0, 2.2, 3, 'muzzle') });
}

// ============================================================ VESPERA — wasp queen
function buildVespera(scene) {
  const root = new BABYLON.TransformNode('vespera', scene);
  const chitin = mat(scene, 0.32, 0.12, 0.4, { spec: 0.6 });
  const stripe = mat(scene, 0.85, 0.75, 0.2, { spec: 0.5 });
  const wingMat = mat(scene, 0.7, 0.85, 0.95, { spec: 0.9 });
  wingMat.alpha = 0.35;
  const eye = mat(scene, 0.5, 1, 0.3, { emissive: [0.3, 0.8, 0.1] });

  const hips = node(scene, root, 0, 5.4, 0, 'hips');
  const torso = node(scene, hips, 0, 0.4, 0, 'torso');
  sph(scene, torso, 3.6, 0, 1.6, 0, chitin, 1.2, 0.9);             // thorax
  sph(scene, torso, 2.4, 0, 0.2, 0.4, stripe, 0.7, 0.8);
  // abdomen with stinger
  const tail = node(scene, hips, 0, 0.4, -1.2, 'tail');
  sph(scene, tail, 3.8, 0, -0.4, -1.8, chitin, 1, 1.5);
  sph(scene, tail, 3, 0, -0.4, -2, stripe, 0.85, 1.1);
  cyl(scene, tail, 2.6, 0.03, 0.9, 0, -0.6, -4.6, chitin, 6).rotation.x = -1.35;

  const head = node(scene, torso, 0, 3.2, 0.5, 'head');
  sph(scene, head, 2.2, 0, 0.2, 0, chitin, 0.95, 1);
  sph(scene, head, 1.1, 0.7, 0.4, 0.65, eye, 1.2, 1);
  sph(scene, head, 1.1, -0.7, 0.4, 0.65, eye, 1.2, 1);
  for (const s of [-1, 1]) {
    const ant = cyl(scene, head, 2.2, 0.05, 0.12, s * 0.5, 1.4, 0.3, stripe, 5);
    ant.rotation.z = s * -0.5; ant.rotation.x = -0.4;
  }
  // mandibles
  for (const s of [-1, 1]) {
    const md = cyl(scene, head, 1.2, 0.05, 0.35, s * 0.5, -0.6, 0.9, stripe, 4);
    md.rotation.x = 1.1; md.rotation.z = s * 0.35;
  }

  const mkArm = (side) => {
    const arm = node(scene, torso, side * 2, 2.4, 0.3, side > 0 ? 'armR' : 'armL');
    cyl(scene, arm, 3, 0.55, 0.8, side * 0.2, -1.6, 0, chitin, 6);
    const hand = node(scene, arm, side * 0.3, -3.4, 0.2, side > 0 ? 'handR' : 'handL');
    // scythe claw
    const claw = cyl(scene, hand, 2.6, 0.04, 0.55, 0, -0.9, 0.5, stripe, 5);
    claw.rotation.x = 0.5;
    sph(scene, hand, 1, 0, 0, 0, chitin);
    return { arm, hand };
  };
  const aR = mkArm(1), aL = mkArm(-1);

  const mkLeg = (side) => {
    const leg = node(scene, hips, side * 1.2, -0.4, 0, side > 0 ? 'legR' : 'legL');
    cyl(scene, leg, 2.8, 0.7, 1, 0, -1.3, 0, chitin, 6);
    cyl(scene, leg, 2.4, 0.5, 0.7, 0, -3.6, 0.2, stripe, 6);
    sph(scene, leg, 1.3, 0, -4.8, 0.4, chitin, 0.5, 1.3);
    return leg;
  };

  const mkWing = (side) => {
    const wing = node(scene, torso, side * 1.2, 2.8, -0.9, side > 0 ? 'wingR' : 'wingL');
    const w = sph(scene, wing, 1, side * 3.4, 0.4, -1, wingMat, 0.12, 2.6);
    w.scaling.x = 3.6;
    return wing;
  };

  return finishRig(root, { root, nodes: { hips, torso, head, armL: aL.arm, armR: aR.arm, legL: mkLeg(-1), legR: mkLeg(1), tail, wingL: mkWing(-1), wingR: mkWing(1) }, handR: aR.hand, muzzle: node(scene, head, 0, -0.3, 1.4, 'muzzle') });
}

// ============================================================ roster
export const ROSTER = [
  {
    id: 'ryzor', name: 'RYZOR', tag: 'The Awakened Deep-Sea Terror',
    build: buildRyzor,
    height: 12, radius: 2.3, hp: 1000, speed: 17, jump: 40, weight: 1,
    dmgMul: 1, energyRegen: 5, roarPitch: 85,
    stats: { power: 0.7, speed: 0.65, tough: 0.6, range: 0.7 },
    special: { kind: 'orb', name: 'TIDAL PLASMA', cost: 34, count: 3, interval: 0.12, dmg: 26, speed: 62, radius: 1.1, aoe: 4, gravity: 0, hue: 'plasma', color: [0.3, 0.9, 1], bDmg: 45 },
  },
  {
    id: 'megaton', name: 'MEGATON MK-7', tag: 'Atomic-Age Defense Automaton',
    build: buildMegaton,
    height: 13, radius: 2.6, hp: 1150, speed: 13, jump: 36, weight: 1.35,
    dmgMul: 1.15, energyRegen: 4.5, roarPitch: 55,
    stats: { power: 0.85, speed: 0.4, tough: 0.8, range: 0.85 },
    special: { kind: 'rockets', name: 'FIST OF THE ATOM', cost: 44, count: 2, interval: 0.22, dmg: 44, speed: 48, radius: 1.3, aoe: 9, gravity: -14, hue: 'fire', color: [1, 0.6, 0.15], bDmg: 90 },
  },
  {
    id: 'kragmor', name: 'KRAGMOR', tag: 'Fury of the Sleeping Volcano',
    build: buildKragmor,
    height: 13.5, radius: 2.8, hp: 1300, speed: 11, jump: 34, weight: 1.6,
    dmgMul: 1.3, energyRegen: 4, roarPitch: 45,
    stats: { power: 1, speed: 0.3, tough: 1, range: 0.55 },
    special: { kind: 'magma', name: 'CALDERA BOMB', cost: 52, count: 1, interval: 0, dmg: 95, speed: 34, radius: 2.2, aoe: 13, gravity: -22, hue: 'fire', color: [1, 0.4, 0.05], bDmg: 160 },
  },
  {
    id: 'vespera', name: 'VESPERA', tag: 'Queen of the Mutant Swarm',
    build: buildVespera,
    height: 11, radius: 2.1, hp: 850, speed: 21, jump: 44, weight: 0.75,
    dmgMul: 0.85, energyRegen: 6, glide: true, roarPitch: 160,
    stats: { power: 0.5, speed: 1, tough: 0.4, range: 0.6 },
    special: { kind: 'acid', name: 'CAUSTIC VOLLEY', cost: 30, count: 4, interval: 0.09, dmg: 15, speed: 70, radius: 0.8, aoe: 3, gravity: 0, hue: 'acid', color: [0.6, 1, 0.2], bDmg: 25 },
  },
];
