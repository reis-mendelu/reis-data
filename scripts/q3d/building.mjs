// Turns flat-roofed LOD2 building parts into storey-sliced, facade-finished
// meshes. A storey is one glTF node (`storey:<level>`) holding every part's walls,
// windows and floor for that storey, plus the roof of each part whose top storey
// it is. The app lifts whole nodes off to cut the building open at a floor, so
// the slicing happens here, once, instead of clipping at runtime.
import { projector, openRing, signedArea, triangulate, inside } from './geometry.mjs';

const hexToLinear = (hex, alpha = 1) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return [...c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)), alpha];
};

export const MATERIALS = [
  { name: 'render', hex: '#6f9a9d', roughness: 0.9 },
  { name: 'glass', hex: '#7e9aa6', metallic: 0.1, roughness: 0.15 },
  { name: 'light', hex: '#dcdfe0', roughness: 0.8 },
  { name: 'plinth', hex: '#c4c0b6', roughness: 0.95 },
  { name: 'window', hex: '#2e3b42', roughness: 0.2 },
  { name: 'slab', hex: '#e4e6e4', roughness: 0.8 },
  { name: 'gravel', hex: '#b8b0a1', roughness: 1 },
  { name: 'silver', hex: '#c6ccd2', metallic: 0.5, roughness: 0.4 },
  { name: 'glassRoof', hex: '#a7c3cb', metallic: 0.1, roughness: 0.2 },
  { name: 'floor', hex: '#d6d3cc', roughness: 1 },
];
const MAT = Object.fromEntries(MATERIALS.map((m, i) => [m.name, i]));
const UNDERGROUND_STYLE_LEVELS = new Set([-2, -1]);

/** One quad, wound so its face normal points along `normal`. */
function pushQuad(prim, corners, normal) {
  const base = prim.positions.length / 3;
  for (const c of corners) {
    prim.positions.push(...c);
    prim.normals.push(...normal);
  }
  const [a, b, c] = corners;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const agrees = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] >= 0;
  prim.indices.push(...(agrees ? [base, base + 1, base + 2, base, base + 2, base + 3] : [base, base + 2, base + 1, base, base + 3, base + 2]));
}

/** A horizontal polygon at height y, facing up. */
function pushCap(prim, ring, y) {
  const base = prim.positions.length / 3;
  for (const [x, z] of ring) {
    prim.positions.push(x, y, z);
    prim.normals.push(0, 1, 0);
  }
  for (const [a, b, c] of triangulate(ring)) {
    // triangulate() winds CCW in (x, z); with z pointing south that faces DOWN,
    // so reverse each triangle to face up.
    prim.indices.push(base + a, base + c, base + b);
  }
}

/**
 * @param {object} input
 * @param {[number, number]} input.anchor [lng, lat]
 * @param {{part: number, bldgheight: number, ring: number[][]}[]} input.parts
 * @param {{level: number, elevation: number}[]} input.storeys ascending
 * @param {Record<number, {wall: string, windows: 'punched'|'slabs'|'none', spacing?: number, roof: string}>} input.styles by part id
 * @param {{a: number, b: number, c: number}} input.ground y = a + b·x + c·z
 */
export function buildStoreyNodes({ anchor, parts, storeys, styles, ground }) {
  const project = projector(anchor);
  const shapes = parts.map((p) => {
    let ring = openRing(p.ring.map(project));
    if (signedArea(ring) < 0) ring = ring.reverse();
    return { id: p.part, height: p.bldgheight, ring, style: styles[p.part] };
  });
  const groundAt = (x, z) => ground.a + ground.b * x + ground.c * z;
  // A facade point faces into a neighbouring part that is at least this tall: no window there.
  const covered = (self, x, z, y) => shapes.some((s) => s !== self && s.height > y && inside([x, z], s.ring));

  const nodes = storeys.map((s) => ({
    name: `storey:${s.level}`,
    extras: { level: s.level },
    primitives: MATERIALS.map((_, material) => ({ material, positions: [], normals: [], indices: [] })),
  }));

  for (const shape of shapes) {
    const live = storeys.filter((s) => s.elevation < shape.height - 0.3);
    live.forEach((s, i) => {
      const node = nodes[storeys.indexOf(s)];
      const top = i === live.length - 1 ? shape.height : live[i + 1].elevation;
      const wallMat = UNDERGROUND_STYLE_LEVELS.has(s.level) ? MAT.plinth : MAT[shape.style.wall];
      pushCap(node.primitives[MAT.floor], shape.ring, s.elevation);
      if (i === live.length - 1) pushCap(node.primitives[MAT[shape.style.roof]], shape.ring, shape.height);
      for (let k = 0; k < shape.ring.length; k++) {
        const [ax, az] = shape.ring[k];
        const [bx, bz] = shape.ring[(k + 1) % shape.ring.length];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const [dx, dz] = [(bx - ax) / len, (bz - az) / len];
        // Outward normal: whichever perpendicular points out of the ring.
        let [nx, nz] = [dz, -dx];
        const mid = [(ax + bx) / 2, (az + bz) / 2];
        if (inside([mid[0] + nx * 0.05, mid[1] + nz * 0.05], shape.ring)) [nx, nz] = [-nx, -nz];
        const normal = [nx, 0, nz];
        pushQuad(node.primitives[wallMat], [[ax, s.elevation, az], [bx, s.elevation, bz], [bx, top, bz], [ax, top, az]], normal);
        addFacade(node, shape, s, top, { ax, az, dx, dz, nx, nz, len, normal }, groundAt, covered);
      }
    });
  }
  return nodes;
}

function addFacade(node, shape, storey, top, e, groundAt, covered) {
  const { windows, spacing = 3 } = shape.style;
  if (windows === 'none' || UNDERGROUND_STYLE_LEVELS.has(storey.level)) return;
  const off = 0.04;
  const at = (t, y) => [e.ax + e.dx * t + e.nx * off, y, e.az + e.dz * t + e.nz * off];
  if (windows === 'slabs') {
    // Glazed walls: a light floor-slab band at the storey line.
    const y0 = storey.elevation;
    const mx = e.ax + e.dx * e.len * 0.5 + e.nx * 0.4;
    const mz = e.az + e.dz * e.len * 0.5 + e.nz * 0.4;
    if (covered(shape, mx, mz, y0 + 0.3) || y0 + 0.5 < groundAt(mx, mz)) return;
    pushQuad(node.primitives[MAT.slab], [at(0, y0), at(e.len, y0), at(e.len, y0 + 0.55), at(0, y0 + 0.55)], e.normal);
    return;
  }
  const [sill, head, width] = [storey.elevation + 0.9, Math.min(storey.elevation + 2.5, top - 0.3), 1.5];
  if (head - sill < 1 || e.len < width + 1) return;
  const count = Math.floor((e.len - 1) / spacing);
  const start = (e.len - (count - 1) * spacing) / 2;
  for (let w = 0; w < count; w++) {
    const t = start + w * spacing;
    const [ox, oz] = [e.ax + e.dx * t + e.nx * 0.4, e.az + e.dz * t + e.nz * 0.4];
    if (sill < groundAt(ox, oz) + 0.2 || covered(shape, ox, oz, (sill + head) / 2)) continue;
    const [t0, t1] = [t - width / 2, t + width / 2];
    pushQuad(node.primitives[MAT.window], [at(t0, sill), at(t1, sill), at(t1, head), at(t0, head)], e.normal);
  }
}

/**
 * A barrel-vaulted front added to one edge of a part: the roof curves from the
 * part's height down to `eave` over `depth` metres, then a wall drops to the base.
 * LOD2 records a roof by its flat top, so a curved roof that sweeps down past the
 * flat part (Q's north block) is missing from the source and has to be added.
 * Returns the extension's footprint so callers can include it in the shell.
 */
export function addCurvedFront(nodes, storeys, { anchor, part, edgeIndex, depth, eave, wall, roof, steps = 8 }) {
  const project = projector(anchor);
  let ring = openRing(part.ring.map(project));
  if (signedArea(ring) < 0) ring = ring.reverse();
  const [a, b] = [ring[edgeIndex], ring[(edgeIndex + 1) % ring.length]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [dx, dz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let [nx, nz] = [dz, -dx];
  if (inside([(a[0] + b[0]) / 2 + nx * 0.05, (a[1] + b[1]) / 2 + nz * 0.05], ring)) [nx, nz] = [-nx, -nz];
  const H = part.bldgheight;
  const off = (p, t) => [p[0] + nx * t, p[1] + nz * t];
  // Quarter ellipse: flat where it leaves the roof, vertical where it meets the wall.
  const profile = [...Array(steps + 1).keys()].map((i) => {
    const t = (i / steps) * depth;
    return [t, eave + (H - eave) * Math.sqrt(Math.max(0, 1 - (t / depth) ** 2))];
  });
  const topLevel = storeys.filter((s) => s.elevation < eave).at(-1);
  const top = nodes[storeys.indexOf(topLevel)];
  for (let i = 0; i < steps; i++) {
    const [[t0, y0], [t1, y1]] = [profile[i], profile[i + 1]];
    const [px, py] = [t1 - t0, y1 - y0];
    const n = Math.hypot(px, py);
    const normal = [nx * (-py / n), px / n, nz * (-py / n)];
    const [p0, p1] = [off(a, t0), off(a, t1)];
    const [q0, q1] = [off(b, t0), off(b, t1)];
    pushQuad(top.primitives[MAT[roof]], [[p0[0], y0, p0[1]], [q0[0], y0, q0[1]], [q1[0], y1, q1[1]], [p1[0], y1, p1[1]]], normal);
  }
  // The two gable ends above the eave: a fan from the eave corner.
  for (const [end, sign] of [[a, -1], [b, 1]]) {
    const prim = top.primitives[MAT[wall]];
    const base = prim.positions.length / 3;
    const normal = [dx * sign, 0, dz * sign];
    const pts = [[depth, eave], [0, eave], ...profile];
    for (const [t, y] of pts) {
      const p = off(end, t);
      prim.positions.push(p[0], y, p[1]);
      prim.normals.push(...normal);
    }
    // Wind the fan to agree with the normal, checked on its first triangle.
    const P = (k) => prim.positions.slice((base + k) * 3, (base + k) * 3 + 3);
    const [o, u, v] = [P(0), P(1), P(2)];
    const e1 = [u[0] - o[0], u[1] - o[1], u[2] - o[2]];
    const e2 = [v[0] - o[0], v[1] - o[1], v[2] - o[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * normal[0] + cz * normal[2] < 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const tri = [base, base + i, base + i + 1];
      prim.indices.push(...(flip ? [tri[0], tri[2], tri[1]] : tri));
    }
  }
  const footprint = [a, b, off(b, depth), off(a, depth)];
  // Walls below the eave, sliced per storey like every other part.
  const walls = [[off(a, depth), off(b, depth), [nx, 0, nz]], [a, off(a, depth), [-dx, 0, -dz]], [off(b, depth), b, [dx, 0, dz]]];
  const live = storeys.filter((s) => s.elevation < eave);
  live.forEach((s, i) => {
    const node = nodes[storeys.indexOf(s)];
    const y1 = i === live.length - 1 ? eave : live[i + 1].elevation;
    const mat = UNDERGROUND_STYLE_LEVELS.has(s.level) ? MAT.plinth : MAT[wall];
    pushCap(node.primitives[MAT.floor], footprint, s.elevation);
    for (const [p, q, normal] of walls)
      pushQuad(node.primitives[mat], [[p[0], s.elevation, p[1]], [q[0], s.elevation, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], normal);
  });
  return footprint;
}

export const glbMaterials = () =>
  MATERIALS.map((m) => ({ name: m.name, color: hexToLinear(m.hex), metallic: m.metallic, roughness: m.roughness }));

/** Index of the ring edge whose outward normal points most nearly along (dirX, dirZ). */
export function edgeFacing(part, anchor, [dirX, dirZ]) {
  const project = projector(anchor);
  let ring = openRing(part.ring.map(project));
  if (signedArea(ring) < 0) ring = ring.reverse();
  let best = -1;
  let score = -Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) return;
    let [nx, nz] = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    if (inside([(a[0] + b[0]) / 2 + nx * 0.05, (a[1] + b[1]) / 2 + nz * 0.05], ring)) [nx, nz] = [-nx, -nz];
    const s = (nx * dirX + nz * dirZ) * Math.min(len, 20);
    if (s > score) [best, score] = [i, s];
  });
  return best;
}
