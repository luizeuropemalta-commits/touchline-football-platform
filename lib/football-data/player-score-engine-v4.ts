/** Raw Sportmonks ratings. V3 remains historical and must not be reinterpreted. */
export const TOUCHLINE_PLAYER_SCORING_V4_VERSION = "player_scoring_v4" as const;

export function touchLinePlayerFixtureScoreV4(value: unknown) {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  const rating = Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
  return {
    scoringVersion: TOUCHLINE_PLAYER_SCORING_V4_VERSION,
    rating,
    points: rating,
    coverageStatus: rating === null ? "unavailable" as const : "complete" as const,
    missingFacts: rating === null ? ["sportmonks-rating"] : [],
    contributions: rating === null ? [] : [{
      providerEventId: `rating:${rating}`,
      role: "fact" as const,
      ruleCode: "sportmonks-rating" as const,
      eventType: "Sportmonks rating" as const,
      minute: null,
      quantity: 1 as const,
      unitPoints: rating,
      points: rating,
      factValue: rating,
      detail: `Sportmonks rating ${rating}`,
    }],
  };
}
