import assert from "node:assert/strict";
import test from "node:test";

import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { quoteTouchlineMarketCart } from "../lib/touchlineArena/market-cart.ts";

test("quotes a preseason squad batch with one authoritative TC total", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [
      { id: "haaland", cardTier: "diamond-gold", availableCopies: 999 },
      { id: "saka", cardTier: "clear-diamond", availableCopies: 999 },
      { id: "palmer", cardTier: "emerald-green", availableCopies: 999 },
    ],
    walletBalanceTc: 60,
    openContractSlots: 3,
  });

  assert.equal(quote.valid, true);
  assert.equal(quote.itemCount, 3);
  assert.equal(quote.totalTc, 32);
  assert.equal(quote.balanceAfterTc, 28);
  assert.equal(quote.openSlotsAfter, 0);
  assert.equal(quote.priceTableVersion, TOUCHLINE_CARD_PRICE_TABLE_VERSION);
  assert.deepEqual(quote.items.map((item) => item.cardTier), ["diamond-gold", "clear-diamond", "emerald-green"]);
});

test("rejects duplicate cards in one checkout", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [
      { id: "haaland", availableCopies: 999 },
      { id: "haaland", availableCopies: 999 },
    ],
    walletBalanceTc: 60,
    openContractSlots: 3,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "duplicate-card");
});

test("rejects cards already owned by the ClubOwner", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{ id: "haaland", alreadyOwned: true, availableCopies: 999 }],
    walletBalanceTc: 60,
    openContractSlots: 3,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "already-owned");
});

test("rejects sold-out cards", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{ id: "haaland", availableCopies: 0 }],
    walletBalanceTc: 60,
    openContractSlots: 3,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "sold-out");
});

test("rejects a cart larger than the open squad capacity", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [
      { id: "haaland", availableCopies: 999 },
      { id: "saka", availableCopies: 999 },
    ],
    walletBalanceTc: 60,
    openContractSlots: 1,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "roster-capacity");
});

test("rejects checkout when TC balance is insufficient", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{ id: "haaland", cardTier: "diamond-gold", availableCopies: 999 }],
    walletBalanceTc: 14,
    openContractSlots: 3,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "insufficient-balance");
});

test("uses the authoritative inventory price when the database supplies it", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{
      id: "123e4567-e89b-42d3-a456-426614174000",
      cardTier: "diamond-gold",
      authoritativeUnitPriceTc: 50,
      authoritativePriceTableVersion: "inventory-v1",
      availableCopies: 999,
    }],
    walletBalanceTc: 60,
    openContractSlots: 3,
  });

  assert.equal(quote.valid, true);
  assert.equal(quote.totalTc, 50);
  assert.equal(quote.balanceAfterTc, 10);
  assert.equal(quote.items[0].cardTier, "diamond-gold");
  assert.equal(quote.items[0].priceTableVersion, "inventory-v1");
  assert.equal(quote.priceTableVersion, "inventory-v1");
  assert.deepEqual(quote.priceTableVersions, ["inventory-v1"]);
});

test("contracts an authoritative FREE card without spending wallet balance", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{
      id: "123e4567-e89b-42d3-a456-426614174000",
      cardTier: "ruby-red",
      authoritativeUnitPriceTc: 0,
      authoritativePriceTableVersion: "2026-07-premier-v1",
      availableCopies: 1000,
    }],
    walletBalanceTc: 0,
    openContractSlots: 1,
  });

  assert.equal(quote.valid, true);
  assert.equal(quote.totalTc, 0);
  assert.equal(quote.balanceBeforeTc, 0);
  assert.equal(quote.balanceAfterTc, 0);
  assert.equal(quote.items[0].unitPriceTc, 0);
  assert.equal(quote.items[0].priceTableVersion, "2026-07-premier-v1");
});

test("rejects a malformed negative authoritative price instead of treating it as FREE", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{
      id: "123e4567-e89b-42d3-a456-426614174000",
      cardTier: "ruby-red",
      authoritativeUnitPriceTc: -1,
      authoritativePriceTableVersion: "2026-07-premier-v1",
      availableCopies: 1000,
    }],
    walletBalanceTc: 60,
    openContractSlots: 1,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "invalid-price");
});

test("reports every authoritative price-table version in a mixed cart", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        cardTier: "ruby-red",
        authoritativeUnitPriceTc: 0,
        authoritativePriceTableVersion: "2026-07-premier-v1",
        availableCopies: 1000,
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174001",
        cardTier: "sapphire-blue",
        authoritativeUnitPriceTc: 2,
        authoritativePriceTableVersion: "legacy-v1",
        availableCopies: 1000,
      },
    ],
    walletBalanceTc: 60,
    openContractSlots: 2,
  });

  assert.equal(quote.valid, true);
  assert.equal(quote.priceTableVersion, "mixed");
  assert.deepEqual(quote.priceTableVersions, ["2026-07-premier-v1", "legacy-v1"]);
});

test("rejects an authoritative price without its immutable table version", () => {
  const quote = quoteTouchlineMarketCart({
    candidates: [{
      id: "123e4567-e89b-42d3-a456-426614174000",
      cardTier: "ruby-red",
      authoritativeUnitPriceTc: 0,
      availableCopies: 1000,
    }],
    walletBalanceTc: 60,
    openContractSlots: 1,
  });

  assert.equal(quote.valid, false);
  assert.equal(quote.errorCode, "invalid-price");
});
