import type { TouchlineFantasyLineupMember } from "./types.ts";
import type { TouchLinePlayerSeasonStatistics } from "../touchlineArena/player-season-statistics.ts";
import { emptyTouchLinePlayerSeasonStatistics } from "../touchlineArena/player-season-statistics.ts";
import {
  touchLinePlayerFixtureEventStatistics,
} from "./player-fixture-scoring.ts";
import {
  isTouchLinePlayerRankingCoverageComplete,
  type TouchLinePlayerRankingCoverageStatus,
} from "./player-ranking-coverage.ts";
import type { TouchlineFantasyEvent } from "./types.ts";

type EligibleFixture = {
  fixtureId: string;
  lineups: TouchlineFantasyLineupMember[] | null;
  latestSyncAt?: string | null;
  events?: TouchlineFantasyEvent[] | null;
  touchlinePoints?: number | null;
  /** False for an official non-participant: no rating is expected and it is
   * excluded from the season score rather than converted to zero. */
  scoringIncluded?: boolean;
  scoringStatistics?: Readonly<Record<string, number>> | null;
  scoringComplete?: boolean;
  rankingCoverageStatus?: TouchLinePlayerRankingCoverageStatus;
};

function numericStatistic(member: TouchlineFantasyLineupMember, codes: string[]) {
  const statistic = member.statistics.find((item) => codes.includes(String(item.code ?? "").toLowerCase()));
  const numeric = typeof statistic?.value === "number"
    ? statistic.value
    : typeof statistic?.value === "string" && statistic.value.trim()
      ? Number(statistic.value)
      : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function sumOnlyWhenKnown(members: TouchlineFantasyLineupMember[], codes: string[]) {
  if (!members.length) return 0;
  const values = members.map((member) => numericStatistic(member, codes));
  return values.every((value) => value !== null) ? values.reduce((total, value) => total + (value ?? 0), 0) : null;
}

function averageOnlyWhenKnown(members: TouchlineFantasyLineupMember[], codes: string[]) {
  // A player with no recorded appearance has no verified rating. Zero would
  // look like a measured rating and would violate the unavailable-data rule.
  if (!members.length) return null;
  const values = members.map((member) => numericStatistic(member, codes));
  if (!values.every((value) => value !== null)) return null;
  const total = values.reduce((sum, value) => sum + (value ?? 0), 0);
  return Math.round((total / values.length) * 100) / 100;
}

function eventStatisticOnlyWhenKnown(
  fixtures: readonly EligibleFixture[],
  providerPlayerId: string,
  key: "goals" | "assists" | "yellowCards" | "redCards",
) {
  if (!fixtures.length || fixtures.some((fixture) => !Array.isArray(fixture.events))) return null;
  return fixtures.reduce((total, fixture) => (
    total + touchLinePlayerFixtureEventStatistics(providerPlayerId, fixture.events ?? [])[key]
  ), 0);
}

/**
 * Produces a season aggregate only from explicit fixture coverage. It never
 * treats a provider's season-level response as proof that every fixture was
 * included. A caller must supply the membership-derived eligible fixtures.
 */
export function buildTouchLinePlayerSeasonAggregate(input: {
  season: Pick<TouchLinePlayerSeasonStatistics, "seasonId" | "seasonName" | "competitionId" | "competitionName" | "clubId" | "clubName">;
  providerPlayerId: string;
  eligibleFixtures: EligibleFixture[] | null;
}): TouchLinePlayerSeasonStatistics {
  if (!input.eligibleFixtures) {
    return emptyTouchLinePlayerSeasonStatistics({ ...input.season, unavailableReason: "not-synchronised" });
  }
  const fixtureById = new Map(input.eligibleFixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const fixtures = [...fixtureById.values()];
  const expectedFixtureIds = fixtures.map((fixture) => fixture.fixtureId);
  const synchronizedFixtures = fixtures.filter((fixture) => Array.isArray(fixture.lineups));
  const aggregatedFixtureIds = synchronizedFixtures.map((fixture) => fixture.fixtureId);
  const playerEntries = synchronizedFixtures.flatMap((fixture) =>
    (fixture.lineups ?? []).filter((member) => String(member.playerId ?? "") === input.providerPlayerId),
  );
  const allLineupsAvailable = synchronizedFixtures.length === fixtures.length;
  const startsKnown = allLineupsAvailable && playerEntries.every((member) => typeof member.isStarter === "boolean");
  const minutes = sumOnlyWhenKnown(playerEntries, ["minutes-played", "minutes"]);
  const knownAppearanceEntries = playerEntries.filter((member) => numericStatistic(member, ["minutes-played", "minutes"]) !== null);
  const appearances = allLineupsAvailable && knownAppearanceEntries.length === playerEntries.length
    ? playerEntries.filter((member) => (numericStatistic(member, ["minutes-played", "minutes"]) ?? 0) > 0).length
    : null;
  const starts = startsKnown ? playerEntries.filter((member) => member.isStarter).length : null;
  const substituteAppearances = startsKnown && appearances !== null
    ? playerEntries.filter((member) => !member.isStarter && (numericStatistic(member, ["minutes-played", "minutes"]) ?? 0) > 0).length
    : null;
  const latestSyncAt = synchronizedFixtures
    .map((fixture) => fixture.latestSyncAt)
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort()
    .at(-1) ?? null;
  // The season projection consumes persisted/per-fixture engine results. It
  // never invokes a second scoring implementation or reinterprets facts.
  const scoredFixtures = synchronizedFixtures.filter((fixture) => fixture.scoringIncluded !== false);
  const fixturePointValues = scoredFixtures.map((fixture) => fixture.touchlinePoints ?? null);
  const touchlinePoints = fixturePointValues.every((value) => value !== null)
    ? fixturePointValues.reduce((total, value) => total + (value ?? 0), 0)
    : null;
  const fixtureSetComplete = fixtures.length > 0
    && allLineupsAvailable
    && expectedFixtureIds.length === aggregatedFixtureIds.length;
  const rankingCoverageStatuses = synchronizedFixtures.map((fixture) => (
    fixture.rankingCoverageStatus ?? (fixture.scoringComplete === true ? "complete" : "blocking_partial")
  ));
  const complete = fixtureSetComplete
    && rankingCoverageStatuses.every((status) => status === "complete");
  const completeForScoring = fixtureSetComplete
    && rankingCoverageStatuses.every(isTouchLinePlayerRankingCoverageComplete);
  const providerPositionStatistics = Object.fromEntries(
    [...new Set(playerEntries.flatMap((member) => member.statistics.map((statistic) => String(statistic.code ?? "").trim().toLowerCase()).filter(Boolean)))]
      .flatMap((code) => {
        const value = sumOnlyWhenKnown(playerEntries, [code]);
        return value === null ? [] : [[code, value] as const];
      }),
  );
  const scoringStatistics = Object.fromEntries(
    [...new Set(scoredFixtures.flatMap((fixture) => Object.keys(fixture.scoringStatistics ?? {})))]
      .flatMap((code) => {
        const values = scoredFixtures.map((fixture) => fixture.scoringStatistics?.[code]);
        return values.every((value): value is number => typeof value === "number" && Number.isFinite(value))
          ? [[code, values.reduce((total, value) => total + value, 0)] as const]
          : [];
      }),
  );
  const positionStatistics = { ...providerPositionStatistics, ...scoringStatistics };

  return {
    coverageStatus: complete
      ? "complete"
      : completeForScoring
        ? "complete_for_scoring"
        : fixtures.length
          ? "partial"
          : "unavailable",
    ...input.season,
    expectedFixtureCount: fixtures.length,
    synchronizedFixtureCount: synchronizedFixtures.length,
    expectedFixtureIds,
    aggregatedFixtureIds,
    summary: {
      appearances,
      starts,
      substituteAppearances,
      minutes,
      goals: eventStatisticOnlyWhenKnown(synchronizedFixtures, input.providerPlayerId, "goals")
        ?? sumOnlyWhenKnown(playerEntries, ["goals"]),
      assists: eventStatisticOnlyWhenKnown(synchronizedFixtures, input.providerPlayerId, "assists")
        ?? sumOnlyWhenKnown(playerEntries, ["assists"]),
      rating: averageOnlyWhenKnown(playerEntries, ["rating"]),
      yellowCards: eventStatisticOnlyWhenKnown(synchronizedFixtures, input.providerPlayerId, "yellowCards")
        ?? sumOnlyWhenKnown(playerEntries, ["yellow-cards", "yellowcards"]),
      redCards: eventStatisticOnlyWhenKnown(synchronizedFixtures, input.providerPlayerId, "redCards")
        ?? sumOnlyWhenKnown(playerEntries, ["red-cards", "redcards"]),
      touchlinePoints,
    },
    positionStatistics,
    latestSyncAt,
    ...(complete || completeForScoring ? {} : { unavailableReason: "not-synchronised" as const }),
  };
}
