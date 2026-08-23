import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { touchLinePlayerFixturePoints } from "../lib/football-data/player-fixture-scoring.ts";
import { touchLinePlayerFixtureEventStatistics } from "../lib/football-data/player-fixture-scoring.ts";
import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
import { isTouchLineSettledFixtureStatus } from "../lib/football-data/fixture-settlement.ts";
import type { TouchlineFantasyEvent, TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";

function event(input: Partial<TouchlineFantasyEvent> & Pick<TouchlineFantasyEvent, "providerId" | "type">): TouchlineFantasyEvent {
  return {
    id: `sportmonks:${input.providerId}`,
    provider: "sportmonks",
    fixtureId: "19722203",
    status: "recorded",
    ...input,
  };
}

const GOLDEN_EVENTS: TouchlineFantasyEvent[] = [
  event({ providerId: "157577582", minute: 15, type: "Goal", playerId: "32612", playerName: "Kai Havertz", relatedPlayerId: "23278684", relatedPlayerName: "Riccardo Calafiori", teamId: "19" }),
  event({ providerId: "157577827", minute: 23, type: "Goal", playerId: "16827155", playerName: "Bukayo Saka", teamId: "19" }),
  event({ providerId: "157577965", minute: 27, type: "Yellowcard", playerId: "37762150", playerName: "Caleb Yirenkyi", teamId: "117" }),
  event({ providerId: "157578115", minute: 34, type: "Yellowcard", playerId: "97811", playerName: "Gabriel", teamId: "19" }),
  event({ providerId: "157578834", minute: 49, type: "Goal", playerId: "26823", playerName: "Martin Ødegaard", relatedPlayerId: "3259", relatedPlayerName: "Ben White", teamId: "19" }),
  event({ providerId: "157579133", minute: 62, type: "Substitution", playerId: "537721", relatedPlayerId: "37762150", teamId: "117" }),
  event({ providerId: "157579235", minute: 68, type: "Substitution", playerId: "25217662", playerName: "Noni Madueke", relatedPlayerId: "16827155", teamId: "19" }),
  event({ providerId: "157579236", minute: 68, type: "Substitution", playerId: "530762", playerName: "Martín Zubimendi", relatedPlayerId: "5273", teamId: "19" }),
  event({ providerId: "157579284", minute: 70, type: "Substitution", playerId: "26506", playerName: "Taiwo Awoniyi", relatedPlayerId: "15076357", teamId: "117" }),
  event({ providerId: "157579287", minute: 70, type: "Substitution", playerId: "32404898", playerName: "Jack Rudoni", relatedPlayerId: "9543", teamId: "117" }),
  event({ providerId: "157579383", minute: 76, type: "Substitution", playerId: "7643", playerName: "Eberechi Eze", relatedPlayerId: "24817182", teamId: "19" }),
  event({ providerId: "157579384", minute: 76, type: "Substitution", playerId: "32710", playerName: "Mikel Merino", relatedPlayerId: "26823", teamId: "19" }),
  event({ providerId: "157579459", minute: 81, type: "Substitution", playerId: "37261496", playerName: "Piero Hincapié", relatedPlayerId: "23278684", teamId: "19" }),
  event({ providerId: "157579469", minute: 82, type: "Substitution", playerId: "26813", playerName: "Gustavo Hamer", relatedPlayerId: "37337041", teamId: "117" }),
];

test("the 14 golden-fixture events yield only the verified scoring contributions", () => {
  const score = (providerPlayerId: string, positionGroup: string, statistics: Record<string, number>, rating: number, teamGoalsConceded: number, minutesPlayed = 90) => touchLinePlayerFixturePoints({
    providerPlayerId,
    positionGroup,
    appearanceStatus: "started",
    minutesPlayed,
    rating,
    statistics,
    events: GOLDEN_EVENTS,
    teamGoalsConceded,
  }).points;
  assert.equal(GOLDEN_EVENTS.length, 14);
  assert.equal(score("32612", "Attacker", { "shots-on-target": 1 }, 7.39, 0), 6);
  assert.equal(score("23278684", "Defender", {}, 7.1, 0, 81), 5);
  assert.equal(score("16827155", "Attacker", { "shots-on-target": 1 }, 7.71, 0, 68), 6);
  assert.equal(score("26823", "Midfielder", { "shots-on-target": 1 }, 8.08, 0, 76), 8);
  assert.equal(score("3259", "Defender", {}, 7.74, 0), 5);
  assert.equal(score("97811", "Defender", {}, 6.68, 0), 1);
  assert.equal(score("37762150", "Midfielder", {}, 6.06, 3, 62), -1);
  assert.equal(score("537721", "Midfielder", {}, 6.77, 3, 28), 0);
});

test("Full Time is a settled result and event facts drive the verified player totals", () => {
  assert.equal(isTouchLineSettledFixtureStatus("Full Time"), true);
  assert.equal(isTouchLineSettledFixtureStatus("Postponed"), false);
  assert.deepEqual(touchLinePlayerFixtureEventStatistics("32612", GOLDEN_EVENTS), {
    goals: 1,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltySaves: 0,
    penaltiesMissed: 0,
  });
  assert.deepEqual(touchLinePlayerFixtureEventStatistics("23278684", GOLDEN_EVENTS), {
    goals: 0,
    assists: 1,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltySaves: 0,
    penaltiesMissed: 0,
  });
  assert.equal(touchLinePlayerFixtureEventStatistics("97811", GOLDEN_EVENTS).yellowCards, 1);
});

test("provider event identity makes repeated reconciliation idempotent", () => {
  const duplicatedFeed = [...GOLDEN_EVENTS, ...GOLDEN_EVENTS];
  const input = { positionGroup: "Attacker", appearanceStatus: "started" as const, minutesPlayed: 90, rating: 7.39, statistics: { "shots-on-target": 1 }, teamGoalsConceded: 0 };
  assert.equal(touchLinePlayerFixturePoints({ ...input, providerPlayerId: "32612", events: duplicatedFeed }).points, 6);
  assert.deepEqual(
    touchLinePlayerFixturePoints({ ...input, providerPlayerId: "32612", events: duplicatedFeed }),
    touchLinePlayerFixturePoints({ ...input, providerPlayerId: "32612", events: GOLDEN_EVENTS }),
  );
});

test("rescinded provider events never score", () => {
  const rescinded = event({ providerId: "rescinded-goal", minute: 90, type: "Goal", playerId: "32612", status: "rescinded" });
  assert.equal(touchLinePlayerFixturePoints({ providerPlayerId: "32612", positionGroup: "Attacker", appearanceStatus: "started", minutesPlayed: 90, rating: 7.39, statistics: { "shots-on-target": 1 }, events: [...GOLDEN_EVENTS, rescinded], teamGoalsConceded: 0 }).points, 6);
});

test("season points remain unavailable until the event feed is known", () => {
  const lineup: TouchlineFantasyLineupMember = {
    id: "lineup-1",
    providerId: "lineup-1",
    provider: "sportmonks",
    fixtureId: "19722203",
    playerId: "32612",
    playerName: "Kai Havertz",
    isStarter: true,
    isSubstitute: false,
    statistics: [],
  };
  const unavailable = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: "32612",
    season: { seasonId: "2026-27", seasonName: "2026/27", competitionId: "8", competitionName: "Premier League", clubId: "19", clubName: "Arsenal" },
    eligibleFixtures: [{ fixtureId: "19722203", lineups: [lineup], events: null }],
  });
  const reconciled = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: "32612",
    season: { seasonId: "2026-27", seasonName: "2026/27", competitionId: "8", competitionName: "Premier League", clubId: "19", clubName: "Arsenal" },
    eligibleFixtures: [{ fixtureId: "19722203", lineups: [lineup], events: GOLDEN_EVENTS, touchlinePoints: 6, scoringStatistics: { goals: 1, assists: 0 }, scoringComplete: false }],
  });
  assert.equal(unavailable.summary.touchlinePoints, null);
  assert.equal(reconciled.summary.touchlinePoints, 6);
  assert.equal(reconciled.summary.goals, 1);
  assert.equal(reconciled.summary.assists, 0);
  assert.equal(reconciled.summary.yellowCards, 0);
});

test("fixture persistence keeps points unavailable when provider events are absent", async () => {
  const source = await readFile(new URL("../lib/football-data/player-season-statistics-store.ts", import.meta.url), "utf8");
  assert.match(source, /events = feed \? fantasyEvents\(feed\.events_payload\) : null/);
  assert.match(source, /touchline_points: pointResult\.points/);
  assert.match(source, /scoring_version: pointResult\.scoringVersion/);
  assert.match(source, /scoring_coverage_status: pointResult\.coverageStatus/);
  assert.match(source, /isTouchLineSettledFixtureStatus\(fixture\.status\)/);
  assert.match(source, /statistics_payload: \{ \.\.\.statistics, \.\.\.pointResult\.statistics \}/);
});

test("the QA distribution migration is idempotent and browser roles cannot read or write canonical facts", async () => {
  const migration = await readFile(new URL("../supabase/qa/015_touchline_qa_golden_fixture_distribution.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.football_fixture_events/);
  assert.match(migration, /unique \(provider, provider_event_id\)/);
  assert.match(migration, /unique \(fixture_id, event_type\)/);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /revoke all privileges on table public\.football_fixture_events from public, anon, authenticated/);
  assert.match(migration, /revoke all privileges on table public\.football_fixture_lifecycle_events from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.football_fixture_events to service_role/);
});

test("live sync distributes canonical fixture writes into player and coach reconciliation", async () => {
  const source = await readFile(new URL("../lib/football-data/live-sync.ts", import.meta.url), "utf8");
  assert.match(source, /syncTouchLinePlayerSeasonStatistics\(admin\)/);
  assert.match(source, /touchline_reconcile_coach_fixture_points/);
  assert.match(source, /playerFixtureRowsWritten/);
  assert.match(source, /coachPointsReconciled/);
});

test("the Sportmonks adapter reads nested detail values and official related-player fields", async () => {
  const source = await readFile(new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url), "utf8");
  assert.match(source, /parseSportmonksStatisticValue\(detail\.data \?\? detail\.value\)/);
  assert.match(source, /asString\(item\.related_player_name\)/);
  assert.match(source, /sortOrder: asNumber\(item\.sort_order\)/);
});

test("Live consumes the persisted allowlisted match detail instead of a static pending panel", async () => {
  const [page, component, reader, route] = await Promise.all([
    readFile(new URL("../app/live/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/football-data/public-fixture-match-detail-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/football-data/fantasy/fixture/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /readPublicFantasyFixtureMatchDetail/);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /const canReadMatchDetail = hasTouchLineArenaAccess\(user\)/);
  assert.match(component, /if \(!canReadMatchDetail\) return/);
  assert.match(component, /touchline-verified-match-data/);
  assert.match(component, /matchDetail\.events\.map/);
  assert.match(component, /contribution\.role === "assist"/);
  assert.match(component, /statistic\?\.minutes \?\? "—"/);
  assert.match(component, /statistic\?\.rating \?\? "—"/);
  assert.match(reader, /touchline_player_fixture_score_settlements/);
  assert.match(reader, /scoring_version", "player_scoring_v3/);
  assert.match(reader, /football_fixture_lifecycle_events/);
  assert.doesNotMatch(reader, /SPORTMONKS_API_TOKEN|api\.sportmonks/);
  assert.match(route, /requireAuthenticatedOrLocalTouchlineEditor/);
});
