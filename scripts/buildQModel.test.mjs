// Run: node --test scripts/*.test.mjs   (from the reis-data repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQ, loadQSources, Q_ANCHOR, Q_STOREYS } from './buildQModel.mjs';
import { readGlb } from './q3d/glb.mjs';
import { projector, inside, distanceToRing, triangulate } from './q3d/geometry.mjs';

const sources = loadQSources();
const { glb, meta, shell } = buildQ(sources);
const { json } = readGlb(glb);

test('the committed model is what the generator produces', () => {
  const committed = readFileSync(new URL('../map/3d/Q.glb', import.meta.url));
  assert.ok(Buffer.from(glb).equals(committed), 'map/3d/Q.glb is stale: run node scripts/buildQModel.mjs');
  const committedMeta = JSON.parse(readFileSync(new URL('../map/3d/Q.json', import.meta.url), 'utf8'));
  assert.deepEqual(committedMeta, JSON.parse(JSON.stringify(meta)));
});

test('stays inside the app budget: < 1.5 MB, < 20k triangles, no textures or compression', () => {
  assert.ok(glb.byteLength < 1.5 * 1024 * 1024, `${glb.byteLength} bytes`);
  const triangles = json.meshes
    .flatMap((m) => m.primitives)
    .reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
  assert.ok(triangles < 20000, `${triangles} triangles`);
  assert.equal(json.images, undefined);
  assert.equal(json.textures, undefined);
  assert.equal(json.extensionsUsed, undefined);
});

test('one node per storey, named and tagged with its level — the cutaway depends on it', () => {
  const levels = json.nodes.map((n) => n.extras.level);
  assert.deepEqual(levels, Q_STOREYS.map((s) => s.level));
  assert.deepEqual(json.nodes.map((n) => n.name), Q_STOREYS.map((s) => `storey:${s.level}`));
});

test('storey heights chain up to the tallest part', () => {
  for (let i = 0; i < meta.storeys.length - 1; i++)
    assert.equal(+(meta.storeys[i].elevation + meta.storeys[i].height).toFixed(3), meta.storeys[i + 1].elevation);
  const last = meta.storeys.at(-1);
  assert.equal(+(last.elevation + last.height).toFixed(3), meta.height);
});

test('every Q floor outline sits within 1.5 m of the shell (the anchor is right)', () => {
  const project = projector(Q_ANCHOR);
  const rooms = JSON.parse(readFileSync(new URL('../map/rooms-0.geojson', import.meta.url), 'utf8'));
  const outside = [];
  for (const f of rooms.features) {
    for (const ring of f.geometry.coordinates) {
      for (const pt of ring) {
        const p = project(pt);
        if (shell.some((r) => inside(p, r))) continue;
        const d = Math.min(...shell.map((r) => distanceToRing(p, r)));
        if (d > 1.5) outside.push(`${f.properties.id} (floor ${f.properties.floorLevel}): ${d.toFixed(2)} m`);
      }
    }
  }
  assert.deepEqual(outside, []);
});

test('ground plane falls to the west, as the terrain does', () => {
  assert.ok(meta.ground.b > 0, 'height should rise towards the east');
});

test('triangulate handles a concave ring and drops collinear points', () => {
  const U = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 1.5]];
  const tris = triangulate(U);
  const area = tris.reduce((s, [a, b, c]) => {
    const [p, q, r] = [U[a], U[b], U[c]];
    return s + Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
  }, 0);
  assert.equal(area, 7);
});
