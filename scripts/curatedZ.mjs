// Budova Z (FRRMS) is not in the MENDELU map API — it never was surveyed there.
// Its rooms are derived from public tender drawings (source/curated/Z/README.md)
// and arrive here as source/curated/Z/spaces.geojson. This turns them into the
// same shapes the API buildings have, so nothing downstream special-cases Z.
//
// `BZ00` is a SYNTHETIC passport prefix: MENDELU's own are BA01..BA39, and none
// is defined for Z. It exists because rooms-index and the app key rooms by a
// prefixed passport code.
//
// Z's IS labels carry their campus. IS names two rooms "Aula" — building A's on
// Černá Pole and FRRMS's on Černá Pole II. — and a timetable brackets the campus
// ("Aula (ČP II.)"), so the label alone cannot say which one it is.
export const Z_PREFIX = 'BZ00';
export const Z_CAMPUS = 'ČP II.';
const FIRST_ROOM_ID = 9001000;
// Not rooms: nothing a student can walk into from this floor.
const DROP = new Set(['roof', 'roof?', 'void', 'courtyard']);
// The rest map onto RoomProperties.category; terraces and dorm cells become `other`.
const CATEGORY = { teaching: 'teaching', office: 'office', service: 'service', circulation: 'circulation' };

/** [[S, W], [N, E]] of a [lon, lat] ring — the order buildings.json uses. */
function bbox(ring) {
  let S = Infinity;
  let W = Infinity;
  let N = -Infinity;
  let E = -Infinity;
  for (const [lon, lat] of ring) {
    S = Math.min(S, lat);
    N = Math.max(N, lat);
    W = Math.min(W, lon);
    E = Math.max(E, lon);
  }
  return [[S, W], [N, E]];
}

export function buildCuratedZ({ building, spaces, isRooms }) {
  const floorByLevel = new Map(building.floors.map((f) => [f.level, f]));
  const spaceIds = new Set(spaces.features.map((f) => f.properties.spaceId));
  const isBySpace = new Map();
  for (const r of isRooms) {
    if (!spaceIds.has(r.spaceId)) throw new Error(`curatedZ: ${r.label} points at missing space ${r.spaceId}`);
    isBySpace.set(r.spaceId, r);
  }

  const seen = new Set();
  const features = [];
  for (const f of spaces.features) {
    const p = f.properties;
    if (DROP.has(p.category)) continue;
    const floor = floorByLevel.get(p.level);
    if (!floor) throw new Error(`curatedZ: no floor for level ${p.level} (${p.spaceId})`);
    const is = isBySpace.get(p.spaceId);
    // An IS row names its space's pasport even where no code is printed (Z11, Z15).
    const pasport = is ? is.pasport : p.code;
    const code = pasport ? `${Z_PREFIX}${pasport}` : null;
    if (code) {
      if (seen.has(code)) throw new Error(`curatedZ: ${pasport} is on two spaces`);
      seen.add(code);
    }
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      spaceId: p.spaceId,
      properties: {
        id: 0,
        buildingId: building.id,
        floorId: floor.id,
        floorLevel: p.level,
        name: code ?? '',
        // A nickname is a room's own handle ("A01"), unique by contract. Printed
        // names are descriptions that repeat ("Sklad", "Chodba"), so they are the label.
        nickname: is?.nickname ?? null,
        type: is ? 'classroom' : 'room',
        category: is ? 'teaching' : (CATEGORY[p.category] ?? 'other'),
        label: is ? 'Classroom' : (p.namePrinted ?? ''),
        passportNumber: code,
        seats: is ? is.seats : null,
        hasProjector: false,
        hasWhiteboard: false,
        code: null,
      },
    });
  }
  features.sort(
    (a, b) =>
      a.properties.floorLevel - b.properties.floorLevel ||
      a.properties.name.localeCompare(b.properties.name) ||
      a.spaceId.localeCompare(b.spaceId)
  );
  features.forEach((f, i) => {
    f.properties.id = FIRST_ROOM_ID + i;
    delete f.spaceId;
  });

  const bounds = bbox(building.outline.coordinates[0]);
  const floors = building.floors.map((fl) => ({
    ...fl,
    roomCount: features.filter((f) => f.properties.floorId === fl.id && f.properties.category !== 'structure').length,
  }));
  const labels = isRooms
    .map((r) => ({ code: `${Z_PREFIX}${r.pasport}`, label: r.label, campus: Z_CAMPUS }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.label.localeCompare(b.label));
  return {
    building: {
      id: building.id,
      name: building.name,
      description: building.description,
      outline: building.outline,
      center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2],
      bounds,
      defaultFloorId: building.defaultFloorId,
      floors,
    },
    rooms: { type: 'FeatureCollection', features },
    labels,
  };
}
