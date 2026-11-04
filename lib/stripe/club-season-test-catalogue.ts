import {
  CLUB_SEASON_AMOUNTS, clubSeasonChargeMinor, isClubSeasonPaidPlan,
  matchesClubSeasonPaymentEvidence, matchesClubSeasonProviderPrice, paymentForClubSeasonPlan,
  validClubSeasonPaymentOrder, type ClubSeasonOrder, type ClubSeasonPaymentProfile,
  type ClubSeasonPaidPlan, type ClubSeasonPaymentEvidence, type ClubSeasonProviderPrice,
} from "./club-season-payment-contract.ts";

export { clubSeasonChargeMinor, isClubSeasonPaidPlan };
export type { ClubSeasonPaidPlan, ClubSeasonPaymentEvidence };
/** Verified sandbox references remain unchanged. Never credentials. */
export const CLUB_SEASON_TEST_ACCOUNT = "acct_1Tl6XQH0T0OdBC6s";
export const CLUB_SEASON_TEST_CATALOGUE = {
  standard: { amountMinor: CLUB_SEASON_AMOUNTS.standard, productId: "prod_VWfOj7xUoHtTzf", priceId: "price_1UVc3eH0T0OdBC6sejXIyxSA" },
  master: { amountMinor: CLUB_SEASON_AMOUNTS.master, productId: "prod_VWfPhe2OKyhU2B", priceId: "price_1UVc4rH0T0OdBC6sTZadG7qv" },
  vip: { amountMinor: CLUB_SEASON_AMOUNTS.vip, productId: "prod_VWfRYf4MYKPBLM", priceId: "price_1UVc6EH0T0OdBC6sXm0WRqIz" },
} as const;
export const CLUB_SEASON_TEST_PROFILE: ClubSeasonPaymentProfile = {
  mode: "test", accountId: CLUB_SEASON_TEST_ACCOUNT, profileId: "club-season-test-v1",
  catalogueVersion: "test-20261028", catalogue: CLUB_SEASON_TEST_CATALOGUE,
  returnOrigin: "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
};
export type ClubSeasonTestOrder = ClubSeasonOrder;
export function clubSeasonTestPayment(plan: ClubSeasonPaidPlan) {
  return paymentForClubSeasonPlan(CLUB_SEASON_TEST_PROFILE, plan);
}
export function validClubSeasonTestOrder(order: ClubSeasonTestOrder, now: number) {
  if (!isClubSeasonPaidPlan(order.plan)) return false;
  return validClubSeasonPaymentOrder({ ...order, payment: clubSeasonTestPayment(order.plan) }, now);
}
export function matchesClubSeasonTestPrice(plan: ClubSeasonPaidPlan, price: ClubSeasonProviderPrice) {
  return isClubSeasonPaidPlan(plan) && matchesClubSeasonProviderPrice(plan, price, clubSeasonTestPayment(plan));
}
/** Explicit TEST compatibility wrapper: Live evidence remains rejected. */
export function matchesClubSeasonPaidEvidence(order: ClubSeasonTestOrder,
  evidence: ClubSeasonPaymentEvidence, now = Date.now()): boolean {
  return isClubSeasonPaidPlan(order.plan)
    && matchesClubSeasonPaymentEvidence({ ...order, payment: clubSeasonTestPayment(order.plan) }, evidence, now);
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
