// Run: node --test scripts/*.test.mjs   (from the reis-data repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCuratedZ, Z_PREFIX, Z_CAMPUS } from './curatedZ.mjs';

const ring = [[16.61, 49.218], [16.611, 49.218], [16.611, 49.219], [16.61, 49.218]];
const building = {
  id: 9000001, name: 'Z', description: 'Budova Z (FRRMS)', outline: { type: 'Polygon', coordinates: [ring] },
  defaultFloorId: 9000011, floors: [{ id: 9000011, level: 1, name: '1' }, { id: 9000010, level: 0, name: '0' }],
};
const sq = (x) => ({ type: 'Polygon', coordinates: [[[x, 49.2181], [x + 1e-4, 49.2181], [x + 1e-4, 49.2182], [x, 49.2181]]] });
const sp = (spaceId, level, code, namePrinted, category) => ({
  type: 'Feature',
  geometry: sq(16.61 + level * 1e-3 + Number(spaceId.split(':')[1] || 0) * 1e-5),
  properties: { spaceId, level, code, namePrinted, category, areaM2: 50 },
});
const spaces = {
  type: 'FeatureCollection',
  features: [
    sp('0:239', 0, 'N1000', 'Aula', 'teaching'),
    sp('1:65', 1, 'N2011', 'Učebna Z1', 'teaching'),
    sp('1:2', 1, 'N2001', 'Knihovna', 'other'),
    sp('1:39', 1, null, null, 'courtyard'),
    sp('1:77', 1, null, null, null),
    sp('1:149', 1, null, null, null),
  ],
};
const isRooms = [
  { label: 'Aula', pasport: 'N1000', spaceId: '0:239', seats: 190, confidence: 'confirmed', evidence: 'printed' },
  { label: 'Z1', pasport: 'N2011', spaceId: '1:65', seats: 24, confidence: 'confirmed', evidence: 'printed' },
  { label: 'Z11', pasport: 'N2031', spaceId: '1:149', seats: 64, confidence: 'low', evidence: 'IS links a storeroom' },
];
const run = () => buildCuratedZ({ building, spaces, isRooms });

test('drops roofs, voids and courtyards; keeps unnamed spaces unnamed', () => {
  const { rooms } = run();
  assert.equal(rooms.features.length, 5);
  const blank = rooms.features.find((f) => f.properties.passportNumber === null);
  assert.equal(blank.properties.name, '');
});

test('names follow the MENDELU convention: name = passportNumber = BZ00<pasport>', () => {
  const z1 = run().rooms.features.find((f) => f.properties.name === `${Z_PREFIX}N2011`);
  assert.equal(z1.properties.passportNumber, 'BZ00N2011');
  assert.equal(z1.properties.category, 'teaching');
  assert.equal(z1.properties.seats, 24);
  assert.equal(z1.properties.floorId, 9000011);
  assert.equal(z1.properties.floorLevel, 1);
});

test('an IS row gives its pasport to a space that has no printed code (Z11)', () => {
  const z11 = run().rooms.features.find((f) => f.properties.name === 'BZ00N2031');
  assert.ok(z11);
  assert.equal(z11.properties.seats, 64);
});

// A nickname is a room's own handle ("A01") — search and the IS lookup treat it as
// unique. Printed names here are descriptions ("Sklad", "Chodba", repeated across
// the floor), so they go where the API buildings put "Storage": the label.
test('printed names become labels, never nicknames, for non-IS rooms', () => {
  const lib = run().rooms.features.find((f) => f.properties.name === 'BZ00N2001');
  assert.equal(lib.properties.nickname, null);
  assert.equal(lib.properties.label, 'Knihovna');
  assert.equal(lib.properties.category, 'other');
});

test('only an IS row may carry a nickname (the coworking room)', () => {
  const rows = [{ ...isRooms[1], nickname: 'Coworking' }];
  const z1 = buildCuratedZ({ building, spaces, isRooms: rows }).rooms.features.find((f) => f.properties.name === 'BZ00N2011');
  assert.equal(z1.properties.nickname, 'Coworking');
  assert.ok(buildCuratedZ({ building, spaces, isRooms: rows }).rooms.features.every((f) => f.properties.name === 'BZ00N2011' || f.properties.nickname === null));
});

test('labels pair every IS row to its code, on campus ČP II.', () => {
  assert.equal(Z_CAMPUS, 'ČP II.');
  assert.deepEqual(run().labels, [
    { code: 'BZ00N1000', label: 'Aula', campus: 'ČP II.' },
    { code: 'BZ00N2011', label: 'Z1', campus: 'ČP II.' },
    { code: 'BZ00N2031', label: 'Z11', campus: 'ČP II.' },
  ]);
});

test('ids are sequential from 9001000 in sorted order and stable across runs', () => {
  const a = run().rooms.features.map((f) => f.properties.id);
  assert.deepEqual(a, [9001000, 9001001, 9001002, 9001003, 9001004]);
  assert.deepEqual(JSON.stringify(run()), JSON.stringify(run()));
});

test('building gets center [lat,lon], bounds [[S,W],[N,E]] and roomCount without structure', () => {
  const { building: b } = run();
  assert.deepEqual(b.bounds, [[49.218, 16.61], [49.219, 16.611]]);
  assert.equal(b.center.length, 2);
  assert.ok(b.center[0] > 49 && b.center[1] > 16);
  assert.equal(b.floors.find((f) => f.level === 1).roomCount, 4);
});

test('an IS row pointing at a missing space fails the build', () => {
  const bad = [...isRooms, { label: 'Z9', pasport: 'N2027', spaceId: '1:999', seats: 40, confidence: 'inferred', evidence: 'x' }];
  assert.throws(() => buildCuratedZ({ building, spaces, isRooms: bad }), /1:999/);
});

test('two spaces with one code fail the build', () => {
  const dup = { ...spaces, features: [...spaces.features, sp('1:70', 1, 'N2011', null, null)] };
  assert.throws(() => buildCuratedZ({ building, spaces: dup, isRooms }), /N2011/);
});
