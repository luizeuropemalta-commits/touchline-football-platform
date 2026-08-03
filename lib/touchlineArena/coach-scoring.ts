export const TOUCHLINE_COACH_SCORING_VERSION = "coach-points-v1" as const;

export type TouchlineCoachVenue = "home" | "away";
export type TouchlineCoachResult = "win" | "draw" | "loss";
export type TouchlineCoachRankingPeriod = "round" | "month" | "season";

export type TouchlineCoachScoringWeights = {
  homeWin: number;
  awayWin: number;
  homeDraw: number;
  awayDraw: number;
  homeLoss: number;
  awayLoss: number;
  yellowCard: number;
  redCard: number;
};

export type TouchlineCoachScoringDraft = {
  [Key in keyof TouchlineCoachScoringWeights]: TouchlineCoachScoringWeights[Key] | null;
};

/** Official values explicitly approved by the owner. */
export const TOUCHLINE_COACH_SCORING_DRAFT: Readonly<TouchlineCoachScoringDraft> = {
  homeWin: 3,
  awayWin: 4,
  homeDraw: 1,
  awayDraw: 2,
  homeLoss: -4,
  awayLoss: -3,
  yellowCard: -1,
  redCard: -3,
};

export const TOUCHLINE_COACH_SCORING_WEIGHTS: Readonly<TouchlineCoachScoringWeights> = {
  homeWin: 3,
  awayWin: 4,
  homeDraw: 1,
  awayDraw: 2,
  homeLoss: -4,
  awayLoss: -3,
  yellowCard: -1,
  redCard: -3,
};

export function touchlineCoachScoringDraftIsComplete(
  draft: TouchlineCoachScoringDraft,
): draft is TouchlineCoachScoringWeights {
  return Object.values(draft).every((value) => typeof value === "number" && Number.isFinite(value));
}

export type TouchlineCoachMatchScoringInput = {
  fixtureId: string;
  coachProviderId: string;
  venue: TouchlineCoachVenue;
  result: TouchlineCoachResult;
  yellowCards: number;
  redCards: number;
};

export type TouchlineCoachMatchScore = {
  fixtureId: string;
  coachProviderId: string;
  resultPoints: number;
  disciplinePoints: number;
  totalPoints: number;
};

/**
 * Protects the approved TouchLine business rules. Numeric weights remain external
 * until the owner approves them; an invalid formula can never be activated.
 */
export function touchlineCoachScoringWeightsAreValid(weights: TouchlineCoachScoringWeights) {
  return Number.isFinite(weights.homeWin)
    && Number.isFinite(weights.awayWin)
    && Number.isFinite(weights.homeDraw)
    && Number.isFinite(weights.awayDraw)
    && Number.isFinite(weights.homeLoss)
    && Number.isFinite(weights.awayLoss)
    && Number.isFinite(weights.yellowCard)
    && Number.isFinite(weights.redCard)
    && weights.awayWin > weights.homeWin
    && weights.homeWin > weights.awayDraw
    && weights.awayDraw > weights.homeDraw
    && weights.homeDraw > weights.awayLoss
    && weights.awayLoss > weights.homeLoss
    && weights.homeLoss < 0
    && weights.yellowCard < 0
    && weights.redCard < weights.yellowCard;
}

export function calculateTouchlineCoachMatchScore(
  input: TouchlineCoachMatchScoringInput,
  weights: TouchlineCoachScoringWeights,
): TouchlineCoachMatchScore {
  if (!touchlineCoachScoringWeightsAreValid(weights)) {
    throw new Error("TouchLine coach scoring weights are not approved or violate the official rules.");
  }
  if (!input.fixtureId.trim() || !input.coachProviderId.trim()) {
    throw new Error("Verified fixture and coach identities are required.");
  }
  if (!Number.isInteger(input.yellowCards) || input.yellowCards < 0 || !Number.isInteger(input.redCards) || input.redCards < 0) {
    throw new Error("Coach discipline totals must be non-negative integers.");
  }

  const resultKey = `${input.venue}${input.result[0].toUpperCase()}${input.result.slice(1)}` as
    | "homeWin"
    | "awayWin"
    | "homeDraw"
    | "awayDraw"
    | "homeLoss"
    | "awayLoss";
  const resultPoints = weights[resultKey];
  const disciplinePoints = input.yellowCards * weights.yellowCard + input.redCards * weights.redCard;

  return {
    fixtureId: input.fixtureId,
    coachProviderId: input.coachProviderId,
    resultPoints,
    disciplinePoints,
    totalPoints: resultPoints + disciplinePoints,
  };
}
