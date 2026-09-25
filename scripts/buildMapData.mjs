// Splits the pinned MENDELU map snapshot into:
//   - per-building room geometry  -> reis-data/map/rooms-<id>.geojson   (served via CDN)
//   - bundled meta (buildings/pois/rooms-index) -> ../reis-extension/src/data/map/
//   - curated data (landmarks/remotePlaces) copied verbatim -> same bundle dir
//   - IS room labels paired by estate number (pairIsRooms.mjs) -> same bundle dir
//   - the map place of every IS room without a floor plan (placeIsRooms.mjs) -> same bundle dir
// The curated inputs (source/mendelu-landmarks.json, source/mendelu-remote-places.json)
// are NOT fetched by fetch-mendelu-map.py — landmark footprints are OSM-sourced +
// enriched with SKM contact info, and the remote places are off-campus (outside the
// Brno-campus API). reis-data is their single source of truth; the extension just
// bundles the copies this script emits. Edit them here, then rerun this script.
// Run: node scripts/buildMapData.mjs   (from the reis-data repo root)
//      node scripts/buildMapData.mjs --ext=<dir>   writes the bundle there instead —
//      the extension's rooms-index.json carries hand edits (building X merges,
//      suppressed rooms) that a full rerun would erase, so build into a scratch
//      dir and copy across only the file you changed.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairIsRooms } from './pairIsRooms.mjs';
import { placeIsRooms } from './placeIsRooms.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extArg = process.argv.find((a) => a.startsWith('--ext='))?.slice('--ext='.length);
const ext = extArg ? resolve(extArg) : resolve(root, '..', 'reis-extension', 'src', 'data', 'map');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const buildings = read('source/mendelu-buildings.json');
const rooms = read('source/mendelu-rooms.geojson');
const pois = read('source/mendelu-pois.geojson');

const buildingIds = new Set(buildings.buildings.map((b) => b.id));
const buildingNames = new Set(buildings.buildings.map((b) => b.name)); // "A".."X"

// 1) Per-building room geometry -> CDN dir
mkdirSync(resolve(root, 'map'), { recursive: true });
for (const id of buildingIds) {
  const fc = { type: 'FeatureCollection',
    features: rooms.features.filter((f) => f.properties.buildingId === id) };
  writeFileSync(resolve(root, `map/rooms-${id}.geojson`), JSON.stringify(fc));
}

// 2) Lightweight room search index (no geometry) -> bundled
mkdirSync(ext, { recursive: true });
const index = rooms.features
  .filter((f) => f.properties.category !== 'structure' && (f.properties.name || '').trim() !== '')
  .map((f) => {
    const p = f.properties;
    return { code: p.passportNumber ?? p.name, name: p.name, nickname: p.nickname ?? null,
      buildingId: p.buildingId, floorId: p.floorId, floorLevel: p.floorLevel, placeId: p.id };
  });
writeFileSync(resolve(ext, 'rooms-index.json'), JSON.stringify(index));

// 3) Bundled buildings meta (verbatim) + POIs with academic-building duplicates removed
writeFileSync(resolve(ext, 'buildings.json'), JSON.stringify(buildings));
const cleanPois = { type: 'FeatureCollection',
  features: pois.features.filter((f) => {
    const t = f.properties.type, n = f.properties.name;
    // drop the academic-building pins (drawn as footprints already)
    return !(t === 'indoor_building' || (t === 'building' && buildingNames.has(n)));
  }) };
writeFileSync(resolve(ext, 'pois.json'), JSON.stringify(cleanPois));

// 4) Curated map data (landmarks + off-campus remote places) copied verbatim.
// These are hand-maintained here (not derived from the API), so preserve exact
// bytes/formatting rather than parse+reserialize.
copyFileSync(resolve(root, 'source/mendelu-landmarks.json'), resolve(ext, 'landmarks.json'));
copyFileSync(resolve(root, 'source/mendelu-remote-places.json'), resolve(ext, 'remotePlaces.json'));

// 5) IS room labels. The map knows a room as "BA04N1065"; a timetable prints
// "B05 – Strojový sál". source/is-room-catalogue.json is reis-scraper's crawl of
// IS's public room catalogue (scripts/scrape-room-catalogue.ts), and the pairing
// is by estate number — see pairIsRooms.mjs for the scope rules.
const { labels, report } = pairIsRooms(read('source/is-room-catalogue.json'), rooms, buildings);
writeFileSync(resolve(ext, 'isRoomLabels.json'), JSON.stringify(labels, null, 2) + '\n');
console.log(`isRoomLabels=${labels.length} unmatched=${report.unmatched.length} noNumber=${report.noNumber.length}`);
for (const u of report.unmatched) console.log(`  unmatched: ${u}`);

// 6) Where the rest are: an IS room with no floor plan still has a building or
// campus the map can show (placeIsRooms.mjs). Rooms paired above are skipped.
const placed = placeIsRooms(read('source/is-room-catalogue.json'), new Set(labels.map((l) => l.label)), {
  buildings,
  pois,
  landmarks: read('source/mendelu-landmarks.json'),
  remote: read('source/mendelu-remote-places.json'),
});
writeFileSync(resolve(ext, 'isRoomPlaces.json'), JSON.stringify(placed.places, null, 2) + '\n');
console.log(`isRoomPlaces=${placed.places.length} notPlaces=${placed.report.notPlaces}`);
for (const u of placed.report.unplaced) console.log(`  unplaced: ${u}`);

console.log(
  `buildings=${buildings.buildings.length} pois=${cleanPois.features.length} index=${index.length} +landmarks +remotePlaces`
);
