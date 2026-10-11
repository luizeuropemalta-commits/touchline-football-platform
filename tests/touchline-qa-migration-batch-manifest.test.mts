import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TOUCHLINE_QA_MIGRATION_BATCH_20261011,
  prepareTouchlineQaMigrationPayload,
  verifyTouchlineQaMigrationBatch,
} from "../scripts/qa/verify-touchline-qa-migration-batch-20261011.mjs";

async function inMemorySources() {
  return new Map(await Promise.all(TOUCHLINE_QA_MIGRATION_BATCH_20261011.map(async (entry) => [
    entry.file,
    await readFile(new URL(`../${entry.file}`, import.meta.url)),
  ] as const)));
}

function mapReader(sources: Map<string, Buffer>) {
  return async (file: string) => {
    const source = sources.get(file);
    if (!source) throw new Error("missing");
    return source;
  };
}

test("QA migration batch manifest is exact, ordered, local-only, and has byte-reconstructible transaction envelopes", async () => {
  const verified = await verifyTouchlineQaMigrationBatch();
  assert.equal(verified.entries.length, 11);
  assert.deepEqual(verified.entries.map((entry) => entry.version), TOUCHLINE_QA_MIGRATION_BATCH_20261011.map((entry) => entry.version));
  for (const entry of verified.entries) {
    assert.match(entry.sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(entry.payloadSha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.transactionEnvelope.beginLine < entry.transactionEnvelope.commitLine, true);
  }
});

test("QA migration batch verifier rejects changed, duplicate, missing, and malformed-envelope inputs entirely in memory", async () => {
  const sources = await inMemorySources();
  const first = TOUCHLINE_QA_MIGRATION_BATCH_20261011[0];
  sources.set(first.file, Buffer.from("begin;\nselect 1;\ncommit;\n"));
  await assert.rejects(verifyTouchlineQaMigrationBatch({ readSource: mapReader(sources) }), /TL_QA_BATCH_MIGRATION_HASH_MISMATCH/);

  sources.set(first.file, await readFile(new URL(`../${first.file}`, import.meta.url)));
  await assert.rejects(verifyTouchlineQaMigrationBatch({
    manifest: [...TOUCHLINE_QA_MIGRATION_BATCH_20261011.slice(0, -1), first],
    readSource: mapReader(sources),
  }), /TL_QA_BATCH_MANIFEST_DUPLICATE_VERSION/);

  sources.delete(TOUCHLINE_QA_MIGRATION_BATCH_20261011[7].file);
  await assert.rejects(verifyTouchlineQaMigrationBatch({ readSource: mapReader(sources) }), /TL_QA_BATCH_MIGRATION_MISSING/);

  const malformed = Buffer.from(`${"-- preamble\n".repeat(3)}begin;\n${"select 1;\n".repeat(62)}`);
  const malformedFirst = {
    ...first,
    sourceSha256: createHash("sha256").update(malformed).digest("hex"),
  };
  sources.set(first.file, malformed);
  await assert.rejects(verifyTouchlineQaMigrationBatch({
    manifest: [malformedFirst, ...TOUCHLINE_QA_MIGRATION_BATCH_20261011.slice(1)],
    readSource: mapReader(sources),
  }), /TL_QA_BATCH_MANIFEST_IDENTITY_MISMATCH/);
  assert.throws(() => prepareTouchlineQaMigrationPayload(malformedFirst, malformed), /TL_QA_BATCH_COMMIT_LINE_MISMATCH/);
  for (const field of ["beginLine", "commitLine"] as const) {
    await assert.rejects(verifyTouchlineQaMigrationBatch({
      manifest: [{ ...first, [field]: first[field] + 1 }, ...TOUCHLINE_QA_MIGRATION_BATCH_20261011.slice(1)],
      readSource: mapReader(sources),
    }), /TL_QA_BATCH_MANIFEST_IDENTITY_MISMATCH/);
  }
});
