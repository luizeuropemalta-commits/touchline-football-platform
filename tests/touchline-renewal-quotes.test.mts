import assert from "node:assert/strict";
import test from "node:test";

import { createTouchlineRenewalQuote } from "../lib/touchlineArena/renewal-quotes.ts";

const lifecycleSchedule = {
  competitionEndsAt: "2027-05-31T20:00:00.000Z",
  dataValidationEndsAt: "2027-06-02T20:00:00.000Z",
  renewalWindowOpensAt: "2027-08-01T00:00:00.000Z",
  nextSeasonStartsAt: "2027-08-08T00:00:00.000Z",
};

const input = {
  now: "2027-08-03T12:00:00.000Z",
  lifecycleSchedule,
  historicalContract: {
    contractId: "contract-2026-27-player-9",
    playerId: "player-9",
    closingSeasonId: "season-2026-27",
    lifecycleState: "RENEWAL_AVAILABLE" as const,
    marketValueAtPurchaseEur: 48_000_000,
    tierAtPurchase: "emerald-green" as const,
    pricePaidTc: 7,
    priceTableVersion: "2026-07-premier-v1",
  },
  nextSeason: {
    id: "season-2027-28",
    startsAt: "2027-08-08T00:00:00.000Z",
    endsAt: "2028-05-31T00:00:00.000Z",
    playerIsEligible: true,
    verifiedMarketValue: 52_000_000,
    marketValueSource: "provider" as const,
  },
};

test("renewal quote uses the next-season official value while preserving the historical purchase snapshot", () => {
  const quote = createTouchlineRenewalQuote(input);

  assert.equal(quote.status, "READY");
  assert.equal(quote.expiresAt, lifecycleSchedule.nextSeasonStartsAt);
  assert.deepEqual(quote.historical, {
    contractId: "contract-2026-27-player-9",
    playerId: "player-9",
    seasonId: "season-2026-27",
    marketValueEur: 48_000_000,
    tierKey: "emerald-green",
    pricePaidTc: 7,
    priceTableVersion: "2026-07-premier-v1",
  });
  assert.equal(quote.offer?.marketValueEur, 52_000_000);
  assert.equal(quote.offer?.tier.id, "clear-diamond");
  assert.equal(quote.offer?.priceTc, 10);
  assert.equal(quote.offer?.tierDelta, 1);
  assert.equal(quote.offer?.priceDeltaTc, 3);
});

test("renewal quote refuses an unverified or missing next-season market value instead of manufacturing a free price", () => {
  const quote = createTouchlineRenewalQuote({
    ...input,
    nextSeason: {
      ...input.nextSeason,
      verifiedMarketValue: null,
      marketValueSource: "unavailable",
    },
  });

  assert.equal(quote.status, "MARKET_VALUE_PENDING");
  assert.equal(quote.offer, null);
  assert.equal(quote.expiresAt, null);
});

test("ineligible players retain history but cannot receive a next-season quote", () => {
  const quote = createTouchlineRenewalQuote({
    ...input,
    nextSeason: {
      ...input.nextSeason,
      playerIsEligible: false,
      ineligibilityReason: "Transferred outside the competition.",
    },
  });

  assert.equal(quote.status, "NOT_ELIGIBLE");
  assert.equal(quote.offer, null);
  assert.equal(quote.reason, "Transferred outside the competition.");
});

test("renewal quotes cannot open before the server-owned renewal window", () => {
  const quote = createTouchlineRenewalQuote({
    ...input,
    now: "2027-07-15T12:00:00.000Z",
  });

  assert.equal(quote.status, "OUTSIDE_RENEWAL_WINDOW");
  assert.equal(quote.offer, null);
});

test("renewal quote requires an active renewal lifecycle state", () => {
  const quote = createTouchlineRenewalQuote({
    ...input,
    historicalContract: {
      ...input.historicalContract,
      lifecycleState: "SEASON_FINISHED",
    },
  });

  assert.equal(quote.status, "OUTSIDE_RENEWAL_WINDOW");
  assert.equal(quote.offer, null);
});
