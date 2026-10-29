import type Stripe from "stripe";
import { CLUB_SEASON_TEST_CATALOGUE, clubSeasonChargeMinor, validClubSeasonTestOrder, type ClubSeasonTestOrder } from "./club-season-test-catalogue.ts";

const QA_ORIGIN = "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
/** These fields must be persisted by the server before contacting Stripe.
 * Retries must reuse the same order and timestamps, not create another order. */
export type ClubSeasonCheckoutOrder = Omit<ClubSeasonTestOrder, "sessionId"> & {
  createdAt: string; checkoutExpiresAt: string;
  /** Server-persisted before the first provider call, never browser input. */
  firstAttemptAt?: string;
};

export function buildClubSeasonCheckoutRequest(order: ClubSeasonCheckoutOrder, now = Date.now()): {
  params: Stripe.Checkout.SessionCreateParams; idempotencyKey: string;
} {
  if (!validClubSeasonTestOrder({ ...order, sessionId: "cs_test_pending" }, now)) {
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
    ...(order.previousPaidPlan === undefined ? {} : { touchlinePreviousPaidPlan: order.previousPaidPlan }) };
  return {
    idempotencyKey: `club-season-test:${order.id}`,
    params: {
      mode: "payment", payment_method_types: ["card"],
      line_items: [order.previousPaidPlan === undefined
        ? { price: CLUB_SEASON_TEST_CATALOGUE[order.plan].priceId, quantity: 1 }
        : { price_data: { currency: "eur", product: CLUB_SEASON_TEST_CATALOGUE[order.plan].productId,
          unit_amount: clubSeasonChargeMinor(order) }, quantity: 1 }],
      client_reference_id: order.userId, metadata,
      payment_intent_data: { metadata },
      expires_at: expires / 1000,
      allow_promotion_codes: false, automatic_tax: { enabled: false },
      adaptive_pricing: { enabled: false },
      success_url: `${QA_ORIGIN}/clubowner?checkout=processing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${QA_ORIGIN}/clubowner?checkout=cancelled`,
    },
  };
}
