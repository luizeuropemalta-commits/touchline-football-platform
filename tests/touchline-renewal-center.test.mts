import assert from "node:assert/strict";
import test from "node:test";

import { buildTouchlineRenewalCenterSummary } from "../lib/touchlineArena/renewal-center.ts";

const readyQuote = {
  status: "READY" as const,
  createdAt: "2027-08-03T12:00:00.000Z",
  expiresAt: "2027-08-08T00:00:00.000Z",
  historical: {
    contractId: "old-9",
    playerId: "player-9",
    seasonId: "2026-27",
    marketValueEur: 48_000_000,
    tierKey: "emerald-green" as const,
    pricePaidTc: 7,
    priceTableVersion: "2026-07-premier-v1",
  },
  offer: {
    nextSeasonId: "2027-28",
    nextSeasonStartsAt: "2027-08-08T00:00:00.000Z",
    nextSeasonEndsAt: "2028-05-31T00:00:00.000Z",
    marketValueEur: 52_000_000,
    tier: {
      id: "clear-diamond" as const,
      borderName: "Clear Diamond",
      minMarketValue: 50_000_000,
      maxMarketValue: 69_999_999,
      touchCreditPrice: 10,
      isFree: false,
    },
    priceTc: 10,
    marketValueSource: "provider" as const,
    tierDelta: 1,
    priceDeltaTc: 3,
  },
  reason: null,
};

const items = [
  {
    quoteId: "quote-9",
    sourceContractId: "old-9",
    playerId: "player-9",
    position: "CF",
    lifecycleState: "RENEWAL_AVAILABLE" as const,
    quote: readyQuote,
  },
  {
    quoteId: "quote-10",
    sourceContractId: "old-10",
    playerId: "player-10",
    position: "CB",
    lifecycleState: "NOT_ELIGIBLE" as const,
    quote: { ...readyQuote, status: "NOT_ELIGIBLE" as const, offer: null, reason: "Left league." },
  },
];

test("Renewal Center summary totals only server-ready, non-expired quotes", () => {
  const summary = buildTouchlineRenewalCenterSummary({
    items,
    selectedQuoteIds: ["quote-9"],
    serverWalletBalanceTc: 12,
    now: "2027-08-04T12:00:00.000Z",
  });

  assert.equal(summary.totalContracts, 2);
  assert.equal(summary.waitingContracts, 1);
  assert.equal(summary.notEligibleContracts, 1);
  assert.equal(summary.selectedTotalTc, 10);
  assert.equal(summary.walletAfterTc, 2);
  assert.deepEqual(summary.selectedByPosition, { CF: 1 });
  assert.equal(summary.canContinue, true);
  assert.equal(summary.selectionError, null);
});

test("Renewal Center refuses non-ready, expired, duplicate and underfunded selections before checkout", () => {
  const base = {
    items,
    now: "2027-08-04T12:00:00.000Z",
  };
  assert.equal(buildTouchlineRenewalCenterSummary({
    ...base,
    selectedQuoteIds: ["quote-10"],
    serverWalletBalanceTc: 99,
  }).selectionError, "quote-not-ready");
  assert.equal(buildTouchlineRenewalCenterSummary({
    ...base,
    selectedQuoteIds: ["quote-9", "quote-9"],
    serverWalletBalanceTc: 99,
  }).selectionError, "duplicate-selection");
  assert.equal(buildTouchlineRenewalCenterSummary({
    ...base,
    selectedQuoteIds: ["quote-9"],
    serverWalletBalanceTc: 9,
  }).selectionError, "insufficient-balance");
  assert.equal(buildTouchlineRenewalCenterSummary({
    ...base,
    now: "2027-08-08T00:00:00.000Z",
    selectedQuoteIds: ["quote-9"],
    serverWalletBalanceTc: 99,
  }).selectionError, "quote-expired");
});
