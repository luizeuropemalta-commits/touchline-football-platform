/**
 * A TouchLine player card is a permanent shared identity; a ClubOwner's
 * contract is seasonal.  This module deliberately carries only historical
 * reference into the following season.  It must never carry a former tier or
 * former TC price forward: a new contract is quoted by the server from that
 * new season's authoritative market value.
 */
export const TOUCHLINE_CARD_CONTRACT_TERM_SEASONS = 1 as const;

export type TouchlineCardSeasonClosingState = {
  playerId: string;
  seasonId: string;
  publishedSnapshotId: string;
};

export type TouchlineCardNextSeasonSeed = {
  playerId: string;
  sourceSeasonId: string;
  nextSeasonId: string;
  sourceSnapshotId: string;
  contractTermSeasons: typeof TOUCHLINE_CARD_CONTRACT_TERM_SEASONS;
  contractExpiresAtSeasonEnd: true;
  requiresFreshServerMarketQuote: true;
  seasonStatsReset: true;
  careerHistoryRetained: true;
};

/**
 * Produces a history-safe next-season seed, not a purchasable card.  The
 * server remains the authority for the current market value, tier, price,
 * supply and contract once the new season is open.
 */
export function carryTouchlineCardIntoNextSeason(
  closing: TouchlineCardSeasonClosingState,
  nextSeasonId: string,
): TouchlineCardNextSeasonSeed {
  const sourceSeason = closing.seasonId.trim();
  const nextSeason = nextSeasonId.trim();
  if (!sourceSeason || !nextSeason || nextSeason === sourceSeason) {
    throw new Error("A distinct next season ID is required.");
  }
  if (!closing.playerId.trim() || !closing.publishedSnapshotId.trim()) {
    throw new Error("A player and published closing snapshot are required.");
  }

  return {
    playerId: closing.playerId,
    sourceSeasonId: sourceSeason,
    nextSeasonId: nextSeason,
    sourceSnapshotId: closing.publishedSnapshotId,
    contractTermSeasons: TOUCHLINE_CARD_CONTRACT_TERM_SEASONS,
    contractExpiresAtSeasonEnd: true,
    requiresFreshServerMarketQuote: true,
    seasonStatsReset: true,
    careerHistoryRetained: true,
  };
}
