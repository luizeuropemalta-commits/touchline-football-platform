import assert from "node:assert/strict";
import test from "node:test";

import { resolveTouchlineCardClassification } from "../lib/touchlineArena/card-engine.ts";
import { resolveTouchlineVerifiedPlayerEconomy } from "../lib/touchlineArena/card-rules.ts";

test("an active-season card stays frozen when the approved market value changes", () => {
  const result = resolveTouchlineCardClassification({
    approvedMarketValueEur: 200_000_000,
    effectiveSeason: "2026/27",
    policyVersion: "2026-07-premier-v1",
    existing: { tierKey: "sapphire-blue", nominalPrice: 1, effectiveSeason: "2026/27", policyVersion: "2026-07-premier-v1" },
  });
  assert.deepEqual(result, {
    tierKey: "sapphire-blue", nominalPrice: 1, effectiveSeason: "2026/27", policyVersion: "2026-07-premier-v1", reason: "active-season-frozen", availability: "available",
  });
});

test("a new approved player receives an immediate canonical classification without a live provider call", () => {
  const result = resolveTouchlineCardClassification({ approvedMarketValueEur: 70_000_000, effectiveSeason: "2026/27", policyVersion: "2026-07-premier-v1", isNewPlayer: true });
  assert.equal(result?.tierKey, "diamond-gold");
  assert.equal(result?.nominalPrice, 15);
  assert.equal(result?.reason, "new-player-approved");
});

test("missing values remain pending instead of becoming a free red card", () => {
  assert.equal(resolveTouchlineCardClassification({ approvedMarketValueEur: null, effectiveSeason: "2026/27", policyVersion: "2026-07-premier-v1" }), null);
});

test("the shared economy keeps an approved active-season classification when a verified value later changes", () => {
  const economy = resolveTouchlineVerifiedPlayerEconomy({
    marketValue: "€200M",
    marketValueSource: "verified-cache",
    effectiveSeason: "2026/27",
    existingClassification: {
      tierKey: "sapphire-blue",
      nominalPrice: 1,
      effectiveSeason: "2026/27",
      policyVersion: "2026-07-premier-v1",
    },
  });

  assert.equal(economy.status, "resolved");
  if (economy.status !== "resolved") return;
  assert.equal(economy.tierKey, "sapphire-blue");
  assert.equal(economy.priceTc, 1);
});
