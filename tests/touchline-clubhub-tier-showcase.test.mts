import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_CLUBHUB_TIER_ORDER,
  selectTouchlineCoachTierRepresentatives,
  selectTouchlineCoachTierRepresentativesFromRanking,
  selectTouchlinePlayerTierRepresentatives,
} from "../lib/touchlineArena/clubhub-tier-showcase.ts";
import type { TouchlineCardTierKey } from "../lib/touchlineArena/card-rules.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { TOUCHLINE_LIVE_COACHES } from "../lib/touchlineArena/live-coaches.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

function publishedCard(
  name: string,
  tierKey: TouchlineCardTierKey,
  marketValueEur: number,
): ClubOwnerSquadCard {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    canonicalPlayerId: "00000000-0000-4000-8000-000000000001",
    name,
    shortName: name.split(" ").at(-1) ?? name,
    role: "forward",
    position: "ST",
    clubName: "TouchLine FC",
    shirtNumber: 9,
    countryCode3: "ENG",
    touchlinePoints: 0,
    marketValue: `€${marketValueEur}`,
    marketValueSource: "verified-cache",
    marketValueState: "verified",
    editorialCard: {
      tierKey,
      cardPrice: { amountMinor: 1500, currency: "GBP" },
      marketValueEur,
      lastReviewedAt: "2026-08-27T00:00:00.000Z",
    },
  };
}

test("player border gallery follows the canonical high-to-entry order", () => {
  const cards = TOUCHLINE_CLUBHUB_TIER_ORDER.flatMap((tierKey, index) => [
    publishedCard(`Lower ${tierKey}`, tierKey, 1_000_000 + index),
    publishedCard(`Highest ${tierKey}`, tierKey, 2_000_000 + index),
  ]);
  cards.push(publishedCard("Erling Haaland", "diamond-gold", 180_000_000));

  const representatives = selectTouchlinePlayerTierRepresentatives(cards);
  assert.deepEqual(representatives.map((item) => item.tierKey), [
    "diamond-gold",
    "clear-diamond",
    "emerald-green",
    "radiant-gold",
    "amethyst-purple",
    "sapphire-blue",
    "ruby-red",
  ]);
  assert.equal(representatives[0]?.card?.name, "Erling Haaland");
  for (const representative of representatives.slice(1)) {
    assert.match(representative.card?.name ?? "", /^Highest /);
  }
});

test("coach border representatives preserve the same immutable tier as their profile", () => {
  const representatives = selectTouchlineCoachTierRepresentatives();
  const byTier = new Map(representatives.map((item) => [item.tierKey, item]));

  assert.equal(byTier.get("diamond-gold")?.snapshot?.coach.displayName, "Mikel Arteta");
  assert.equal(byTier.get("clear-diamond")?.snapshot?.coach.displayName, "Unai Emery");
  assert.equal(byTier.get("emerald-green")?.snapshot?.coach.displayName, "Régis Le Bris");
  assert.equal(byTier.get("radiant-gold")?.snapshot?.coach.displayName, "Keith Andrews");
  assert.equal(byTier.get("amethyst-purple")?.snapshot?.coach.displayName, "David Moyes");
  assert.equal(byTier.get("sapphire-blue")?.snapshot?.coach.displayName, "Frank Lampard");
  assert.equal(byTier.get("ruby-red")?.snapshot, null);
  assert.equal(byTier.get("ruby-red")?.classification, null);

  assert.equal(representatives.length, 7, "retain every border, including pending ones");
  for (const item of representatives) {
    if (item.snapshot) assert.equal(item.tierKey, item.classification?.tierKey);
  }
});

test("a complete persisted coach table fills every gallery border from its current rank", () => {
  assert.equal(TOUCHLINE_LIVE_COACHES.length, 20);
  const ranking: TouchLineCoachRankingState = {
    phase: "ranked", snapshotId: "snapshot-current", seasonId: "2026-27", scoringVersion: "coach_scoring_v2",
    fixtureIds: ["fixture-current"], generatedAt: "2026-10-14T00:00:00.000Z",
    rows: TOUCHLINE_LIVE_COACHES.map((snapshot, index) => ({
      rank: index + 1, coachProviderId: snapshot.coach.providerId, coachName: snapshot.coach.displayName,
      clubName: snapshot.clubName, touchlinePoints: 20 - index, wins: 0, draws: 0, losses: 0, awayWins: 0,
      home: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 },
      away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 },
    })),
  };
  const representatives = selectTouchlineCoachTierRepresentativesFromRanking(ranking);
  assert.equal(representatives.length, 7);
  assert.equal(representatives.every((item) => item.snapshot && item.rankingRow), true);
  assert.equal(representatives.at(-1)?.tierKey, "ruby-red");
  assert.equal(representatives.at(-1)?.rankingRow?.rank, 18);
});
