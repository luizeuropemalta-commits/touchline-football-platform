import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
import {
  normalizeTouchLinePlayerSeasonStatistics,
  touchLinePlayerSeasonCoverageMessage,
} from "../lib/touchlineArena/player-season-statistics.ts";
import type { TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";

function lineup(input: {
  fixtureId: string;
  starter: boolean;
  minutes: number;
  goals?: number;
  assists?: number;
  rating?: number;
}): TouchlineFantasyLineupMember {
  return {
    id: `${input.fixtureId}-lineup`,
    providerId: `${input.fixtureId}-lineup`,
    provider: "sportmonks",
    fixtureId: input.fixtureId,
    playerId: "154421",
    playerName: "Erling Haaland",
    isStarter: input.starter,
    isSubstitute: !input.starter,
    statistics: [
      { typeId: "119", code: "minutes-played", value: input.minutes },
      { typeId: "52", code: "goals", value: input.goals ?? 0 },
      { typeId: "79", code: "assists", value: input.assists ?? 0 },
      { typeId: "118", code: "rating", value: input.rating ?? 7 },
      { typeId: "20", code: "yellow-cards", value: 0 },
      { typeId: "21", code: "red-cards", value: 0 },
    ],
  };
}

test("a complete season aggregate requires every eligible fixture exactly once", () => {
  const aggregate = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: "154421",
    season: { seasonId: "previous", seasonName: "2025/26", competitionId: "england", competitionName: "TouchLine England", clubId: "city", clubName: "Manchester City" },
    eligibleFixtures: [
      { fixtureId: "f-1", lineups: [lineup({ fixtureId: "f-1", starter: true, minutes: 90, goals: 1, assists: 1, rating: 8 })], latestSyncAt: "2026-05-01T10:00:00.000Z" },
      { fixtureId: "f-2", lineups: [lineup({ fixtureId: "f-2", starter: false, minutes: 30, goals: 0, assists: 0, rating: 7 })], latestSyncAt: "2026-05-08T10:00:00.000Z" },
    ],
  });

  assert.equal(aggregate.coverageStatus, "complete");
  assert.deepEqual(aggregate.expectedFixtureIds, ["f-1", "f-2"]);
  assert.deepEqual(aggregate.aggregatedFixtureIds, ["f-1", "f-2"]);
  assert.equal(aggregate.summary.appearances, 2);
  assert.equal(aggregate.summary.starts, 1);
  assert.equal(aggregate.summary.substituteAppearances, 1);
  assert.equal(aggregate.summary.minutes, 120);
  assert.equal(aggregate.summary.goals, 1);
  assert.equal(aggregate.summary.assists, 1);
  assert.equal(aggregate.summary.rating, 7.5);
});

test("a missing fixture is partial and never gets a complete-season label", () => {
  const aggregate = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: "154421",
    season: { seasonId: "previous", seasonName: "2025/26", competitionId: "england", competitionName: "TouchLine England", clubId: "city", clubName: "Manchester City" },
    eligibleFixtures: [
      { fixtureId: "f-1", lineups: [lineup({ fixtureId: "f-1", starter: true, minutes: 90 })] },
      { fixtureId: "f-2", lineups: null },
    ],
  });

  assert.equal(aggregate.coverageStatus, "partial");
  assert.equal(touchLinePlayerSeasonCoverageMessage(aggregate), "Partial data — 1 of 2 eligible fixtures synchronised");
});

test("a legacy row claiming complete is downgraded if its fixture identity sets disagree", () => {
  const normalized = normalizeTouchLinePlayerSeasonStatistics({
    coverageStatus: "complete",
    expectedFixtureCount: 4,
    synchronizedFixtureCount: 4,
    expectedFixtureIds: ["1", "2", "3", "4"],
    aggregatedFixtureIds: ["1", "2", "3", "other"],
    summaryPayload: { appearances: 4, goals: 3 },
  });

  assert.equal(normalized.coverageStatus, "partial");
  assert.equal(touchLinePlayerSeasonCoverageMessage(normalized), "Partial data — 3 of 4 eligible fixtures synchronised");
});

test("migration 048 makes player statistics server-only and coverage-aware", async () => {
  const migration = await readFile(new URL("../supabase/migrations/048_touchline_player_season_statistics_read_model.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.football_player_season_statistics/);
  assert.match(migration, /football_player_season_memberships/);
  assert.match(migration, /coverage_status/);
  assert.match(migration, /expected_fixture_count = synchronized_fixture_count/);
  assert.match(migration, /revoke all privileges on table public\.football_player_season_statistics from public, anon, authenticated/);
});

test("public player surfaces use TouchLine branding and the canonical season reader", async () => {
  const [profile, coach, lineupSurface, matchCentre] = await Promise.all([
    readFile(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(profile, /loadTouchLinePlayerStatisticsReadModel/);
  assert.match(profile, /previousCompletedSeason/);
  assert.match(profile, /currentSeason/);
  assert.match(profile, /lastFiveMatches/);
  assert.doesNotMatch(profile, /SportMonks|Sportmonks|provider response|do provedor/);
  assert.doesNotMatch(coach, />Sportmonks</);
  assert.doesNotMatch(lineupSurface, /confirmed by the provider|confirmados pelo provedor/);
  assert.doesNotMatch(matchCentre, /official provider|fonte oficial/);
});
