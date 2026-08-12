import assert from "node:assert/strict";
import test from "node:test";

import { canonicalBindingsForCandidate } from "../scripts/bind-owner-approved-market-values-to-canonical-roster.mts";

const competitionId = "00000000-0000-4000-8000-000000000001";
const clubId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const membershipId = "00000000-0000-4000-8000-000000000004";
const timestamp = "2026-08-11T10:00:00.000Z";

function candidate(rows: readonly Record<string, unknown>[]) {
  return { rows } as never;
}

function roster() {
  return {
    schemaVersion: "touchline-canonical-roster-export-v1",
    audit: { state: "ready" },
    source: { sourceRevision: "a".repeat(64) },
    competitions: [{ id: competitionId, provider: "sportmonks", provider_competition_id: "8", source_updated_at: timestamp }],
    clubs: [{ id: clubId, provider: "sportmonks", provider_team_id: "19", source_updated_at: timestamp }],
    players: [{ id: playerId, provider: "sportmonks", provider_player_id: "123", current_club_id: clubId, source_updated_at: timestamp }],
    memberships: [{ id: membershipId, provider: "sportmonks", player_id: playerId, club_id: clubId, competition_id: competitionId, status: "active", source_updated_at: timestamp }],
  };
}

test("binds only explicit ready provider team/player pairs and never uses names", () => {
  const bindings = canonicalBindingsForCandidate(roster(), candidate([
    { reconciliation_state: "READY_AFTER_CANONICAL_UUID_BINDING", provider_team_id: "19", provider_player_id: "123", player_display_name: "Wrong name is irrelevant" },
    { reconciliation_state: "PENDING_VALUE_MISSING", provider_team_id: "19", provider_player_id: "123" },
  ]));
  assert.deepEqual(bindings, [{
    providerPlayerId: "123", providerTeamId: "19", canonicalPlayerId: playerId, canonicalClubId: clubId,
    canonicalMembershipId: membershipId, canonicalCompetitionId: competitionId,
    playerSourceUpdatedAt: timestamp, clubSourceUpdatedAt: timestamp,
    membershipSourceUpdatedAt: timestamp, competitionSourceUpdatedAt: timestamp,
  }]);
});

test("fails closed when the canonical roster audit is not ready", () => {
  assert.throws(() => canonicalBindingsForCandidate({ ...roster(), audit: { state: "incomplete" } }, candidate([])), /TL_CANONICAL_ROSTER_NOT_READY/);
});
