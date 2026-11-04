import "server-only";
import Stripe from "stripe";
import { buildClubSeasonPaymentCheckoutRequest, type ClubSeasonCheckoutOrder } from "./club-season-checkout-request.ts";
import { CLUB_SEASON_TEST_PROFILE, clubSeasonTestPayment, resolveClubSeasonTestConfiguration,
  type ClubSeasonTestOrder } from "./club-season-test-catalogue.ts";
import { CLUB_SEASON_PROFILE_ID, CLUB_SEASON_CATALOGUE_VERSION, clubSeasonChargeMinor, isClubSeasonPaidPlan, matchesClubSeasonProviderPrice,
  matchesClubSeasonPaymentEvidence, paymentForClubSeasonPlan, sameClubSeasonOrderPayment,
  validClubSeasonPaymentOrder, validClubSeasonSession, type ClubSeasonOrderPayment,
  type ClubSeasonPaymentOrder } from "./club-season-payment-contract.ts";
import { resolveClubSeasonPaymentConfiguration, type ClubSeasonPaymentPurpose,
  type ClubSeasonProviderConfiguration } from "./club-season-configuration.server.ts";

function configuration(purpose: ClubSeasonPaymentPurpose, testOnly: boolean): ClubSeasonProviderConfiguration {
  if (testOnly) {
    const test = resolveClubSeasonTestConfiguration();
    if (!test.ok) throw new Error("SEASON_CHECKOUT_UNAVAILABLE");
    return { mode: "test", accountId: test.accountId, secretKey: test.secretKey,
      webhookSecret: test.webhookSecret, profile: CLUB_SEASON_TEST_PROFILE };
  }
  const resolved = resolveClubSeasonPaymentConfiguration(purpose);
  if (!resolved.ok) throw new Error("SEASON_CHECKOUT_UNAVAILABLE");
  return resolved.config;
}
/** Dedicated keys only. Provider errors/configuration never reach browsers. */
async function verifiedProvider(purpose: ClubSeasonPaymentPurpose, testOnly = false) {
  const config = configuration(purpose, testOnly);
  const stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== config.accountId) throw new Error("STRIPE_ACCOUNT_MISMATCH");
  if (purpose === "create" && config.mode === "live" && (!account.charges_enabled || !account.details_submitted)) {
    throw new Error("STRIPE_ACCOUNT_NOT_READY");
  }
  return { stripe, config };
}
function orderPayment(order: ClubSeasonCheckoutOrder, config: ClubSeasonProviderConfiguration): ClubSeasonOrderPayment {
  if (!isClubSeasonPaidPlan(order.plan) || !config.profile) throw new Error("INVALID_SEASON_ORDER");
  const expected = paymentForClubSeasonPlan(config.profile, order.plan);
  const payment = order.payment ?? (config.mode === "test" ? expected : null);
  if (!payment || !sameClubSeasonOrderPayment(payment, expected)) throw new Error("SEASON_ORDER_CONTEXT_CHANGED");
  return payment;
}
async function createCheckout(order: ClubSeasonCheckoutOrder, testOnly: boolean) {
  const config = configuration("create", testOnly);
  const payment = orderPayment(order, config);
  const request = buildClubSeasonPaymentCheckoutRequest({ ...order, payment });
  const { stripe, config: verified } = await verifiedProvider("create", testOnly);
  if (verified.mode !== config.mode || verified.accountId !== config.accountId) throw new Error("SEASON_ORDER_CONTEXT_CHANGED");
  const price = await stripe.prices.retrieve(payment.priceId);
  if (!matchesClubSeasonProviderPrice(order.plan, price, payment)) throw new Error("STRIPE_PRICE_MISMATCH");
  const session = await stripe.checkout.sessions.create(request.params, { idempotencyKey: request.idempotencyKey });
  if (session.livemode !== (payment.mode === "live") || !validClubSeasonSession(session.id, payment.mode)
    || session.client_reference_id !== order.userId || session.metadata?.touchlineOrderId !== order.id
    || session.metadata?.touchlineSeasonId !== order.seasonId || session.metadata?.touchlinePlan !== order.plan
    || session.mode !== "payment" || session.currency !== "eur"
    || session.metadata?.touchlinePreviousPaidPlan !== order.previousPaidPlan
    || (payment.mode === "live" && (session.metadata?.touchlinePaymentMode !== "live"
      || session.metadata?.touchlinePaymentAccountId !== payment.accountId
      || session.metadata?.touchlinePaymentProfileId !== payment.profileId
      || session.metadata?.touchlineCatalogueVersion !== payment.catalogueVersion))
    || session.amount_total !== clubSeasonChargeMinor(order)
    || !session.url || new URL(session.url).origin !== "https://checkout.stripe.com") {
    throw new Error("STRIPE_SESSION_MISMATCH");
  }
  return { sessionId: session.id, url: session.url };
}
export const createClubSeasonCheckout = (order: ClubSeasonCheckoutOrder) => createCheckout(order, false);
export const createClubSeasonTestCheckout = (order: ClubSeasonCheckoutOrder) => createCheckout(order, true);

function verifyWebhook(body: string, signature: string, testOnly: boolean) {
  const config = configuration("reconcile", testOnly);
  const stripe = new Stripe(config.secretKey);
  const event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
  if (event.livemode !== (config.mode === "live")) throw new Error(config.mode === "test" ? "LIVE_EVENT_REJECTED" : "PAYMENT_MODE_MISMATCH");
  if (event.account) throw new Error("CONNECTED_ACCOUNT_NOT_SUPPORTED");
  return event;
}
export async function verifyClubSeasonWebhook(body: string, signature: string) { return verifyWebhook(body, signature, false); }
export async function verifyClubSeasonTestWebhook(body: string, signature: string) { return verifyWebhook(body, signature, true); }

async function readVerifiedPayment(order: ClubSeasonPaymentOrder, testOnly: boolean) {
  if (!validClubSeasonPaymentOrder(order, Date.now())) throw new Error("INVALID_SEASON_ORDER");
  const { stripe, config } = await verifiedProvider("reconcile", testOnly);
  if (order.payment.mode !== config.mode || order.payment.accountId !== config.accountId) throw new Error("SEASON_EVENT_MISMATCH");
  const session = await stripe.checkout.sessions.retrieve(order.sessionId);
  const lines = await stripe.checkout.sessions.listLineItems(order.sessionId, { limit: 100 });
  const evidence = { ...session, accountId: config.accountId, lines,
    ...(config.mode === "live" ? { profileId: session.metadata?.touchlinePaymentProfileId,
      catalogueVersion: session.metadata?.touchlineCatalogueVersion } : {}) };
  if (!matchesClubSeasonPaymentEvidence(order, evidence)) throw new Error("SEASON_PAYMENT_UNCONFIRMED");
  return { sessionId: session.id, orderId: order.id, userId: order.userId, plan: order.plan,
    seasonId: order.seasonId, seasonEndsAt: order.seasonEndsAt };
}
export const readVerifiedClubSeasonPayment = (order: ClubSeasonPaymentOrder) => readVerifiedPayment(order, false);
export async function readVerifiedClubSeasonTestPayment(order: ClubSeasonTestOrder) {
  if (!isClubSeasonPaidPlan(order.plan)) throw new Error("INVALID_SEASON_ORDER");
  return readVerifiedPayment({ ...order, payment: clubSeasonTestPayment(order.plan) }, true);
}

/** Signature snapshots only route the lookup; current provider state supplies
 * identity/payment/risk evidence. No browser payload or URL activates a plan. */
async function readWebhookSubject(event: Stripe.Event, testOnly: boolean): Promise<import("./club-season-webhook-service.ts").SeasonWebhookSubject | null> {
  const types = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "charge.refunded", "charge.dispute.created"];
  if (!types.includes(event.type)) return null;
  const config = configuration("reconcile", testOnly);
  if (event.account || event.livemode !== (config.mode === "live")) throw new Error("SEASON_EVENT_MISMATCH");
  const object = event.data.object;
  if (!("id" in object) || typeof object.id !== "string") throw new Error("SEASON_EVENT_MISMATCH");
  const { stripe } = await verifiedProvider("reconcile", testOnly);
  let session: Stripe.Checkout.Session;
  let riskType: "charge.refunded" | "charge.dispute.created" | undefined;
  if (event.type.startsWith("checkout.session.")) {
    if (!validClubSeasonSession(object.id, config.mode)) throw new Error("SEASON_EVENT_MISMATCH");
    session = await stripe.checkout.sessions.retrieve(object.id);
  } else {
    let charge: Stripe.Charge;
    if (event.type === "charge.dispute.created") {
      const dispute = await stripe.disputes.retrieve(object.id);
      if (dispute.livemode !== (config.mode === "live")) throw new Error("SEASON_EVENT_MISMATCH");
      if (["won", "warning_closed"].includes(dispute.status)) return null;
      charge = await stripe.charges.retrieve(typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id);
      riskType = "charge.dispute.created";
    } else {
      charge = await stripe.charges.retrieve(object.id);
      if (charge.livemode !== (config.mode === "live")) throw new Error("SEASON_EVENT_MISMATCH");
      if (charge.amount_refunded <= 0) return null;
      riskType = "charge.refunded";
    }
    if (charge.livemode !== (config.mode === "live") || !charge.payment_intent) throw new Error("SEASON_EVENT_MISMATCH");
    const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
    const sessions = await stripe.checkout.sessions.list({ payment_intent: intent, limit: 2 });
    if (sessions.has_more || sessions.data.length !== 1) throw new Error("SEASON_SESSION_UNCONFIRMED");
    session = sessions.data[0];
  }
  if (!session.metadata?.touchlineOrderId) return null;
  if (session.livemode !== (config.mode === "live") || session.mode !== "payment"
    || !validClubSeasonSession(session.id, config.mode)) throw new Error("SEASON_EVENT_MISMATCH");
  const providerContext = config.mode === "test"
    ? { mode: "test" as const, accountId: config.accountId, profileId: CLUB_SEASON_TEST_PROFILE.profileId,
      catalogueVersion: CLUB_SEASON_TEST_PROFILE.catalogueVersion }
    : { mode: "live" as const, accountId: config.accountId, profileId: session.metadata.touchlinePaymentProfileId ?? "",
      catalogueVersion: session.metadata.touchlineCatalogueVersion ?? "" };
  if (config.mode === "live" && (session.metadata.touchlinePaymentMode !== "live"
    || session.metadata.touchlinePaymentAccountId !== config.accountId
    || !CLUB_SEASON_PROFILE_ID.test(providerContext.profileId)
    || !CLUB_SEASON_CATALOGUE_VERSION.test(providerContext.catalogueVersion))) throw new Error("SEASON_EVENT_MISMATCH");
  const base = { orderId: session.metadata.touchlineOrderId, sessionId: session.id,
    ownerId: session.client_reference_id ?? "", seasonId: session.metadata.touchlineSeasonId ?? "", plan: session.metadata.touchlinePlan ?? "",
    ...(session.metadata.touchlinePreviousPaidPlan ? { previousPaidPlan: session.metadata.touchlinePreviousPaidPlan } : {}),
    ...(testOnly ? {} : { providerContext }) };
  if (riskType) return { ...base, kind: "risk", riskType };
  if (session.status === "expired" && session.payment_status === "unpaid") return { ...base, kind: "expired" };
  if (session.status !== "complete" || session.payment_status !== "paid" || !session.payment_intent) throw new Error("SEASON_PAYMENT_UNCONFIRMED");
  const intent = await stripe.paymentIntents.retrieve(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id);
  if (intent.livemode !== (config.mode === "live") || intent.status !== "succeeded" || !intent.latest_charge) throw new Error("SEASON_PAYMENT_UNCONFIRMED");
  const charge = await stripe.charges.retrieve(typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge.id);
  if (charge.livemode !== (config.mode === "live")) throw new Error("PAYMENT_MODE_MISMATCH");
  if (charge.disputed || charge.amount_refunded > 0) return { ...base, kind: "risk", riskType: charge.disputed ? "charge.dispute.created" : "charge.refunded" };
  const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  return { ...base, kind: "payment", evidence: { ...session, accountId: config.accountId, lines,
    ...(config.mode === "live" ? { profileId: providerContext.profileId, catalogueVersion: providerContext.catalogueVersion } : {}) } };
}
export const readClubSeasonWebhookSubject = (event: Stripe.Event) => readWebhookSubject(event, false);
export const readClubSeasonTestWebhookSubject = (event: Stripe.Event) => readWebhookSubject(event, true);
