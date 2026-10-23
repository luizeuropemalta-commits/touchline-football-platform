import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
import { parseTouchlinePublicEditorialCardPresentation } from "./editorial-card-profile.ts";

/** Store identity only; every render resolves facts from the current publication. */
export type TouchlineRankingZoomSelection = Readonly<{
  playerId: string;
  providerPlayerId: string;
}>;

export type TouchlineRankingZoomSelectedCard =
  | Readonly<{ phase: "available"; card: ClubOwnerSquadCard }>
  | Readonly<{ phase: "unavailable"; reason: "identity" | "editorial" | "publication" }>;

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
function canonicalId(value: unknown) {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID.test(id) ? id : null;
}
function providerId(value: unknown) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return null;
  return String(value).trim().toLowerCase() || null;
}

export function touchlineRankingZoomSelectionForCard(card: ClubOwnerSquadCard): TouchlineRankingZoomSelection | null {
  const playerId = canonicalId(card.canonicalPlayerId ?? card.id);
  const providerPlayerId = providerId(card.providerPlayerId);
  return playerId && providerPlayerId ? { playerId, providerPlayerId } : null;
}

/**
 * Independent of top-N/list completeness, not of the selected player's identity.
 * An unrelated missing card may withhold the list without erasing this player's
 * admitted facts. Withdrawal/absence clears only the season score; a conflicting
 * identity or removed/invalid editorial card hides the card and all its actions.
 * This display clone cannot introduce a ranking tier, price, fantasy score or
 * current-match fact into the editorial catalogue.
 */
export function resolveTouchlineRankingZoomSelection(
  catalogue: readonly ClubOwnerSquadCard[],
  ranking: TouchlineActiveRankingState | null,
  selection: TouchlineRankingZoomSelection,
): TouchlineRankingZoomSelectedCard {
  const id = canonicalId(selection.playerId);
  const provider = providerId(selection.providerPlayerId);
  if (!id || !provider) return { phase: "unavailable", reason: "identity" };

  const matchingCards = catalogue.filter(card => canonicalId(card?.canonicalPlayerId ?? card?.id) === id
    || providerId(card?.providerPlayerId) === provider);
  const card = matchingCards.length === 1 ? matchingCards[0] : null;
  if (!card || canonicalId(card.canonicalPlayerId ?? card.id) !== id || providerId(card.providerPlayerId) !== provider) {
    return { phase: "unavailable", reason: "identity" };
  }
  if (!parseTouchlinePublicEditorialCardPresentation(card.editorialCard)) return { phase: "unavailable", reason: "editorial" };

  const withoutRating = (): TouchlineRankingZoomSelectedCard => ({
    phase: "available", card: { ...card, seasonTotalRating: null, publishedRanking: undefined },
  });
  if (!ranking || ranking.phase === "preseason") return withoutRating();
  if (ranking.phase !== "ranked" || ranking.leagueKey !== "touchline-england"
    || ranking.scoringVersion !== "player_scoring_v4"
    || !ranking.snapshotId?.trim() || !ranking.seasonId?.trim()
    || (ranking.coverageStatus !== "complete" && ranking.coverageStatus !== "complete_for_scoring")
    || !Array.isArray(ranking.players)) return { phase: "unavailable", reason: "publication" };

  const matchingRows = ranking.players.filter(row => canonicalId(row?.playerId) === id
    || providerId(row?.providerPlayerId) === provider);
  if (!matchingRows.length) return withoutRating();
  const row = matchingRows.length === 1 ? matchingRows[0] : null;
  if (!row || canonicalId(row.playerId) !== id || providerId(row.providerPlayerId) !== provider) {
    return { phase: "unavailable", reason: "identity" };
  }
  if (!(row.totalRating === null || (typeof row.totalRating === "number" && Number.isFinite(row.totalRating)))
    || ![row.minutesPlayed, row.appearances].every(value => value == null
      || (typeof value === "number" && Number.isFinite(value) && value >= 0))) {
    return { phase: "unavailable", reason: "publication" };
  }
  return { phase: "available", card: {
    ...card,
    seasonTotalRating: row.totalRating,
    publishedRanking: {
      snapshotId: ranking.snapshotId,
      providerPlayerId: row.providerPlayerId ?? null,
      totalRating: row.totalRating,
      minutesPlayed: row.minutesPlayed ?? null,
      appearances: row.appearances ?? null,
    },
  } };
}
