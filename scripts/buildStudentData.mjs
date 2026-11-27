// Builds student-data/: the files the "Data pro projekty" page offers to students.
// Run from the reis-data root:  node scripts/buildStudentData.mjs
//
// Two datasets, both flat rows (JSON and CSV from the same rows):
//   success-rates  one row per subject per semester, from the all-terms line
//   erasmus        one row per report, numbers only
//
// What is left out on purpose: teachers and the garant (a "who fails most"
// ranking), and everything a student wrote or that names one (name, e-mail,
// coordinator, every free-text answer). assertNoPersonalData fails the build if
// an address or one of those keys reaches the output.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ALL_TERMS = 'Všechny termíny';
const FORBIDDEN_KEYS = new Set(['garant', 'teachers', 'student', 'email', 'coordinator', 'coordinators']);

/** "2,60" → 2.6, "58 000" → 58000; blanks and prose → null. */
export function toNumber(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/[\s ]/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/** "1. 9. 2014" → "2014-09-01"; anything else → null. */
function isoDate(value) {
  const m = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*$/.exec(value ?? '');
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function buildSuccessRows(subject) {
  const rows = [];
  for (const stat of subject.stats ?? []) {
    const all = (stat.terms ?? []).find((t) => t.term === ALL_TERMS);
    if (!all) continue;
    const g = all.grades;
    rows.push({
      code: subject.courseCode,
      nameCs: subject.nameCs,
      nameEn: subject.nameEn,
      facultyId: subject.facultyId,
      semester: stat.semesterName,
      year: stat.year,
      kind: stat.type,
      a: g.A, b: g.B, c: g.C, d: g.D, e: g.E, f: g.F, fn: g.FN,
      pass: all.pass,
      fail: all.fail,
    });
  }
  return rows;
}

export function buildErasmusRows(country) {
  return (country.reports ?? []).map((r) => ({
    countryId: country.meta.countryId,
    hostUniversity: r.host?.name?.replace(/&amp;/g, '&') ?? null,
    hostCountry: r.host?.country ?? null,
    stayFrom: isoDate(r.stay?.from),
    stayMonths: toNumber(r.stay?.durationMonths),
    accommodationPerDay: toNumber(r.finance?.accommodationPerDay),
    foodPerDay: toNumber(r.finance?.foodPerDay),
    transportCost: toNumber(r.finance?.transportCost),
    totalCostCZK: toNumber(r.finance?.totalCostCZK),
    grantCoveragePercent: toNumber(r.finance?.grantCoveragePercent),
    recognized: r.recognition?.recognized === 'ano' ? true : r.recognition?.recognized === 'ne' ? false : null,
    rating: toNumber(r.overall?.rating),
  }));
}

export function toCsv(rows) {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\n') + '\n';
}

export function assertNoPersonalData(rows) {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`forbidden key in student-data: ${key}`);
    }
  }
  if (JSON.stringify(rows).includes('@')) throw new Error('an address reached student-data');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(root) {
  const out = join(root, 'student-data');
  mkdirSync(out, { recursive: true });

  const success = readdirSync(join(root, 'subjects'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => buildSuccessRows(readJson(join(root, 'subjects', f))));

  // slovenia-study.json is a country file under a name (its countryId is 705):
  // the same report can appear twice, so rows are kept once per report id.
  const seen = new Set();
  const erasmus = [];
  for (const f of readdirSync(join(root, 'erasmus')).filter((n) => n.endsWith('-study.json')).sort()) {
    const country = readJson(join(root, 'erasmus', f));
    for (const [i, row] of buildErasmusRows(country).entries()) {
      const id = `${country.meta.countryId}:${country.reports[i].reportId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      erasmus.push(row);
    }
  }

  for (const [name, rows] of [['success-rates', success], ['erasmus', erasmus]]) {
    assertNoPersonalData(rows);
    writeFileSync(join(out, `${name}.json`), JSON.stringify(rows) + '\n');
    writeFileSync(join(out, `${name}.csv`), toCsv(rows));
    console.log(`${name}: ${rows.length} rows`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(join(dirname(fileURLToPath(import.meta.url)), '..'));
}
