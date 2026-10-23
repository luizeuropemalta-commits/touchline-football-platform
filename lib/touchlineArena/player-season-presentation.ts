import type { TouchlineCardLeadershipAuthority } from "./card-leadership-authority";
import type { TouchlinePositionRankingGroup } from "./card-ranking";
import type { ClubOwnerSquadCard } from "./demo-data";

export type TouchlineSeasonPlayerFacts = Readonly<{
  seasonId: string;
  snapshotId: string;
  totalRating: number | null;
  positionRank: number | null;
  positionGroup: TouchlinePositionRankingGroup | null;
}>;

/** undefined means no admitted authority; null means an explicit absence. */
export function resolveTouchlineSeasonPlayer(input: {
  authority: TouchlineCardLeadershipAuthority | null;
  enabled?: boolean;
  playerId?: string | null;
  providerPlayerId?: string | number | null;
  seasonId?: string | null;
}): TouchlineSeasonPlayerFacts | null | undefined {
  const ranking = input.authority?.playerRanking;
  if (!input.enabled || !ranking) return undefined;
  if (ranking.phase === "preseason") return null;
  if (!ranking.snapshotId || !ranking.seasonId || ranking.leagueKey !== "touchline-england"
    || ranking.scoringVersion !== "player_scoring_v4"
    || input.seasonId && input.seasonId !== ranking.seasonId) return undefined;
  const id = input.playerId?.trim().toLowerCase();
  // An unresolved identity is not an authoritative removal. Keep the seed;
  // never borrow another player's total through provider-only matching.
  if (!id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)) return undefined;
  const rows = ranking.players.filter(row => row.playerId.toLowerCase() === id);
  const row = rows.length === 1 ? rows[0] : null;
  const providerId = String(input.providerPlayerId ?? "").trim();
  if (!row || providerId && String(row.providerPlayerId ?? "").trim() !== providerId) return null;
  return { seasonId: ranking.seasonId, snapshotId: ranking.snapshotId,
    totalRating: Number.isFinite(row.totalRating) ? row.totalRating : null,
    positionRank: row.positionRank, positionGroup: row.positionGroup };
}

/** Display only: never change the catalogue used by trades, lineup or ordering. */
export function projectTouchlineSeasonCard(card: ClubOwnerSquadCard, authority: TouchlineCardLeadershipAuthority | null, enabled = false): ClubOwnerSquadCard {
  const canonicalPlayerId = card.canonicalPlayerId ?? (/^[0-9a-f-]{36}$/i.test(card.id) ? card.id : null);
  const facts = resolveTouchlineSeasonPlayer({ authority, enabled, playerId: canonicalPlayerId,
    providerPlayerId: card.providerPlayerId ?? (card.id !== canonicalPlayerId ? card.id : undefined) });
  if (facts === undefined) return card;
  const seasonTotalRating = facts?.totalRating ?? null;
  return card.seasonTotalRating === seasonTotalRating ? card : { ...card, seasonTotalRating };
}
