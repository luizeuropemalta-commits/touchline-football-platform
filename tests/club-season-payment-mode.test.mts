import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_SEASON_AMOUNTS, clubSeasonChargeMinor, matchesClubSeasonPaymentEvidence,
  paymentForClubSeasonPlan, validClubSeasonOrderPayment, type ClubSeasonPaymentProfile, type ClubSeasonPaymentEvidence } from "../lib/stripe/club-season-payment-contract.ts";
import { CLUB_SEASON_TEST_PROFILE, clubSeasonTestPayment } from "../lib/stripe/club-season-test-catalogue.ts";
import { buildClubSeasonCheckoutRequest, buildClubSeasonPaymentCheckoutRequest } from "../lib/stripe/club-season-checkout-request.ts";
import { beginClubSeasonCheckout, type ClubSeasonStoredOrder } from "../lib/stripe/club-season-checkout-service.ts";
import { processClubSeasonWebhook, type SeasonWebhookSubject, type SeasonWebhookOrder } from "../lib/stripe/club-season-webhook-service.ts";
import { requestClubSeasonCheckout, requestClubSeasonPaymentCheckout, checkoutDisplayMode } from "../lib/stripe/club-season-checkout-client.ts";
import { handleClubSeasonCheckoutStatus } from "../lib/stripe/club-season-checkout-status.ts";

// Invented identifiers only. These fixtures never invoke Stripe or a database.
const now = Date.parse("2026-11-03T12:00:00Z");
const profile: ClubSeasonPaymentProfile = { mode: "live", accountId: "acct_fixtureLive", profileId: "fixture-live-v1",
  catalogueVersion: "fixture-20261103", returnOrigin: "https://checkout-return.example.test",
  catalogue: { standard: { productId: "prod_fixtureStandard", priceId: "price_fixtureStandard" },
    master: { productId: "prod_fixtureMaster", priceId: "price_fixtureMaster" },
    vip: { productId: "prod_fixtureVip", priceId: "price_fixtureVip" } } };
const payment = paymentForClubSeasonPlan(profile, "standard");
const order: ClubSeasonStoredOrder & { payment: typeof payment } = {
  id: "22222222-2222-4222-8222-222222222222", userId: "11111111-1111-4111-8111-111111111111",
  seasonId: "33333333-3333-4333-8333-333333333333", plan: "standard", state: "pending", sessionId: "cs_live_fixture",
  amountMinor: 4990, payment, seasonStartsAt: "2026-08-01T00:00:00Z", seasonEndsAt: "2027-06-01T00:00:00Z",
  createdAt: "2026-11-03T11:00:00Z", firstAttemptAt: "2026-11-03T11:00:00Z", checkoutExpiresAt: "2026-11-03T13:00:00Z",
};
const paidOrder = { ...order, sessionId: "cs_live_fixture" };
const metadata = { touchlineOrderId: order.id, touchlineSeasonId: order.seasonId, touchlinePlan: order.plan,
  touchlinePaymentMode: "live", touchlinePaymentAccountId: payment.accountId,
  touchlinePaymentProfileId: payment.profileId, touchlineCatalogueVersion: payment.catalogueVersion };
function evidence(): ClubSeasonPaymentEvidence {
  return { accountId: payment.accountId, id: paidOrder.sessionId, livemode: true, mode: "payment", status: "complete",
    payment_status: "paid", currency: "eur", amount_total: 4990, amount_subtotal: 4990,
    total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 }, client_reference_id: order.userId,
    metadata: { ...metadata }, profileId: payment.profileId, catalogueVersion: payment.catalogueVersion,
    lines: { has_more: false, data: [{ quantity: 1, price: { id: payment.priceId, product: payment.productId,
      active: true, livemode: true, currency: "eur", unit_amount: 4990, recurring: null } }] } };
}
function subject(): SeasonWebhookSubject {
  return { orderId: order.id, sessionId: paidOrder.sessionId, ownerId: order.userId, seasonId: order.seasonId,
    plan: order.plan, kind: "payment", evidence: evidence(), providerContext: { mode: payment.mode,
      accountId: payment.accountId, profileId: payment.profileId, catalogueVersion: payment.catalogueVersion } };
}

test("seasonal amounts, exact upgrades and the original TEST request contract remain stable", () => {
  assert.deepEqual(CLUB_SEASON_AMOUNTS, { standard: 4990, master: 8990, vip: 16990 });
  for (const [plan, previousPaidPlan, amount] of [["master", "standard", 4000], ["vip", "standard", 12000], ["vip", "master", 8000]] as const) {
    assert.equal(clubSeasonChargeMinor({ plan, previousPaidPlan }), amount);
    const upgrade = buildClubSeasonPaymentCheckoutRequest({ ...order, plan, previousPaidPlan,
      payment: paymentForClubSeasonPlan(profile, plan) }, now);
    assert.deepEqual(upgrade.params.line_items, [{ price_data: { currency: "eur", product: profile.catalogue[plan].productId, unit_amount: amount }, quantity: 1 }]);
  }
  for (const plan of ["standard", "master", "vip"] as const) assert.throws(() => clubSeasonChargeMinor({ plan, previousPaidPlan: plan }), /PAID_UPGRADE_REQUIRED/);
  const testOrder = { ...order, payment: clubSeasonTestPayment("standard") };
  const legacy = buildClubSeasonCheckoutRequest(testOrder, now);
  assert.equal(legacy.idempotencyKey, `club-season-test:${order.id}`);
  assert.deepEqual(legacy.params.metadata, { touchlineOrderId: order.id, touchlineSeasonId: order.seasonId, touchlinePlan: "standard" });
  assert.equal(legacy.params.success_url, `${CLUB_SEASON_TEST_PROFILE.returnOrigin}/clubowner?checkout=processing&session_id={CHECKOUT_SESSION_ID}`);
  assert.deepEqual(legacy.params.line_items, [{ price: CLUB_SEASON_TEST_PROFILE.catalogue.standard.priceId, quantity: 1 }]);
  assert.throws(() => buildClubSeasonCheckoutRequest(order, now), /INVALID_SEASON_ORDER/);
  assert.throws(() => buildClubSeasonCheckoutRequest({ ...testOrder, payment: { ...testOrder.payment, accountId: "acct_other" } }, now), /INVALID_SEASON_ORDER/);
});

test("profile identity and return origin reject values the persisted SQL contract cannot admit", () => {
  for (const profileId of ["ab", "0profile", "profile.with.dot", "profile_with_underscore", "p".repeat(81)]) {
    assert.equal(validClubSeasonOrderPayment({ ...payment, profileId }), false);
  }
  assert.equal(validClubSeasonOrderPayment({ ...payment, profileId: "p".repeat(80), catalogueVersion: "v".repeat(80) }), true);
  assert.equal(validClubSeasonOrderPayment({ ...payment, catalogueVersion: "v".repeat(81) }), false);
  for (const returnOrigin of ["https://localhost", "https://127.0.0.1", "https://a..example.test",
    "https://user@example.test", "https://example.test:444", "https://under_score.example.test", "https://example.test/path"]) {
    assert.equal(validClubSeasonOrderPayment({ ...payment, returnOrigin }), false);
  }
});

test("Live request uses the persisted profile and retains a stable replay key and exact metadata", () => {
  const first = buildClubSeasonPaymentCheckoutRequest(order, now);
  assert.equal(first.idempotencyKey, `club-season-live:${payment.accountId}:${order.id}`);
  assert.deepEqual(first.params.metadata, metadata);
  assert.deepEqual(first.params.payment_intent_data?.metadata, metadata);
  assert.equal(first.params.success_url, `${payment.returnOrigin}/clubowner?checkout=processing&session_id={CHECKOUT_SESSION_ID}`);
  assert.deepEqual(buildClubSeasonPaymentCheckoutRequest(order, now + 40 * 60_000), first);
  assert.equal(first.params.mode, "payment");
  assert.deepEqual(first.params.automatic_tax, { enabled: false });
  assert.equal(first.params.allow_promotion_codes, false);
});

test("paid evidence binds mode, account, profile, catalogue, product and full seasonal price", () => {
  assert.equal(matchesClubSeasonPaymentEvidence(paidOrder, evidence(), now), true);
  for (const patch of [{ accountId: "acct_other" }, { livemode: false }, { id: "cs_test_fixture" },
    { profileId: "other-profile" }, { catalogueVersion: "other" }, { amount_total: 1 }, { amount_subtotal: 1 }]) {
    assert.equal(matchesClubSeasonPaymentEvidence(paidOrder, { ...evidence(), ...patch }, now), false);
  }
  for (const key of ["touchlinePaymentMode", "touchlinePaymentAccountId", "touchlinePaymentProfileId", "touchlineCatalogueVersion"] as const) {
    const ev = evidence(); ev.metadata![key] = "other";
    assert.equal(matchesClubSeasonPaymentEvidence(paidOrder, ev, now), false);
  }
  for (const patch of [{ product: "prod_other" }, { id: "price_other" }, { livemode: false }, { unit_amount: 1 }, { recurring: {} }]) {
    const ev = evidence(); Object.assign(ev.lines.data[0].price!, patch);
    assert.equal(matchesClubSeasonPaymentEvidence(paidOrder, ev, now), false);
  }
});

test("checkout rejects a TEST or changed persisted profile before calling the provider", async () => {
  let creates = 0, attaches = 0;
  const run = (stored: ClubSeasonStoredOrder) => beginClubSeasonCheckout({ ownerId: order.userId, plan: "standard", expectedAmountMinor: 4990 }, {
    profile, store: { prepare: async () => stored, attach: async () => { attaches++; return order; } },
    createCheckout: async () => { creates++; return { sessionId: paidOrder.sessionId, url: "https://checkout.stripe.com/c/pay/fixture" }; },
  }, now);
  for (const stored of [{ ...order, payment: undefined }, { ...order, payment: clubSeasonTestPayment("standard") },
    { ...order, payment: { ...payment, profileId: "other-profile" } }, { ...order, amountMinor: 4000 }]) {
    await assert.rejects(run(stored), /SEASON_ORDER_CONTEXT_CHANGED|SEASON_QUOTE_CHANGED/);
  }
  assert.equal(creates, 0); assert.equal(attaches, 0);
  const result = await run(order);
  assert.deepEqual(result, { orderId: order.id, sessionId: paidOrder.sessionId,
    url: "https://checkout.stripe.com/c/pay/fixture", testMode: false, mode: "live" });
  assert.equal(creates, 1); assert.equal(attaches, 1);
});

test("every event checks authenticated context before terminal replay or any paid/risk/expired mutation", async () => {
  const writes: string[] = [];
  let stored: SeasonWebhookOrder = { ...paidOrder, state: "paid" };
  const store = { read: async () => stored, fulfill: async () => { writes.push("fulfill"); },
    review: async () => { writes.push("review"); }, expire: async () => { writes.push("expire"); } };
  for (const kind of ["payment", "risk", "expired"] as const) {
    for (const patch of [{ mode: "test" as const }, { accountId: "acct_other" }, { profileId: "other-profile" }, { catalogueVersion: "other" }]) {
      await assert.rejects(processClubSeasonWebhook("evt_fixture", { ...subject(), kind, riskType: "charge.refunded",
        providerContext: { ...subject().providerContext!, ...patch } }, store, now), /SEASON_EVENT_MISMATCH/);
    }
    await assert.rejects(processClubSeasonWebhook("evt_fixture", { ...subject(), kind, riskType: "charge.refunded", providerContext: undefined }, store, now), /SEASON_EVENT_MISMATCH/);
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(await processClubSeasonWebhook("evt_fixture", subject(), store, now), { received: true, duplicate: true });
  assert.deepEqual(writes, []);
  stored = paidOrder;
  await processClubSeasonWebhook("evt_paid", subject(), store, now);
  await processClubSeasonWebhook("evt_risk", { ...subject(), kind: "risk", riskType: "charge.refunded" }, store, now);
  await processClubSeasonWebhook("evt_expired", { ...subject(), kind: "expired" }, store, now);
  assert.deepEqual(writes, ["fulfill", "review", "expire"]);
});

test("client mode comes from server offers and does not enter the checkout request body", async () => {
  assert.equal(checkoutDisplayMode({ standard: { amountMinor: 4990 } }, "standard"), "test");
  assert.equal(checkoutDisplayMode({ standard: { amountMinor: 4990, paymentMode: "live" } }, "standard"), "live");
  assert.equal(checkoutDisplayMode(undefined, "standard"), null);
  const signal = new AbortController().signal;
  const fake = (payload: unknown): typeof fetch => async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { plan: "standard", expectedAmountMinor: 4990 });
    return Response.json(payload);
  };
  const payload = { ok: true, testMode: false, mode: "live", sessionId: paidOrder.sessionId, url: "https://checkout.stripe.com/c/pay/fixture" };
  assert.equal(await requestClubSeasonPaymentCheckout("standard", 4990, signal, "live", fake(payload)), payload.url);
  await assert.rejects(requestClubSeasonCheckout("standard", 4990, signal, fake(payload)), /CHECKOUT_UNAVAILABLE/);
  for (const patch of [{ testMode: true }, { mode: "test" }, { sessionId: "cs_test_fixture" }, { url: "https://evil.example.test" }]) {
    await assert.rejects(requestClubSeasonPaymentCheckout("standard", 4990, signal, "live", fake({ ...payload, ...patch })), /CHECKOUT_UNAVAILABLE/);
  }
});

test("status stays read-only and binds owner/session plus Live account/mode", async () => {
  const row = { user_id: order.userId, session_id: paidOrder.sessionId, state: "paid", plan: "standard",
    season_ends_at: order.seasonEndsAt, payment_mode: "live", provider_account: payment.accountId };
  const request = new Request(`https://example.test/api/season-status?session_id=${paidOrder.sessionId}`);
  const deps = (patch = {}) => ({ configured: () => true, payment: { mode: "live" as const, accountId: payment.accountId },
    authenticate: async () => order.userId, read: async () => ({ ...row, ...patch }) });
  const result = await handleClubSeasonCheckoutStatus(request, deps());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, status: "paid", plan: "standard", seasonEndsAt: order.seasonEndsAt, paymentMode: "live" });
  for (const patch of [{ payment_mode: "test" }, { provider_account: "acct_other" }, { user_id: "other" }]) {
    assert.equal((await handleClubSeasonCheckoutStatus(request, deps(patch))).status, 404);
  }
});
