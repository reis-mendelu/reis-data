// Geometry helpers for the building models: the local metric frame, polygon
// triangulation and point-in-polygon. No dependencies, like every reis-data script.
//
// Local frame, shared with the app (reis-extension src/components/Building3D/projection.ts):
// x = metres east of the anchor, y = metres up from the building's base height,
// z = metres SOUTH of the anchor (three.js is right-handed with y up, so south is +z).

/** Metres per degree at a latitude (WGS84 series, good to centimetres at campus scale). */
export function metresPerDegree(latDeg) {
  const φ = (latDeg * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * φ) + 1.175 * Math.cos(4 * φ),
    lng: 111412.84 * Math.cos(φ) - 93.5 * Math.cos(3 * φ),
  };
}

/** [lng, lat] → [x, z] in the local frame around `anchor` ([lng, lat]). */
export function projector(anchor) {
  const m = metresPerDegree(anchor[1]);
  return ([lng, lat]) => [(lng - anchor[0]) * m.lng, -(lat - anchor[1]) * m.lat];
}

/** Signed area of a ring of [x, z] points (the closing duplicate may be present). */
export function signedArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    s += x1 * z2 - x2 * z1;
  }
  return s / 2;
}

/** Drop the closing duplicate and consecutive duplicates. */
export function openRing(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
  }
  const [a, b] = [out[0], out[out.length - 1]];
  if (out.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  return out;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function inTriangle(p, a, b, c) {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
  const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
  return !(neg && pos);
}

/**
 * Ear-clipping triangulation of a simple polygon. Returns index triples into
 * `ring`, wound counter-clockwise in (x, z) — which is what an upward-facing
 * face needs once z points south.
 */
export function triangulate(ring) {
  const n = ring.length;
  const idx = [...Array(n).keys()];
  if (signedArea(ring) < 0) idx.reverse(); // work on a CCW ring
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const [ia, ib, ic] = [idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]];
      const [a, b, c] = [ring[ia], ring[ib], ring[ic]];
      const turn = cross(a, b, c);
      if (turn <= 1e-9) {
        // Reflex, or a collinear point that adds nothing: drop collinear ones outright.
        if (Math.abs(turn) <= 1e-9) {
          idx.splice(i, 1);
          clipped = true;
          break;
        }
        continue;
      }
      const blocked = idx.some((j) => j !== ia && j !== ib && j !== ic && inTriangle(ring[j], a, b, c));
      if (blocked) continue;
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('triangulate: polygon is not simple');
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** Even-odd point-in-polygon on [x, z] rings. */
export function inside(p, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Distance from a point to the nearest edge of a ring. */
export function distanceToRing(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)));
  }
  return best;
}

/** Least-squares plane y = a + b·x + c·z through [x, z, y] samples. */
export function fitPlane(samples) {
  let [n, sx, sz, sy, sxx, szz, sxz, sxy, szy] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const [x, z, y] of samples) {
    n++;
    sx += x;
    sz += z;
    sy += y;
    sxx += x * x;
    szz += z * z;
    sxz += x * z;
    sxy += x * y;
    szy += z * y;
  }
  // Normal equations, solved by Cramer's rule on the 3×3 system.
  const M = [
    [n, sx, sz],
    [sx, sxx, sxz],
    [sz, sxz, szz],
  ];
  const r = [sy, sxy, szy];
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  const col = (k) => M.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)));
  return { a: det(col(0)) / D, b: det(col(1)) / D, c: det(col(2)) / D };
}
