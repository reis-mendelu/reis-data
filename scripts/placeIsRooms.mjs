// Where an IS room is when the map has no floor plan for it.
//
// pairIsRooms.mjs names the rooms the MENDELU map draws. The rest — buildings
// D, T, J, P… on Černá Pole, the FRRMS building at Černá Pole II, the whole
// Lednice campus, CSA — have no rooms in the map at all, but IS's room catalogue
// still says which campus and building each one is in, and the map already has
// a pin, landmark or remote place for nearly all of them. This is that join:
// IS label + campus code → one map place. The app shows the place and says the
// room has no floor plan, instead of offering nothing.
//
// The campus code is what a timetable prints in brackets ("Z11 (ČP II.)"), so
// the app can tell same-named rooms on different campuses apart.
//
// Kinds: `poi` (a building pin in pois.json), `landmark` (landmarks.json),
// `remote` (remote-places.json), `building` (one of the seven mapped buildings,
// for the few IS rooms in them the map does not draw). Every id is checked
// against the map data, so a renamed or removed place fails the build.

const MAPPED = new Set(['A', 'B', 'C', 'E', 'M', 'Q', 'X']);

// Černá Pole buildings with a pin but no floor plan, by IS building letter.
// IS still calls building D "D_old".
const CERNA_POLE_PIN = { D: 'D', D_old: 'D', J: 'J', L: 'L', N: 'N', O: 'O', P: 'P', R: 'R', T: 'T', V: 'V' };
// IS building F10 is design lab MENDELU (see the extension's fetch-landmarks.mjs).
const CERNA_POLE_LANDMARK = { F10: -201 };

// Campuses IS lumps together from unrelated buildings, placed per building.
// "Brno - Soběšice" (Sob): Sob-03 is LDF's wood-science centre in Areál Útěchov
// (the extension's fetch-remote-places.mjs, -106); Sob-01's only room PL001 is
// the riding hall at Panská lícha (-105) — IS's own 2019/20 JE1 syllabus says
// "výuka bude v areálu Panská lícha".
const BY_BUILDING = {
  'Sob-03': { kind: 'remote', id: -106 },
  'Sob-01': { kind: 'remote', id: -105 },
};

// Campuses that are one place on the map, by IS campus code.
const CAMPUS = {
  'ČP II.': { kind: 'landmark', id: 1587 }, // FRRMS building, Černá Pole II
  TAK: { kind: 'landmark', id: 1623 }, // CSA, Jana Babáka
  Led: { kind: 'remote', id: -102 }, // Lednice — Valtická
  LedR: { kind: 'remote', id: -102 }, // Lednice — rozptyl
  Mend: { kind: 'remote', id: -102 }, // Lednice — Mendeleum
  BZA: { kind: 'remote', id: -101 },
  Žab: { kind: 'remote', id: -103 },
  Kar: { kind: 'remote', id: -108 },
  SLŠ: { kind: 'remote', id: -109 },
  VASS: { kind: 'remote', id: -110 },
  // ŠLP: no place. Its only room, "Lesní škola Jezírko" (8.2 m², no lessons),
  // names the forest school by Soběšice that Lipka runs, while IS files it under
  // the Hubertka cabin near Křtiny — a record that contradicts itself.
};

// IS labels a few rooms with a technical handle. The timetable prints the
// handle, so it stays the lookup key; `display` is what the map card shows.
const DISPLAY = { ucebna_utechov: 'Učebna Útěchov' };

// A lesson "in" these has no place to show: distance teaching, or IS's own
// "outside the CSA campus", or "somewhere on the MENDELU campus" (v areálu).
const NOT_A_PLACE = /virtu[aá]ln|mimo areál|v areálu/i;

export function placeIsRooms(catalogue, pairedLabels, maps) {
  const buildingId = new Map(maps.buildings.buildings.map((b) => [b.name, b.id]));
  const poiId = new Map(
    maps.pois.features
      .filter((f) => f.properties.type === 'building')
      .map((f) => [f.properties.name, f.properties.id])
  );
  const landmarkIds = new Set(maps.landmarks.landmarks.map((l) => l.id));
  const remoteIds = new Set(maps.remote.places.map((p) => p.id));

  const need = (ok, what) => {
    if (!ok) throw new Error(`placeIsRooms: ${what} is not in the map data`);
  };

  const places = [];
  const report = { notPlaces: 0, unplaced: [] };
  for (const r of catalogue) {
    if (NOT_A_PLACE.test(r.label)) {
      report.notPlaces++;
      continue;
    }
    if (pairedLabels.has(r.label)) continue;

    let target = null;
    if (r.campusCode === 'ČP') {
      if (MAPPED.has(r.building)) {
        need(buildingId.has(r.building), `building "${r.building}"`);
        target = { kind: 'building', id: buildingId.get(r.building) };
      } else if (CERNA_POLE_PIN[r.building]) {
        const pin = CERNA_POLE_PIN[r.building];
        need(poiId.has(pin), `pin "${pin}"`);
        target = { kind: 'poi', id: poiId.get(pin) };
      } else if (CERNA_POLE_LANDMARK[r.building] !== undefined) {
        const id = CERNA_POLE_LANDMARK[r.building];
        need(landmarkIds.has(id), `landmark ${id}`);
        target = { kind: 'landmark', id };
      }
    } else if (BY_BUILDING[r.building]) {
      target = BY_BUILDING[r.building];
      need(remoteIds.has(target.id), `${target.kind} ${target.id}`);
    } else if (CAMPUS[r.campusCode]) {
      target = CAMPUS[r.campusCode];
      need((target.kind === 'landmark' ? landmarkIds : remoteIds).has(target.id), `${target.kind} ${target.id}`);
    }

    if (target) {
      const display = DISPLAY[r.label];
      places.push({ label: r.label, campus: r.campusCode, ...target, ...(display && { display }) });
    }
    else report.unplaced.push(`${r.campusCode} ${r.building} ${r.label}`);
  }
  places.sort((a, b) => a.label.localeCompare(b.label, 'cs') || a.campus.localeCompare(b.campus));
  return { places, report };
}
