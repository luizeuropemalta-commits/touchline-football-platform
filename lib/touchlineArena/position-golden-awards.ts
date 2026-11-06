import { parseTouchlineRankingPresentation, type TouchlineActiveRankingState } from "./card-ranking-live.ts";
import { compareTouchlineRankingPlayers } from "./card-ranking.ts";

export const TOUCHLINE_POSITION_GOLDEN_AWARDS = {
  goalkeeper: { asset: "/touchline/awards/golden-gloves-v1.png", label: "Golden Gloves", key: "golden-gloves" },
  "centre-back": { asset: "/touchline/awards/golden-shield-v1.png", label: "Golden Shield", key: "golden-shield" },
} as const;

/** Same current published ratings and tie-breaks as the ranking, never saves or DEF. */
export function touchlinePositionGoldenAward(state: TouchlineActiveRankingState | null | undefined, playerId: string | null | undefined) {
  const ranking = parseTouchlineRankingPresentation(state);
  if (!ranking || ranking.phase !== "ranked" || !playerId) return null;
  const id = playerId.trim().toLowerCase();
  const player = ranking.players.find(row => row.playerId.toLowerCase() === id);
  if (!player || (player.positionGroup !== "goalkeeper" && player.positionGroup !== "centre-back")) return null;
  const candidates = ranking.players.filter(row => row.positionGroup === player.positionGroup
    && row.totalRating !== null && Number.isFinite(row.totalRating))
    .sort(compareTouchlineRankingPlayers);
  const leader = candidates[0];
  const tied = candidates.filter(row => row.totalRating === leader?.totalRating);
  if (tied.length > 1 && tied.some(row => row.minutesPlayed == null || row.appearances == null)) return null;
  return leader?.playerId.toLowerCase() === id ? TOUCHLINE_POSITION_GOLDEN_AWARDS[player.positionGroup] : null;
}
