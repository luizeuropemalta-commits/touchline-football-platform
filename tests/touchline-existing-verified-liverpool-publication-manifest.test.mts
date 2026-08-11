import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildExistingVerifiedLiverpoolPublicationManifest } from "../scripts/build-existing-verified-liverpool-publication-manifest.mts";

const archive = JSON.parse(readFileSync(
  new URL("../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T19-32-00Z/liverpool-existing-verified-values.json", import.meta.url),
  "utf8",
)) as { rows: Record<string, unknown>[]; rowsSha256: string };

test("builds exactly the existing 29 verified Liverpool records without inventing a value", () => {
  const manifest = buildExistingVerifiedLiverpoolPublicationManifest({ rows: archive.rows, sourceRowsSha256: archive.rowsSha256 });
  assert.equal(manifest.status, "review-required");
  assert.equal(manifest.applicationEligible, false);
  assert.equal(manifest.execution, "dry-run-only");
  assert.equal(manifest.counts.readyRows, 29);
  assert.equal(manifest.counts.excludedRows, 0);
  assert.equal(manifest.rows.every((row) => row.providerTeamId === "8" && row.currency === "EUR" && row.publicationAction === "ready_to_publish"), true);
  assert.equal(new Set(manifest.rows.map((row) => row.canonicalPlayerId)).size, 29);
  assert.equal(new Set(manifest.rows.map((row) => row.canonicalMembershipId)).size, 29);
  assert.match(manifest.manifestFingerprintSha256, /^[0-9a-f]{64}$/);
});

test("fails closed if a legacy row loses verified/manual canonical evidence", () => {
  assert.throws(() => buildExistingVerifiedLiverpoolPublicationManifest({
    sourceRowsSha256: archive.rowsSha256,
    rows: archive.rows.map((row, index) => index === 0 ? { ...row, confidence: "estimated" } : row),
  }), /TL_LIVERPOOL_PUBLICATION_ROW_INVALID/);
  assert.throws(() => buildExistingVerifiedLiverpoolPublicationManifest({
    sourceRowsSha256: archive.rowsSha256,
    rows: archive.rows.slice(1),
  }), /TL_LIVERPOOL_PUBLICATION_SOURCE_INVALID/);
});
