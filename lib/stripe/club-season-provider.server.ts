import "server-only";
import Stripe from "stripe";
import { buildClubSeasonCheckoutRequest, type ClubSeasonCheckoutOrder } from "./club-season-checkout-request.ts";
import { CLUB_SEASON_TEST_ACCOUNT, CLUB_SEASON_TEST_CATALOGUE, clubSeasonChargeMinor, matchesClubSeasonTestPrice,
  matchesClubSeasonPaidEvidence, validClubSeasonTestOrder, resolveClubSeasonTestConfiguration, type ClubSeasonTestOrder } from "./club-season-test-catalogue.ts";

/** No generic/live secret fallback. Do not return provider errors or config to browsers. */
async function verifiedProvider() {
  const config = resolveClubSeasonTestConfiguration();
  if (!config.ok) throw new Error("SEASON_CHECKOUT_UNAVAILABLE");
  const stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== CLUB_SEASON_TEST_ACCOUNT) throw new Error("STRIPE_TEST_ACCOUNT_MISMATCH");
  return { stripe, config };
}

/** Caller must persist the order first, and persist sessionId before redirecting.
 * This adapter never activates a plan or mutates a TC wallet. */
export async function createClubSeasonTestCheckout(order: ClubSeasonCheckoutOrder) {
  const request = buildClubSeasonCheckoutRequest(order);
  const { stripe } = await verifiedProvider();
  const price = await stripe.prices.retrieve(CLUB_SEASON_TEST_CATALOGUE[order.plan].priceId);
  if (!matchesClubSeasonTestPrice(order.plan, price)) throw new Error("STRIPE_TEST_PRICE_MISMATCH");
  const session = await stripe.checkout.sessions.create(request.params, { idempotencyKey: request.idempotencyKey });
  if (session.livemode !== false || !/^cs_test_[A-Za-z0-9]+$/.test(session.id)
    || session.client_reference_id !== order.userId || session.metadata?.touchlineOrderId !== order.id
    || session.metadata?.touchlineSeasonId !== order.seasonId || session.metadata?.touchlinePlan !== order.plan
    || session.mode !== "payment" || session.currency !== "eur"
    || session.metadata?.touchlinePreviousPaidPlan !== order.previousPaidPlan
    || session.amount_total !== clubSeasonChargeMinor(order)
    || !session.url || new URL(session.url).origin !== "https://checkout.stripe.com") {
    throw new Error("STRIPE_TEST_SESSION_MISMATCH");
  }
  return { sessionId: session.id, url: session.url };
}

/** Signature verification is separate from fulfillment. No activation from URL
 * params or event payload amounts; the caller must load a server-owned order. */
export async function verifyClubSeasonTestWebhook(body: string, signature: string) {
  const config = resolveClubSeasonTestConfiguration();
  if (!config.ok) throw new Error("SEASON_CHECKOUT_UNAVAILABLE");
  const stripe = new Stripe(config.secretKey);
  const event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
  if (event.livemode !== false) throw new Error("LIVE_EVENT_REJECTED");
  return event;
}

export async function readVerifiedClubSeasonTestPayment(order: ClubSeasonTestOrder) {
  if (!validClubSeasonTestOrder(order, Date.now())) throw new Error("INVALID_SEASON_ORDER");
  const { stripe } = await verifiedProvider();
  const session = await stripe.checkout.sessions.retrieve(order.sessionId);
  const lines = await stripe.checkout.sessions.listLineItems(order.sessionId, { limit: 100 });
  if (!matchesClubSeasonPaidEvidence(order, { ...session, accountId: CLUB_SEASON_TEST_ACCOUNT, lines })) {
    throw new Error("SEASON_PAYMENT_UNCONFIRMED");
  }
  return { sessionId: session.id, orderId: order.id, userId: order.userId, plan: order.plan,
    seasonId: order.seasonId, seasonEndsAt: order.seasonEndsAt };
}

/** Re-fetches subject from the configured account. Signed event snapshots are
 * routing hints only: their amounts, metadata and charge status are not trusted. */
export async function readClubSeasonTestWebhookSubject(event: Stripe.Event): Promise<import('./club-season-webhook-service.ts').SeasonWebhookSubject|null> {
  const types = ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','charge.refunded','charge.dispute.created'];
  if(!types.includes(event.type)) return null;
  const object=event.data.object;
  if (!('id' in object) || typeof object.id!=='string') throw new Error('SEASON_EVENT_MISMATCH');
  const objectId=object.id;
  const {stripe}=await verifiedProvider();
  let session:Stripe.Checkout.Session;
  let riskType:'charge.refunded'|'charge.dispute.created'|undefined;
  if(event.type.startsWith('checkout.session.')) {
    const id=objectId;
    if(!/^cs_test_[A-Za-z0-9]+$/.test(id)) throw new Error('SEASON_EVENT_MISMATCH');
    session=await stripe.checkout.sessions.retrieve(id);
  } else {
    let charge:Stripe.Charge;
    if(event.type==='charge.dispute.created') {
      const dispute=await stripe.disputes.retrieve(objectId);
      if(dispute.livemode || ['won','warning_closed'].includes(dispute.status)) return null;
      charge=await stripe.charges.retrieve(typeof dispute.charge==='string'?dispute.charge:dispute.charge.id);
      riskType='charge.dispute.created';
    } else {
      charge=await stripe.charges.retrieve(objectId);
      if(charge.amount_refunded<=0) return null;
      riskType='charge.refunded';
    }
    if(charge.livemode || !charge.payment_intent) throw new Error('SEASON_EVENT_MISMATCH');
    const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent.id;
    const sessions=await stripe.checkout.sessions.list({payment_intent:intent,limit:2});
    if(sessions.has_more || sessions.data.length!==1) throw new Error('SEASON_SESSION_UNCONFIRMED');
    session=sessions.data[0];
  }
  if(!session.metadata?.touchlineOrderId) return null; // Another sandbox product.
  if(session.livemode || session.mode!=='payment' || !/^cs_test_[A-Za-z0-9]+$/.test(session.id)) throw new Error('SEASON_EVENT_MISMATCH');
  const base={orderId:session.metadata.touchlineOrderId,sessionId:session.id,
    ownerId:session.client_reference_id??'',seasonId:session.metadata.touchlineSeasonId??'',plan:session.metadata.touchlinePlan??'',
    ...(session.metadata.touchlinePreviousPaidPlan?{previousPaidPlan:session.metadata.touchlinePreviousPaidPlan}:{})};
  if(riskType) return {...base,kind:'risk',riskType};
  if(session.status==='expired' && session.payment_status==='unpaid') return {...base,kind:'expired'};
  if(session.status!=='complete' || session.payment_status!=='paid') throw new Error('SEASON_PAYMENT_UNCONFIRMED');
  // A delayed completion must not activate a payment already refunded/disputed.
  if(!session.payment_intent) throw new Error('SEASON_PAYMENT_UNCONFIRMED');
  const intent=await stripe.paymentIntents.retrieve(typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id);
  if(intent.livemode || intent.status!=='succeeded' || !intent.latest_charge) throw new Error('SEASON_PAYMENT_UNCONFIRMED');
  const charge=await stripe.charges.retrieve(typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge.id);
  if(charge.livemode) throw new Error('LIVE_EVENT_REJECTED');
  if(charge.disputed || charge.amount_refunded>0) return {...base,kind:'risk',riskType:charge.disputed?'charge.dispute.created':'charge.refunded'};
  const lines=await stripe.checkout.sessions.listLineItems(session.id,{limit:100});
  return {...base,kind:'payment',evidence:{...session,accountId:CLUB_SEASON_TEST_ACCOUNT,lines}};
}
