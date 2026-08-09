import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { quoteTouchlineMarketCart } from "../lib/touchlineArena/market-cart.ts";
import {
  resolveTouchlineMarketContractReadiness,
  type TouchlineMarketContractReadinessInput,
} from "../lib/touchlineArena/market-contract-readiness.ts";
import { PLAYER_MARKET_TIERS } from "../lib/touchlineArena/player-market-tiers.ts";

const VERIFIED_AT = "2026-08-07T21:19:00.000Z";

function verifiedInput(overrides: Partial<TouchlineMarketContractReadinessInput> = {}) {
  return {
    marketValueState: "verified",
    classificationState: "verified",
    marketValueEur: 15_000_000,
    marketValueUpdatedAt: VERIFIED_AT,
    canonicalTierKey: "amethyst-purple",
    inventoryId: "inventory-authoritative",
    inventoryTierKey: "amethyst-purple",
    transactionPriceTc: 0,
    transactionPriceTableVersion: "2026-27-england-founder-free-v1",
    ...overrides,
  } satisfies TouchlineMarketContractReadinessInput;
}

test("keeps a verified €15M player contract-ready when an authoritative Founder price is 0 TC", () => {
  const readiness = resolveTouchlineMarketContractReadiness(verifiedInput());

  assert.deepEqual(readiness, {
    status: "contract-ready",
    nominalTierKey: "amethyst-purple",
    nominalPriceTc: 2,
    transactionPriceTc: 0,
    transactionPriceTableVersion: "2026-27-england-founder-free-v1",
  });

  if (readiness.status !== "contract-ready") return;
  const cart = quoteTouchlineMarketCart({
    candidates: [{
      id: "inventory-authoritative",
      cardTier: readiness.nominalTierKey,
      authoritativeUnitPriceTc: readiness.transactionPriceTc,
      authoritativePriceTableVersion: readiness.transactionPriceTableVersion,
      availableCopies: 1,
    }],
    walletBalanceTc: 0,
    openContractSlots: 1,
  });
  assert.equal(cart.valid, true);
  assert.equal(cart.totalTc, 0);
  assert.equal(cart.items[0]?.cardTier, "amethyst-purple");
});

test("resolves every approved tier from verified canonical value while preserving an independent transaction price", () => {
  for (const tier of PLAYER_MARKET_TIERS) {
    const readiness = resolveTouchlineMarketContractReadiness(verifiedInput({
      marketValueEur: tier.minMarketValue,
      canonicalTierKey: tier.id,
      inventoryTierKey: tier.id,
      transactionPriceTc: 0,
    }));

    assert.equal(readiness.status, "contract-ready", tier.id);
    if (readiness.status !== "contract-ready") continue;
    assert.equal(readiness.nominalTierKey, tier.id);
    assert.equal(readiness.nominalPriceTc, tier.touchCreditPrice);
    assert.equal(readiness.transactionPriceTc, 0);
  }
});

test("marks only unverified canonical values pending and fails closed for unavailable or inconsistent inventory", () => {
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ marketValueState: "pending" })),
    { status: "pending-value", reason: "market-value-pending" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ classificationState: "pending" })),
    { status: "pending-value", reason: "classification-pending" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ marketValueState: "unavailable" })),
    { status: "unavailable-value", reason: "market-value-unavailable" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ classificationState: "error" })),
    { status: "unavailable-value", reason: "classification-error" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ inventoryId: null })),
    { status: "blocked", reason: "inventory-missing" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ inventoryTierKey: "ruby-red" })),
    { status: "blocked", reason: "inventory-tier-mismatch" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ transactionPriceTc: -1 })),
    { status: "blocked", reason: "inventory-price-invalid" },
  );
  assert.deepEqual(
    resolveTouchlineMarketContractReadiness(verifiedInput({ transactionPriceTableVersion: " " })),
    { status: "blocked", reason: "inventory-price-table-invalid" },
  );
});

test("keeps a 589-player batch name-free: verified rows are selectable and only missing canonical values are pending", () => {
  const verifiedRows = Array.from({ length: 29 }, (_, index) => {
    const tier = PLAYER_MARKET_TIERS[index % PLAYER_MARKET_TIERS.length]!;
    return resolveTouchlineMarketContractReadiness(verifiedInput({
      marketValueEur: tier.minMarketValue,
      canonicalTierKey: tier.id,
      inventoryTierKey: tier.id,
      transactionPriceTc: 0,
    }));
  });
  const pendingRows = Array.from({ length: 560 }, () => resolveTouchlineMarketContractReadiness({
    marketValueState: "pending",
    classificationState: "pending",
  }));
  const batch = [...verifiedRows, ...pendingRows];

  assert.equal(batch.length, 589);
  assert.equal(batch.filter((row) => row.status === "contract-ready").length, 29);
  assert.equal(batch.filter((row) => row.status === "pending-value").length, 560);
  assert.equal(batch.filter((row) => row.status === "blocked").length, 0);
  assert.equal(batch.filter((row) => row.status === "unavailable-value").length, 0);
});

test("Arena preserves canonical tier and inventory transaction table as separate authorities", () => {
  const source = readFileSync(
    new URL("../app/arena/ArenaClient.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /resolveTouchlineMarketContractReadiness\(/);
  assert.match(source, /marketValueState\?:\s*TouchlinePublicProjectionStatus/);
  assert.match(source, /classificationState\?:\s*TouchlinePublicProjectionStatus/);
  assert.match(source, /inventoryTierKey:\s*inventory\.tierKey/);
  assert.match(source, /inventoryPriceTableVersion:\s*inventory\.priceTableVersion/);
  assert.doesNotMatch(source, /cardTier:\s*inventory\.tierKey/);
  assert.doesNotMatch(source, /cardPriceVersion:\s*inventory\.priceTableVersion/);
  assert.match(source, /authoritativePriceTableVersion:\s*player\.inventoryId\s*\?\s*player\.inventoryPriceTableVersion/);
  assert.doesNotMatch(source, /inventoryPriceTc\s*===\s*authoritativeTier\.tier\.touchCreditPrice/);
  assert.match(source, /builderPlayerNominalPriceLabel\(/);
  assert.match(source, /builderPlayerTransactionPriceLabel\(/);
});
