import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareTouchlineManualMarketValueEditorialDecision,
  resolveTouchlineManualMarketValuePublicCardPresentation,
} from "../lib/touchlineArena/manual-market-value-editorial.ts";

const PLAYER_ID = "d9428888-122b-11e1-b85c-61cd3cbb3210";

function input(overrides: Record<string, unknown> = {}) {
  return {
    playerId: PLAYER_ID,
    effectiveSeason: "2026-27",
    marketValueEur: 42_000_000,
    publicationState: "published" as const,
    lastReviewedAt: "2026-08-11T10:00:00.000Z",
    internalNote: "Editorial review evidence.",
    internalSource: "Internal owner decision.",
    ...overrides,
  };
}

test("a manual editorial value uses the shared tier and price policy", () => {
  const decision = prepareTouchlineManualMarketValueEditorialDecision(input());

  assert.ok(decision);
  assert.equal(decision.classification.tierKey, "emerald-green");
  assert.equal(decision.classification.nominalPrice, 7);
  assert.deepEqual(resolveTouchlineManualMarketValuePublicCardPresentation(decision), {
    tierKey: "emerald-green",
    cardPrice: { amountMinor: 700, currency: "GBP" },
    lastReviewedAt: "2026-08-11T10:00:00.000Z",
  });
});

test("unpublished decisions calculate internally but never expose a card tier or price", () => {
  for (const publicationState of ["market_value_required", "ready_for_review", "ready_to_publish"] as const) {
    const decision = prepareTouchlineManualMarketValueEditorialDecision(input({ publicationState }));
    assert.ok(decision);
    assert.equal(resolveTouchlineManualMarketValuePublicCardPresentation(decision), null);
  }
});

test("missing or invalid manual EUR values fail closed", () => {
  assert.equal(prepareTouchlineManualMarketValueEditorialDecision(input({ marketValueEur: -1 })), null);
  assert.equal(prepareTouchlineManualMarketValueEditorialDecision(input({ marketValueEur: 12.5 })), null);
  assert.equal(prepareTouchlineManualMarketValueEditorialDecision(input({ effectiveSeason: "  " })), null);
});

test("an active-season card classification stays frozen while the manual record changes", () => {
  const decision = prepareTouchlineManualMarketValueEditorialDecision(input({ marketValueEur: 90_000_000 }), {
    tierKey: "sapphire-blue",
    nominalPrice: 1,
    effectiveSeason: "2026-27",
    policyVersion: "2026-07-premier-v1",
  });

  assert.ok(decision);
  assert.equal(decision.classification.reason, "active-season-frozen");
  assert.equal(decision.editorialCard.tierKey, "sapphire-blue");
  assert.equal(decision.editorialCard.cardPrice.amountMinor, 100);
});

test("manual value and internal evidence never cross the public card boundary", () => {
  const decision = prepareTouchlineManualMarketValueEditorialDecision(input());
  const publicCard = resolveTouchlineManualMarketValuePublicCardPresentation(decision);

  assert.ok(publicCard);
  const serialized = JSON.stringify(publicCard);
  assert.doesNotMatch(serialized, /42.?000.?000|Editorial review|Internal owner/i);
});
