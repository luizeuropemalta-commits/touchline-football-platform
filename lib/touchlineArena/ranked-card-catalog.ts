import { compareTouchlineRankingPlayers } from "./card-ranking.ts";
import type { ClubOwnerSquadCard } from "./demo-data";

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asRankingPlayer(card: ClubOwnerSquadCard) {
  return {
    playerId: card.canonicalPlayerId ?? card.id,
    providerPlayerId: card.publishedRanking?.providerPlayerId ?? card.providerPlayerId,
    name: card.name,
    clubName: card.clubName,
    position: card.position,
    role: card.role,
    totalRating: card.publishedRanking ? card.publishedRanking.totalRating : card.seasonTotalRating ?? null,
    minutesPlayed: card.publishedRanking ? card.publishedRanking.minutesPlayed : finiteNumber(card.seasonStats?.minutes),
    appearances: card.publishedRanking ? card.publishedRanking.appearances : finiteNumber(card.seasonStats?.appearances),
  };
}

/** Every public card list uses the same canonical total-rating order. */
export function compareTouchLineRankedCards(
  first: ClubOwnerSquadCard,
  second: ClubOwnerSquadCard,
) {
  return compareTouchlineRankingPlayers(asRankingPlayer(first), asRankingPlayer(second));
}
