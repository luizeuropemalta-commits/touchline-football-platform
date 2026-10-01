import type { ClubOwnerSquadCard } from "./demo-data";
import type { TouchlinePublishedTopEleven } from "./published-top-eleven";
import { resolveTouchlinePublishedGameweekBest } from "./published-gameweek-best.ts";
import { compareTouchLineRankedCards } from "./ranked-card-catalog.ts";

/** Project only rendered highlights after the complete catalogue has passed
 * its server-side publication and season gates. Never use this as authority
 * for the total catalogue count or the player leadership publication. */
export function projectTouchlineRankingsHighlights(
  rosterCards: readonly ClubOwnerSquadCard[],
  publishedTopEleven: TouchlinePublishedTopEleven | null,
) {
  const publishedRosterCards = rosterCards.filter((card) => Boolean(card.editorialCard));
  return {
    gameweekBest: resolveTouchlinePublishedGameweekBest({ selection: publishedTopEleven, cards: publishedRosterCards }),
    topPlayerCards: publishedRosterCards
      .filter((card) => card.seasonTotalRating != null)
      .sort(compareTouchLineRankedCards)
      .slice(0, 3),
  };
}

export type TouchlineRankingsHighlights = ReturnType<typeof projectTouchlineRankingsHighlights>;
