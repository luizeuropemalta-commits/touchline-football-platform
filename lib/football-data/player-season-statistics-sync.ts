import type { TouchlineFantasyLineupMember } from "./types.ts";
import type { TouchLinePlayerSeasonStatistics } from "../touchlineArena/player-season-statistics.ts";
import { emptyTouchLinePlayerSeasonStatistics } from "../touchlineArena/player-season-statistics.ts";
import { touchLinePlayerFixturePoints } from "./player-fixture-scoring.ts";
import type { TouchlineFantasyEvent } from "./types.ts";

type EligibleFixture = {
  fixtureId: string;
  lineups: TouchlineFantasyLineupMember[] | null;
  latestSyncAt?: string | null;
  events?: TouchlineFantasyEvent[] | null;
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
  const fixturePointValues = synchronizedFixtures.map((fixture) => (
    Array.isArray(fixture.events)
      ? touchLinePlayerFixturePoints(input.providerPlayerId, fixture.events).points
      : null
  ));
  const touchlinePoints = fixturePointValues.every((value) => value !== null)
    ? fixturePointValues.reduce((total, value) => total + (value ?? 0), 0)
    : null;
  const complete = fixtures.length > 0 && allLineupsAvailable && expectedFixtureIds.length === aggregatedFixtureIds.length;
  const positionStatistics = Object.fromEntries(
    [...new Set(playerEntries.flatMap((member) => member.statistics.map((statistic) => String(statistic.code ?? "").trim().toLowerCase()).filter(Boolean)))]
      .flatMap((code) => {
        const value = sumOnlyWhenKnown(playerEntries, [code]);
        return value === null ? [] : [[code, value] as const];
      }),
  );

  return {
    coverageStatus: complete ? "complete" : fixtures.length ? "partial" : "unavailable",
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
      goals: sumOnlyWhenKnown(playerEntries, ["goals"]),
      assists: sumOnlyWhenKnown(playerEntries, ["assists"]),
      rating: averageOnlyWhenKnown(playerEntries, ["rating"]),
      yellowCards: sumOnlyWhenKnown(playerEntries, ["yellow-cards", "yellowcards"]),
      redCards: sumOnlyWhenKnown(playerEntries, ["red-cards", "redcards"]),
      touchlinePoints,
    },
    positionStatistics,
    latestSyncAt,
    ...(complete ? {} : { unavailableReason: "not-synchronised" as const }),
  };
}
