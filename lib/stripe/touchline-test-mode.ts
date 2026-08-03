import Stripe from "stripe";

export type TouchlineStripeTestEnvironment = Readonly<Record<string, string | undefined>>;

export type TouchlineStripeTestConfig = Readonly<{
  secretKey: string;
  webhookSecret: string;
  initialActivationPriceId: string;
}>;

export type TouchlineStripeTestConfigResult =
  | Readonly<{ ok: true; config: TouchlineStripeTestConfig }>
  | Readonly<{
    ok: false;
    reason: "mode-not-test" | "missing-secret" | "invalid-test-secret" | "missing-webhook-secret" | "missing-price-id";
  }>;

/** Test-only boundary. It neither reads generic STRIPE_SECRET_KEY nor permits a live key. */
export function resolveTouchlineStripeTestConfig(
  environment: TouchlineStripeTestEnvironment = process.env,
): TouchlineStripeTestConfigResult {
  if (environment.TOUCHLINE_STRIPE_MODE !== "test") return { ok: false, reason: "mode-not-test" };
  const secretKey = environment.TOUCHLINE_STRIPE_TEST_SECRET_KEY;
  const webhookSecret = environment.TOUCHLINE_STRIPE_TEST_WEBHOOK_SECRET;
  const initialActivationPriceId = environment.TOUCHLINE_STRIPE_TEST_INITIAL_ACTIVATION_PRICE_ID;
  if (!secretKey) return { ok: false, reason: "missing-secret" };
  if (!secretKey.startsWith("sk_test_")) return { ok: false, reason: "invalid-test-secret" };
  if (!webhookSecret || !webhookSecret.startsWith("whsec_")) return { ok: false, reason: "missing-webhook-secret" };
  if (!initialActivationPriceId || !initialActivationPriceId.startsWith("price_")) return { ok: false, reason: "missing-price-id" };
  return { ok: true, config: { secretKey, webhookSecret, initialActivationPriceId } };
}

export function createTouchlineStripeTestClient(config: TouchlineStripeTestConfig) {
  return new Stripe(config.secretKey, { appInfo: { name: "Touchline Test Mode", version: "2.10" } });
}

export type TouchlineStripeTestWebhookEvent = Readonly<{
  id: string;
  type: string;
  livemode: boolean;
  data: { object: { metadata?: Record<string, string> } };
}>;

export type TouchlineStripeTestWebhookValidation =
  | Readonly<{ ok: true; operationId: string }>
  | Readonly<{ ok: false; reason: "live-event-rejected" | "unsupported-event" | "missing-operation-id" }>;

const SUPPORTED_TEST_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

/** Client-supplied totals, currencies, Product IDs and Price IDs are intentionally not read. */
export function validateTouchlineStripeTestWebhookEvent(
  event: TouchlineStripeTestWebhookEvent,
): TouchlineStripeTestWebhookValidation {
  if (event.livemode) return { ok: false, reason: "live-event-rejected" };
  if (!SUPPORTED_TEST_EVENTS.has(event.type)) return { ok: false, reason: "unsupported-event" };
  const operationId = event.data.object.metadata?.touchlineOperationId?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(operationId)) return { ok: false, reason: "missing-operation-id" };
  return { ok: true, operationId };
}
