import assert from "node:assert/strict";
import test from "node:test";

import {
  bridgeTouchlineStripeTestLedgerEvent,
} from "../lib/touchlineArena/touchline-stripe-test-ledger-bridge.ts";
import {
  resolveTouchlineStripeTestConfig,
  validateTouchlineStripeTestWebhookEvent,
} from "../lib/stripe/touchline-test-mode.ts";

const validEnvironment = {
  TOUCHLINE_STRIPE_MODE: "test",
  TOUCHLINE_STRIPE_TEST_SECRET_KEY: "sk_test_fixture",
  TOUCHLINE_STRIPE_TEST_WEBHOOK_SECRET: "whsec_fixture",
  TOUCHLINE_STRIPE_TEST_INITIAL_ACTIVATION_PRICE_ID: "price_fixture",
};
const event = (overrides = {}) => ({
  id: "evt_fixture",
  type: "checkout.session.completed",
  livemode: false,
  data: { object: { metadata: { touchlineOperationId: "11111111-1111-4111-8111-111111111111" } } },
  ...overrides,
});

test("TouchLine Stripe adapter accepts only explicitly configured Test Mode credentials", () => {
  assert.equal(resolveTouchlineStripeTestConfig(validEnvironment).ok, true);
  assert.deepEqual(resolveTouchlineStripeTestConfig({ ...validEnvironment, TOUCHLINE_STRIPE_MODE: "live" }), {
    ok: false,
    reason: "mode-not-test",
  });
  assert.deepEqual(resolveTouchlineStripeTestConfig({ ...validEnvironment, TOUCHLINE_STRIPE_TEST_SECRET_KEY: "sk_live_forbidden" }), {
    ok: false,
    reason: "invalid-test-secret",
  });
  assert.deepEqual(resolveTouchlineStripeTestConfig({ ...validEnvironment, TOUCHLINE_STRIPE_TEST_WEBHOOK_SECRET: undefined }), {
    ok: false,
    reason: "missing-webhook-secret",
  });
});

test("test webhook accepts server operation metadata and rejects live, unknown or client price inputs", () => {
  assert.deepEqual(validateTouchlineStripeTestWebhookEvent(event()), {
    ok: true,
    operationId: "11111111-1111-4111-8111-111111111111",
  });
  assert.deepEqual(validateTouchlineStripeTestWebhookEvent(event({ livemode: true })), { ok: false, reason: "live-event-rejected" });
  assert.deepEqual(validateTouchlineStripeTestWebhookEvent(event({ type: "payment_intent.succeeded" })), { ok: false, reason: "unsupported-event" });
  assert.deepEqual(validateTouchlineStripeTestWebhookEvent(event({
    data: { object: { metadata: { touchlineOperationId: "" } } },
  })), { ok: false, reason: "missing-operation-id" });
});

test("the test ledger bridge emits non-monetary observations only", () => {
  assert.deepEqual(bridgeTouchlineStripeTestLedgerEvent({
    stripeEventId: "evt_fixture",
    operationId: "11111111-1111-4111-8111-111111111111",
    stripeEventType: "charge.refunded",
  }), {
    stripeEventId: "evt_fixture",
    operationId: "11111111-1111-4111-8111-111111111111",
    kind: "refund-simulated",
    testOnly: true,
  });
});
