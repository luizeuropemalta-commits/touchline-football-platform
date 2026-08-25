import type Stripe from "stripe";

export type TouchlineFantasyStripeConfig = Readonly<{
  secretKey: string;
  webhookSecret: string;
  monthlyPriceId: string;
}>;

export function resolveTouchlineFantasyStripeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): { ok: true; config: TouchlineFantasyStripeConfig } | { ok: false; reason: string } {
  if (environment.TOUCHLINE_STRIPE_MODE !== "test") return { ok: false, reason: "mode-not-test" };
  const secretKey = environment.TOUCHLINE_STRIPE_TEST_SECRET_KEY;
  const webhookSecret = environment.TOUCHLINE_STRIPE_TEST_FANTASY_WEBHOOK_SECRET;
  const monthlyPriceId = environment.TOUCHLINE_STRIPE_TEST_FANTASY_MONTHLY_PRICE_ID;
  if (!secretKey?.startsWith("sk_test_")) return { ok: false, reason: "invalid-test-secret" };
  if (!webhookSecret?.startsWith("whsec_")) return { ok: false, reason: "missing-webhook-secret" };
  if (!monthlyPriceId?.startsWith("price_")) return { ok: false, reason: "missing-price-id" };
  return { ok: true, config: { secretKey, webhookSecret, monthlyPriceId } };
}

export async function createTouchlineFantasyStripeClient(config: TouchlineFantasyStripeConfig) {
  const { default: StripeClient } = await import("stripe");
  return new StripeClient(config.secretKey, { appInfo: { name: "TouchLine Fantasy QA", version: "1.0" } });
}

export function isTouchlineFantasyMonthlyPrice(price: Pick<Stripe.Price, "active" | "currency" | "unit_amount" | "recurring">) {
  return price.active === true
    && price.currency.toLowerCase() === "gbp"
    && price.unit_amount === 2_990
    && price.recurring?.interval === "month"
    && price.recurring.interval_count === 1;
}

export function touchlineFantasyEntitlementStatus(status: Stripe.Subscription.Status) {
  if (status === "active" || status === "trialing") return "active" as const;
  if (status === "past_due" || status === "unpaid" || status === "paused") return "past_due" as const;
  if (status === "canceled") return "canceled" as const;
  return "inactive" as const;
}
