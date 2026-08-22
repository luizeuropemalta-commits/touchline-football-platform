export type TouchLineSeasonStatisticsCoverageStatus = "complete" | "partial" | "unavailable";

export type TouchLinePlayerSeasonSummary = {
  appearances: number | null;
  starts: number | null;
  substituteAppearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  rating: number | null;
  yellowCards: number | null;
  redCards: number | null;
  touchlinePoints: number | null;
};

export type TouchLinePlayerSeasonStatistics = {
  coverageStatus: TouchLineSeasonStatisticsCoverageStatus;
  seasonId: string | null;
  seasonName: string | null;
  competitionId: string | null;
  competitionName: string | null;
  clubId: string | null;
  clubName: string | null;
  expectedFixtureCount: number | null;
  synchronizedFixtureCount: number;
  expectedFixtureIds: string[];
  aggregatedFixtureIds: string[];
  summary: TouchLinePlayerSeasonSummary;
  positionStatistics: Record<string, number | string>;
  latestSyncAt: string | null;
  unavailableReason?: "season-not-known" | "not-synchronised" | "mapping-not-verified" | "fixture-not-selected";
};

export type TouchLinePlayerFixtureStatistics = {
  fixtureId: string;
  fixtureName: string | null;
  fixtureStartsAt: string | null;
  fixtureStatus: string | null;
  appearanceStatus: "started" | "substitute" | "unused" | "absent" | "unavailable";
  minutes: number | null;
  rating: number | null;
  touchlinePoints: number | null;
  pointContributions: Array<{
    role: "primary" | "assist";
    eventType: string;
    minute: number | null;
    points: number;
  }>;
  statistics: Record<string, number | string>;
  latestSyncAt: string | null;
};

export type TouchLinePlayerStatisticsReadModel = {
  touchlinePlayerId: string | null;
  providerPlayerId: string | null;
  mappingStatus: "verified" | "unavailable";
  previousCompletedSeason: TouchLinePlayerSeasonStatistics;
  currentSeason: TouchLinePlayerSeasonStatistics;
  lastFiveMatches: TouchLinePlayerFixtureStatistics[];
  currentOrSelectedFixture: TouchLinePlayerFixtureStatistics | null;
};

/**
 * A player profile keeps the latest verified match projection after full time.
 * A future fixture has no player fact yet and must not erase the prior final
 * points, statistics or event-backed scoring explanation.
 */
export function selectTouchLineCurrentOrLastVerifiedFixture(
  fixtures: readonly TouchLinePlayerFixtureStatistics[],
  selectedFixtureId?: string | null,
) {
  const selected = String(selectedFixtureId ?? "").trim();
  if (selected) return fixtures.find((fixture) => fixture.fixtureId === selected) ?? null;
  return fixtures.find((fixture) => (
    fixture.touchlinePoints !== null
    || fixture.pointContributions.length > 0
    || Object.keys(fixture.statistics).length > 0
  )) ?? null;
}

export const TOUCHLINE_PLAYER_SEASON_SUMMARY_KEYS = [
  "appearances",
  "starts",
  "substituteAppearances",
  "minutes",
  "goals",
  "assists",
  "rating",
  "yellowCards",
  "redCards",
  "touchlinePoints",
] as const satisfies readonly (keyof TouchLinePlayerSeasonSummary)[];

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function recordOfNumbersOrStrings(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, number | string]> = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === "number" && Number.isFinite(nested)) entries.push([key, nested]);
    else if (typeof nested === "string" && nested.trim()) entries.push([key, nested]);
  }
  return Object.fromEntries(entries);
}

export function emptyTouchLinePlayerSeasonStatistics(input: Partial<Pick<
  TouchLinePlayerSeasonStatistics,
  "seasonId" | "seasonName" | "competitionId" | "competitionName" | "clubId" | "clubName" | "unavailableReason"
>> = {}): TouchLinePlayerSeasonStatistics {
  return {
    coverageStatus: "unavailable",
    seasonId: input.seasonId ?? null,
    seasonName: input.seasonName ?? null,
    competitionId: input.competitionId ?? null,
    competitionName: input.competitionName ?? null,
    clubId: input.clubId ?? null,
    clubName: input.clubName ?? null,
    expectedFixtureCount: null,
    synchronizedFixtureCount: 0,
    expectedFixtureIds: [],
    aggregatedFixtureIds: [],
    summary: {
      appearances: null,
      starts: null,
      substituteAppearances: null,
      minutes: null,
      goals: null,
      assists: null,
      rating: null,
      yellowCards: null,
      redCards: null,
      touchlinePoints: null,
    },
    positionStatistics: {},
    latestSyncAt: null,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {}),
  };
}

/**
 * Normalises one persisted season row. A database row cannot claim complete
 * coverage if its fixture identity sets do not exactly match. This is checked
 * again in TypeScript to protect older databases before migration 048 lands.
 */
export function normalizeTouchLinePlayerSeasonStatistics(input: {
  coverageStatus?: unknown;
  seasonId?: unknown;
  seasonName?: unknown;
  competitionId?: unknown;
  competitionName?: unknown;
  clubId?: unknown;
  clubName?: unknown;
  expectedFixtureCount?: unknown;
  synchronizedFixtureCount?: unknown;
  expectedFixtureIds?: unknown;
  aggregatedFixtureIds?: unknown;
  summaryPayload?: unknown;
  positionStatisticsPayload?: unknown;
  latestSyncAt?: unknown;
}): TouchLinePlayerSeasonStatistics {
  const expectedFixtureIds = Array.isArray(input.expectedFixtureIds)
    ? [...new Set(input.expectedFixtureIds.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  const aggregatedFixtureIds = Array.isArray(input.aggregatedFixtureIds)
    ? [...new Set(input.aggregatedFixtureIds.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  const expectedFixtureCount = finiteNumber(input.expectedFixtureCount);
  const reportedSynchronizedFixtureCount = finiteNumber(input.synchronizedFixtureCount) ?? aggregatedFixtureIds.length;
  const synchronizedEligibleFixtureCount = expectedFixtureIds.length
    ? aggregatedFixtureIds.filter((fixtureId) => expectedFixtureIds.includes(fixtureId)).length
    : reportedSynchronizedFixtureCount;
  const synchronizedFixtureCount = Math.min(reportedSynchronizedFixtureCount, synchronizedEligibleFixtureCount);
  const sourceSummary = recordOfNumbersOrStrings(input.summaryPayload);
  const summary = Object.fromEntries(
    TOUCHLINE_PLAYER_SEASON_SUMMARY_KEYS.map((key) => [key, finiteNumber(sourceSummary[key])]),
  ) as TouchLinePlayerSeasonSummary;
  const requestedStatus = input.coverageStatus === "complete" || input.coverageStatus === "partial"
    ? input.coverageStatus
    : "unavailable";
  const coverageIsComplete = expectedFixtureCount !== null
    && expectedFixtureCount === synchronizedFixtureCount
    && expectedFixtureIds.length === expectedFixtureCount
    && aggregatedFixtureIds.length === synchronizedFixtureCount
    && expectedFixtureIds.every((fixtureId) => aggregatedFixtureIds.includes(fixtureId));
  const coverageStatus = requestedStatus === "complete" && coverageIsComplete
    ? "complete"
    : requestedStatus === "complete" || requestedStatus === "partial"
      ? "partial"
      : "unavailable";

  return {
    coverageStatus,
    seasonId: typeof input.seasonId === "string" && input.seasonId.trim() ? input.seasonId : null,
    seasonName: typeof input.seasonName === "string" && input.seasonName.trim() ? input.seasonName : null,
    competitionId: typeof input.competitionId === "string" && input.competitionId.trim() ? input.competitionId : null,
    competitionName: typeof input.competitionName === "string" && input.competitionName.trim() ? input.competitionName : null,
    clubId: typeof input.clubId === "string" && input.clubId.trim() ? input.clubId : null,
    clubName: typeof input.clubName === "string" && input.clubName.trim() ? input.clubName : null,
    expectedFixtureCount,
    synchronizedFixtureCount,
    expectedFixtureIds,
    aggregatedFixtureIds,
    summary,
    positionStatistics: recordOfNumbersOrStrings(input.positionStatisticsPayload),
    latestSyncAt: typeof input.latestSyncAt === "string" && Number.isFinite(Date.parse(input.latestSyncAt))
      ? input.latestSyncAt
      : null,
    ...(coverageStatus === "unavailable" ? { unavailableReason: "not-synchronised" as const } : {}),
  };
}

export function touchLinePlayerSeasonCoverageMessage(statistics: TouchLinePlayerSeasonStatistics) {
  if (statistics.coverageStatus === "partial") {
    return `Partial data — ${statistics.synchronizedFixtureCount} of ${statistics.expectedFixtureCount ?? "?"} eligible fixtures synchronised`;
  }
  return null;
}
