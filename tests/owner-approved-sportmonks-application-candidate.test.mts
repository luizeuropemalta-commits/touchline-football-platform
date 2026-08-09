import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOwnerApprovedSportmonksApplicationCandidate,
} from "../scripts/build-owner-approved-sportmonks-application-candidate.mjs";
import {
  normalizeTranscriptIdentity,
  parseOwnerTranscriptCsv,
} from "../scripts/reconcile-owner-approved-transcript-market-values.mjs";

const baseDirectory = new URL("../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/", import.meta.url);
const ownerCsv = readFileSync(new URL("owner-approved-market-values-2026-08-09.csv", baseDirectory), "utf8");
const ownerManifestText = readFileSync(new URL("owner-approved-market-values-2026-08-09.manifest.json", baseDirectory), "utf8");
const snapshotText = readFileSync(new URL("provider-roster-audits/2026-08-09T19-11-27-889Z/sportmonks-roster-snapshot.json", baseDirectory), "utf8");
const candidateSource = readFileSync(new URL("../scripts/build-owner-approved-sportmonks-application-candidate.mjs", import.meta.url), "utf8");
const archivedCandidateDirectory = new URL("application-candidates/2026-08-09T19-25-39-089Z/", baseDirectory);

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function candidate(snapshot = JSON.parse(snapshotText)) {
  return buildOwnerApprovedSportmonksApplicationCandidate({
    ownerRows: parseOwnerTranscriptCsv(ownerCsv),
    ownerManifest: JSON.parse(ownerManifestText),
    snapshot,
    ownerCsvSha256: "owner-csv-sha",
    ownerManifestSha256: "owner-manifest-sha",
    snapshotSha256: "sportmonks-snapshot-sha",
    generatedAt: "2026-08-09T20:00:00.000Z",
  });
}

test("the archived Sportmonks snapshot produces the exact local 538-match candidate", () => {
  const result = candidate();

  assert.equal(result.status, "LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING");
  assert.equal(result.applicationEligible, false);
  assert.deepEqual(result.counts, {
    ownerRows: 558,
    providerMembersManualScope: 561,
    exactMatches: 538,
    readyAfterCanonicalUuidBinding: 533,
    pendingValueMissing: 5,
    providerOnlyPending: 23,
    ownerOnlyReview: 20,
    ambiguousNameGroups: 0,
  });
  assert.equal(result.rows.length, 538);
  assert.equal(new Set(result.rows.map((row) => row.source_row_sha256)).size, 538);
  assert.equal(new Set(result.rows.map((row) => `${row.provider_team_id}:${row.provider_player_id}`)).size, 538);
  assert.equal(result.rows.filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING").length, 533);
  assert.equal(result.rows.filter((row) => row.reconciliation_state === "PENDING_VALUE_MISSING").length, 5);
  assert.ok(result.rows
    .filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING")
    .every((row) => Number.isSafeInteger(row.market_value_eur) && row.market_value_eur > 0 && row.currency === "EUR"));
  assert.ok(result.rows.every((row) => row.application_eligible === false));
  assert.ok(result.rows.every((row) => !("canonical_player_id" in row) && !("canonical_club_id" in row)));
});

test("pending and review records remain outside the future value write set", () => {
  const result = candidate();

  for (const row of result.rows.filter((row) => row.reconciliation_state === "PENDING_VALUE_MISSING")) {
    assert.equal(row.market_value_eur, null);
    assert.equal(row.currency, null);
    assert.equal(row.application_eligible, false);
  }
  assert.ok(result.providerOnlyQuarantinedPending.every((row) => (
    row.manual_value_state === "PENDING"
    && row.market_value_eur === null
    && row.application_eligible === false
  )));
  assert.ok(result.ownerOnlyReview.every((row) => (
    row.manual_value_state === "REVIEW" || row.manual_value_state === "PENDING"
  )));
  assert.ok(result.ownerOnlyReview.every((row) => row.market_value_eur === null && row.application_eligible === false));
  assert.match(result.idempotentFutureApplication.requiredPreconditions.join("\n"), /excluded from every write set/i);
});

test("partial, ambiguous and duplicate provider identity inputs fail closed", () => {
  const partial = JSON.parse(snapshotText);
  partial.validation.state = "partial";
  assert.throws(() => candidate(partial), /SNAPSHOT_NOT_READY/);

  const ambiguous = JSON.parse(snapshotText);
  const manualClub = ambiguous.clubs.find((club: { manualValueScope: boolean }) => club.manualValueScope)!;
  manualClub.members.push({ ...manualClub.members[0], providerPlayerId: "99999999" });
  assert.throws(() => candidate(ambiguous), /AMBIGUOUS_NAME_GROUP/);

  const duplicateProviderId = JSON.parse(snapshotText);
  const ownerRows = parseOwnerTranscriptCsv(ownerCsv);
  let originalMember: { playerName: string; providerPlayerId: string } | null = null;
  let duplicateOwner: { player_display_name: string } | null = null;
  let duplicateClub: { members: Array<{ playerName: string; providerPlayerId: string }> } | null = null;
  for (const club of duplicateProviderId.clubs.filter((entry: { manualValueScope: boolean }) => entry.manualValueScope)) {
    const sameClubOwners = ownerRows.filter((row) => row.club_name === club.clubName && row.market_value_eur);
    for (const member of club.members) {
      const matchingOwner = sameClubOwners.find((row) => normalizeTranscriptIdentity(row.player_display_name) === normalizeTranscriptIdentity(member.playerName));
      const anotherOwner = sameClubOwners.find((row) => normalizeTranscriptIdentity(row.player_display_name) !== normalizeTranscriptIdentity(member.playerName));
      if (matchingOwner && anotherOwner) {
        originalMember = member;
        duplicateOwner = anotherOwner;
        duplicateClub = club;
        break;
      }
    }
    if (duplicateClub) break;
  }
  assert.ok(originalMember && duplicateOwner && duplicateClub);
  duplicateClub!.members.push({ ...originalMember!, playerName: duplicateOwner!.player_display_name });
  assert.throws(() => candidate(duplicateProviderId), /DUPLICATE_PROVIDER_PLAYER_ID/);
});

test("candidate identity is deterministic and every ready row has an idempotency key", () => {
  const first = candidate();
  const second = candidate();

  assert.equal(first.candidateId, second.candidateId);
  assert.equal(first.candidateFingerprintSha256, second.candidateFingerprintSha256);
  assert.ok(first.rows.every((row) => /^[a-f0-9]{64}$/.test(row.row_idempotency_key_sha256)));
  assert.deepEqual(first.idempotentFutureApplication.futureWriteTablesOnly, [
    "football_player_market_values",
    "football_player_market_value_history",
    "football_market_value_import_runs",
    "football_market_value_import_items",
    "football_market_value_job_runs",
  ]);
});

test("the committed archive preserves the candidate's artifact hashes and review-only state", () => {
  const manifest = JSON.parse(readFileSync(new URL("application-manifest.json", archivedCandidateDirectory), "utf8"));
  const matchedRows = readFileSync(new URL("matched-owner-values.csv", archivedCandidateDirectory), "utf8");
  const providerOnly = readFileSync(new URL("provider-only-quarantined-pending.json", archivedCandidateDirectory), "utf8");
  const ownerOnly = readFileSync(new URL("owner-only-review.json", archivedCandidateDirectory), "utf8");

  assert.equal(manifest.applicationEligible, false);
  assert.equal(manifest.status, "LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING");
  assert.equal(manifest.counts.exactMatches, 538);
  assert.equal(manifest.counts.readyAfterCanonicalUuidBinding, 533);
  assert.equal(manifest.counts.pendingValueMissing, 5);
  assert.equal(manifest.counts.providerOnlyPending, 23);
  assert.equal(manifest.counts.ownerOnlyReview, 20);
  assert.equal(sha256(matchedRows), manifest.artifactSha256["matched-owner-values.csv"]);
  assert.equal(sha256(providerOnly), manifest.artifactSha256["provider-only-quarantined-pending.json"]);
  assert.equal(sha256(ownerOnly), manifest.artifactSha256["owner-only-review.json"]);
  assert.equal(JSON.stringify(manifest).includes("SPORTMONKS_API_TOKEN"), false);
  assert.equal(JSON.stringify(manifest).includes("api_token"), false);
});

test("the local candidate has no provider, database, sync or mutation capability and forbids economic surfaces", () => {
  for (const forbidden of [
    "@supabase",
    "createClient",
    "createAdminClient",
    "createFootballDataProvider",
    "fetch(",
    "process.env",
    ".insert(",
    ".upsert(",
    ".delete(",
    ".rpc(",
  ]) {
    assert.equal(candidateSource.includes(forbidden), false, `forbidden local candidate capability: ${forbidden}`);
  }
  assert.doesNotMatch(candidateSource, /\.from\([^)]*\)\s*\.update\s*\(/);
  const result = candidate();
  assert.ok(result.rows.every((row) => Object.keys(row).every((key) => !/(tier|price|colour|color|contract)/i.test(key))));
  for (const surface of [
    "touchline_card_inventory",
    "touchline_card_contracts",
    "touchline_card_price_catalog",
    "competition_tier",
    "price_table_version",
    "wallet",
    "offer",
    "membership",
    "roster",
  ]) {
    assert.ok(result.idempotentFutureApplication.prohibitedCanonicalSurfaces.includes(surface));
  }
});
