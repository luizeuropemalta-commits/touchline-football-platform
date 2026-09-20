import type { EventsLiveEvidence, EventsLivePackageInput } from "../../lib/touchlineArena/social-events-live-contract.ts";

// Unit-test inputs, NOT captured football facts or publication evidence. No
// producer/reader imports this file; the official source gate rejects its label.
export const SYNTHETIC_EVENTS_SOURCE = "SYNTHETIC_UNIT_TEST_ONLY" as const;
export const SYNTHETIC_EVENTS_NOW = Date.parse("2026-09-15T12:00:00Z");
export const SYNTHETIC_EVENT_IDS = { ownGoal: "990001", firstGoal: "990002", dismissal: "990003", secondGoal: "990004", penalty: "990005", lastHomeGoal: "990006", awayGoal: "990007" } as const;
export const SYNTHETIC_TEAMS = { home: "9901", away: "9902" } as const;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const homeClub = { id: id(1), providerTeamId: SYNTHETIC_TEAMS.home, name: "Synthetic Home FC" };
const awayClub = { id: id(2), providerTeamId: SYNTHETIC_TEAMS.away, name: "Synthetic Away FC" };
const scorer = { id: id(31), providerId: "99031", name: "Synthetic Hat-trick Scorer", club: homeClub, shirt: 9, position: "Centre Forward" };
const defender = { id: id(32), providerId: "99032", name: "Synthetic Away Defender", club: awayClub, shirt: 4, position: "Centre Back" };
const finisher = { id: id(33), providerId: "99033", name: "Synthetic Home Finisher", club: homeClub, shirt: 11, position: "Left Wing" };
type Player = { id: string; providerId: string; name: string; club: { id: string; providerTeamId: string; name: string }; shirt: number; position: string };
type Event = EventsLiveEvidence["events"][number];
const event = (eventId: string, player: Player, teamId: string, type: string, minute: number, result: string | null): Event => ({
  id: eventId, playerId: player.id, providerPlayerId: player.providerId, teamId,
  type, status: "recorded", info: null, addition: null, minute, extraMinute: null, result,
});
// Deliberate, independently specified score progression: 1-0, 2-0, 3-0,
// 4-0, 5-0, 5-1. The own-goal author and its beneficiary are different clubs.
const events: Event[] = [
  event(SYNTHETIC_EVENT_IDS.ownGoal, defender, SYNTHETIC_TEAMS.home, "Own Goal", 10, "1-0"),
  event(SYNTHETIC_EVENT_IDS.firstGoal, scorer, SYNTHETIC_TEAMS.home, "Goal", 20, "2-0"),
  event(SYNTHETIC_EVENT_IDS.dismissal, defender, SYNTHETIC_TEAMS.away, "Red Card", 30, null),
  event(SYNTHETIC_EVENT_IDS.secondGoal, scorer, SYNTHETIC_TEAMS.home, "Goal", 40, "3-0"),
  event(SYNTHETIC_EVENT_IDS.penalty, scorer, SYNTHETIC_TEAMS.home, "Penalty", 60, "4-0"),
  event(SYNTHETIC_EVENT_IDS.lastHomeGoal, finisher, SYNTHETIC_TEAMS.home, "Goal", 80, "5-0"),
  event(SYNTHETIC_EVENT_IDS.awayGoal, defender, SYNTHETIC_TEAMS.away, "Goal", 90, "5-1"),
];
const goals: EventsLivePackageInput["goals"] = [
  { id: SYNTHETIC_EVENT_IDS.ownGoal, teamId: SYNTHETIC_TEAMS.home, playerName: defender.name, minute: 10, extraMinute: null, kind: "own-goal" },
  { id: SYNTHETIC_EVENT_IDS.firstGoal, teamId: SYNTHETIC_TEAMS.home, playerName: scorer.name, minute: 20, extraMinute: null, kind: "goal" },
  { id: SYNTHETIC_EVENT_IDS.secondGoal, teamId: SYNTHETIC_TEAMS.home, playerName: scorer.name, minute: 40, extraMinute: null, kind: "goal" },
  { id: SYNTHETIC_EVENT_IDS.penalty, teamId: SYNTHETIC_TEAMS.home, playerName: scorer.name, minute: 60, extraMinute: null, kind: "penalty" },
  { id: SYNTHETIC_EVENT_IDS.lastHomeGoal, teamId: SYNTHETIC_TEAMS.home, playerName: finisher.name, minute: 80, extraMinute: null, kind: "goal" },
  { id: SYNTHETIC_EVENT_IDS.awayGoal, teamId: SYNTHETIC_TEAMS.away, playerName: defender.name, minute: 90, extraMinute: null, kind: "goal" },
];
type SyntheticInput = EventsLivePackageInput & {
  caption: string; source: typeof SYNTHETIC_EVENTS_SOURCE; publishable: false; outbound: "DISABLED";
  factualData: EventsLivePackageInput["factualData"] & { lineage: { source: typeof SYNTHETIC_EVENTS_SOURCE } };
};

function input(artId: EventsLivePackageInput["artId"], player: Player, eventIds: string[], score: { home: number; away: number },
  moments: EventsLivePackageInput["moments"], matchRating: number, touchlinePoints: number): SyntheticInput {
  const caption = "Synthetic match rewind · 15 September 2026 · TouchLine contract test only; not publishable.";
  return {
    source: SYNTHETIC_EVENTS_SOURCE, publishable: false, outbound: "DISABLED", artId,
    mode: "RETROSPECTIVE_VISUAL_REVIEW", dateLabel: "15 September 2026", caption,
    asOf: "2026-09-15T11:50:00Z", fetchedAt: "2026-09-15T12:00:00Z", validUntil: "2026-09-16T12:00:00Z",
    evidence: {
      artId, fixtureId: id(10), providerFixtureId: "99010", startsAt: "2026-09-15T10:00:00Z",
      fixtureStatus: "Full Time", finalizedAt: "2026-09-15T11:45:00Z",
      homeTeamId: SYNTHETIC_TEAMS.home, awayTeamId: SYNTHETIC_TEAMS.away, finalScore: { home: 5, away: 1 },
      eventIds, playerId: player.id, playerProviderId: player.providerId, playerTeamId: player.club.providerTeamId,
      cardPublished: true, confirmationState: null, events,
    },
    home: { teamId: SYNTHETIC_TEAMS.home }, away: { teamId: SYNTHETIC_TEAMS.away }, playerClub: { teamId: player.club.providerTeamId },
    playerCard: { canonicalPlayerId: player.id, sportmonksPlayerId: player.providerId, name: player.name, shirtNumber: player.shirt, position: player.position, marketValue: "€10m" },
    score, finalScore: { home: 5, away: 1 }, moments, matchRating, touchlinePoints, totalRating: null, goals,
    captions: { language: "en-GB", instagram: caption, facebook: caption, approval: "PENDING" },
    destinations: ["INSTAGRAM", "FACEBOOK"].flatMap(platform => ["FEED", "STORY"].map(placement => ({
      platform, placement, accountId: null, destinationResolution: "REQUIRED_BEFORE_APPROVAL", editorialClub: player.club,
      fixtureClubs: [SYNTHETIC_TEAMS.home, SYNTHETIC_TEAMS.away],
      eventRole: artId === "OWN_GOAL" ? "OWN_GOAL_AUTHOR" : artId === "FULL_TIME" ? "FEATURED_PLAYER_CLUB" : "EVENT_PLAYER_CLUB",
      beneficiaryProviderTeamId: artId === "OWN_GOAL" ? SYNTHETIC_TEAMS.home : null, publishable: false as const,
    }))),
    factualData: {
      lineage: { source: SYNTHETIC_EVENTS_SOURCE },
      cardPublication: { id: player.id, provider_player_id: player.providerId, current_club_id: player.club.id,
        provider_team_id: player.club.providerTeamId, publication_club_id: player.club.id, publication_status: "published",
        membership_status: "active", name: player.name, jersey_number: player.shirt, detailed_position: player.position,
        market_value_eur: 10_000_000, market_value_status: "verified", verified_season: "2026/27" },
      settlement: { football_player_id: player.id, provider_fixture_id: "99010", club_id: player.club.id, rating: String(matchRating),
        touchline_points: touchlinePoints, settlement_status: "final", scoring_coverage_status: "complete", scoring_version: "player_scoring_v3" },
      fixture: { events: goals.map(goal => ({ provider_event_id: goal.id, player_name: goal.playerName })) },
      // These are schema-test values, NOT a claim that any URL was consulted.
      externalSources: [{ url: "https://social-events-unit-test.invalid/synthetic", accessedAt: "2026-09-15T12:00:00Z" }],
    },
  };
}

export function syntheticEventsLiveInputs(): SyntheticInput[] {
  return [
    input("GOAL_CONFIRMED", scorer, [SYNTHETIC_EVENT_IDS.firstGoal], { home: 2, away: 0 },
      [{ eventId: SYNTHETIC_EVENT_IDS.firstGoal, kind: "goal", minute: 20, extraMinute: null }], 10, 12),
    input("OWN_GOAL", defender, [SYNTHETIC_EVENT_IDS.ownGoal], { home: 1, away: 0 },
      [{ eventId: SYNTHETIC_EVENT_IDS.ownGoal, kind: "own-goal", minute: 10, extraMinute: null }], 5.9, -1),
    input("HAT_TRICK_HERO", scorer, [SYNTHETIC_EVENT_IDS.firstGoal, SYNTHETIC_EVENT_IDS.secondGoal, SYNTHETIC_EVENT_IDS.penalty], { home: 4, away: 0 }, [
      { eventId: SYNTHETIC_EVENT_IDS.firstGoal, kind: "goal", minute: 20, extraMinute: null },
      { eventId: SYNTHETIC_EVENT_IDS.secondGoal, kind: "goal", minute: 40, extraMinute: null },
      { eventId: SYNTHETIC_EVENT_IDS.penalty, kind: "penalty", minute: 60, extraMinute: null },
    ], 10, 12),
    input("RED_CARD_CONFIRMED", defender, [SYNTHETIC_EVENT_IDS.dismissal], { home: 2, away: 0 },
      [{ eventId: SYNTHETIC_EVENT_IDS.dismissal, kind: "red-card", minute: 30, extraMinute: null }], 5.9, -1),
    input("FULL_TIME", finisher, [], { home: 5, away: 1 }, [], 7.5, 3),
  ].map(scenario => structuredClone(scenario));
}
