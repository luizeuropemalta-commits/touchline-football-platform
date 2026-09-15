import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRankingsLiveCardsInChunks } from "../lib/social-rankings-live-catalog.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
const row = JSON.parse(readFileSync(new URL("../artifacts/social-studio/rankings/editorial-pack-20260915.json", import.meta.url), "utf8")).facts.overall;
const state = (count: number): TouchlineActiveRankingState => ({ ...TOUCHLINE_PRESEASON_RANKING_STATE,
  phase: "ranked", seasonId: "1e83121b-b778-459b-b9a0-7cf1eaff5729", scoringVersion: "player_scoring_v3",
  snapshotId: "local-review:catalog-regression", publishedAt: null,
  players: Array.from({ length: count }, (_, index) => ({ ...row, playerId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, providerPlayerId: String(index + 1) })) });
const cards = (scope: TouchlineActiveRankingState) => scope.players.map(p => ({ canonicalPlayerId: p.playerId } as ClubOwnerSquadCard));
test("618 identities are read in <=150 chunks without losing order or local provenance", async () => {
  const original = state(618), sizes: number[] = [];
  const result = await loadRankingsLiveCardsInChunks(original, async scope => {
    if (scope.players.length > 150) throw new Error("UND_ERR_HEADERS_OVERFLOW");
    sizes.push(scope.players.length);
    assert.equal(scope.snapshotId, original.snapshotId);
    assert.equal(scope.publishedAt, null);
    return cards(scope);
  });
  assert.deepEqual(sizes, [150, 150, 150, 150, 18]);
  assert.deepEqual(result.map(c => c.canonicalPlayerId), original.players.map(p => p.playerId));
});
test("missing, duplicate or cross-chunk cards never produce a partial approval input", async () => {
  await assert.rejects(() => loadRankingsLiveCardsInChunks(state(151), async scope => cards(scope).slice(1)), /CANONICAL_CARD_COVERAGE/);
  await assert.rejects(() => loadRankingsLiveCardsInChunks(state(2), async scope => [cards(scope)[0]!, cards(scope)[0]!]), /CANONICAL_CARD_COVERAGE/);
  await assert.rejects(() => loadRankingsLiveCardsInChunks(state(2), async () => [{ canonicalPlayerId: "outside-scope" } as ClubOwnerSquadCard]), /CANONICAL_CARD_COVERAGE/);
});
