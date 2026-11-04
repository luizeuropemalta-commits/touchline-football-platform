/** Nonsecret seasonal payment contract. Provider access and environment gates
 * belong to the server-only configuration/provider boundaries. */
export const CLUB_SEASON_PROFILE_ID = /^[a-z][a-z0-9-]{2,79}$/;
export const CLUB_SEASON_CATALOGUE_VERSION = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
export const CLUB_SEASON_AMOUNTS = { standard: 4990, master: 8990, vip: 16990 } as const;
export type ClubSeasonPaidPlan = keyof typeof CLUB_SEASON_AMOUNTS;
export type ClubSeasonPaymentMode = "test" | "live";
export function isClubSeasonPaidPlan(value: unknown): value is ClubSeasonPaidPlan {
  return typeof value === "string" && Object.hasOwn(CLUB_SEASON_AMOUNTS, value);
}
export type ClubSeasonOrder = {
  id: string; userId: string; seasonId: string; plan: ClubSeasonPaidPlan;
  sessionId: string; seasonStartsAt: string; seasonEndsAt: string;
  previousPaidPlan?: ClubSeasonPaidPlan;
};
/** Immutable server-owned snapshot for the selected plan, never browser input. */
export type ClubSeasonOrderPayment = Readonly<{
  mode: ClubSeasonPaymentMode; accountId: string; profileId: string;
  catalogueVersion: string; productId: string; priceId: string; returnOrigin: string;
}>;
export type ClubSeasonPaymentProfile = Readonly<{
  mode: ClubSeasonPaymentMode; accountId: string; profileId: string;
  catalogueVersion: string; returnOrigin: string;
  catalogue: Readonly<Record<ClubSeasonPaidPlan, Readonly<{ productId: string; priceId: string }>>>;
}>;
export type ClubSeasonPaymentOrder = ClubSeasonOrder & { payment: ClubSeasonOrderPayment };
export type ClubSeasonProviderPrice = {
  id: string; product: string | { id: string }; active: boolean; livemode: boolean;
  currency: string; unit_amount: number | null; recurring: unknown;
};
export type ClubSeasonPaymentEvidence = {
  accountId: string; id: string; livemode: boolean; mode: string | null;
  status: string | null; payment_status: string; currency: string | null;
  amount_total: number | null; amount_subtotal: number | null;
  total_details: { amount_tax: number; amount_discount: number; amount_shipping: number | null } | null;
  client_reference_id: string | null; metadata: Record<string, string> | null;
  lines: { has_more: boolean; data: { quantity: number | null; price: ClubSeasonProviderPrice | null }[] };
  profileId?: string; catalogueVersion?: string;
};
export const CLUB_SEASON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function clubSeasonChargeMinor(order: Pick<ClubSeasonOrder, "plan" | "previousPaidPlan">): number {
  if (!isClubSeasonPaidPlan(order.plan) || (order.previousPaidPlan !== undefined && !isClubSeasonPaidPlan(order.previousPaidPlan))) {
    throw new Error("INVALID_PAID_PLAN");
  }
  const amount = CLUB_SEASON_AMOUNTS[order.plan]
    - (order.previousPaidPlan === undefined ? 0 : CLUB_SEASON_AMOUNTS[order.previousPaidPlan]);
  if (amount <= 0) throw new Error("PAID_UPGRADE_REQUIRED");
  return amount;
}
export function validClubSeasonSession(value: unknown, mode: ClubSeasonPaymentMode): value is string {
  return typeof value === "string" && value.length <= 255
    && (mode === "test" ? /^cs_test_[A-Za-z0-9]+$/ : /^cs_live_[A-Za-z0-9]+$/).test(value);
}
export function validClubSeasonReturnOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(value) && !value.includes("..")
      && url.protocol === "https:" && url.origin === value && !url.username && !url.password
      && !url.port && url.hostname.includes(".") && !/^\d+(?:\.\d+){3}$/.test(url.hostname);
  } catch { return false; }
}
export function validClubSeasonOrderPayment(value: ClubSeasonOrderPayment): boolean {
  return (value.mode === "test" || value.mode === "live")
    && /^acct_[A-Za-z0-9]+$/.test(value.accountId)
    && CLUB_SEASON_PROFILE_ID.test(value.profileId)
    && CLUB_SEASON_CATALOGUE_VERSION.test(value.catalogueVersion)
    && /^prod_[A-Za-z0-9]+$/.test(value.productId) && /^price_[A-Za-z0-9]+$/.test(value.priceId)
    && validClubSeasonReturnOrigin(value.returnOrigin);
}
export function paymentForClubSeasonPlan(profile: ClubSeasonPaymentProfile, plan: ClubSeasonPaidPlan): ClubSeasonOrderPayment {
  if (!isClubSeasonPaidPlan(plan)) throw new Error("INVALID_PAID_PLAN");
  const payment = { mode: profile.mode, accountId: profile.accountId, profileId: profile.profileId,
    catalogueVersion: profile.catalogueVersion, returnOrigin: profile.returnOrigin, ...profile.catalogue[plan] };
  if (!validClubSeasonOrderPayment(payment)) throw new Error("INVALID_PAYMENT_PROFILE");
  return payment;
}
export function sameClubSeasonOrderPayment(a: ClubSeasonOrderPayment, b: ClubSeasonOrderPayment): boolean {
  return a.mode === b.mode && a.accountId === b.accountId && a.profileId === b.profileId
    && a.catalogueVersion === b.catalogueVersion && a.productId === b.productId
    && a.priceId === b.priceId && a.returnOrigin === b.returnOrigin;
}
export function validClubSeasonPaymentOrder(order: ClubSeasonPaymentOrder, now: number): boolean {
  try { clubSeasonChargeMinor(order); } catch { return false; }
  const start = Date.parse(order.seasonStartsAt), end = Date.parse(order.seasonEndsAt);
  return validClubSeasonOrderPayment(order.payment)
    && CLUB_SEASON_UUID.test(order.id) && CLUB_SEASON_UUID.test(order.userId) && CLUB_SEASON_UUID.test(order.seasonId)
    && validClubSeasonSession(order.sessionId, order.payment.mode)
    && Number.isFinite(now) && Number.isFinite(start) && Number.isFinite(end)
    && start <= now && end > now && end > start;
}
export function matchesClubSeasonProviderPrice(plan: ClubSeasonPaidPlan, price: ClubSeasonProviderPrice,
  payment: ClubSeasonOrderPayment): boolean {
  return isClubSeasonPaidPlan(plan) && validClubSeasonOrderPayment(payment)
    && price.id === payment.priceId
    && (typeof price.product === "string" ? price.product : price.product?.id) === payment.productId
    && price.active === true && price.livemode === (payment.mode === "live") && price.currency === "eur"
    && price.unit_amount === CLUB_SEASON_AMOUNTS[plan] && price.recurring === null;
}
/** The caller verifies signature and re-fetches provider state first. This
 * predicate authorizes only the following atomic/idempotent SQL operation. */
export function matchesClubSeasonPaymentEvidence(order: ClubSeasonPaymentOrder,
  evidence: ClubSeasonPaymentEvidence, now = Date.now()): boolean {
  if (!validClubSeasonPaymentOrder(order, now)) return false;
  const amount = clubSeasonChargeMinor(order), payment = order.payment;
  const item = evidence.lines.data[0], price = item?.price;
  const priceMatches = price && (order.previousPaidPlan === undefined
    ? matchesClubSeasonProviderPrice(order.plan, price, payment)
    : /^price_[A-Za-z0-9]+$/.test(price.id)
      && (typeof price.product === "string" ? price.product : price.product?.id) === payment.productId
      && price.livemode === (payment.mode === "live") && price.currency === "eur"
      && price.recurring === null && price.unit_amount === amount);
  return evidence.accountId === payment.accountId && evidence.id === order.sessionId
    && evidence.livemode === (payment.mode === "live")
    && (payment.mode === "test" || (evidence.profileId === payment.profileId
      && evidence.catalogueVersion === payment.catalogueVersion
      && evidence.metadata?.touchlinePaymentMode === "live"
      && evidence.metadata?.touchlinePaymentAccountId === payment.accountId
      && evidence.metadata?.touchlinePaymentProfileId === payment.profileId
      && evidence.metadata?.touchlineCatalogueVersion === payment.catalogueVersion))
    && evidence.mode === "payment" && evidence.status === "complete" && evidence.payment_status === "paid"
    && evidence.currency === "eur" && evidence.amount_total === amount && evidence.amount_subtotal === amount
    && evidence.total_details?.amount_tax === 0 && evidence.total_details?.amount_discount === 0
    && evidence.total_details?.amount_shipping === 0 && evidence.client_reference_id === order.userId
    && evidence.metadata?.touchlineOrderId === order.id && evidence.metadata?.touchlineSeasonId === order.seasonId
    && evidence.metadata?.touchlinePlan === order.plan
    && evidence.metadata?.touchlinePreviousPaidPlan === order.previousPaidPlan
    && evidence.lines.has_more === false && evidence.lines.data.length === 1
    && item?.quantity === 1 && Boolean(priceMatches);
}
