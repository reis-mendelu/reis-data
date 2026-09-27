// Sets meta.json's `lastUpdated` to now.
//
// reIS treats `lastUpdated` as the version of the success-rate data: a cached
// subject fetched under an older version is fetched again
// (reis-extension src/api/successRateVersion.ts). A change to subjects/ that
// leaves `lastUpdated` alone therefore never reaches a student who already has
// the subject cached. The full export (reis-scraper audit/export-data.ts) sets
// it; this covers everything else — hand corrections, partial re-exports.
// 28fe5ad3 ("Correct 134 historical totals") was one that did not.
//
// Run: node scripts/bump-meta.mjs                 (from the reis-data repo root)
//      node scripts/bump-meta.mjs --since <ref>   only if `lastUpdated` is still
//                                                 what it was at <ref>
// The bump-meta workflow runs the second form on every push to main that
// touches subjects/.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metaPath = resolve(root, 'meta.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

const sinceIdx = process.argv.indexOf('--since');
if (sinceIdx !== -1) {
  const ref = process.argv[sinceIdx + 1];
  let before = null;
  try {
    const raw = execFileSync('git', ['show', `${ref}:meta.json`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    before = JSON.parse(raw).lastUpdated ?? null;
  } catch {
    // Unknown ref (first push, force-push) or no meta.json there: bump to be safe.
  }
  if (before !== null && before !== meta.lastUpdated) {
    console.log(`meta.json lastUpdated already moved since ${ref}: ${before} -> ${meta.lastUpdated}`);
    process.exit(0);
  }
}

const previous = meta.lastUpdated;
meta.lastUpdated = new Date().toISOString();
// Same serialisation as reis-scraper's export: 2-space indent, no trailing newline.
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`meta.json lastUpdated: ${previous} -> ${meta.lastUpdated}`);
