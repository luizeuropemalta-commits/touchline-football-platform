import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { CLUB_SEASON_TEST_PROFILE } from "../lib/stripe/club-season-test-catalogue.ts";
import { paymentForClubSeasonPlan, type ClubSeasonPaymentProfile } from "../lib/stripe/club-season-payment-contract.ts";
import type { ClubSeasonCheckoutOrder } from "../lib/stripe/club-season-checkout-request.ts";
import type Stripe from "stripe";

type Provider = typeof import("../lib/stripe/club-season-provider.server.ts");
type Row = Record<string, unknown>;
const root = fileURLToPath(new URL("..", import.meta.url));
const liveProfile: ClubSeasonPaymentProfile = { mode: "live", accountId: "acct_fixtureLive", profileId: "fixture-live-v1",
  catalogueVersion: "fixture-20261103", returnOrigin: "https://return.example.test", catalogue: {
    standard: { productId: "prod_fixtureStandard", priceId: "price_fixtureStandard" },
    master: { productId: "prod_fixtureMaster", priceId: "price_fixtureMaster" },
    vip: { productId: "prod_fixtureVip", priceId: "price_fixtureVip" },
  } };
function harness(mode: "test" | "live" = "live") {
  const profile = mode === "live" ? liveProfile : CLUB_SEASON_TEST_PROFILE;
  const now = Math.floor(Date.now() / 1000) * 1000;
  const order: ClubSeasonCheckoutOrder = { id: "22222222-2222-4222-8222-222222222222",
    userId: "11111111-1111-4111-8111-111111111111", seasonId: "33333333-3333-4333-8333-333333333333", plan: "standard",
    seasonStartsAt: new Date(now - 86400_000).toISOString(), seasonEndsAt: new Date(now + 86400_000 * 30).toISOString(),
    createdAt: new Date(now - 60_000).toISOString(), firstAttemptAt: new Date(now - 60_000).toISOString(),
    checkoutExpiresAt: new Date(now + 3600_000).toISOString(), payment: paymentForClubSeasonPlan(profile, "standard") };
  const metadata: Record<string, string> = { touchlineOrderId: order.id, touchlineSeasonId: order.seasonId, touchlinePlan: order.plan,
    ...(mode === "test" ? {} : { touchlinePaymentMode: "live", touchlinePaymentAccountId: profile.accountId,
      touchlinePaymentProfileId: profile.profileId, touchlineCatalogueVersion: profile.catalogueVersion }) };
  const control = {
    account: { id: profile.accountId, charges_enabled: true, details_submitted: true }, calls: [] as string[],
    requests: [] as Array<{ params: Row; options: Row }>,
    price: { id: profile.catalogue.standard.priceId, product: profile.catalogue.standard.productId,
      active: true, livemode: mode === "live", currency: "eur", unit_amount: 4990, recurring: null },
    session: { id: `cs_${mode}_fixture`, livemode: mode === "live", client_reference_id: order.userId,
      metadata, mode: "payment", currency: "eur", amount_total: 4990, amount_subtotal: 4990,
      total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 }, status: "complete", payment_status: "paid",
      payment_intent: "pi_fixture", url: "https://checkout.stripe.com/c/pay/fixture" },
    charge: { id: "ch_fixture", payment_intent: "pi_fixture", livemode: mode === "live", disputed: false, amount_refunded: 0 },
    intent: { id: "pi_fixture", livemode: mode === "live", status: "succeeded", latest_charge: "ch_fixture" },
    dispute: { id: "dp_fixture", livemode: mode === "live", status: "needs_response", charge: "ch_fixture" },
  };
  const env: Record<string, string> = {
    TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED: "true", TOUCHLINE_STRIPE_MODE: mode,
    VERCEL_ENV: mode === "live" ? "production" : "preview", VERCEL_GIT_COMMIT_REF: "qa",
    SUPABASE_URL: mode === "live" ? "https://bbbbbbbbbbbbbbbbbbbb.supabase.co" : "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_STRIPE_TEST_SECRET_KEY: "sk_test_fake_unit_only", TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET: "whsec_fake_unit_only",
    TOUCHLINE_CLUB_SEASON_LIVE_ENABLED: "true", TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED: "true",
    TOUCHLINE_STRIPE_LIVE_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co", TOUCHLINE_STRIPE_LIVE_ACCOUNT_ID: liveProfile.accountId,
    TOUCHLINE_STRIPE_LIVE_SECRET_KEY: "sk_live_fake_unit_only", TOUCHLINE_STRIPE_LIVE_CLUB_SEASON_WEBHOOK_SECRET: "whsec_fake_live_unit_only",
    TOUCHLINE_STRIPE_LIVE_PROFILE_ID: liveProfile.profileId, TOUCHLINE_STRIPE_LIVE_CATALOGUE_VERSION: liveProfile.catalogueVersion,
    TOUCHLINE_STRIPE_LIVE_RETURN_ORIGIN: liveProfile.returnOrigin,
  };
  env.NEXT_PUBLIC_SUPABASE_URL = env.SUPABASE_URL;
  for (const plan of ["standard", "master", "vip"] as const) {
    env[`TOUCHLINE_STRIPE_LIVE_${plan.toUpperCase()}_PRODUCT_ID`] = liveProfile.catalogue[plan].productId;
    env[`TOUCHLINE_STRIPE_LIVE_${plan.toUpperCase()}_PRICE_ID`] = liveProfile.catalogue[plan].priceId;
  }
  // Compile the actual adapter and local dependencies. Only the provider SDK is
  // replaced; no network implementation exists in this fixture.
  class FixtureStripe {
    accounts = { retrieve: async () => { control.calls.push("account"); return control.account; } };
    prices = { retrieve: async (id: string) => { control.calls.push("price"); assert.equal(id, control.price.id); return control.price; } };
    checkout = { sessions: {
      create: async (params: Row, options: Row) => { control.calls.push("create"); control.requests.push({ params, options }); return control.session; },
      retrieve: async (id: string) => { control.calls.push("session"); assert.equal(id, control.session.id); return control.session; },
      list: async (params: Row) => { control.calls.push("sessions"); assert.equal(params.payment_intent, "pi_fixture"); return { has_more: false, data: [control.session] }; },
      listLineItems: async (id: string) => { control.calls.push("lines"); assert.equal(id, control.session.id); return { has_more: false, data: [{ quantity: 1, price: control.price }] }; },
    } };
    charges = { retrieve: async () => { control.calls.push("charge"); return control.charge; } };
    paymentIntents = { retrieve: async () => { control.calls.push("intent"); return control.intent; } };
    disputes = { retrieve: async () => { control.calls.push("dispute"); return control.dispute; } };
  }
  const cache = new Map<string, Row>();
  function load(file: string): Row {
    const existing = cache.get(file); if (existing) return existing;
    const exports: Row = {}; cache.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInNewContext(compiled, { exports, URL, Date, Set, process: { env }, require(specifier: string) {
      if (specifier === "server-only") return {};
      if (specifier === "stripe") return { __esModule: true, default: FixtureStripe };
      if (specifier.startsWith(".")) return load(path.resolve(path.dirname(file), specifier));
      throw new Error(`Unexpected provider dependency: ${specifier}`);
    } }, { filename: file });
    return exports;
  }
  return { provider: load(path.join(root, "lib/stripe/club-season-provider.server.ts")) as unknown as Provider,
    control, order, profile, env };
}
function event(type: string, id: string, live = true): Stripe.Event {
  return { id: "evt_fixture", type, livemode: live, data: { object: { id } } } as Stripe.Event;
}

test("actual adapter verifies account and price before creating an exact one-off request", async () => {
  const h = harness(); const created = await h.provider.createClubSeasonCheckout(h.order);
  assert.equal(created.sessionId, "cs_live_fixture");
  assert.deepEqual(h.control.calls, ["account", "price", "create"]);
  const { params, options } = JSON.parse(JSON.stringify(h.control.requests[0]));
  assert.equal(options.idempotencyKey, `club-season-live:${h.profile.accountId}:${h.order.id}`);
  assert.deepEqual(params.line_items, [{ price: h.profile.catalogue.standard.priceId, quantity: 1 }]);
  assert.equal(params.metadata.touchlinePaymentAccountId, h.profile.accountId);
  assert.equal(params.metadata.touchlinePaymentProfileId, h.profile.profileId);
  assert.equal(params.mode, "payment");
  const sandbox = harness("test");
  await sandbox.provider.createClubSeasonTestCheckout({ ...sandbox.order, payment: undefined });
  const testRequest = JSON.parse(JSON.stringify(sandbox.control.requests[0]));
  assert.equal(testRequest.options.idempotencyKey, `club-season-test:${sandbox.order.id}`);
  assert.deepEqual(Object.keys(testRequest.params.metadata).sort(), ["touchlineOrderId", "touchlinePlan", "touchlineSeasonId"]);
});

test("wrong account, disabled charges, cross-mode price or order context cannot reach session creation", async () => {
  for (const change of ["account", "charges", "priceMode", "context"] as const) {
    const h = harness();
    if (change === "account") h.control.account.id = "acct_other";
    if (change === "charges") h.control.account.charges_enabled = false;
    if (change === "priceMode") h.control.price.livemode = false;
    if (change === "context") h.order.payment = { ...h.order.payment!, profileId: "other-profile" };
    await assert.rejects(h.provider.createClubSeasonCheckout(h.order));
    assert.equal(h.control.requests.length, 0);
  }
});

test("paid, expired and risk subjects carry authenticated immutable context; no current creation profile is required", async () => {
  const paid = harness(); paid.env.TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED = "false";
  delete paid.env.TOUCHLINE_STRIPE_LIVE_PROFILE_ID;
  const subject = await paid.provider.readClubSeasonWebhookSubject(event("checkout.session.completed", paid.control.session.id));
  assert.equal(subject?.kind, "payment");
  assert.equal(subject?.providerContext?.accountId, paid.profile.accountId);
  assert.equal(subject?.providerContext?.profileId, paid.profile.profileId);
  assert.equal(subject?.evidence?.catalogueVersion, paid.profile.catalogueVersion);
  assert.deepEqual(paid.control.calls, ["account", "session", "intent", "charge", "lines"]);
  const expired = harness(); expired.control.session.status = "expired"; expired.control.session.payment_status = "unpaid";
  assert.equal((await expired.provider.readClubSeasonWebhookSubject(event("checkout.session.expired", expired.control.session.id)))?.kind, "expired");
  const refunded = harness(); refunded.control.charge.amount_refunded = 4990;
  const risk = await refunded.provider.readClubSeasonWebhookSubject(event("charge.refunded", "ch_fixture"));
  assert.equal(risk?.kind, "risk"); assert.equal(risk?.providerContext?.profileId, refunded.profile.profileId);
  const disputed = harness();
  assert.equal((await disputed.provider.readClubSeasonWebhookSubject(event("charge.dispute.created", "dp_fixture")))?.riskType, "charge.dispute.created");
  const terminal = harness(); terminal.control.dispute.status = "won";
  assert.equal(await terminal.provider.readClubSeasonWebhookSubject(event("charge.dispute.created", "dp_fixture")), null);
});

test("provider re-fetch rejects mixed account/mode/profile metadata and preserves the TEST wrapper subject shape", async () => {
  for (const change of ["account", "sessionMode", "metadataAccount", "metadataProfile", "intentMode", "chargeMode"] as const) {
    const h = harness();
    if (change === "account") h.control.account.id = "acct_other";
    if (change === "sessionMode") h.control.session.livemode = false;
    if (change === "metadataAccount") h.control.session.metadata.touchlinePaymentAccountId = "acct_other";
    if (change === "metadataProfile") delete h.control.session.metadata.touchlinePaymentProfileId;
    if (change === "intentMode") h.control.intent.livemode = false;
    if (change === "chargeMode") h.control.charge.livemode = false;
    await assert.rejects(h.provider.readClubSeasonWebhookSubject(event("checkout.session.completed", h.control.session.id)));
    assert.equal(h.control.calls.includes("lines"), false);
  }
  const h = harness("test");
  const subject = await h.provider.readClubSeasonTestWebhookSubject(event("checkout.session.completed", h.control.session.id, false));
  assert.equal(subject?.kind, "payment"); assert.equal(subject?.providerContext, undefined);
  assert.equal(subject?.evidence?.profileId, undefined); assert.equal(subject?.evidence?.catalogueVersion, undefined);
});
