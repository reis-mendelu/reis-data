// Builds the 3D model of budova Q for the app's building card:
//   node scripts/buildQModel.mjs   → map/3d/Q.glb + map/3d/Q.json
//
// Everything here is derived from committed sources (source/3d/Q/README.md):
// Brno's LOD2 parts (flat roofs, so footprint + base + height IS the LOD2
// geometry), ČÚZK DMR 5G terrain samples, and Q's floor list from
// source/mendelu-buildings.json. The facade finishing — colours and window bands —
// is chosen here from reference photos instead of in Blender, so it stays
// reproducible and reviewable.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projector, fitPlane, openRing } from './q3d/geometry.mjs';
import { writeGlb } from './q3d/glb.mjs';
import { buildStoreyNodes, glbMaterials, addCurvedFront, edgeFacing } from './q3d/building.mjs';

export const Q_BUILDING_ID = 0;
// buildings.json's centre of Q — the local frame's origin in the app too.
export const Q_ANCHOR = [16.614247303030304, 49.20959154545455];

/**
 * Storey elevations in metres above Brno's `baseheight` (231.66 m). The parts
 * step at the storeys: the west wing's roof (22.18) tops the 3rd floor, the east
 * wing's (25.62) the 4th, the south wing's (28.75) the 5th — 3.35 m per storey
 * above the podium, whose roofs (12.10 / 12.79) top floor 0. The terrain puts
 * floor 0 at street level on the east (ground ≈ +8.3 m) while −2 and −1 open
 * onto the lower west side, which is why the base sits two storeys down.
 */
export const Q_STOREYS = [
  { level: -2, elevation: 0 },
  { level: -1, elevation: 4.1 },
  { level: 0, elevation: 8.2 },
  { level: 1, elevation: 12.1 },
  { level: 2, elevation: 15.45 },
  { level: 3, elevation: 18.8 },
  { level: 4, elevation: 22.15 },
  { level: 5, elevation: 25.5 },
];

// Facades from Wikimedia Commons photos of Q (source/3d/Q/README.md): teal
// render with punched windows on the south and east wings, a glass curtain wall
// on the west wing and the foyer ring, the low north block (library/aula) light
// with a silver roof, a glazed courtyard roof.
export const Q_STYLES = {
  50580: { wall: 'render', windows: 'punched', spacing: 2.6, roof: 'gravel' }, // south wing
  50583: { wall: 'render', windows: 'punched', spacing: 4.2, roof: 'gravel' }, // east wing
  50582: { wall: 'glass', windows: 'slabs', roof: 'gravel' }, // west wing
  50584: { wall: 'glass', windows: 'slabs', roof: 'gravel' }, // foyer ring
  50585: { wall: 'light', windows: 'punched', spacing: 3.2, roof: 'silver' }, // north block
  50581: { wall: 'glass', windows: 'none', roof: 'glassRoof' }, // courtyard hall
};
// The north block's silver roof sweeps down past its flat top towards the
// north — the reference photos show it — and LOD2 keeps only the flat top, so
// the lecture halls Q01–Q03 stuck out of the model by 5.2 m. This adds the
// curved front back; the alignment test is what caught it.
export const Q_CURVED_FRONT = { part: 50585, facing: [0, -1], depth: 5.5, eave: 9, wall: 'light', roof: 'silver' };
// From just west of south: the phone shows this card under a north-up map, so
// the east wing is on the right in both, and the south facade on Zemědělská —
// the one people know — faces the viewer.
export const Q_DEFAULT_AZIMUTH_DEG = 195;
export const Q_ATTRIBUTION = '3D: © Statutární město Brno, CC BY 4.0';
const GROUND_RADIUS_M = 90;

export function buildQ({ parts, terrain }) {
  const base = parts.parts[0].baseheight;
  const project = projector(Q_ANCHOR);
  const near = terrain.samples
    .map(([lng, lat, h]) => [...project([lng, lat]), h - base])
    .filter(([x, z]) => Math.hypot(x, z) <= GROUND_RADIUS_M);
  const ground = fitPlane(near);
  const tallest = Math.max(...parts.parts.map((p) => p.bldgheight));
  const storeys = Q_STOREYS.map((s, i) => ({
    ...s,
    height: +((Q_STOREYS[i + 1]?.elevation ?? tallest) - s.elevation).toFixed(3),
  }));
  const nodes = buildStoreyNodes({ anchor: Q_ANCHOR, parts: parts.parts, storeys, styles: Q_STYLES, ground });
  const north = parts.parts.find((p) => p.part === Q_CURVED_FRONT.part);
  const front = addCurvedFront(nodes, storeys, {
    ...Q_CURVED_FRONT,
    anchor: Q_ANCHOR,
    part: north,
    edgeIndex: edgeFacing(north, Q_ANCHOR, Q_CURVED_FRONT.facing),
  });
  const shell = [...parts.parts.map((p) => openRing(p.ring.map(project))), front];
  const glb = writeGlb({ materials: glbMaterials(), nodes, generator: 'reis-data scripts/buildQModel.mjs' });
  const round = (v) => +v.toFixed(5);
  const meta = {
    buildingId: Q_BUILDING_ID,
    name: 'Q',
    anchor: Q_ANCHOR,
    baseElevation: base,
    storeys,
    ground: { a: round(ground.a), b: round(ground.b), c: round(ground.c) },
    radius: +Math.max(...nodes.flatMap((n) => n.primitives.flatMap((p) => {
      const r = [];
      for (let i = 0; i < p.positions.length; i += 3) r.push(Math.hypot(p.positions[i], p.positions[i + 2]));
      return r;
    }))).toFixed(2),
    height: tallest,
    defaultAzimuthDeg: Q_DEFAULT_AZIMUTH_DEG,
    attribution: Q_ATTRIBUTION,
  };
  return { glb, meta, shell };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
export const loadQSources = () => ({
  parts: readJson('source/3d/Q/brno-lod2-parts.json'),
  terrain: readJson('source/3d/Q/terrain-samples.json'),
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { glb, meta } = buildQ(loadQSources());
  mkdirSync(join(root, 'map/3d'), { recursive: true });
  writeFileSync(join(root, 'map/3d/Q.glb'), glb);
  writeFileSync(join(root, 'map/3d/Q.json'), JSON.stringify(meta, null, 1) + '\n');
  console.log(`Q.glb ${glb.byteLength} bytes, ${meta.storeys.length} storeys, ground`, meta.ground);
}
