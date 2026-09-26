import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { TOUCHLINE_ARENA_MARKET_TIERS, touchlineCardTierName } from "../lib/touchlineArena/card-rules.ts";

test("all seven market-facing tier labels use the shared British English category dictionary", () => {
  assert.equal(TOUCHLINE_ARENA_MARKET_TIERS.length, 7);
  for (const tier of TOUCHLINE_ARENA_MARKET_TIERS) {
    assert.equal(tier.label, touchlineCardTierName(tier.key, "en-GB"), tier.key);
  }
});

test("the audit tier gallery resolves display names rather than rendering internal identifiers", () => {
  const source = readFileSync(new URL("../components/touchline/audit/TouchlineAuditStudio.tsx", import.meta.url), "utf8");
  assert.match(source, /touchlineCardTierName\(tier, language\)/);
  assert.doesNotMatch(source, /tier\.replace\(/);
});
