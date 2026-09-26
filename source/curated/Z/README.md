# Curated building: Z (FRRMS, Černá Pole II.)

The MENDELU map API (`api.mm.mendelu.cz/v1/map/buildings/`) has only seven buildings
(A B C E M Q X), and budova Z was never surveyed there. These files add it by hand.
`scripts/curatedZ.mjs` turns them into the same shapes the API buildings have, and
`scripts/buildMapData.mjs` merges them. Nothing downstream special-cases Z.

## Files

| File | What it is |
|---|---|
| `building.json` | id 9000001, floors 1.NP–4.NP as levels 0–3 (level = NP − 1, like A, C and Q), opens on 2.NP. The outline is copied byte for byte from landmark 1587 (FRRMS) in `source/mendelu-landmarks.json`. |
| `spaces.geojson` | Every space on 1.NP–4.NP as a polygon with its pasport code, printed room name and a category hint. Roofs, voids and courtyards are marked and dropped by the generator. |
| `is-rooms.json` | The 20 IS rooms (Aula, Z1–Z11, Z13–Z15, Z24–Z26, Z28 and the 4.NP coworking room), each with its pasport, its space, seats from IS, a confidence and a one-line reason. **Walk corrections edit only this file.** |

## Where the geometry comes from

- **Footprint:** OSM way 305942870, which is a RÚIAN import of stavební objekt 19135831
  (0.13 m from the grid-transformed cadastral map, whose own point error is 0.26 m).
- **Room shapes:** derived from floor plans attached to public MENDELU tenders on
  zakazky.mendelu.cz: 1803 (2.–4.NP, 2016), 4051 (1.NP, 2019), plus sheets from 4971,
  7573, 8290, 8329 and 5054 used only to place room codes. **The drawings are not in
  this repository and must never be added.** Only derived geometry, pasport codes and
  printed room names are. Using the derived geometry without a sublicence was accepted
  by Dominik on 2026-09-26.
- **Pipeline:** kept outside every repo, because it reads the drawings. It is
  reproducible from these source files (sha256):

```
e55ea1a76b68ef170f5960f7d959cb074eac1627fbf8087e4ea10ba69bd80ce3  sources/1NP_E2_osvetleni2020_EZAK4051.pdf
c25db554a2ed9859f8f9161439dad7fea4811ed468f66e029bb791c54ac559a6  sources/2NP_G01_koberce2016_EZAK1803.pdf
d779c230bd26f7a5cd7435d67dcec7a65cf45285a570c80c4e60f7ec9526f088  sources/3NP_G02_koberce2016_EZAK1803.pdf
2b64930536f924a2f03a197ee09615b653da4b38902820ef24d7384eb81d514d  sources/4NP_G03_koberce2016_EZAK1803.pdf
9092307e5156bcb702d594e83eb7bb6f8f79b556de0e27641db5a7b9cf29e50f  sources/anchor_1NP_aula_s_cisly_EZAK7573.pdf
2a11790029a641dc450fa1a4da14eee4e3532fef16f7d6c818bd4f4d7e3b3f49  sources/anchor_2NP-3NP_klimatizace_elektro_s_cisly_mistnosti_EZAK4971.pdf
5dfc2de39e45134d0b237299e087e75fe7c9af53928591b8760f0aac74681d6b  sources/anchor_2NP_aula_galerie_s_cisly_EZAK7573.pdf
e42cd5c1e69db5e8924b0a3a983074258d91a63e93f5f3b73a76e286beac7a86  sources/anchor_2NP_ucebna_Z4_elektro_2026_EZAK8329.pdf
e2547c030d0714d5053a35e0b3f58b6b669f040bcd90f8d1938b400b6b84917f  sources/anchor_4NP_Coworking_2026_EZAK8290.pdf
e9370200d6db3c414f823061991df2a5a319311af79a15edf5f5255ede083c7e  sources/ref_rozvodna_NN_1NP-8NP_EZAK5054.pdf
```

  Fit residual against the footprint is 0.15 m median on 2.NP. 3.NP reuses 2.NP's
  transform, since both sheets share one page placement.

## Identities

`confidence` in `is-rooms.json`:
- **confirmed:** the pasport code is printed inside the space on a registered sheet.
- **bracketed:** the only space left between two confirmed rooms.
- **inferred:** area plus pasport numbering order.
- **low:** the IS record itself points at a different room.

A 2.NP door-sign walk is expected to upgrade the rest.

IS quirks resolved here, explicitly:
- **Z24 / Z28:** IS `Číslo` holds door numbers 284 / 285, which are pasport N2084 / N2085.
- **Z11 / Z15:** IS links an 11 m² storeroom and a 0.94 m² shaft. Their spaces come from
  numbering and capacity instead.
- **Z12, Z22, Z23, Z27:** these do not exist in IS.

## The `BZ00` prefix is synthetic

MENDELU passport codes carry a building prefix (BA01 … BA39), and none is defined for Z.
Rooms here are `BZ00<pasport>`, e.g. `BZ00N2024`, so the rooms index and the app can key
them like every other room. Do not look for BZ00 in any MENDELU system.
