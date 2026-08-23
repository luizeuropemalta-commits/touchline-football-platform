import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
import {
  normalizeTouchLinePlayerSeasonStatistics,
  selectTouchLineCurrentOrLastVerifiedFixture,
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
      { fixtureId: "f-1", lineups: [lineup({ fixtureId: "f-1", starter: true, minutes: 90, goals: 1, assists: 1, rating: 8 })], latestSyncAt: "2026-05-01T10:00:00.000Z", touchlinePoints: 5, scoringComplete: true },
      { fixtureId: "f-2", lineups: [lineup({ fixtureId: "f-2", starter: false, minutes: 30, goals: 0, assists: 0, rating: 7 })], latestSyncAt: "2026-05-08T10:00:00.000Z", touchlinePoints: 1, scoringComplete: true },
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

test("an exact final fixture set can be complete for scoring while details remain unavailable", () => {
  const aggregate = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: "154421",
    season: { seasonId: "current", seasonName: "2026/27", competitionId: "england", competitionName: "TouchLine England", clubId: "city", clubName: "Manchester City" },
    eligibleFixtures: [
      { fixtureId: "f-1", lineups: [lineup({ fixtureId: "f-1", starter: true, minutes: 90 })], latestSyncAt: "2026-08-20T10:00:00.000Z", touchlinePoints: 3, rankingCoverageStatus: "complete" },
      { fixtureId: "f-2", lineups: [lineup({ fixtureId: "f-2", starter: true, minutes: 90 })], latestSyncAt: "2026-08-21T10:00:00.000Z", touchlinePoints: 1, rankingCoverageStatus: "complete_for_scoring" },
    ],
  });

  assert.equal(aggregate.coverageStatus, "complete_for_scoring");
  assert.equal(aggregate.summary.touchlinePoints, 4);
  assert.equal(touchLinePlayerSeasonCoverageMessage(aggregate), "Complete for scoring — unavailable provider details remain unavailable");
});

test("a provider-omitted rating never turns an official appearance into zero points", () => {
  const aggregate = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: "154421",
    season: { seasonId: "current", seasonName: "2026/27", competitionId: "england", competitionName: "TouchLine England", clubId: "city", clubName: "Manchester City" },
    eligibleFixtures: [
      {
        fixtureId: "f-1",
        lineups: [lineup({ fixtureId: "f-1", starter: false, minutes: 4 })],
        touchlinePoints: null,
        scoringIncluded: false,
        providerRatingAbsentFromFinalLineup: true,
        rankingCoverageStatus: "complete_for_scoring",
      },
    ],
  });

  assert.equal(aggregate.coverageStatus, "complete_for_scoring");
  assert.equal(aggregate.summary.touchlinePoints, null);
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

test("complete-for-scoring is also downgraded when fixture identities disagree", () => {
  const normalized = normalizeTouchLinePlayerSeasonStatistics({
    coverageStatus: "complete_for_scoring",
    expectedFixtureCount: 2,
    synchronizedFixtureCount: 2,
    expectedFixtureIds: ["1", "2"],
    aggregatedFixtureIds: ["1", "other"],
    summaryPayload: { touchlinePoints: 4 },
  });

  assert.equal(normalized.coverageStatus, "partial");
});

test("a scheduled next fixture cannot erase the last verified final match points", () => {
  const fixture = (id: string, points: number | null, statistics: Record<string, number | string>) => ({
    fixtureId: id,
    fixtureName: null,
    fixtureStartsAt: id === "next" ? "2026-08-28T19:00:00.000Z" : "2026-08-21T19:00:00.000Z",
    fixtureStatus: id === "next" ? "Not Started" : "Full Time",
    appearanceStatus: "started" as const,
    minutes: 90,
    rating: null,
    touchlinePoints: points,
    pointContributions: id === "final" ? [{ role: "primary" as const, eventType: "Goal", minute: 67, points: 6 }] : [],
    statistics,
    latestSyncAt: "2026-08-22T10:00:00.000Z",
  });
  const final = fixture("final", 6, { goals: 1, assists: 0 });
  const next = fixture("next", null, {});

  assert.equal(selectTouchLineCurrentOrLastVerifiedFixture([next, final]), final);
  assert.equal(selectTouchLineCurrentOrLastVerifiedFixture([next, final], "next"), next);
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
