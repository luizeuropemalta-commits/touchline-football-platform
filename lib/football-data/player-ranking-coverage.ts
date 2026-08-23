export const TOUCHLINE_PLAYER_RANKING_COVERAGE_STATUSES = [
  "complete",
  "complete_for_scoring",
  "blocking_partial",
  "unavailable",
] as const;

export type TouchLinePlayerRankingCoverageStatus =
  (typeof TOUCHLINE_PLAYER_RANKING_COVERAGE_STATUSES)[number];

const NON_SCORING_DETAIL_FACTS = new Set([
  "shots-off-target",
]);

const NON_PARTICIPANT_NOT_APPLICABLE_FACTS = new Set([
  "shots-on-target",
  "rating",
  "saves",
  "goals-conceded-while-on-field",
  "def:tacklesWon",
  "def:interceptions",
  "def:clearances",
  "def:blockedShots",
  "def:aerialsWon",
]);

/**
 * Sportmonks V3 omits unrecorded statistic detail types instead of emitting a
 * numeric zero. An omitted scoring fact therefore remains blocking unless the
 * V2 contract proves it is not used by scoring or it is not applicable because
 * the final official lineup confirms that the player did not participate.
 * COMPLETE_FOR_SCORING never converts a missing fact to zero.
 */
export function classifyTouchLinePlayerRankingCoverage(input: {
  fixtureFinal: boolean;
  points: number | null;
  scoringCoverageStatus: "complete" | "partial" | "unavailable";
  missingFacts: readonly string[];
  appearanceStatus: "started" | "substitute" | "unused" | "absent" | "unavailable";
  /** The final Sportmonks lineup identifies a real participant, but its
   * authoritative statistics array contains no rating fact. This is distinct
   * from an ingestion, identity, or settlement failure. */
  providerRatingAbsentFromFinalLineup?: boolean;
}): TouchLinePlayerRankingCoverageStatus {
  const nonParticipant = input.appearanceStatus === "unused" || input.appearanceStatus === "absent";
  // A final official team sheet proves this player did not receive a rating
  // because they did not play. This is neither a fabricated zero nor a
  // missing scoring fact for the player's season accumulation.
  if (input.fixtureFinal && nonParticipant) return "complete_for_scoring";
  // A provider-confirmed substitute can legitimately have no Sportmonks
  // rating. It is excluded from the player's V3 score accumulation (rather
  // than assigned zero), while the final fixture remains safe for the ranking
  // population. Any unknown/mapped-away participant stays unavailable below.
  if (
    input.fixtureFinal
    && input.providerRatingAbsentFromFinalLineup === true
    && (input.appearanceStatus === "started" || input.appearanceStatus === "substitute")
  ) return "complete_for_scoring";
  if (input.points === null || !Number.isFinite(input.points) || input.scoringCoverageStatus === "unavailable") {
    return "unavailable";
  }
  if (!input.fixtureFinal) return "blocking_partial";
  if (input.scoringCoverageStatus === "complete" && input.missingFacts.length === 0) return "complete";
  if (
    input.scoringCoverageStatus === "partial"
    && input.missingFacts.length > 0
    && input.missingFacts.every((fact) => (
      NON_SCORING_DETAIL_FACTS.has(fact)
      || (nonParticipant && NON_PARTICIPANT_NOT_APPLICABLE_FACTS.has(fact))
    ))
  ) {
    return "complete_for_scoring";
  }
  return "blocking_partial";
}

export function isTouchLinePlayerRankingCoverageComplete(value: unknown) {
  return value === "complete" || value === "complete_for_scoring";
}
