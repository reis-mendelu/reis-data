// Run: node --test scripts/*.test.mjs   (from the reis-data repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSuccessRows, buildErasmusRows, toNumber, toCsv, assertNoPersonalData } from './buildStudentData.mjs';

const subject = {
  courseCode: 'EBC-PJ',
  name: 'Programovací jazyk Java',
  nameCs: 'Programovací jazyk Java',
  nameEn: 'Java Programming Language',
  facultyId: 220,
  aliases: [],
  teachers: ['Doc. Jan Novák'],
  stats: [
    {
      semesterName: 'ZS 2025/2026 - PEF',
      year: 2025,
      type: 'exam',
      garant: 'Doc. Jan Novák',
      terms: [
        { term: '1. opravný', grades: { A: 0, B: 0, C: 0, D: 0, E: 1, F: 0, FN: 0 }, pass: 1, fail: 0 },
        { term: 'Všechny termíny', grades: { A: 20, B: 11, C: 4, D: 4, E: 6, F: 0, FN: 2 }, pass: 45, fail: 2 },
      ],
    },
  ],
};

const report = (over = {}) => ({
  reportId: '1',
  student: { name: 'Jan Vzorový', faculty: 'Provozně ekonomická fakulta', coordinator: 'Bc. Anna Vzorová' },
  host: { name: 'University of Helsinki', country: 'Finská republika', coordinators: 'Mari Lauri', email: 'office@helsinki.fi' },
  stay: { from: '1. 9. 2014', to: '19. 12. 2014', durationMonths: 3.6 },
  finance: { accommodationPerDay: '14', foodPerDay: '2,60', transportCost: '', totalCostCZK: '58 000', grantCoveragePercent: '65', otherCostsDescription: 'napsal jsem na jan@example.cz' },
  recognition: { recognized: 'ano', conditions: 'text' },
  overall: { rating: '5', review: 'Napište mi na jan@example.cz' },
  ...over,
});

test('success rows: one row per semester from the all-terms line, no teacher keys', () => {
  const rows = buildSuccessRows(subject);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    code: 'EBC-PJ', nameCs: 'Programovací jazyk Java', nameEn: 'Java Programming Language',
    facultyId: 220, semester: 'ZS 2025/2026 - PEF', year: 2025, kind: 'exam',
    a: 20, b: 11, c: 4, d: 4, e: 6, f: 0, fn: 2, pass: 45, fail: 2,
  });
  const text = JSON.stringify(rows);
  assert.ok(!/garant|teachers|Novák/.test(text));
});

test('success rows: a stat without an all-terms line gives no row', () => {
  const s = { ...subject, stats: [{ ...subject.stats[0], terms: [subject.stats[0].terms[0]] }] };
  assert.deepEqual(buildSuccessRows(s), []);
});

test('toNumber: comma decimals, spaced thousands, blanks and prose', () => {
  assert.equal(toNumber('2,60'), 2.6);
  assert.equal(toNumber('58 000'), 58000);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('cca 2 eura'), null);
  assert.equal(toNumber(undefined), null);
});

test('erasmus rows: numbers only, no student, no free text', () => {
  const rows = buildErasmusRows({ meta: { countryId: '246' }, reports: [report()] });
  assert.deepEqual(rows, [{
    countryId: '246', hostUniversity: 'University of Helsinki', hostCountry: 'Finská republika',
    stayFrom: '2014-09-01', stayMonths: 3.6, accommodationPerDay: 14, foodPerDay: 2.6,
    transportCost: null, totalCostCZK: 58000, grantCoveragePercent: 65, recognized: true, rating: 5,
  }]);
  const text = JSON.stringify(rows);
  assert.ok(!/@|Vzorov|jan@example|Napište/.test(text));
});

test('erasmus rows: &amp; in a host name is decoded', () => {
  const r = report({ host: { name: 'Management &amp; Communication', country: 'X' } });
  const [row] = buildErasmusRows({ meta: { countryId: '1' }, reports: [r] });
  assert.equal(row.hostUniversity, 'Management & Communication');
});

test('erasmus rows: an unparsable date and a missing recognition stay null', () => {
  const r = report({ stay: { from: 'brzy', durationMonths: 2 }, recognition: {} });
  const [row] = buildErasmusRows({ meta: { countryId: '1' }, reports: [r] });
  assert.equal(row.stayFrom, null);
  assert.equal(row.recognized, null);
});

test('toCsv: header from keys, quoting, null as empty', () => {
  const csv = toCsv([{ a: 1, b: 'x,y', c: null }, { a: 2, b: 'q"r', c: 3 }]);
  assert.equal(csv, 'a,b,c\n1,"x,y",\n2,"q""r",3\n');
});

test('assertNoPersonalData throws on an address or a forbidden key', () => {
  assert.throws(() => assertNoPersonalData([{ note: 'write jan@example.cz' }]));
  assert.throws(() => assertNoPersonalData([{ garant: 'x' }]));
  assert.doesNotThrow(() => assertNoPersonalData([{ code: 'EBC-PJ', a: 1 }]));
});
