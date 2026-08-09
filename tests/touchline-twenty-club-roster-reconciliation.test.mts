import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  planTouchlineTwentyClubRosterReconciliation,
  TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE,
  type TouchlineCanonicalRosterExport,
  type TouchlineOwnerRosterEntry,
} from "../lib/football-data/twenty-club-roster-reconciliation.ts";

const coreSource = readFileSync(
  new URL("../lib/football-data/twenty-club-roster-reconciliation.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../lib/football-data/twenty-club-roster-reconciliation-server.ts", import.meta.url),
  "utf8",
);

const timestamp = "2026-08-09T19:00:00.000Z";

function uuid(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function roster(label: "baseline" | "incoming" = "baseline"): TouchlineCanonicalRosterExport {
  const competitionId = uuid(1);
  const clubs = TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.map((scope, index) => ({
    id: uuid(index + 10),
    provider: "sportmonks",
    provider_team_id: scope.providerTeamId,
    competition_id: competitionId,
    name: scope.clubName,
    source_updated_at: timestamp,
  }));
  const players = TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.map((scope, index) => ({
    id: uuid(index + 100),
    provider: "sportmonks",
    provider_player_id: String(1000 + index),
    current_club_id: clubs[index]!.id,
    name: `Roster ${scope.providerTeamId}`,
    display_name: `Roster ${scope.providerTeamId}`,
    source_updated_at: timestamp,
  }));
  const memberships = players.map((player, index) => ({
    id: uuid(index + 200),
    provider: "sportmonks",
    player_id: player.id,
    club_id: clubs[index]!.id,
    competition_id: competitionId,
    status: "active",
    source_updated_at: timestamp,
  }));
  return {
    schemaVersion: "touchline-canonical-roster-export-v1",
    exportedAt: timestamp,
    source: { runId: `${label}-run`, sourceRevision: `${label}-revision` },
    competitions: [{
      id: competitionId,
      provider: "sportmonks",
      provider_competition_id: "8",
      source_updated_at: timestamp,
    }],
    clubs,
    players,
    memberships,
  };
}

function replaceRoster(
  source: TouchlineCanonicalRosterExport,
  overrides: Partial<TouchlineCanonicalRosterExport>,
): TouchlineCanonicalRosterExport {
  return { ...source, ...overrides };
}

function ownerEntries(snapshot: TouchlineCanonicalRosterExport): TouchlineOwnerRosterEntry[] {
  return snapshot.players.map((player) => {
    const club = snapshot.clubs.find((candidate) => candidate.id === player.current_club_id)!;
    return {
      clubProviderTeamId: club.provider_team_id,
      normalizedPlayerName: player.display_name ?? player.name,
      sourceRowSha256: `owner-row-${player.provider_player_id}`,
    };
  });
}

test("a complete 20-club snapshot produces a dry-run-only review plan", () => {
  const baseline = roster("baseline");
  const incoming = roster("incoming");
  const plan = planTouchlineTwentyClubRosterReconciliation({ canonicalBaseline: baseline, incomingProviderSnapshot: incoming });

  assert.equal(plan.status, "review-required");
  assert.equal(plan.applicationEligible, false);
  assert.equal(plan.execution, "dry-run-only");
  assert.equal(plan.scope.length, 20);
  assert.equal(plan.counts.expectedClubs, 20);
  assert.equal(plan.counts.noChange, 20);
  assert.equal(plan.counts.additionsForReview, 0);
  assert.equal(plan.counts.transfersForReview, 0);
  assert.equal(plan.counts.preservedUnseenForReview, 0);
  assert.ok(plan.operations.every((operation) => operation.applicationEligible === false));
});

test("a partial provider response blocks before proposing any roster operation", () => {
  const baseline = roster("baseline");
  const incoming = roster("incoming");
  const missingClub = incoming.clubs.find((club) => club.provider_team_id === "19")!;
  const partial = replaceRoster(incoming, {
    clubs: incoming.clubs.filter((club) => club.id !== missingClub.id),
    players: incoming.players.filter((player) => player.current_club_id !== missingClub.id),
    memberships: incoming.memberships.filter((membership) => membership.club_id !== missingClub.id),
  });
  const plan = planTouchlineTwentyClubRosterReconciliation({ canonicalBaseline: baseline, incomingProviderSnapshot: partial });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.operations.length, 0);
  assert.equal(plan.quarantined.length, 0);
  assert.ok(plan.issues.some((entry) => entry.code === "BLOCKED_PARTIAL_PROVIDER_RESPONSE" && entry.scopeProviderTeamId === "19"));
});

test("duplicate provider IDs and duplicate active memberships block the entire plan", () => {
  const baseline = roster("baseline");
  const incoming = roster("incoming");
  const arsenal = incoming.clubs.find((club) => club.provider_team_id === "19")!;
  const city = incoming.clubs.find((club) => club.provider_team_id === "9")!;
  const cityPlayer = incoming.players.find((player) => player.current_club_id === city.id)!;
  const duplicateProvider = replaceRoster(incoming, {
    players: incoming.players.map((player) => player.id === cityPlayer.id ? {
      ...player,
      provider_player_id: "1000",
    } : player),
  });
  const providerPlan = planTouchlineTwentyClubRosterReconciliation({ canonicalBaseline: baseline, incomingProviderSnapshot: duplicateProvider });
  assert.equal(providerPlan.status, "blocked");
  assert.ok(providerPlan.issues.some((entry) => entry.code === "BLOCKED_DUPLICATE_PROVIDER_PLAYER_ID" && entry.providerPlayerId === "1000"));

  const arsenalPlayer = incoming.players.find((player) => player.current_club_id === arsenal.id)!;
  const originalMembership = incoming.memberships.find((membership) => membership.player_id === arsenalPlayer.id)!;
  const duplicateMembership = replaceRoster(incoming, {
    memberships: [...incoming.memberships, { ...originalMembership, id: uuid(999) }],
  });
  const membershipPlan = planTouchlineTwentyClubRosterReconciliation({ canonicalBaseline: baseline, incomingProviderSnapshot: duplicateMembership });
  assert.equal(membershipPlan.status, "blocked");
  assert.ok(membershipPlan.issues.some((entry) => entry.code === "BLOCKED_DUPLICATE_ACTIVE_MEMBERSHIP" && entry.canonicalPlayerIds.includes(arsenalPlayer.id)));
});

test("a complete Newcastle-to-Arsenal transfer is review-only and preserves historic membership", () => {
  const baseline = roster("baseline");
  const incoming = roster("incoming");
  const arsenal = incoming.clubs.find((club) => club.provider_team_id === "19")!;
  const newcastle = incoming.clubs.find((club) => club.provider_team_id === "20")!;
  const bruno = incoming.players.find((player) => player.current_club_id === newcastle.id)!;
  const brunoMembership = incoming.memberships.find((membership) => membership.player_id === bruno.id)!;
  const newcastleReplacement = {
    id: uuid(801),
    provider: "sportmonks",
    provider_player_id: "9901",
    current_club_id: newcastle.id,
    name: "Newcastle Replacement",
    display_name: "Newcastle Replacement",
    source_updated_at: timestamp,
  };
  const newcastleReplacementMembership = {
    id: uuid(802),
    provider: "sportmonks",
    player_id: newcastleReplacement.id,
    club_id: newcastle.id,
    competition_id: incoming.competitions[0]!.id,
    status: "active",
    source_updated_at: timestamp,
  };
  const moved = replaceRoster(incoming, {
    players: incoming.players.map((player) => {
      if (player.id === bruno.id) return {
        ...player,
        provider_player_id: "459145",
        current_club_id: arsenal.id,
        name: "Bruno Guimaraes",
        display_name: "Bruno Guimaraes",
      };
      return player;
    }).concat(newcastleReplacement),
    memberships: incoming.memberships.map((membership) => {
      if (membership.id === brunoMembership.id) return { ...membership, club_id: arsenal.id };
      return membership;
    }).concat(newcastleReplacementMembership),
  });
  const historicalBaseline = replaceRoster(baseline, {
    players: baseline.players.map((player) => player.id === bruno.id ? {
      ...player,
      provider_player_id: "459145",
      name: "Bruno Guimaraes",
      display_name: "Bruno Guimaraes",
    } : player),
  });
  const plan = planTouchlineTwentyClubRosterReconciliation({ canonicalBaseline: historicalBaseline, incomingProviderSnapshot: moved });
  const transfer = plan.operations.find((operation) => operation.providerPlayerId === "459145");

  assert.equal(plan.status, "review-required");
  assert.equal(transfer?.kind, "TRANSFER_REVIEW_REQUIRED");
  assert.equal(transfer?.baselineClubProviderTeamId, "20");
  assert.equal(transfer?.incomingClubProviderTeamId, "19");
  assert.equal(transfer?.applicationEligible, false);
  assert.equal(plan.counts.transfersForReview, 1);
  assert.equal(plan.counts.preservedUnseenForReview, 0);

  const conflict = replaceRoster(moved, {
    memberships: [...moved.memberships, { ...brunoMembership, id: uuid(998), status: "active" }],
  });
  const conflictPlan = planTouchlineTwentyClubRosterReconciliation({ canonicalBaseline: historicalBaseline, incomingProviderSnapshot: conflict });
  assert.equal(conflictPlan.status, "blocked");
  assert.ok(conflictPlan.issues.some((entry) => entry.code === "BLOCKED_DUPLICATE_ACTIVE_MEMBERSHIP"));
});

test("unmatched manual-scope members are quarantined pending and Liverpool stays out of manual value scope", () => {
  const baseline = roster("baseline");
  const incoming = roster("incoming");
  const arsenal = incoming.clubs.find((club) => club.provider_team_id === "19")!;
  const extraPlayer = {
    id: uuid(700),
    provider: "sportmonks",
    provider_player_id: "7700",
    current_club_id: arsenal.id,
    name: "Roster Extra",
    display_name: "Roster Extra",
    source_updated_at: timestamp,
  };
  const extraMembership = {
    id: uuid(701),
    provider: "sportmonks",
    player_id: extraPlayer.id,
    club_id: arsenal.id,
    competition_id: incoming.competitions[0]!.id,
    status: "active",
    source_updated_at: timestamp,
  };
  const withExtra = replaceRoster(incoming, {
    players: [...incoming.players, extraPlayer],
    memberships: [...incoming.memberships, extraMembership],
  });
  const plan = planTouchlineTwentyClubRosterReconciliation({
    canonicalBaseline: baseline,
    incomingProviderSnapshot: withExtra,
    ownerRosterEntries: ownerEntries(incoming),
  });

  assert.equal(plan.status, "review-required");
  assert.equal(plan.counts.quarantinedPending, 1);
  assert.deepEqual(plan.quarantined[0], {
    reconciliationState: "QUARANTINED",
    manualValueState: "PENDING",
    applicationEligible: false,
    providerPlayerId: "7700",
    canonicalPlayerId: uuid(700),
    canonicalClubId: arsenal.id,
    providerTeamId: "19",
    canonicalMembershipId: uuid(701),
    playerSourceUpdatedAt: timestamp,
    membershipSourceUpdatedAt: timestamp,
    reason: "NO_EXACT_OWNER_ROSTER_ENTRY",
  });
  assert.ok(!plan.quarantined.some((entry) => entry.providerTeamId === "8"));
});

test("the planner and server facade have no client, provider, environment, I/O, DML or executor capability", () => {
  assert.match(serverSource, /import "server-only"/);
  assert.match(serverSource, /planTouchlineTwentyClubRosterReconciliation/);
  for (const source of [coreSource, serverSource]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|createAdminClient|createClient|createFootballDataProvider|process\.env|node:fs|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  }
  assert.doesNotMatch(serverSource, /from\s+["'][^"']*(?:app\/api|route\.ts)[^"']*["']/);
});
