import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineFantasyMonthlyPrice,
  resolveTouchlineFantasyStripeConfig,
  touchlineFantasyEntitlementStatus,
} from "../lib/touchlineFantasy/subscription.ts";

const webhookSource = readFileSync(new URL("../app/api/touchline-fantasy/subscription/webhook/route.ts", import.meta.url), "utf8");
const orderingMigration = readFileSync(new URL("../supabase/migrations/20260825182600_touchline_fantasy_subscription_event_ordering.sql", import.meta.url), "utf8");

test("Fantasy billing accepts only its dedicated Stripe test configuration", () => {
  assert.equal(resolveTouchlineFantasyStripeConfig({ TOUCHLINE_STRIPE_MODE: "live" }).ok, false);
  assert.equal(resolveTouchlineFantasyStripeConfig({
    TOUCHLINE_STRIPE_MODE: "test",
    TOUCHLINE_STRIPE_TEST_SECRET_KEY: "sk_live_forbidden",
    TOUCHLINE_STRIPE_TEST_FANTASY_WEBHOOK_SECRET: "whsec_test",
    TOUCHLINE_STRIPE_TEST_FANTASY_MONTHLY_PRICE_ID: "price_test",
  }).ok, false);
  assert.equal(resolveTouchlineFantasyStripeConfig({
    TOUCHLINE_STRIPE_MODE: "test",
    TOUCHLINE_STRIPE_TEST_SECRET_KEY: "sk_test_safe",
    TOUCHLINE_STRIPE_TEST_FANTASY_WEBHOOK_SECRET: "whsec_test",
    TOUCHLINE_STRIPE_TEST_FANTASY_MONTHLY_PRICE_ID: "price_test",
  }).ok, true);
});

test("monthly price and entitlement status fail closed", () => {
  assert.equal(isTouchlineFantasyMonthlyPrice({ active: true, currency: "gbp", unit_amount: 2990, recurring: { interval: "month", interval_count: 1 } }), true);
  assert.equal(isTouchlineFantasyMonthlyPrice({ active: true, currency: "eur", unit_amount: 2990, recurring: { interval: "month", interval_count: 1 } }), false);
  assert.equal(touchlineFantasyEntitlementStatus("active"), "active");
  assert.equal(touchlineFantasyEntitlementStatus("past_due"), "past_due");
  assert.equal(touchlineFantasyEntitlementStatus("canceled"), "canceled");
});

test("subscription entitlement processing is monotonic across reordered events", () => {
  assert.match(webhookSource, /stripe\.subscriptions\.retrieve\(subscriptionId\)/);
  assert.match(webhookSource, /p_provider_event_created_at:\s*new Date\(event\.created \* 1000\)/);
  assert.match(orderingMigration, /last_provider_event_created_at/);
  assert.match(orderingMigration, /p_provider_event_created_at < v_existing_event_created_at/);
  assert.match(orderingMigration, /'stale', true/);
});
