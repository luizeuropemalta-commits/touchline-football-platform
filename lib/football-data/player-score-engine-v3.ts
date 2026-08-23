/**
 * Player Score Engine V3 is deliberately rating-only. Football statistics are
 * retained as match explanation data, but never contribute a second time to
 * TouchLine points.
 */
export const TOUCHLINE_PLAYER_SCORING_V3_VERSION = "player_scoring_v3" as const;

export const TOUCHLINE_PLAYER_SCORING_V3_RATING_BANDS = [
  { minInclusive: 0, maxExclusive: 6, points: -1 },
  { minInclusive: 6, maxExclusive: 6.5, points: 0 },
  { minInclusive: 6.5, maxExclusive: 7, points: 1 },
  { minInclusive: 7, maxExclusive: 7.5, points: 2 },
  { minInclusive: 7.5, maxExclusive: 8, points: 3 },
  { minInclusive: 8, maxExclusive: 8.5, points: 5 },
  { minInclusive: 8.5, maxExclusive: 9, points: 7 },
  { minInclusive: 9, maxExclusive: 9.5, points: 9 },
  { minInclusive: 9.5, maxExclusive: 10.000_001, points: 12 },
] as const;

export type TouchLinePlayerScoreV3Result = Readonly<{
  scoringVersion: typeof TOUCHLINE_PLAYER_SCORING_V3_VERSION;
  rating: number | null;
  points: number | null;
  coverageStatus: "complete" | "unavailable";
  missingFacts: string[];
  contributions: Array<{
    providerEventId: string;
    role: "fact";
    ruleCode: "sportmonks-rating";
    eventType: "Sportmonks rating";
    minute: null;
    quantity: 1;
    unitPoints: number;
    points: number;
    factValue: number;
    detail: string;
  }>;
}>;

function finiteRating(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Missing or out-of-range provider ratings are unavailable, never zero. */
export function touchLinePointsFromSportmonksRating(rating: unknown) {
  const numericRating = finiteRating(rating);
  if (numericRating === null || numericRating < 0 || numericRating > 10) return null;
  return TOUCHLINE_PLAYER_SCORING_V3_RATING_BANDS.find((band) => (
    numericRating >= band.minInclusive && numericRating < band.maxExclusive
  ))?.points ?? null;
}

export function touchLinePlayerFixtureScoreV3(rating: unknown): TouchLinePlayerScoreV3Result {
  const numericRating = finiteRating(rating);
  const points = touchLinePointsFromSportmonksRating(numericRating);
  if (numericRating === null || points === null) {
    return {
      scoringVersion: TOUCHLINE_PLAYER_SCORING_V3_VERSION,
      rating: null,
      points: null,
      coverageStatus: "unavailable",
      missingFacts: ["sportmonks-rating"],
      contributions: [],
    };
  }
  return {
    scoringVersion: TOUCHLINE_PLAYER_SCORING_V3_VERSION,
    rating: numericRating,
    points,
    coverageStatus: "complete",
    missingFacts: [],
    contributions: [{
      providerEventId: `rating:${numericRating}`,
      role: "fact",
      ruleCode: "sportmonks-rating",
      eventType: "Sportmonks rating",
      minute: null,
      quantity: 1,
      unitPoints: points,
      points,
      factValue: numericRating,
      detail: `Sportmonks rating ${numericRating}`,
    }],
  };
}
