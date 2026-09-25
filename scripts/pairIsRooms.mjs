// Pairs IS room labels with map rooms by estate number.
//
// The MENDELU map names a room by its passport code ("BA04N1065") and, for some
// rooms only, a hand-typed nickname ("B01"). IS names it by the label a timetable
// prints ("B05 – Strojový sál"). The only thing both know is the estate number:
// IS's public room catalogue lists it as "Číslo" (N1065), and it is the tail of
// the map's passport code. So a pairing is `<building prefix><number>`, looked up
// inside that one building.
//
// Input `catalogue` is reis-scraper's scripts/scrape-room-catalogue.ts output
// (source/is-room-catalogue.json). Scope is deliberately narrow:
//   - campus 1 (Brno - Černá Pole) only: "B1 CSA" sits in CSA's Hala B, on
//     another campus, and its P1011 would land on a storage room in building B;
//   - the map's own buildings only (A B C E M Q X), matched by letter;
//   - an exact passport-code hit inside that building, never a suffix match
//     across buildings (N1065 exists in A as well as B).
// Building Q's id is 0, so nothing here may treat an id as truthy.
const CERNA_POLE = 1;

/** Each map building's passport prefix ("BA04"), taken from its own rooms. */
function prefixes(rooms) {
  const counts = new Map();
  for (const f of rooms.features) {
    const { buildingId, passportNumber } = f.properties;
    const m = /^(BA\d\d)[NP]/.exec(passportNumber ?? '');
    if (!m) continue;
    const perBuilding = counts.get(buildingId) ?? new Map();
    perBuilding.set(m[1], (perBuilding.get(m[1]) ?? 0) + 1);
    counts.set(buildingId, perBuilding);
  }
  const out = new Map();
  for (const [id, perBuilding] of counts) {
    out.set(id, [...perBuilding].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return out;
}

export function pairIsRooms(catalogue, rooms, buildings) {
  const idByLetter = new Map(buildings.buildings.map((b) => [b.name, b.id]));
  const prefixById = prefixes(rooms);
  // Pair only what buildMapData puts in rooms-index.json — a structure (E03 is
  // drawn as a floor outline) or a nameless feature is nothing the app can show.
  const codesById = new Map();
  for (const f of rooms.features) {
    const { buildingId, passportNumber, category, name } = f.properties;
    if (!passportNumber || category === 'structure' || !(name || '').trim()) continue;
    const set = codesById.get(buildingId) ?? new Set();
    set.add(passportNumber);
    codesById.set(buildingId, set);
  }

  const labels = [];
  const report = { outOfScope: 0, noNumber: [], unmatched: [] };
  for (const r of catalogue) {
    if (r.campusId !== CERNA_POLE || !idByLetter.has(r.building)) {
      report.outOfScope++;
      continue;
    }
    if (!r.number) {
      report.noNumber.push(r.label);
      continue;
    }
    const id = idByLetter.get(r.building);
    const code = `${prefixById.get(id)}${r.number}`;
    if (!codesById.get(id)?.has(code)) report.unmatched.push(`${r.building} ${r.label} ${r.number}`);
    // IS sometimes labels a room with its own passport code (BA01N4011, which
    // the map calls A455) — that names nothing the code does not already.
    else if (r.label !== code) labels.push({ code, label: r.label });
  }
  labels.sort((a, b) => a.code.localeCompare(b.code) || a.label.localeCompare(b.label));
  return { labels, report };
}
