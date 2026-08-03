import assert from "node:assert/strict";
import test from "node:test";

import { parseTouchlineMarketCheckoutRequest } from "../lib/touchlineArena/market-checkout-request.ts";

const CARD_ONE = "cb58b289-dbb6-4a2f-8db5-bf3af1cb8d6e";
const CARD_TWO = "b9d84c13-5c7e-44b6-b12d-bb7cb8f11909";

test("accepts normalized inventory ids and a stable idempotency key", () => {
  const result = parseTouchlineMarketCheckoutRequest({
    cardIds: [` ${CARD_ONE.toUpperCase()} `, CARD_TWO],
    idempotencyKey: " market-checkout-001 ",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      cardIds: [CARD_ONE, CARD_TWO],
      idempotencyKey: "market-checkout-001",
    },
  });
});

test("rejects an empty or malformed cart", () => {
  assert.deepEqual(parseTouchlineMarketCheckoutRequest(null), { ok: false, error: "invalid-body" });
  assert.deepEqual(parseTouchlineMarketCheckoutRequest({ cardIds: [], idempotencyKey: "checkout-001" }), { ok: false, error: "empty-cart" });
  assert.deepEqual(parseTouchlineMarketCheckoutRequest({ cardIds: [CARD_ONE, 7], idempotencyKey: "checkout-001" }), { ok: false, error: "empty-cart" });
});

test("rejects duplicate inventory ids before reaching the database", () => {
  assert.deepEqual(parseTouchlineMarketCheckoutRequest({
    cardIds: [CARD_ONE, CARD_ONE.toUpperCase()],
    idempotencyKey: "checkout-duplicate",
  }), { ok: false, error: "duplicate-card" });
});

test("rejects non-inventory ids and weak idempotency keys", () => {
  assert.deepEqual(parseTouchlineMarketCheckoutRequest({
    cardIds: ["demo-haaland"],
    idempotencyKey: "checkout-card",
  }), { ok: false, error: "invalid-card-id" });
  assert.deepEqual(parseTouchlineMarketCheckoutRequest({
    cardIds: [CARD_ONE],
    idempotencyKey: "short",
  }), { ok: false, error: "invalid-idempotency-key" });
});
