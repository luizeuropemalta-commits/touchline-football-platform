import "server-only";
import { loadRequestTouchlineSportsPublication } from "./sports-publication-server";
import { loadCoachCatalogue } from "./coach-catalogue-server";
import { EMPTY_COACH_RANKING, type TouchLineCoachRankingState } from "./coach-ranking-snapshot-server";
export { readTouchlineCoachRankingSnapshot } from "./coach-ranking-snapshot-server";
export type { TouchLineCoachRankingState, TouchLineCoachRankingRow } from "./coach-ranking-snapshot-server";

/** Public SSR never resolves an independently active crown authority. */
export async function loadTouchLineCoachRanking(): Promise<TouchLineCoachRankingState> {
  const publication = await loadRequestTouchlineSportsPublication();
  if (!publication) throw new Error("TOUCHLINE_SPORTS_PUBLICATION_UNAVAILABLE");
  if (publication.coachRanking) return publication.coachRanking;
  const catalogue = await loadCoachCatalogue();
  return catalogue.phase === "legacy" ? EMPTY_COACH_RANKING : { ...EMPTY_COACH_RANKING, catalogue };
}
