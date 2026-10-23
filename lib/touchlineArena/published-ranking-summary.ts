import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
import { parseTouchlinePublicEditorialCardPresentation } from "./editorial-card-profile.ts";

/** Only published identity bindings cross the Hero boundary, not card artwork/economy. */
export type TouchlineRankingSummaryIndex = readonly Readonly<{
  playerId: string;
  providerPlayerId: string;
}>[] | null;

export type TouchlinePublishedRankingSummary =
  | Readonly<{ phase: "ready"; totalRankedCards: number }>
  | Readonly<{ phase: "withdrawn"; totalRankedCards: 0 }>
  | Readonly<{ phase: "incomplete"; totalRankedCards: null;
      reason: "catalogue-unavailable" | "invalid-ranking" | "unknown-player" | "provider-mismatch" }>;

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
function canonicalId(value: unknown) {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID.test(id) ? id : null;
}
function providerId(value: unknown) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return null;
  return String(value).trim().toLowerCase() || null;
}

function identityMap(index: TouchlineRankingSummaryIndex) {
  if (!Array.isArray(index)) return null;
  const identities = new Map<string, string>();
  const providers = new Set<string>();
  for (const entry of index) {
    const id = canonicalId(entry?.playerId), provider = providerId(entry?.providerPlayerId);
    if (!id || !provider || identities.has(id) || providers.has(provider)) return null;
    identities.set(id, provider); providers.add(provider);
  }
  return identities;
}

/** Server catalogue already establishes provenance; retain only verified public bindings. */
export function buildTouchlineRankingSummaryIndex(
  catalogue: readonly ClubOwnerSquadCard[] | null | undefined,
): TouchlineRankingSummaryIndex {
  if (!Array.isArray(catalogue)) return null;
  const index: Array<{ playerId: string; providerPlayerId: string }> = [];
  for (const card of catalogue) {
    const playerId = canonicalId(card?.canonicalPlayerId ?? card?.id);
    const providerPlayerId = providerId(card?.providerPlayerId);
    if (!playerId || !providerPlayerId || !parseTouchlinePublicEditorialCardPresentation(card?.editorialCard)) return null;
    index.push({ playerId, providerPlayerId });
  }
  return identityMap(index) ? index : null;
}

/**
 * Counts membership of the admitted ranking, not finite ratings or goal rows.
 * A null-rated player is still a member; a goals-only card is not. Every row
 * must bind exactly once before returning a count, so it is bounded by the
 * unique verified catalogue size. An unavailable/partial catalogue is never 0.
 * Accepted activation order (including A -> B -> A) belongs to the shared reader.
 * The global editorial published-card count is deliberately outside this model.
 */
export function projectTouchlinePublishedRankingSummary(
  index: TouchlineRankingSummaryIndex,
  ranking: TouchlineActiveRankingState | null,
): TouchlinePublishedRankingSummary {
  if (!ranking || ranking.phase === "preseason") return { phase: "withdrawn", totalRankedCards: 0 };
  if (ranking.phase !== "ranked" || ranking.leagueKey !== "touchline-england"
    || ranking.scoringVersion !== "player_scoring_v4" || !ranking.snapshotId?.trim() || !ranking.seasonId?.trim()
    || (ranking.coverageStatus !== "complete" && ranking.coverageStatus !== "complete_for_scoring")
    || !Array.isArray(ranking.players) || !ranking.players.length) {
    return { phase: "incomplete", totalRankedCards: null, reason: "invalid-ranking" };
  }
  const identities = identityMap(index);
  if (!identities) return { phase: "incomplete", totalRankedCards: null, reason: "catalogue-unavailable" };
  const rankingIds = new Set<string>(), rankingProviders = new Set<string>();
  for (const row of ranking.players) {
    const id = canonicalId(row?.playerId), provider = providerId(row?.providerPlayerId);
    if (!id || !provider || rankingIds.has(id) || rankingProviders.has(provider)
      || !(row.totalRating === null || typeof row.totalRating === "number" && Number.isFinite(row.totalRating))) {
      return { phase: "incomplete", totalRankedCards: null, reason: "invalid-ranking" };
    }
    rankingIds.add(id); rankingProviders.add(provider);
    if (!identities.has(id)) return { phase: "incomplete", totalRankedCards: null, reason: "unknown-player" };
    if (identities.get(id) !== provider) return { phase: "incomplete", totalRankedCards: null, reason: "provider-mismatch" };
  }
  return { phase: "ready", totalRankedCards: rankingIds.size };
}
