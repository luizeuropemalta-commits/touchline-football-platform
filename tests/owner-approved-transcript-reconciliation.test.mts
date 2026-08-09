import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS,
  reconcileOwnerTranscriptRows,
} from "../scripts/reconcile-owner-approved-transcript-market-values.mjs";

const reconciliationSource = readFileSync(
  new URL("../scripts/reconcile-owner-approved-transcript-market-values.mjs", import.meta.url),
  "utf8",
);
const report = JSON.parse(readFileSync(
  new URL("../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/owner-approved-market-values-2026-08-09.reconciliation-report.json", import.meta.url),
  "utf8",
));

function sourceRow(overrides: Record<string, string> = {}) {
  return {
    source_row_sha256: "row-hash",
    club_name: "Arsenal FC",
    player_display_name: "Martin Ødegaard",
    normalized_player_name: "martin degaard",
    market_value_eur: "70000000",
    review_status: "REVIEW_PROVIDER_ID_MISSING",
    ...overrides,
  };
}

function canonicalRoster(overrides: Record<string, unknown> = {}) {
  const roster = {
    schemaVersion: "touchline-canonical-roster-export-v1",
    exportedAt: "2026-08-09T18:00:00.000Z",
    source: { runId: "read-only-audit-run", sourceRevision: "snapshot-1" },
    competitions: [{ id: "competition", provider: "sportmonks", provider_competition_id: "8" }],
    clubs: [{ id: "club", provider: "sportmonks", provider_team_id: "19", competition_id: "competition", name: "Arsenal FC" }],
    players: [{
      id: "canonical-player",
      provider: "sportmonks",
      provider_player_id: "1001",
      current_club_id: "club",
      name: "Martin Ødegaard",
      display_name: "Martin Ødegaard",
    }],
    memberships: [{ player_id: "canonical-player", club_id: "club", competition_id: "competition", status: "active" }],
  };
  return { ...roster, ...overrides };
}

test("missing local canonical roster export fails closed with no fabricated match", () => {
  const result = reconcileOwnerTranscriptRows([sourceRow(), sourceRow({ source_row_sha256: "pending", market_value_eur: "", review_status: "PENDING_VALUE_MISSING" })]);
  assert.equal(result.runStatus, "blocked");
  assert.equal(result.blocker, "LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE");
  assert.deepEqual(result.totals, {
    rows: 2,
    explicitValues: 1,
    pendingValues: 1,
    matchedCandidates: 0,
    review: 1,
    unmatched: 0,
    rosterUnavailable: 1,
  });
  assert.equal(result.rows[0].reconciliation_outcome, "REVIEW_CANONICAL_ROSTER_EXPORT_UNAVAILABLE");
  assert.equal(result.rows[1].reconciliation_outcome, "PENDING_VALUE_MISSING");
  assert.ok(result.rows.every((row) => row.application_eligible === false));
});

test("a unique exact current-club canonical roster candidate remains review-only", () => {
  const result = reconcileOwnerTranscriptRows([sourceRow()], canonicalRoster());
  assert.equal(result.runStatus, "completed-local-review");
  assert.equal(result.rows[0].reconciliation_outcome, "MATCHED_EXACT_NAME_CURRENT_CLUB_REVIEW_REQUIRED");
  assert.equal(result.rows[0].candidate_canonical_player_id, "canonical-player");
  assert.equal(result.rows[0].candidate_provider_player_id, "1001");
  assert.equal(result.rows[0].candidate_provider_team_id, "19");
  assert.equal(result.rows[0].application_eligible, false);
});

test("ambiguous, invalid, and other-club name candidates never become automatic identity bindings", () => {
  const ambiguous = canonicalRoster({
    players: [
      ...canonicalRoster().players,
      { ...canonicalRoster().players[0], id: "other-player", provider_player_id: "1002" },
    ],
    memberships: [
      ...canonicalRoster().memberships,
      { player_id: "other-player", club_id: "club", competition_id: "competition", status: "active" },
    ],
  });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], ambiguous).rows[0].reconciliation_outcome,
    "REVIEW_AMBIGUOUS_NAME_CURRENT_CLUB",
  );

  const invalid = canonicalRoster({ memberships: [{ player_id: "canonical-player", club_id: "club", competition_id: "competition", status: "inactive" }] });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], invalid).rows[0].reconciliation_outcome,
    "REVIEW_CANONICAL_ROSTER_INVALID_OR_DUPLICATE",
  );

  const otherClub = canonicalRoster({
    clubs: [{ id: "club", provider: "sportmonks", provider_team_id: "9", competition_id: "competition", name: "Manchester City" }],
  });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], otherClub).rows[0].reconciliation_outcome,
    "REVIEW_CURRENT_CLUB_MISMATCH",
  );
});

test("reconciliation is a local read-only boundary with the exact 19-club team registry", () => {
  assert.equal(Object.keys(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS).length, 19);
  assert.equal(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS["Arsenal FC"], "19");
  assert.equal(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS["Manchester City"], "9");
  assert.equal(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS["Nottingham Forest"], "63");
  assert.doesNotMatch(reconciliationSource, /fetch\s*\(|createClient|supabase|createFootballDataProvider|sportmonksFetch|process\.env|insert into|update public\.|delete from/i);
  assert.match(reconciliationSource, /LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE/);
  assert.match(reconciliationSource, /MATCHED_EXACT_NAME_CURRENT_CLUB_REVIEW_REQUIRED/);
});

test("the committed reconciliation report makes the missing canonical roster gate explicit", () => {
  assert.equal(report.runStatus, "blocked");
  assert.equal(report.blocker, "LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE");
  assert.equal(report.applicationEligible, false);
  assert.deepEqual(report.totals, {
    rows: 558,
    explicitValues: 553,
    pendingValues: 5,
    matchedCandidates: 0,
    review: 553,
    unmatched: 0,
    rosterUnavailable: 553,
  });
  assert.equal(report.clubs.length, 19);
  assert.ok(report.rows.every((row: { application_eligible: boolean }) => row.application_eligible === false));
  assert.ok(report.rows.every((row: { reconciliation_outcome: string }) => row.reconciliation_outcome !== "VERIFIED"));
});
