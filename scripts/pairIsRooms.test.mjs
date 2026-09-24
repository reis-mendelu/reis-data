// Run: node --test scripts/*.test.mjs   (from the reis-data repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairIsRooms } from './pairIsRooms.mjs';

const buildings = { buildings: [{ id: 510096, name: 'B' }, { id: 0, name: 'Q' }, { id: 54678, name: 'A' }] };
const room = (buildingId, passportNumber, category = 'teaching') => ({
  properties: { buildingId, passportNumber, name: passportNumber, category },
});
const rooms = {
  features: [
    room(510096, 'BA04N1065'),
    room(510096, 'BA04N1067'),
    room(510096, 'BA04P1011'),
    room(0, 'BA39N1001'),
    room(0, 'BA39N1002'),
    room(54678, 'BA01N1065'),
    room(510096, 'BA04N1003', 'structure'),
  ],
};
const row = (building, label, number, campusId = 1) => ({ campusId, building, label, number });

test('pairs an IS label with the map room whose passport ends in its number', () => {
  const { labels } = pairIsRooms([row('B', 'B05 – Strojový sál', 'N1065')], rooms, buildings);
  assert.deepEqual(labels, [{ code: 'BA04N1065', label: 'B05 – Strojový sál' }]);
});

test('building Q has id 0 and still pairs', () => {
  const { labels } = pairIsRooms([row('Q', 'Q01', 'N1001')], rooms, buildings);
  assert.deepEqual(labels, [{ code: 'BA39N1001', label: 'Q01' }]);
});

test('a number is only looked up inside its own building', () => {
  // N1065 exists in A as BA01N1065, but IS says building B.
  const { labels } = pairIsRooms([row('A', 'A-room', 'N1066')], rooms, buildings);
  assert.deepEqual(labels, []);
});

test('only Brno - Černá Pole pairs — CSA Hala B is not map building B', () => {
  const { labels, report } = pairIsRooms([row('B', 'B1 CSA', 'P1011', 67)], rooms, buildings);
  assert.deepEqual(labels, []);
  assert.equal(report.outOfScope, 1);
});

test('rooms without an estate number and unknown numbers are reported, not paired', () => {
  const { labels, report } = pairIsRooms(
    [row('B', 'P1014', ''), row('B', 'B99', 'N9999')],
    rooms,
    buildings
  );
  assert.deepEqual(labels, []);
  assert.deepEqual(report.noNumber, ['P1014']);
  assert.deepEqual(report.unmatched, ['B B99 N9999']);
});

test('a label that is only the passport code adds nothing and is dropped', () => {
  // IS labels BA01N4011 with its own estate code; the map already calls it A455.
  const { labels } = pairIsRooms([row('B', 'BA04N1067', 'N1067')], rooms, buildings);
  assert.deepEqual(labels, []);
});

test('a map feature the room index leaves out (a structure) is not a pairing target', () => {
  // The map draws E03 as a floor outline; the app has no room to show for it.
  const { labels, report } = pairIsRooms([row('B', 'B-structure', 'N1003')], rooms, buildings);
  assert.deepEqual(labels, []);
  assert.deepEqual(report.unmatched, ['B B-structure N1003']);
});

test('output is sorted by code', () => {
  const { labels } = pairIsRooms(
    [row('Q', 'Q02', 'N1002'), row('B', 'B01', 'N1067')],
    rooms,
    buildings
  );
  assert.deepEqual(labels.map((l) => l.code), ['BA04N1067', 'BA39N1002']);
});

test('the real catalogue pairs B05, B06 and B01 as IS lists them', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
  const { labels } = pairIsRooms(
    read('source/is-room-catalogue.json'),
    read('source/mendelu-rooms.geojson'),
    read('source/mendelu-buildings.json')
  );
  const byLabel = Object.fromEntries(labels.map((l) => [l.label, l.code]));
  assert.equal(byLabel['B05 – Strojový sál'], 'BA04N1065');
  assert.equal(byLabel.B06, 'BA04N1029'); // the map nicknames this room "B40"
  assert.equal(byLabel.B01, 'BA04N1067');
});
