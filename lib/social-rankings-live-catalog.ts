import type { TouchlineActiveRankingState } from "./touchlineArena/card-ranking-live.ts";
import type { ClubOwnerSquadCard } from "./touchlineArena/demo-data.ts";

export const RANKINGS_LIVE_CATALOG_CHUNK_SIZE = 150;

/** Local input adapter; its callback remains the canonical published-card reader. */
export async function loadRankingsLiveCardsInChunks(
  state: TouchlineActiveRankingState,
  readCanonicalChunk: (state: TouchlineActiveRankingState) => Promise<ClubOwnerSquadCard[]>,
): Promise<ClubOwnerSquadCard[]> {
  const expected = state.players.map(player => player.playerId);
  if (new Set(expected).size !== expected.length) throw new Error("RANKINGS_CANONICAL_CARD_COVERAGE_DUPLICATE_INPUT");
  const result: ClubOwnerSquadCard[] = [];
  for (let offset = 0; offset < state.players.length; offset += RANKINGS_LIVE_CATALOG_CHUNK_SIZE) {
    const players = state.players.slice(offset, offset + RANKINGS_LIVE_CATALOG_CHUNK_SIZE);
    const cards = await readCanonicalChunk({ ...state, players });
    const byId = new Map(cards.map(card => [card.canonicalPlayerId, card]));
    const missing = players.filter(player => !byId.has(player.playerId)).map(player => player.playerId);
    if (cards.length !== players.length || byId.size !== cards.length || missing.length) {
      throw new Error(`RANKINGS_CANONICAL_CARD_COVERAGE:${missing.join(",") || "DUPLICATE_OR_OUT_OF_SCOPE"}`);
    }
    result.push(...players.map(player => byId.get(player.playerId)!));
  }
  return result;
}
