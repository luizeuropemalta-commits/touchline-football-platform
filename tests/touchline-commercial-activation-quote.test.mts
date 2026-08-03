import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTouchlineCommercialActivationIntent,
  validateTouchlineCommercialActivationQuote,
} from "../lib/touchlineArena/commercial-activation-quote.ts";

const quote = {
  quoteId: "quote_england_001",
  competition: "england" as const,
  currency: "GBP" as const,
  maintenanceAmountMinor: 999,
  cardItems: [{ inventoryId: "inventory_001", amountMinor: 1200 }],
  taxAmountMinor: 0,
  totalAmountMinor: 2199,
  expiresAt: "2026-08-03T12:00:00.000Z",
};

test("server quote validates only a consistent England commercial operation", () => {
  assert.equal(validateTouchlineCommercialActivationQuote(quote, "2026-08-02T12:00:00.000Z"), null);
  assert.equal(validateTouchlineCommercialActivationQuote({ ...quote, currency: "EUR" }, "2026-08-02T12:00:00.000Z"), "commercial-operation-out-of-scope");
  assert.equal(validateTouchlineCommercialActivationQuote({ ...quote, totalAmountMinor: 1 }, "2026-08-02T12:00:00.000Z"), "total-mismatch");
});

test("server quote rejects duplicate inventory and expired quote", () => {
  assert.equal(validateTouchlineCommercialActivationQuote({
    ...quote,
    cardItems: [...quote.cardItems, quote.cardItems[0]],
    totalAmountMinor: 3399,
  }, "2026-08-02T12:00:00.000Z"), "duplicate-inventory");
  assert.equal(validateTouchlineCommercialActivationQuote({ ...quote, expiresAt: "2026-08-02T11:59:59.000Z" }, "2026-08-02T12:00:00.000Z"), "invalid-expiry");
});

test("browser intent accepts only quote identity and idempotency, never financial values", () => {
  assert.deepEqual(parseTouchlineCommercialActivationIntent({
    quoteId: "quote_england_001",
    idempotencyKey: "intent-0001",
    totalAmountMinor: 1,
    currency: "USD",
  }), {
    quoteId: "quote_england_001",
    idempotencyKey: "intent-0001",
  });
  assert.equal(parseTouchlineCommercialActivationIntent({ quoteId: "bad", idempotencyKey: "intent-0001" }), null);
});
