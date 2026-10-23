import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
import { compareTouchLineRankedCards } from "./ranked-card-catalog.ts";

export type TouchlinePublishedRankingCatalogFailure =
  | "invalid-ranking"
  | "invalid-catalogue-identity"
  | "duplicate-catalogue-identity"
  | "duplicate-ranking-identity"
  | "missing-published-card"
  | "provider-mismatch";

export type TouchlinePublishedRankingCatalog =
  | Readonly<{
      phase: "ready";
      snapshotId: string;
      seasonId: string;
      cards: readonly ClubOwnerSquadCard[];
    }>
  | Readonly<{ phase: "withdrawn"; cards: readonly ClubOwnerSquadCard[] }>
  | Readonly<{
      phase: "incomplete";
      reason: TouchlinePublishedRankingCatalogFailure;
      missingPlayerIds: readonly string[];
      cards: readonly ClubOwnerSquadCard[];
    }>;

const EMPTY_CARDS: readonly ClubOwnerSquadCard[] = Object.freeze([]);
const CANONICAL_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

function canonicalId(value: unknown) {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CANONICAL_ID.test(id) ? id : null;
}

function providerId(value: unknown) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return null;
  return String(value).trim().toLowerCase() || null;
}

function incomplete(reason: TouchlinePublishedRankingCatalogFailure, missingPlayerIds: readonly string[] = []): TouchlinePublishedRankingCatalog {
  return { phase: "incomplete", reason, missingPlayerIds: [...new Set(missingPlayerIds)].sort(), cards: EMPTY_CARDS };
}

/**
 * Total-rating ranking only, from an already admitted immutable publication.
 * Null/preseason means explicit withdrawal; callers handle an unread seed first.
 * Null-rated rows and goals-only players are NOT total-rating candidates. Zero
 * remains a rated candidate. Golden Boot must resolve cardGoals separately.
 *
 * Every rated candidate must bind to one published card in the complete server
 * catalogue. Never promote a runner-up by silently dropping an unknown player:
 * an incomplete result asks the caller to refresh its catalogue, not this helper
 * to fetch identities or invent a card. Activation order/season scope belongs to
 * the shared publication reader, so a legitimate A -> B -> A is not suppressed.
 */
export function projectTouchlinePublishedRankingCatalog(
  catalogue: readonly ClubOwnerSquadCard[],
  ranking: TouchlineActiveRankingState | null,
): TouchlinePublishedRankingCatalog {
  if (!ranking || ranking.phase === "preseason") return { phase: "withdrawn", cards: EMPTY_CARDS };
  if (ranking.phase !== "ranked" || ranking.leagueKey !== "touchline-england"
    || ranking.scoringVersion !== "player_scoring_v4"
    || !ranking.snapshotId?.trim() || !ranking.seasonId?.trim()
    || (ranking.coverageStatus !== "complete" && ranking.coverageStatus !== "complete_for_scoring")
    || !Array.isArray(ranking.players) || !ranking.players.length) return incomplete("invalid-ranking");
  const snapshotId = ranking.snapshotId;
  const seasonId = ranking.seasonId;

  const cardsById = new Map<string, { card: ClubOwnerSquadCard; provider: string }>();
  const catalogueProviders = new Set<string>();
  for (const card of catalogue) {
    const id = canonicalId(card?.canonicalPlayerId ?? card?.id);
    const provider = providerId(card?.providerPlayerId);
    if (!id || !provider) return incomplete("invalid-catalogue-identity");
    if (cardsById.has(id) || catalogueProviders.has(provider)) return incomplete("duplicate-catalogue-identity");
    cardsById.set(id, { card, provider });
    catalogueProviders.add(provider);
  }

  const rankingIds = new Set<string>();
  const rankingProviders = new Set<string>();
  const candidates: Array<{ id: string; provider: string; row: TouchlineActiveRankingState["players"][number] }> = [];
  for (const row of ranking.players) {
    const id = canonicalId(row?.playerId);
    const provider = providerId(row?.providerPlayerId);
    if (!id || !provider
      || !(row.totalRating === null || (typeof row.totalRating === "number" && Number.isFinite(row.totalRating)))
      || ![row.minutesPlayed, row.appearances].every(value => value == null
        || (typeof value === "number" && Number.isFinite(value) && value >= 0))) return incomplete("invalid-ranking");
    if (rankingIds.has(id) || rankingProviders.has(provider)) return incomplete("duplicate-ranking-identity");
    rankingIds.add(id);
    rankingProviders.add(provider);
    if (row.totalRating !== null) candidates.push({ id, provider, row });
  }

  const missing = candidates.filter(({ id }) => !cardsById.get(id)?.card.editorialCard).map(({ id }) => id);
  if (missing.length) return incomplete("missing-published-card", missing);
  if (candidates.some(({ id, provider }) => cardsById.get(id)!.provider !== provider)) return incomplete("provider-mismatch");

  const cards = candidates.map(({ id, row }): ClubOwnerSquadCard => ({
    ...cardsById.get(id)!.card,
    seasonTotalRating: row.totalRating,
    // The comparator prioritizes this record. Updating only the display total
    // would leave ordering and tiebreaks pinned to the previous publication.
    publishedRanking: {
      snapshotId,
      providerPlayerId: row.providerPlayerId ?? null,
      totalRating: row.totalRating,
      minutesPlayed: row.minutesPlayed ?? null,
      appearances: row.appearances ?? null,
    },
  })).sort(compareTouchLineRankedCards);
  return { phase: "ready", snapshotId, seasonId, cards };
}
