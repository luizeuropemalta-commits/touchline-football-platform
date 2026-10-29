/** Verified Stripe sandbox catalogue. These identifiers are public references,
 * not credentials. This contract does not charge or activate an entitlement. */
export const CLUB_SEASON_TEST_ACCOUNT = "acct_1Tl6XQH0T0OdBC6s";
export const CLUB_SEASON_TEST_CATALOGUE = {
  standard: { amountMinor: 4990, productId: "prod_VWfOj7xUoHtTzf", priceId: "price_1UVc3eH0T0OdBC6sejXIyxSA" },
  master: { amountMinor: 8990, productId: "prod_VWfPhe2OKyhU2B", priceId: "price_1UVc4rH0T0OdBC6sTZadG7qv" },
  vip: { amountMinor: 16990, productId: "prod_VWfRYf4MYKPBLM", priceId: "price_1UVc6EH0T0OdBC6sXm0WRqIz" },
} as const;
export type ClubSeasonPaidPlan = keyof typeof CLUB_SEASON_TEST_CATALOGUE;
export function isClubSeasonPaidPlan(value: unknown): value is ClubSeasonPaidPlan {
  return typeof value === "string" && Object.hasOwn(CLUB_SEASON_TEST_CATALOGUE, value);
}
export type ClubSeasonTestOrder = {
  id: string; userId: string; seasonId: string; plan: ClubSeasonPaidPlan;
  sessionId: string; seasonStartsAt: string; seasonEndsAt: string;
  /** Confirmed paid plan in THIS season, read and locked by the server.
   * Free/admin-granted access does not establish a prior payment. */
  previousPaidPlan?: ClubSeasonPaidPlan;
};
export function clubSeasonChargeMinor(order: Pick<ClubSeasonTestOrder, "plan" | "previousPaidPlan">): number {
  if (!isClubSeasonPaidPlan(order.plan) || (order.previousPaidPlan !== undefined && !isClubSeasonPaidPlan(order.previousPaidPlan))) {
    throw new Error("INVALID_PAID_PLAN");
  }
  const amount = CLUB_SEASON_TEST_CATALOGUE[order.plan].amountMinor
    - (order.previousPaidPlan === undefined ? 0 : CLUB_SEASON_TEST_CATALOGUE[order.previousPaidPlan].amountMinor);
  if (amount <= 0) throw new Error("PAID_UPGRADE_REQUIRED");
  return amount;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validClubSeasonTestOrder(order: ClubSeasonTestOrder, now: number) {
  try { clubSeasonChargeMinor(order); } catch { return false; }
  const start = Date.parse(order.seasonStartsAt), end = Date.parse(order.seasonEndsAt);
  return UUID.test(order.id) && UUID.test(order.userId) && UUID.test(order.seasonId)
    && isClubSeasonPaidPlan(order.plan) && /^cs_test_[A-Za-z0-9]+$/.test(order.sessionId)
    && Number.isFinite(now) && Number.isFinite(start) && Number.isFinite(end)
    && start <= now && end > now && end > start;
}

type ProviderPrice = {
  id: string; product: string | { id: string }; active: boolean; livemode: boolean;
  currency: string; unit_amount: number | null; recurring: unknown;
};
export function matchesClubSeasonTestPrice(plan: ClubSeasonPaidPlan, price: ProviderPrice) {
  if (!isClubSeasonPaidPlan(plan)) return false;
  const expected = CLUB_SEASON_TEST_CATALOGUE[plan];
  return price.id === expected.priceId
    && (typeof price.product === "string" ? price.product : price.product?.id) === expected.productId
    && price.active === true && price.livemode === false && price.currency === "eur"
    && price.unit_amount === expected.amountMinor && price.recurring === null;
}

function matchesOrderPrice(order: ClubSeasonTestOrder, price: ProviderPrice) {
  if (order.previousPaidPlan === undefined) return matchesClubSeasonTestPrice(order.plan, price);
  return /^price_[A-Za-z0-9]+$/.test(price.id)
    && (typeof price.product === "string" ? price.product : price.product?.id) === CLUB_SEASON_TEST_CATALOGUE[order.plan].productId
    && price.livemode === false && price.currency === "eur" && price.recurring === null
    && price.unit_amount === clubSeasonChargeMinor(order);
}

export type ClubSeasonPaymentEvidence = {
  accountId: string; id: string; livemode: boolean; mode: string | null;
  status: string | null; payment_status: string; currency: string | null;
  amount_total: number | null; amount_subtotal: number | null;
  total_details: { amount_tax: number; amount_discount: number; amount_shipping: number | null } | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  lines: { has_more: boolean; data: { quantity: number | null; price: ProviderPrice | null }[] };
};
/** Caller must first verify the webhook signature, retrieve the session and all
 * line items from Stripe, and load the order from server-owned storage. Returning
 * true only permits a subsequent atomic/idempotent transaction; never a wallet
 * increment or browser-controlled activation. Taxes/discounts require a separate
 * approved quote policy and are deliberately rejected by this initial contract. */
export function matchesClubSeasonPaidEvidence(order: ClubSeasonTestOrder,
  evidence: ClubSeasonPaymentEvidence, now = Date.now()): boolean {
  if (!validClubSeasonTestOrder(order, now)) return false;
  const amount = clubSeasonChargeMinor(order);
  const item = evidence.lines.data[0];
  return evidence.accountId === CLUB_SEASON_TEST_ACCOUNT
    && evidence.id === order.sessionId && evidence.livemode === false
    && evidence.mode === "payment" && evidence.status === "complete" && evidence.payment_status === "paid"
    && evidence.currency === "eur" && evidence.amount_total === amount
    && evidence.amount_subtotal === amount
    && evidence.total_details?.amount_tax === 0 && evidence.total_details?.amount_discount === 0
    && evidence.total_details?.amount_shipping === 0
    && evidence.client_reference_id === order.userId
    && evidence.metadata?.touchlineOrderId === order.id
    && evidence.metadata?.touchlineSeasonId === order.seasonId
    && evidence.metadata?.touchlinePlan === order.plan
    && evidence.metadata?.touchlinePreviousPaidPlan === order.previousPaidPlan
    && evidence.lines.has_more === false && evidence.lines.data.length === 1
    && item?.quantity === 1 && item.price !== null && matchesOrderPrice(order, item.price);
}

/** Server callers only. Never return this result through an API or log it. */
export function resolveClubSeasonTestConfiguration(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED !== "true") return { ok: false, reason: "disabled" } as const;
  if (env.TOUCHLINE_STRIPE_MODE !== "test") return { ok: false, reason: "test-mode-required" } as const;
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "qa") {
    return { ok: false, reason: "qa-preview-required" } as const;
  }
  const databaseUrls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter((v): v is string => !!v);
  if (!databaseUrls.length || databaseUrls.some(url => url !== "https://xgxbwqxjssxxuihuwmgy.supabase.co")) {
    return { ok: false, reason: "qa-database-required" } as const;
  }
  const secretKey = env.TOUCHLINE_STRIPE_TEST_SECRET_KEY;
  const webhookSecret = env.TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET;
  if (!secretKey?.startsWith("sk_test_") || secretKey.length <= 8) return { ok: false, reason: "test-key-required" } as const;
  if (!webhookSecret?.startsWith("whsec_") || webhookSecret.length <= 6) return { ok: false, reason: "webhook-secret-required" } as const;
  return { ok: true, secretKey, webhookSecret, accountId: CLUB_SEASON_TEST_ACCOUNT } as const;
}
