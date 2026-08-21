import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { touchLinePlayerFixturePoints } from "../lib/football-data/player-fixture-scoring.ts";
import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
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
  assert.equal(GOLDEN_EVENTS.length, 14);
  assert.equal(touchLinePlayerFixturePoints("32612", GOLDEN_EVENTS).points, 6);
  assert.equal(touchLinePlayerFixturePoints("23278684", GOLDEN_EVENTS).points, 3);
  assert.equal(touchLinePlayerFixturePoints("16827155", GOLDEN_EVENTS).points, 6);
  assert.equal(touchLinePlayerFixturePoints("26823", GOLDEN_EVENTS).points, 6);
  assert.equal(touchLinePlayerFixturePoints("3259", GOLDEN_EVENTS).points, 3);
  assert.equal(touchLinePlayerFixturePoints("97811", GOLDEN_EVENTS).points, -1);
  assert.equal(touchLinePlayerFixturePoints("37762150", GOLDEN_EVENTS).points, -1);
  assert.equal(touchLinePlayerFixturePoints("537721", GOLDEN_EVENTS).points, 0);
});

test("provider event identity makes repeated reconciliation idempotent", () => {
  const duplicatedFeed = [...GOLDEN_EVENTS, ...GOLDEN_EVENTS];
  assert.equal(touchLinePlayerFixturePoints("32612", duplicatedFeed).points, 6);
  assert.equal(touchLinePlayerFixturePoints("23278684", duplicatedFeed).points, 3);
});

test("rescinded provider events never score", () => {
  const rescinded = event({ providerId: "rescinded-goal", minute: 90, type: "Goal", playerId: "32612", status: "rescinded" });
  assert.equal(touchLinePlayerFixturePoints("32612", [...GOLDEN_EVENTS, rescinded]).points, 6);
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
    eligibleFixtures: [{ fixtureId: "19722203", lineups: [lineup], events: GOLDEN_EVENTS }],
  });
  assert.equal(unavailable.summary.touchlinePoints, null);
  assert.equal(reconciled.summary.touchlinePoints, 6);
});

test("fixture persistence keeps points unavailable when provider events are absent", async () => {
  const source = await readFile(new URL("../lib/football-data/player-season-statistics-store.ts", import.meta.url), "utf8");
  assert.match(source, /const verifiedEvents = fantasyEvents\(feed\?\.events_payload\)/);
  assert.match(source, /touchline_points: pointResult\?\.points \?\? null/);
  assert.match(source, /scoring_version: pointResult\?\.scoringVersion \?\? null/);
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
