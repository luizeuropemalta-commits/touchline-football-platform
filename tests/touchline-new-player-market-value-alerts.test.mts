import assert from "node:assert/strict";
import test from "node:test";

import { TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE, type TouchlineCanonicalRosterExport } from "../lib/football-data/twenty-club-roster-reconciliation.ts";
import { planTouchlineNewPlayerMarketValueAlerts } from "../lib/touchlineArena/new-player-market-value-alerts.ts";

const timestamp = "2026-08-11T10:00:00.000Z";
const uuid = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function snapshot(label: string): TouchlineCanonicalRosterExport {
  const competitionId = uuid(1);
  const clubs = TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.map((scope, index) => ({ id: uuid(index + 10), provider: "sportmonks", provider_team_id: scope.providerTeamId, competition_id: competitionId, name: scope.clubName, source_updated_at: timestamp }));
  const players = clubs.map((club, index) => ({ id: uuid(index + 100), provider: "sportmonks", provider_player_id: String(1000 + index), current_club_id: club.id, name: `Player ${index}`, display_name: `Player ${index}`, source_updated_at: timestamp }));
  const memberships = players.map((player, index) => ({ id: uuid(index + 200), provider: "sportmonks", player_id: player.id, club_id: player.current_club_id, competition_id: competitionId, status: "active", source_updated_at: timestamp }));
  return { schemaVersion: "touchline-canonical-roster-export-v1", exportedAt: timestamp, source: { runId: `${label}-run`, sourceRevision: `${label}-revision` }, competitions: [{ id: competitionId, provider: "sportmonks", provider_competition_id: "8", source_updated_at: timestamp }], clubs, players, memberships };
}

test("a new canonical player creates a manual-review alert without a tier, price or automatic value", () => {
  const baseline = snapshot("baseline");
  const incoming = snapshot("incoming");
  const arsenal = incoming.clubs.find((club) => club.provider_team_id === "19")!;
  const displaced = incoming.players.find((player) => player.current_club_id === arsenal.id)!;
  const nextPlayer = { ...displaced, id: uuid(900), provider_player_id: "9900", name: "New Player", display_name: "New Player" };
  const nextMembership = { ...incoming.memberships.find((membership) => membership.player_id === displaced.id)!, id: uuid(901), player_id: nextPlayer.id };
  const candidate = { ...incoming, players: incoming.players.map((player) => player.id === displaced.id ? nextPlayer : player), memberships: incoming.memberships.map((membership) => membership.player_id === displaced.id ? nextMembership : membership) };
  const plan = planTouchlineNewPlayerMarketValueAlerts({ canonicalBaseline: baseline, incomingProviderSnapshot: candidate, publishedCardPlayerIds: [], unresolvedAlertKeys: [] });

  assert.equal(plan.status, "review-required");
  assert.equal(plan.alerts.length, 1);
  assert.deepEqual(plan.alerts[0], {
    alertKey: `market-value-required:${uuid(900)}:${uuid(901)}`,
    status: "MARKET_VALUE_REQUIRED", canonicalPlayerId: uuid(900), canonicalClubId: "", canonicalMembershipId: uuid(901), providerPlayerId: "9900", providerTeamId: "19", detectedAt: timestamp, reason: "NEW_CANONICAL_PLAYER", applicationEligible: false,
  });
});

test("published cards and unresolved keys deduplicate the notification queue", () => {
  const baseline = snapshot("baseline");
  const incoming = snapshot("incoming");
  const arsenal = incoming.clubs.find((club) => club.provider_team_id === "19")!;
  const displaced = incoming.players.find((player) => player.current_club_id === arsenal.id)!;
  const nextPlayer = { ...displaced, id: uuid(900), provider_player_id: "9900" };
  const nextMembership = { ...incoming.memberships.find((membership) => membership.player_id === displaced.id)!, id: uuid(901), player_id: nextPlayer.id };
  const candidate = { ...incoming, players: incoming.players.map((player) => player.id === displaced.id ? nextPlayer : player), memberships: incoming.memberships.map((membership) => membership.player_id === displaced.id ? nextMembership : membership) };
  const deduped = planTouchlineNewPlayerMarketValueAlerts({ canonicalBaseline: baseline, incomingProviderSnapshot: candidate, publishedCardPlayerIds: [], unresolvedAlertKeys: [`market-value-required:${uuid(900)}:${uuid(901)}`] });
  assert.equal(deduped.alerts.length, 0);
  assert.deepEqual(deduped.duplicateAlertKeys, [`market-value-required:${uuid(900)}:${uuid(901)}`]);
  const published = planTouchlineNewPlayerMarketValueAlerts({ canonicalBaseline: baseline, incomingProviderSnapshot: candidate, publishedCardPlayerIds: [uuid(900)], unresolvedAlertKeys: [] });
  assert.equal(published.alerts.length, 0);
});

test("partial provider scope blocks alert creation entirely", () => {
  const baseline = snapshot("baseline");
  const incoming = snapshot("incoming");
  const missing = incoming.clubs[0]!;
  const partial = { ...incoming, clubs: incoming.clubs.filter((club) => club.id !== missing.id), players: incoming.players.filter((player) => player.current_club_id !== missing.id), memberships: incoming.memberships.filter((membership) => membership.club_id !== missing.id) };
  const plan = planTouchlineNewPlayerMarketValueAlerts({ canonicalBaseline: baseline, incomingProviderSnapshot: partial, publishedCardPlayerIds: [], unresolvedAlertKeys: [] });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.alerts.length, 0);
});
