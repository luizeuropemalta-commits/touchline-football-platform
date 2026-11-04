import type Stripe from "stripe";
import { clubSeasonTestPayment, type ClubSeasonTestOrder } from "./club-season-test-catalogue.ts";
import { clubSeasonChargeMinor, isClubSeasonPaidPlan, sameClubSeasonOrderPayment, validClubSeasonPaymentOrder, type ClubSeasonOrderPayment } from "./club-season-payment-contract.ts";

/** These fields must be persisted by the server before contacting Stripe.
 * Retries must reuse the same order and timestamps, not create another order. */
export type ClubSeasonCheckoutOrder = Omit<ClubSeasonTestOrder, "sessionId"> & {
  createdAt: string; checkoutExpiresAt: string;
  /** Server-persisted before the first provider call, never browser input. */
  firstAttemptAt?: string;
  /** Present on generic orders; absent only for historical TEST callers. */
  payment?: ClubSeasonOrderPayment;
};

export function buildClubSeasonPaymentCheckoutRequest(order: ClubSeasonCheckoutOrder & { payment: ClubSeasonOrderPayment }, now = Date.now()): {
  params: Stripe.Checkout.SessionCreateParams; idempotencyKey: string;
} {
  if (!validClubSeasonPaymentOrder({ ...order, sessionId: `cs_${order.payment.mode}_pending` }, now)) {
    throw new Error("INVALID_SEASON_ORDER");
  }
  const created = Date.parse(order.createdAt), expires = Date.parse(order.checkoutExpiresAt);
  const attempt = order.firstAttemptAt === undefined ? now : Date.parse(order.firstAttemptAt);
  // Stripe requires at least 30 minutes. Stop new checkout before season end;
  // never extend the contract or change persisted retry parameters to fit it.
  // An already attempted request replays its original idempotency key even in
  // the last 30 minutes; Stripe either recovers it or rejects a new creation.
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now
    || !Number.isFinite(attempt) || attempt < created || attempt > now || expires <= now
    || expires - attempt < 30 * 60_000 || expires - created > 24 * 60 * 60_000
    || expires > Date.parse(order.seasonEndsAt) || expires % 1000 !== 0) {
    throw new Error("INVALID_CHECKOUT_WINDOW");
  }
  const metadata = { touchlineOrderId: order.id, touchlineSeasonId: order.seasonId, touchlinePlan: order.plan,
    ...(order.previousPaidPlan === undefined ? {} : { touchlinePreviousPaidPlan: order.previousPaidPlan }),
    ...(order.payment.mode === "test" ? {} : { touchlinePaymentMode: "live", touchlinePaymentAccountId: order.payment.accountId, touchlinePaymentProfileId: order.payment.profileId,
      touchlineCatalogueVersion: order.payment.catalogueVersion }) };
  return {
    idempotencyKey: order.payment.mode === "test" ? `club-season-test:${order.id}`
      : `club-season-live:${order.payment.accountId}:${order.id}`,
    params: {
      mode: "payment", payment_method_types: ["card"],
      line_items: [order.previousPaidPlan === undefined
        ? { price: order.payment.priceId, quantity: 1 }
        : { price_data: { currency: "eur", product: order.payment.productId,
          unit_amount: clubSeasonChargeMinor(order) }, quantity: 1 }],
      client_reference_id: order.userId, metadata,
      payment_intent_data: { metadata },
      expires_at: expires / 1000,
      allow_promotion_codes: false, automatic_tax: { enabled: false },
      adaptive_pricing: { enabled: false },
      success_url: `${order.payment.returnOrigin}/clubowner?checkout=processing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${order.payment.returnOrigin}/clubowner?checkout=cancelled`,
    },
  };
}

/** Stable TEST entrypoint, including original metadata, URLs and retry key. */
export function buildClubSeasonCheckoutRequest(order: ClubSeasonCheckoutOrder, now = Date.now()) {
  if (!isClubSeasonPaidPlan(order.plan) || (order.payment && !sameClubSeasonOrderPayment(order.payment, clubSeasonTestPayment(order.plan)))) throw new Error("INVALID_SEASON_ORDER");
  return buildClubSeasonPaymentCheckoutRequest({ ...order, payment: clubSeasonTestPayment(order.plan) }, now);
}
