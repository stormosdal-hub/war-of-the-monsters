// Shared math / helper utilities.
export const V3 = (x = 0, y = 0, z = 0) => new BABYLON.Vector3(x, y, z);
export const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smoothstep = (t) => t * t * (3 - 2 * t);

// Exponential damping factor that is frame-rate independent.
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const fwdOf = (yaw) => V3(Math.sin(yaw), 0, Math.cos(yaw));

export const distXZ = (a, b) => {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
};

// Distance from point p to vertical segment (x,z, y0..y1) — capsule axis test.
export function distToCapsule(p, cx, cz, y0, y1) {
  const cy = clamp(p.y, y0, y1);
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Ray (segment from->to) vs AABB. Returns t in [0,1] of entry or null.
export function segmentVsAABB(from, to, min, max) {
  let tmin = 0, tmax = 1;
  const d = [to.x - from.x, to.y - from.y, to.z - from.z];
  const o = [from.x, from.y, from.z];
  const mn = [min.x, min.y, min.z], mx = [max.x, max.y, max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
