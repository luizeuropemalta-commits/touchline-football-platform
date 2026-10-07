// Local artifact validation only. No network, credentials, database or file writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const manifest = Object.freeze([
  { id: 'L1', file: '20261002183141_touchline_notification_game_locale.sql', sha256: '13a85b62378261328c5edd01026b3cc392df1cbdcd9314c2a13c3f64ddec97f4' },
  { id: 'L2', file: '20261002200934_touchline_game_locale_revision.sql', sha256: '438ab0f13338dce1b43e2461b8ff57f2752bf78f7e63fd4cd1b17483ff6da00b' },
  { id: 'Q1', file: '20261002152457_touchline_fixture_quota_authority.sql', sha256: 'ce34d739405276b62d197cb8de3beaa7fb834ee60b60f78a2e7f1fb844f7ac56', beginLine: 2, commitLine: 139 },
  { id: 'Q2', file: '20261003233637_touchline_sportmonks_prequery_authority.sql', sha256: '1874df53481e913e35b58e9f4acf6a2ebbf1e6f4f60fc7eac35b2b4334b5cdb6', beginLine: 4, commitLine: 127 },
  { id: 'R', file: '20261002160805_touchline_fixture_recovery_deferral.sql', sha256: '01d8e34ec82252e3b0d2fd31a002ea76815a28071743cc9f00af8bafc2d11b7d' },
].map(Object.freeze));

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function preparePayload(entry, source) {
  assert(Buffer.isBuffer(source), 'Source must be bytes');
  assert.equal(hash(source), entry.sha256, `${entry.id}: source fingerprint changed`);
  const text = source.toString('utf8');
  assert(Buffer.from(text).equals(source), `${entry.id}: invalid UTF-8`);
  let payload = source;
  const removedLines = [];
  if (entry.beginLine !== undefined) {
    // This is an exact, hash-bound transform, not a general SQL parser.
    const lines = text.split('\n');
    assert.equal(lines[entry.beginLine - 1], 'begin;');
    assert.equal(lines[entry.commitLine - 1], 'commit;');
    assert.equal(lines.length, entry.commitLine + 1);
    assert.equal(lines.at(-1), '');
    assert(lines.slice(0, entry.beginLine - 1).every((line) => line.startsWith('--')));
    assert.deepEqual(lines.flatMap((line, index) => /^(begin|commit|rollback);$/i.test(line) ? [index + 1] : []), [entry.beginLine, entry.commitLine]);
    removedLines.push(entry.beginLine, entry.commitLine);
    const retained = lines.filter((_, index) => !removedLines.includes(index + 1));
    payload = Buffer.from(retained.join('\n'));
    // Reinsert precisely the two removed complete lines and prove all other bytes unchanged.
    const restored = [...retained];
    restored.splice(entry.beginLine - 1, 0, 'begin;');
    restored.splice(entry.commitLine - 1, 0, 'commit;');
    assert(Buffer.from(restored.join('\n')).equals(source), `${entry.id}: body changed`);
    assert.equal(payload.length, source.length - Buffer.byteLength('begin;\ncommit;\n'));
  } else {
    assert(payload.equals(source));
  }
  return { payload, metadata: { id: entry.id, file: entry.file, sourceSha256: entry.sha256, payloadSha256: hash(payload), sourceBytes: source.length, payloadBytes: payload.length, removedLines } };
}

export function loadPayloads() {
  return manifest.map((entry) => preparePayload(entry, readFileSync(new URL(`../supabase/migrations/${entry.file}`, import.meta.url))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--payload' && manifest.some(({ id }) => id === args[1])), 'Usage: node scripts/check-qa-release-migration-payloads-20261007.mjs [--payload L1|L2|Q1|Q2|R]');
  // Validate every source before printing any selected payload.
  const results = loadPayloads();
  if (args.length) process.stdout.write(results.find(({ metadata }) => metadata.id === args[1]).payload);
  else process.stdout.write(`${JSON.stringify({ localPayloadCheck: 'PASS', hostedAtomicity: 'UNVERIFIED', migrations: results.map(({ metadata }) => metadata) }, null, 2)}\n`);
}
