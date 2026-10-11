// Local manifest verifier only. It opens no connection and cannot apply SQL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const entries = [
  ["20261011005000", "supabase/migrations/20261011005000_touchline_quick_sub_saved_xi_guard.sql", "943c2eee6eabb5a479a59215fb859ddbf0edd406901e5c7e6219685ef615ff98", 4, 67],
  ["20261011006000", "supabase/migrations/20261011006000_touchline_quick_sub_live_fixture_guard.sql", "507ab04baf48f650036549602496354dadddb5916681046b1b9e6a4efb7821ae", 5, 51],
  ["20261011007000", "supabase/migrations/20261011007000_touchline_quick_sub_active_gameweek_binding.sql", "ed1d3d0d98e898c7688b04010ef9761e6dd6c98f1d1e21b25e9a2d2de20af2f7", 5, 143],
  ["20261011008000", "supabase/migrations/20261011008000_touchline_quick_sub_live_gameweek_guard.sql", "89bff7fb68b7fddcea3e17e7c5cf2bce66c2adf53a2376bc7527bb85b80f141f", 4, 62],
  ["20261011009000", "supabase/migrations/20261011009000_touchline_quick_sub_command_audit.sql", "94b6fedbef20364cf186a78fedc78c3e2eb94382b80394565824eed932bb5ecd", 4, 151],
  ["20261011010000", "supabase/migrations/20261011010000_touchline_fantasy_market_plan_policy.sql", "0c00b9b610e2468faba66eb434b69087c65048b78930b2554b6de5b22212e2af", 4, 207],
  ["20261011011000", "supabase/migrations/20261011011000_touchline_fantasy_owner_vip_access.sql", "37162d4c566e87b4988e640d953e2d5186afe2a3a7ad89a388c7deb304a26e00", 4, 172],
  ["20261011012000", "supabase/migrations/20261011012000_touchline_fantasy_beta_enrollment.sql", "3fd41da7e298c72120914506b70207dacc1ad0fad4e45d9328b30dd5844ee4a0", 3, 130],
  ["20261011013000", "supabase/migrations/20261011013000_touchline_live_presentation_score_payload_contract.sql", "ebdef0328716f50b6b420ecd297b1259732a83252334cf8966c29b71185a24a8", 4, 111],
  ["20261011014000", "supabase/migrations/20261011014000_touchline_fantasy_server_owned_plan_budgets.sql", "c96a98fc4d8918942e86dcbe3de65a1556a6c7b3ed117ebaf181b41961d9ff14", 5, 195],
  ["20261011015000", "supabase/migrations/20261011015000_touchline_fantasy_confirmed_plan_lock_guard.sql", "9ea0054ace33eb8ce9428b0eb21d6b263a1471370f35c09f6d7139b4cd02aefd", 8, 163],
];

export const TOUCHLINE_QA_MIGRATION_BATCH_20261011 = Object.freeze(entries.map(([version, file, sourceSha256, beginLine, commitLine]) => Object.freeze({ version, file, sourceSha256, beginLine, commitLine })));
const canonicalFiles = new Map(TOUCHLINE_QA_MIGRATION_BATCH_20261011.map((entry) => [entry.version, entry.file]));

function fail(code, detail) { throw new Error(`${code}: ${detail}`); }

function assertManifest(manifest) {
  assert.equal(manifest.length, 11, "QA batch must contain exactly 11 migrations");
  const versions = new Set();
  const files = new Set();
  for (const entry of manifest) {
    if (!/^202610110(?:0[5-9]|1[0-5])000$/.test(entry.version)) fail("TL_QA_BATCH_MANIFEST_VERSION_INVALID", entry.version);
    if (canonicalFiles.get(entry.version) !== entry.file) fail("TL_QA_BATCH_MANIFEST_FILE_INVALID", entry.file);
    if (!/^[0-9a-f]{64}$/.test(entry.sourceSha256) || !Number.isSafeInteger(entry.beginLine) || !Number.isSafeInteger(entry.commitLine)) fail("TL_QA_BATCH_MANIFEST_HASH_OR_ENVELOPE_INVALID", entry.file);
    if (entry.file.startsWith("/") || entry.file.includes(`..${sep}`) || entry.file.includes("../")) fail("TL_QA_BATCH_MANIFEST_PATH_INVALID", entry.file);
    if (versions.has(entry.version)) fail("TL_QA_BATCH_MANIFEST_DUPLICATE_VERSION", entry.version);
    if (files.has(entry.file)) fail("TL_QA_BATCH_MANIFEST_DUPLICATE_FILE", entry.file);
    const canonical = TOUCHLINE_QA_MIGRATION_BATCH_20261011.find((item) => item.version === entry.version);
    if (entry.sourceSha256 !== canonical.sourceSha256 || entry.beginLine !== canonical.beginLine || entry.commitLine !== canonical.commitLine) {
      fail("TL_QA_BATCH_MANIFEST_IDENTITY_MISMATCH", entry.file);
    }
    versions.add(entry.version);
    files.add(entry.file);
  }
  assert.deepEqual(manifest.map((entry) => entry.version), [...versions].sort(), "QA batch must be version ordered");
}

// Exact, hash-bound envelope removal for a future one-transaction rehearsal.
// It is deliberately not a general SQL parser or an execution mechanism.
export function prepareTouchlineQaMigrationPayload(entry, source) {
  assert(Buffer.isBuffer(source), "Migration source must be bytes");
  assert.equal(sha256(source), entry.sourceSha256, `TL_QA_BATCH_MIGRATION_HASH_MISMATCH: ${entry.file}`);
  const text = source.toString("utf8");
  assert(Buffer.from(text).equals(source), `TL_QA_BATCH_MIGRATION_ENCODING_INVALID: ${entry.file}`);
  const lines = text.split("\n");
  assert.equal(lines[entry.beginLine - 1], "begin;", `TL_QA_BATCH_BEGIN_LINE_MISMATCH: ${entry.file}`);
  assert.equal(lines[entry.commitLine - 1], "commit;", `TL_QA_BATCH_COMMIT_LINE_MISMATCH: ${entry.file}`);
  assert.equal(lines.length, entry.commitLine + 1, `TL_QA_BATCH_TRAILING_CONTENT_INVALID: ${entry.file}`);
  assert.equal(lines.at(-1), "", `TL_QA_BATCH_FINAL_NEWLINE_REQUIRED: ${entry.file}`);
  assert(lines.slice(0, entry.beginLine - 1).every((line) => line === "" || line.startsWith("--")), `TL_QA_BATCH_PREAMBLE_INVALID: ${entry.file}`);
  assert.deepEqual(lines.flatMap((line, index) => /^(begin|commit|rollback);$/i.test(line) ? [index + 1] : []), [entry.beginLine, entry.commitLine], `TL_QA_BATCH_TRANSACTION_ENVELOPE_INVALID: ${entry.file}`);
  const retained = lines.filter((_, index) => index + 1 !== entry.beginLine && index + 1 !== entry.commitLine);
  const payload = Buffer.from(retained.join("\n"));
  const restored = [...retained];
  restored.splice(entry.beginLine - 1, 0, "begin;");
  restored.splice(entry.commitLine - 1, 0, "commit;");
  assert(Buffer.from(restored.join("\n")).equals(source), `TL_QA_BATCH_PAYLOAD_RECONSTRUCTION_MISMATCH: ${entry.file}`);
  return Object.freeze({ payload, metadata: Object.freeze({
    version: entry.version, file: entry.file, sourceSha256: entry.sourceSha256,
    payloadSha256: sha256(payload), sourceBytes: source.length, payloadBytes: payload.length,
    removedLines: Object.freeze([entry.beginLine, entry.commitLine]),
  }) });
}

export async function verifyTouchlineQaMigrationBatch({ rootDir = repoRoot, manifest = TOUCHLINE_QA_MIGRATION_BATCH_20261011, readSource } = {}) {
  assertManifest(manifest);
  const absoluteRoot = resolve(rootDir);
  const reader = readSource ?? ((file) => readFile(resolve(absoluteRoot, file)));
  const verified = [];
  for (const entry of manifest) {
    const absolutePath = resolve(absoluteRoot, entry.file);
    if (!absolutePath.startsWith(`${absoluteRoot}${sep}`)) fail("TL_QA_BATCH_MANIFEST_PATH_ESCAPE", entry.file);
    let source;
    try { source = await reader(entry.file); } catch { fail("TL_QA_BATCH_MIGRATION_MISSING", entry.file); }
    const prepared = prepareTouchlineQaMigrationPayload(entry, source);
    verified.push(Object.freeze({ ...prepared.metadata, transactionEnvelope: Object.freeze({ beginLine: entry.beginLine, commitLine: entry.commitLine }) }));
  }
  return Object.freeze({ kind: "TOUCHLINE_QA_MIGRATION_BATCH_20261011", entries: Object.freeze(verified) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, "This verifier accepts no target, connection, or SQL arguments");
  const verified = await verifyTouchlineQaMigrationBatch();
  process.stdout.write(`${verified.kind}: verified ${verified.entries.length} local files; no database or network action\n`);
  for (const entry of verified.entries) process.stdout.write(`${entry.version} ${entry.sourceSha256} ${entry.payloadSha256} BEGIN:${entry.transactionEnvelope.beginLine} COMMIT:${entry.transactionEnvelope.commitLine} ${entry.file}\n`);
}
