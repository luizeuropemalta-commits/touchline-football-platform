import { compareTouchlineRankingPlayers } from "./card-ranking";
import type { ClubOwnerSquadCard } from "./demo-data";

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asRankingPlayer(card: ClubOwnerSquadCard) {
  return {
    playerId: card.canonicalPlayerId ?? card.id,
    name: card.name,
    clubName: card.clubName,
    position: card.position,
    role: card.role,
    touchlinePoints: card.seasonTouchlinePoints ?? card.touchlinePoints,
    minutesPlayed: finiteNumber(card.seasonStats?.minutes),
    appearances: finiteNumber(card.seasonStats?.appearances),
  };
}

/** Uses the same stable V2 ranking tie-break contract on every public card list. */
export function compareTouchLineRankedCards(
  first: ClubOwnerSquadCard,
  second: ClubOwnerSquadCard,
) {
  return compareTouchlineRankingPlayers(asRankingPlayer(first), asRankingPlayer(second));
}
