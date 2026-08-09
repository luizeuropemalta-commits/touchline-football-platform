import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS,
  TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS,
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

const timestamp = "2026-08-09T18:00:00.000Z";

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function canonicalRoster(overrides: Record<string, unknown> = {}) {
  const teams = Object.entries(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS);
  const competitionId = uuid(1);
  const clubs = teams.map(([clubName, providerTeamId], index) => ({
    id: uuid(index + 10),
    provider: "sportmonks",
    provider_team_id: providerTeamId,
    competition_id: competitionId,
    name: clubName,
    source_updated_at: timestamp,
  }));
  const players = teams.map(([_name, providerTeamId], index) => ({
    id: uuid(index + 100),
    provider: "sportmonks",
    provider_player_id: String(1000 + index),
    current_club_id: clubs[index].id,
    name: providerTeamId === "19" ? "Martin Ødegaard" : `Roster Player ${providerTeamId}`,
    display_name: providerTeamId === "19" ? "Martin Ødegaard" : `Roster Player ${providerTeamId}`,
    source_updated_at: timestamp,
  }));
  const memberships = players.map((player, index) => ({
    id: uuid(index + 200),
    provider: "sportmonks",
    player_id: player.id,
    club_id: clubs[index].id,
    competition_id: competitionId,
    status: "active",
    source_updated_at: timestamp,
  }));
  const roster = {
    schemaVersion: "touchline-canonical-roster-export-v1",
    exportedAt: timestamp,
    source: { runId: "read-only-audit-run", sourceRevision: "snapshot-1" },
    competitions: [{ id: competitionId, provider: "sportmonks", provider_competition_id: "8", source_updated_at: timestamp }],
    clubs,
    players,
    memberships,
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
  assert.equal(result.rows[0].candidate_canonical_player_id, uuid(100));
  assert.equal(result.rows[0].candidate_provider_player_id, "1000");
  assert.equal(result.rows[0].candidate_provider_team_id, "19");
  assert.equal(result.rows[0].application_eligible, false);
});

test("ambiguous, invalid, and other-club name candidates never become automatic identity bindings", () => {
  const base = canonicalRoster();
  const arsenal = base.players.find((player) => player.provider_player_id === "1000")!;
  const arsenalMembership = base.memberships.find((membership) => membership.player_id === arsenal.id)!;
  const ambiguous = canonicalRoster({
    players: [
      ...base.players,
      { ...arsenal, id: uuid(999), provider_player_id: "2002" },
    ],
    memberships: [
      ...base.memberships,
      { ...arsenalMembership, id: uuid(998), player_id: uuid(999) },
    ],
  });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], ambiguous).rows[0].reconciliation_outcome,
    "REVIEW_AMBIGUOUS_NAME_CURRENT_CLUB",
  );

  const invalid = canonicalRoster({
    memberships: base.memberships.map((membership) => membership.player_id === arsenal.id ? { ...membership, status: "inactive" } : membership),
  });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], invalid).rows[0].reconciliation_outcome,
    "REVIEW_CANONICAL_ROSTER_EXPORT_INCOMPLETE",
  );

  const city = base.clubs.find((club) => club.provider_team_id === "9")!;
  const arsenalClub = base.clubs.find((club) => club.provider_team_id === "19")!;
  const cityPlayer = base.players.find((player) => player.current_club_id === city.id)!;
  const otherClub = canonicalRoster({
    players: base.players.map((player) => {
      if (player.id === arsenal.id) return { ...player, current_club_id: city.id };
      if (player.id === cityPlayer.id) return { ...player, current_club_id: arsenalClub.id };
      return player;
    }),
    memberships: base.memberships.map((membership) => {
      if (membership.player_id === arsenal.id) return { ...membership, club_id: city.id };
      if (membership.player_id === cityPlayer.id) return { ...membership, club_id: arsenalClub.id };
      return membership;
    }),
  });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], otherClub).rows[0].reconciliation_outcome,
    "REVIEW_CURRENT_CLUB_MISMATCH",
  );
});

test("provider-team mismatch, audit coverage, and DB-only members fail closed into review/quarantine output", () => {
  const base = canonicalRoster();
  const arsenal = base.players.find((player) => player.provider_player_id === "1000")!;
  const city = base.clubs.find((club) => club.provider_team_id === "9")!;
  const cityPlayer = base.players.find((player) => player.current_club_id === city.id)!;
  const mismatch = canonicalRoster({
    clubs: base.clubs.map((club) => {
      if (club.id === city.id) return { ...club, name: "Arsenal FC" };
      if (club.provider_team_id === "19") return { ...club, name: "Arsenal Reserve" };
      return club;
    }),
    players: base.players.map((player) => {
      if (player.id === cityPlayer.id) return { ...player, name: "Martin Ødegaard", display_name: "Martin Ødegaard" };
      if (player.id === arsenal.id) return { ...player, name: "Arsenal Player", display_name: "Arsenal Player" };
      return player;
    }),
  });
  assert.equal(
    reconcileOwnerTranscriptRows([sourceRow()], mismatch).rows[0].reconciliation_outcome,
    "REVIEW_EXPECTED_PROVIDER_TEAM_ID_MISMATCH",
  );

  const arsenalClub = base.clubs.find((club) => club.provider_team_id === "19")!;
  const extraPlayer = {
    id: uuid(700),
    provider: "sportmonks",
    provider_player_id: "7700",
    current_club_id: arsenalClub.id,
    name: "DB Only Player",
    display_name: "DB Only Player",
    source_updated_at: timestamp,
  };
  const withExtra = canonicalRoster({
    players: [...base.players, extraPlayer],
    memberships: [...base.memberships, {
      id: uuid(701),
      provider: "sportmonks",
      player_id: extraPlayer.id,
      club_id: arsenalClub.id,
      competition_id: base.competitions[0].id,
      status: "active",
      source_updated_at: timestamp,
    }],
  });
  const coverage = reconcileOwnerTranscriptRows([sourceRow()], withExtra).rosterCoverageAudit;
  assert.equal(coverage.state, "ready");
  assert.ok(coverage.quarantined.some((row) => row.provider_player_id === "7700" && row.market_value_eur === null && row.application_eligible === false));
  assert.ok(coverage.outOfManualValueScope.some((row) => row.provider_team_id === "8"));

  const incomplete = canonicalRoster({ clubs: base.clubs.filter((club) => club.provider_team_id !== "8") });
  const incompleteResult = reconcileOwnerTranscriptRows([sourceRow()], incomplete);
  assert.equal(incompleteResult.runStatus, "blocked");
  assert.equal(incompleteResult.blocker, "ROSTER_AUDIT_EXPORT_INCOMPLETE");
  assert.equal(incompleteResult.rows[0].reconciliation_outcome, "REVIEW_CANONICAL_ROSTER_EXPORT_INCOMPLETE");
});

test("reconciliation is a local read-only boundary with the exact 19-club team registry", () => {
  assert.equal(Object.keys(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS).length, 19);
  assert.equal(Object.keys(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS).length, 20);
  assert.equal(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS["Liverpool FC"], "8");
  assert.equal(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS["Arsenal FC"], "19");
  assert.equal(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS["Manchester City"], "9");
  assert.equal(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS["Nottingham Forest"], "63");
  assert.doesNotMatch(reconciliationSource, /fetch\s*\(|createClient|supabase|createFootballDataProvider|sportmonksFetch|process\.env|insert into|update public\.|delete from/i);
  assert.match(reconciliationSource, /LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE/);
  assert.match(reconciliationSource, /ROSTER_AUDIT_EXPORT_INCOMPLETE/);
  assert.match(reconciliationSource, /REVIEW_EXPECTED_PROVIDER_TEAM_ID_MISMATCH/);
  assert.match(reconciliationSource, /QUARANTINED/);
  assert.match(reconciliationSource, /touchline-roster-quarantine-report-v1/);
  assert.match(reconciliationSource, /OUTPUT_AND_QUARANTINE_OUTPUT_REQUIRED_FOR_WRITE_NEW/);
  assert.match(reconciliationSource, /OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN/);
  assert.match(reconciliationSource, /flag: "wx"/);
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
