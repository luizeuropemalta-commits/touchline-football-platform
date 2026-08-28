export const TOUCHLINE_COACH_SCORING_VERSION = "coach_scoring_v2" as const;

export const TOUCHLINE_COACH_SCORING = Object.freeze({
  version: TOUCHLINE_COACH_SCORING_VERSION,
  home: Object.freeze({ win: 3, draw: 1, loss: 0 }),
  away: Object.freeze({ win: 4, draw: 2, loss: 0 }),
});

export type TouchlineCoachFixtureContext = "home" | "away";
export type TouchlineCoachFixtureOutcome = "win" | "draw" | "loss";

export type TouchlineCoachRecord = Readonly<{
  wins: number;
  draws: number;
  losses: number;
  touchlinePoints: number;
}>;

/**
 * Public competition projection for one canonical coach. It is intentionally
 * independent from a ClubOwner contract: every current coach receives the
 * same audited season record on Card, Zoom, Profile and Ranking surfaces.
 */
export type TouchlineCoachCompetitionSnapshot = Readonly<{
  snapshotId: string;
  seasonId: string;
  rank: number;
  scoringVersion: typeof TOUCHLINE_COACH_SCORING_VERSION;
  home: TouchlineCoachRecord;
  away: TouchlineCoachRecord;
  totalTouchlinePoints: number;
}>;

export type TouchlineCoachContractSnapshot = Readonly<{
  id: string;
  coachProviderId: string;
  clubProviderId: string;
  status: "active" | "ended";
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  scoringVersion: "coach_scoring_v1" | typeof TOUCHLINE_COACH_SCORING_VERSION;
  home: TouchlineCoachRecord;
  away: TouchlineCoachRecord;
  totalTouchlinePoints: number;
  currentFixture: Readonly<{
    fixtureId: string;
    context: TouchlineCoachFixtureContext;
    status: string | null;
    startsAt: string | null;
    provisionalPoints: number | null;
  }> | null;
  fixtureHistory: readonly Readonly<{
    fixtureId: string;
    context: TouchlineCoachFixtureContext;
    outcome: TouchlineCoachFixtureOutcome;
    homeScore: number;
    awayScore: number;
    touchlinePoints: number;
    settlementStatus: "provisional" | "final";
    startsAt: string | null;
  }>[];
}>;

export function touchlineCoachOutcome(
  context: TouchlineCoachFixtureContext,
  homeScore: number,
  awayScore: number,
): TouchlineCoachFixtureOutcome {
  if (homeScore === awayScore) return "draw";
  const homeWon = homeScore > awayScore;
  return context === "home"
    ? (homeWon ? "win" : "loss")
    : (homeWon ? "loss" : "win");
}

export function touchlineCoachPoints(
  context: TouchlineCoachFixtureContext,
  outcome: TouchlineCoachFixtureOutcome,
) {
  return TOUCHLINE_COACH_SCORING[context][outcome];
}

export function touchlineCoachContractCoversFixture(
  contract: Pick<TouchlineCoachContractSnapshot, "startedAt" | "endedAt">,
  fixtureStartsAt: string,
) {
  const fixtureTime = Date.parse(fixtureStartsAt);
  const startedAt = Date.parse(contract.startedAt);
  const endedAt = contract.endedAt ? Date.parse(contract.endedAt) : null;
  if (![fixtureTime, startedAt].every(Number.isFinite)) return false;
  return fixtureTime >= startedAt && (endedAt === null || fixtureTime < endedAt);
}

export function emptyTouchlineCoachRecord(): TouchlineCoachRecord {
  return { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 };
}
