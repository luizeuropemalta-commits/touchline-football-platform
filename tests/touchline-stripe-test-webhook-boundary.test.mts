import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TouchLine Test Mode webhook verifies raw signed input without exposing errors or trusting client commerce fields", async () => {
  const source = await readFile(
    new URL("../app/api/touchline-arena/stripe-test/webhook/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /resolveTouchlineStripeTestConfig/);
  assert.match(source, /request\.headers\.get\("stripe-signature"\)/);
  assert.match(source, /stripe\.webhooks\.constructEvent\(/);
  assert.match(source, /validateTouchlineStripeTestWebhookEvent/);
  assert.match(source, /claim_touchline_stripe_test_webhook_event/);
  assert.doesNotMatch(source, /STRIPE_SECRET_KEY|priceId|productId|totalAmount|currency/i);
  assert.doesNotMatch(source, /error instanceof Error|error\.message/);
});
