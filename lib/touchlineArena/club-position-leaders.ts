import { compareTouchlineRankingPlayers } from "./card-ranking.ts";
import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
import { resolveTouchlineSeasonPlayer } from "./player-season-presentation.ts";

export const CLUB_POSITION_LEADER_GROUPS = [
  { key: "centre-back", positionGroups: ["centre-back"], copyKey: "topCentreBack" },
  { key: "full-back", positionGroups: ["full-back"], copyKey: "topFullBack" },
  { key: "midfielder", positionGroups: ["midfielder"], copyKey: "topMidfielder" },
  { key: "attacker", positionGroups: ["winger", "striker"], copyKey: "topAttacker" },
] as const;

/** Club membership comes only from the verified roster, never from ranking names. */
export function projectClubPositionLeaders(cards: readonly ClubOwnerSquadCard[], ranking: TouchlineActiveRankingState | null) {
  const overall = ranking?.phase === "ranked" ? [...ranking.players].filter(row => row.totalRating !== null).sort(compareTouchlineRankingPlayers) : [];
  const authority = { playerRanking: ranking, coachLeader: null };
  const projected = cards.flatMap(card => {
    const id = card.canonicalPlayerId ?? (/^[0-9a-f-]{36}$/i.test(card.id) ? card.id : null);
    const facts = resolveTouchlineSeasonPlayer({ authority, enabled: true, playerId: id,
      providerPlayerId: card.providerPlayerId ?? (card.id !== id ? card.id : undefined) });
    if (!facts || facts.totalRating === null) return [];
    const row = overall.find(candidate => candidate.playerId.toLowerCase() === id?.toLowerCase());
    if (!row) return [];
    return [{ card: { ...card, seasonTotalRating: facts.totalRating, publishedRanking: {
      snapshotId: facts.snapshotId, providerPlayerId: row.providerPlayerId ?? null, totalRating: facts.totalRating,
      minutesPlayed: row.minutesPlayed ?? null, appearances: row.appearances ?? null,
    } }, positionGroup: facts.positionGroup, positionRank: facts.positionRank, overallRank: overall.indexOf(row) + 1 }];
  }).sort((a, b) => a.overallRank - b.overallRank);
  return CLUB_POSITION_LEADER_GROUPS.map(group => ({ ...group,
    leader: projected.find(item => (group.positionGroups as readonly string[]).includes(item.positionGroup ?? "")),
  }));
}
