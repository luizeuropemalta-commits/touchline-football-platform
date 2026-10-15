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
  goldenBootPlayerIds: readonly string[] = [],
) {
  const publishedRosterCards = rosterCards.filter((card) => Boolean(card.editorialCard));
  const topPlayerCards = publishedRosterCards
    .filter((card) => card.seasonTotalRating != null)
    .sort(compareTouchLineRankedCards);
  const goldenBootIds = new Set(goldenBootPlayerIds.map((id) => id.trim().toLowerCase()).filter(Boolean));
  const publishedGoldenBootCard = goldenBootIds.size === 1
    ? publishedRosterCards.find((card) => card.canonicalPlayerId && goldenBootIds.has(card.canonicalPlayerId.toLowerCase())) ?? null
    : null;
  // Owner-approved visual placeholder for the QA award canvas. It is never
  // presented as a scored result and yields immediately to the published
  // Golden Boot authority once that read is supplied.
  const haalandPreviewCard = publishedRosterCards.find((card) => card.name.trim().toLowerCase() === "erling haaland") ?? null;
  return {
    gameweekBest: resolveTouchlinePublishedGameweekBest({ selection: publishedTopEleven, cards: publishedRosterCards }),
    /** The award is shown only when the separately published Golden Boot
     * authority identifies exactly one current published card. A rating must
     * never be relabelled as a goals award. */
    bestPlayerCard: topPlayerCards[0] ?? null,
    // Retained as the public ranking projection for consumers that need the
    // complete compact list. The award surface uses only bestPlayerCard.
    topPlayerCards: topPlayerCards.slice(0, 3),
    goldenBootCard: publishedGoldenBootCard ?? haalandPreviewCard,
    goldenBootState: publishedGoldenBootCard ? "published" as const : haalandPreviewCard ? "preview" as const : "pending" as const,
  };
}

export type TouchlineRankingsHighlights = ReturnType<typeof projectTouchlineRankingsHighlights>;
