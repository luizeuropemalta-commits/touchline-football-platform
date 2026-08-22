import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PLAYER_MARKET_TIERS,
  resolvePlayerMarketTier,
  resolvePlayerMarketTierChange,
} from "../lib/touchlineArena/player-market-tiers.ts";
import {
  parseMarketValueEurOrNull,
  resolveTouchlineVerifiedPlayerEconomy,
  touchlineCardTierName,
} from "../lib/touchlineArena/card-rules.ts";

const productionEconomicSurfaces = [
  "../components/touchline/cards/TouchlineEliteExactCard.tsx",
  "../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
  "../app/touchline-player-card-rankings/page.tsx",
  "../app/touchline-players/[player]/page.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

const APPROVED_BOUNDARIES = [
  [0, "ruby-red", 0, true],
  [5_999_999, "ruby-red", 0, true],
  [6_000_000, "sapphire-blue", 1, false],
  [9_999_999, "sapphire-blue", 1, false],
  [10_000_000, "amethyst-purple", 2, false],
  [19_999_999, "amethyst-purple", 2, false],
  [20_000_000, "radiant-gold", 4, false],
  [34_999_999, "radiant-gold", 4, false],
  [35_000_000, "emerald-green", 7, false],
  [49_999_999, "emerald-green", 7, false],
  [50_000_000, "clear-diamond", 10, false],
  [69_999_999, "clear-diamond", 10, false],
  [70_000_000, "diamond-gold", 15, false],
  [100_000_000, "diamond-gold", 15, false],
  [250_000_000, "diamond-gold", 15, false],
] as const;

test("resolves all 15 approved Premier League market-value boundaries", () => {
  for (const [marketValueEur, tierId, touchCreditPrice, isFree] of APPROVED_BOUNDARIES) {
    const resolution = resolvePlayerMarketTier(marketValueEur);

    assert.equal(resolution.status, "resolved", `expected €${marketValueEur} to resolve`);
    if (resolution.status !== "resolved") continue;

    assert.equal(resolution.marketValueEur, marketValueEur);
    assert.equal(resolution.tier.id, tierId);
    assert.equal(resolution.tier.touchCreditPrice, touchCreditPrice);
    assert.equal(resolution.tier.isFree, isFree);
  }
});

test("the central configuration has seven contiguous, non-overlapping bands", () => {
  assert.equal(PLAYER_MARKET_TIERS.length, 7);
  assert.equal(PLAYER_MARKET_TIERS[0].minMarketValue, 0);
  assert.equal(PLAYER_MARKET_TIERS.at(-1)?.maxMarketValue, null);

  for (let index = 1; index < PLAYER_MARKET_TIERS.length; index += 1) {
    const previous = PLAYER_MARKET_TIERS[index - 1];
    const current = PLAYER_MARKET_TIERS[index];

    assert.notEqual(previous.maxMarketValue, null);
    assert.equal(current.minMarketValue, (previous.maxMarketValue ?? -1) + 1);
  }

  for (const tier of PLAYER_MARKET_TIERS) {
    assert.equal(tier.borderName, touchlineCardTierName(tier.id, "en"));
  }
});

test("admin dates use the selected locale and British English has no host-locale fallback", () => {
  const adminHistorySource = readFileSync(new URL("../components/admin-manual-card-editorial-actions.tsx", import.meta.url), "utf8");
  const footballDataSource = readFileSync(new URL("../app/(app)/admin/football-data/page.tsx", import.meta.url), "utf8");

  assert.match(adminHistorySource, /toLocaleString\(locale\)/);
  assert.doesNotMatch(adminHistorySource, /toLocaleString\(\)/);
  assert.match(footballDataSource, /function formatDate\(value: string \| null \| undefined, locale: "en-GB" \| "pt-BR"\)/);
  assert.match(footballDataSource, /Intl\.DateTimeFormat\(locale,/);
  assert.equal((footballDataSource.match(/formatDate\([^\n]+, locale\)/g) ?? []).length, 4);
});

test("keeps missing, non-finite and negative values unavailable while accepting real zero", () => {
  assert.deepEqual(resolvePlayerMarketTier(null), {
    status: "unavailable",
    marketValueEur: null,
    reason: "missing-market-value",
  });
  assert.deepEqual(resolvePlayerMarketTier(undefined), {
    status: "unavailable",
    marketValueEur: null,
    reason: "missing-market-value",
  });
  assert.deepEqual(resolvePlayerMarketTier(Number.NaN), {
    status: "unavailable",
    marketValueEur: null,
    reason: "non-finite-market-value",
  });
  assert.deepEqual(resolvePlayerMarketTier(Number.POSITIVE_INFINITY), {
    status: "unavailable",
    marketValueEur: null,
    reason: "non-finite-market-value",
  });
  assert.deepEqual(resolvePlayerMarketTier(Number.NEGATIVE_INFINITY), {
    status: "unavailable",
    marketValueEur: null,
    reason: "non-finite-market-value",
  });
  assert.deepEqual(resolvePlayerMarketTier(-1), {
    status: "unavailable",
    marketValueEur: null,
    reason: "negative-market-value",
  });

  const zero = resolvePlayerMarketTier(0);
  assert.equal(zero.status, "resolved");
  if (zero.status === "resolved") {
    assert.equal(zero.tier.id, "ruby-red");
    assert.equal(zero.tier.touchCreditPrice, 0);
    assert.equal(zero.tier.isFree, true);
  }
});

test("classifies decimal provider values at integer boundaries without gaps", () => {
  const ruby = resolvePlayerMarketTier(5_999_999.99);
  const sapphire = resolvePlayerMarketTier(9_999_999.99);
  const amethyst = resolvePlayerMarketTier(19_999_999.99);
  const radiant = resolvePlayerMarketTier(34_999_999.99);
  const emerald = resolvePlayerMarketTier(49_999_999.99);
  const clear = resolvePlayerMarketTier(69_999_999.99);

  assert.equal(ruby.status === "resolved" ? ruby.tier.id : null, "ruby-red");
  assert.equal(sapphire.status === "resolved" ? sapphire.tier.id : null, "sapphire-blue");
  assert.equal(amethyst.status === "resolved" ? amethyst.tier.id : null, "amethyst-purple");
  assert.equal(radiant.status === "resolved" ? radiant.tier.id : null, "radiant-gold");
  assert.equal(emerald.status === "resolved" ? emerald.tier.id : null, "emerald-green");
  assert.equal(clear.status === "resolved" ? clear.tier.id : null, "clear-diamond");
});

test("reports an upward tier change with the new price delta", () => {
  const change = resolvePlayerMarketTierChange(48_000_000, 52_000_000);

  assert.equal(change.movement, "up");
  assert.equal(change.tierChanged, true);
  assert.equal(change.marketValueChangeEur, 4_000_000);
  assert.equal(change.touchCreditPriceChange, 3);
  assert.equal(change.previous.status, "resolved");
  assert.equal(change.current.status, "resolved");
  if (change.previous.status === "resolved" && change.current.status === "resolved") {
    assert.equal(change.previous.tier.id, "emerald-green");
    assert.equal(change.current.tier.id, "clear-diamond");
  }
});

test("reports a downward tier change with the new price delta", () => {
  const change = resolvePlayerMarketTierChange(75_000_000, 65_000_000);

  assert.equal(change.movement, "down");
  assert.equal(change.tierChanged, true);
  assert.equal(change.marketValueChangeEur, -10_000_000);
  assert.equal(change.touchCreditPriceChange, -5);
  assert.equal(change.previous.status, "resolved");
  assert.equal(change.current.status, "resolved");
  if (change.previous.status === "resolved" && change.current.status === "resolved") {
    assert.equal(change.previous.tier.id, "diamond-gold");
    assert.equal(change.current.tier.id, "clear-diamond");
  }
});

test("reports same tier while retaining the real market-value change", () => {
  const change = resolvePlayerMarketTierChange(51_000_000, 65_000_000);

  assert.equal(change.movement, "same");
  assert.equal(change.tierChanged, false);
  assert.equal(change.marketValueChangeEur, 14_000_000);
  assert.equal(change.touchCreditPriceChange, 0);
});

test("does not manufacture a tier movement from unavailable data", () => {
  const change = resolvePlayerMarketTierChange(null, 70_000_000);

  assert.equal(change.movement, "unavailable");
  assert.equal(change.tierChanged, false);
  assert.equal(change.marketValueChangeEur, null);
  assert.equal(change.touchCreditPriceChange, null);
  assert.equal(change.previous.status, "unavailable");
  assert.equal(change.current.status, "resolved");
});

test("production card surfaces never use sporting ranking as economic tier or price", () => {
  for (const source of productionEconomicSurfaces) {
    assert.doesNotMatch(source, /(?:competition|liveCompetition)\.(?:tierKey|priceTc)/);
  }
});

test("verified economy accepts real zero but rejects missing and untrusted values", () => {
  assert.equal(parseMarketValueEurOrNull(0), 0);
  assert.equal(parseMarketValueEurOrNull("€0"), 0);
  assert.equal(parseMarketValueEurOrNull("Pending"), null);

  assert.deepEqual(resolveTouchlineVerifiedPlayerEconomy({
    marketValue: "Pending",
    marketValueSource: "unavailable",
  }), {
    status: "unavailable",
    marketValueEur: null,
    tier: null,
    tierKey: null,
    priceTc: null,
  });
  assert.equal(resolveTouchlineVerifiedPlayerEconomy({
    marketValue: "€70M",
    marketValueSource: "unavailable",
  }).status, "unavailable");

  assert.deepEqual(resolveTouchlineVerifiedPlayerEconomy({
    marketValue: 0,
    marketValueSource: "provider",
  }), {
    status: "resolved",
    marketValueEur: 0,
    tier: PLAYER_MARKET_TIERS[0],
    tierKey: "ruby-red",
    priceTc: 0,
  });
  assert.deepEqual(resolveTouchlineVerifiedPlayerEconomy({
    marketValue: "€52M",
    marketValueSource: "verified-cache",
  }), {
    status: "resolved",
    marketValueEur: 52_000_000,
    tier: PLAYER_MARKET_TIERS[5],
    tierKey: "clear-diamond",
    priceTc: 10,
  });
});
