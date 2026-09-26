// Run: node --test scripts/*.test.mjs   (from the reis-data repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeIsRooms, pairedKey } from './placeIsRooms.mjs';

const maps = {
  buildings: { buildings: [{ id: 510096, name: 'B' }, { id: 9000001, name: 'Z' }] },
  pois: {
    features: [
      { properties: { id: 1572, name: 'T', type: 'building' } },
      { properties: { id: 1592, name: 'D', type: 'building' } },
    ],
  },
  landmarks: { landmarks: [{ id: 1587 }, { id: 1623 }, { id: -201 }] },
  remote: { places: [{ id: -102 }, { id: -105 }, { id: -106 }, { id: -108 }] },
};
const row = (campusCode, building, label) => ({ campusCode, building, label });
// `paired` lists Černá Pole labels, the common case; other campuses pass a key.
const place = (rows, paired = []) =>
  placeIsRooms(rows, new Set(paired.map((l) => (l.includes('|') ? l : pairedKey('ČP', l)))), maps);

test('a Černá Pole building without a floor plan points at its campus pin', () => {
  assert.deepEqual(place([row('ČP', 'T', 'T18')]).places, [
    { label: 'T18', campus: 'ČP', kind: 'poi', id: 1572 },
  ]);
});

test('IS calls building D "D_old"; it is still pin D', () => {
  assert.deepEqual(place([row('ČP', 'D_old', 'D03')]).places[0], {
    label: 'D03',
    campus: 'ČP',
    kind: 'poi',
    id: 1592,
  });
});

test('design lab (IS building F10) is its landmark', () => {
  assert.equal(place([row('ČP', 'F10', 'Design lab MENDELU')]).places[0].id, -201);
});

test('a room IS lists in a mapped building but the map cannot pair points at that building', () => {
  assert.deepEqual(place([row('ČP', 'B', 'B Kotelna')]).places[0], {
    label: 'B Kotelna',
    campus: 'ČP',
    kind: 'building',
    id: 510096,
  });
});

test('whole campuses map to one place: Lednice, CSA, Karlov', () => {
  const got = place([
    row('Led', 'Led-A', 'ZFAC1'),
    row('Mend', 'LD03', 'Mendeleum 1'),
    row('TAK', 'TAK-B', 'B1 CSA'),
    row('Kar', 'Kar-01', 'Karlov učebna'),
  ]).places.map((p) => `${p.label}:${p.kind}:${p.id}`);
  assert.deepEqual(got, [
    'B1 CSA:landmark:1623',
    'Karlov učebna:remote:-108',
    'Mendeleum 1:remote:-102',
    'ZFAC1:remote:-102',
  ]);
});

test('rooms already paired to a map room are left to isRoomLabels', () => {
  assert.deepEqual(place([row('ČP', 'B', 'B05 – Strojový sál')], ['B05 – Strojový sál']).places, []);
});

test('virtual rooms, "outside the campus" and "on the campus" get no place', () => {
  const { places, report } = place([
    row('ČP', 'B', 'B Virtuální 1'),
    row('TAK', 'TAK', 'Mimo areál CSA'),
    row('ČP', 'C', 'v areálu MENDELU'), // "somewhere on campus", not building C
  ]);
  assert.deepEqual(places, []);
  assert.equal(report.notPlaces, 3);
});

// ŠLP's only IS room is "Lesní škola Jezírko" — the forest site by Soběšice,
// not Křtiny château where the ŠLP pin is. Held with the other Jezírko room.
test('the ŠLP campus is held: its room is Jezírko, not Křtiny', () => {
  const { places, report } = place([row('ŠLP', 'ŠLP-01', 'Lesní škola Jezírko')]);
  assert.deepEqual(places, []);
  assert.deepEqual(report.unplaced, ['ŠLP ŠLP-01 Lesní škola Jezírko']);
});

// IS's "Brno - Soběšice" campus is two unrelated buildings, so it is mapped per
// building: Sob-03 is the wood-science centre in Areál Útěchov, and Sob-01's
// only room PL001 is the riding hall at Panská lícha (IS's own 2019/20 JE1
// syllabus: "výuka bude v areálu Panská lícha").
test('the Soběšice campus is placed building by building', () => {
  const got = place([row('Sob', 'Sob-03', 'ucebna_utechov'), row('Sob', 'Sob-01', 'PL001')]).places;
  assert.deepEqual(
    got.map((p) => `${p.label}:${p.kind}:${p.id}`),
    ['PL001:remote:-105', 'ucebna_utechov:remote:-106']
  );
});

// IS's own label for the Útěchov room is a technical handle; the card shows a
// name, and the lookup still matches the handle a timetable prints.
test('a technical IS label gets a display name', () => {
  const [p] = place([row('Sob', 'Sob-03', 'ucebna_utechov')]).places;
  assert.equal(p.label, 'ucebna_utechov');
  assert.equal(p.display, 'Učebna Útěchov');
});

test('a building with no pin yet is reported, not guessed', () => {
  const { places, report } = place([row('Sob', 'Sob-99', 'new room')]);
  assert.deepEqual(places, []);
  assert.deepEqual(report.unplaced, ['Sob Sob-99 new room']);
});

test('a place id missing from the map data fails loudly', () => {
  assert.throws(
    () => placeIsRooms([row('ČP', 'T', 'T18')], new Set(), { ...maps, pois: { features: [] } }),
    /pin "T"/
  );
});

test('the real catalogue places T18, ZFAC1 and design lab, and nothing on ČP II.', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
  const buildings = read('source/mendelu-buildings.json');
  buildings.buildings.push(read('source/curated/Z/building.json'));
  const { places } = placeIsRooms(read('source/is-room-catalogue.json'), new Set(), {
    buildings,
    pois: read('source/mendelu-pois.geojson'),
    landmarks: read('source/mendelu-landmarks.json'),
    remote: read('source/mendelu-remote-places.json'),
  });
  const find = (label, campus) => places.find((p) => p.label === label && p.campus === campus);
  assert.equal(find('T18', 'ČP')?.id, 1572);
  assert.equal(find('ZFAC1', 'Led')?.id, -102);
  // Budova Z's rooms come from its curated table, and Budova K has no place.
  assert.equal(find('Z11', 'ČP II.'), undefined);
  assert.equal(find('K01', 'ČP II.'), undefined);
  assert.equal(find('Design lab MENDELU', 'ČP')?.id, -201);
});

test('a paired label is skipped only on its own campus: "Aula" is A on ČP and FRRMS on ČP II.', () => {
  // Lednice stands in for "another campus with a place" — ČP II. has none now.
  const rows = [row('ČP', 'A', 'Aula'), row('Led', 'Led-A', 'Aula')];
  assert.deepEqual(place(rows, ['Aula']).places, [{ label: 'Aula', campus: 'Led', kind: 'remote', id: -102 }]);
  assert.deepEqual(place(rows, ['Aula', pairedKey('Led', 'Aula')]).places, []);
});

test('on ČP II. a paired Z room is skipped and Budova K, with no place on the map, is unplaced', () => {
  const rows = [row('ČP II.', 'Z', 'Z14'), row('ČP II.', 'Budova K', 'K01')];
  const got = place(rows, [pairedKey('ČP II.', 'Z14')]);
  assert.deepEqual(got.places, []);
  assert.deepEqual(got.report.unplaced, ['ČP II. Budova K K01']);
});
