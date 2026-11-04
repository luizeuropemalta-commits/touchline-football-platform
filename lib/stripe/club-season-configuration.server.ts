import "server-only";
import { CLUB_SEASON_PROFILE_ID, CLUB_SEASON_CATALOGUE_VERSION, paymentForClubSeasonPlan, validClubSeasonReturnOrigin,
  type ClubSeasonPaymentMode, type ClubSeasonPaymentProfile } from "./club-season-payment-contract.ts";
import { CLUB_SEASON_TEST_ACCOUNT, CLUB_SEASON_TEST_CATALOGUE, CLUB_SEASON_TEST_PROFILE,
  resolveClubSeasonTestConfiguration } from "./club-season-test-catalogue.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export type ClubSeasonPaymentPurpose = "create" | "reconcile" | "status";
export type ClubSeasonProviderConfiguration = Readonly<{
  mode: ClubSeasonPaymentMode; accountId: string; secretKey: string; webhookSecret: string;
  /** Required for new creation; reconciliation reads the historical order snapshot. */
  profile?: ClubSeasonPaymentProfile;
}>;
type Result = { ok: true; config: ClubSeasonProviderConfiguration } | { ok: false; reason: string };
const unavailable = (reason: string): Result => ({ ok: false, reason });
const QA_DATABASE = "https://xgxbwqxjssxxuihuwmgy.supabase.co";

/** Shared deployment/account fence also protects neutral billing. This checks
 * only trusted server configuration; it never authorizes a request or a write. */
export function approvedClubSeasonLiveTarget(env: Environment): string | null {
  const database = env.TOUCHLINE_STRIPE_LIVE_SUPABASE_URL;
  const accountId = env.TOUCHLINE_STRIPE_LIVE_ACCOUNT_ID;
  if (env.TOUCHLINE_STRIPE_MODE !== "live" || env.VERCEL_ENV !== "production"
    || env.TOUCHLINE_CLUB_SEASON_LIVE_ENABLED !== "true"
    || !database || database === QA_DATABASE || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(database)
    || env.SUPABASE_URL !== database || env.NEXT_PUBLIC_SUPABASE_URL !== database
    || !accountId || !/^acct_[A-Za-z0-9]+$/.test(accountId) || accountId === CLUB_SEASON_TEST_ACCOUNT) return null;
  return accountId;
}

/** Server only. Never serialize/log this result. Preview cannot enter the Live
 * branch even with Live keys, profile values and every Live switch present. */
export function resolveClubSeasonPaymentConfiguration(purpose: ClubSeasonPaymentPurpose,
  env: Environment = process.env): Result {
  if (env.TOUCHLINE_STRIPE_MODE === "test") {
    // Preserve the operational TEST contract exactly: an absent new Live
    // reconciliation switch must not disable the existing TEST webhook.
    const test = resolveClubSeasonTestConfiguration(env);
    return test.ok ? { ok: true, config: { mode: "test", accountId: test.accountId,
      secretKey: test.secretKey, webhookSecret: test.webhookSecret, profile: CLUB_SEASON_TEST_PROFILE } }
      : unavailable(test.reason);
  }
  if (env.TOUCHLINE_STRIPE_MODE !== "live") return unavailable("mode-required");
  if (env.VERCEL_ENV !== "production") return unavailable("live-production-required");
  if (env.TOUCHLINE_CLUB_SEASON_LIVE_ENABLED !== "true") return unavailable("live-disabled");
  if (env.TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED !== "true"
    || (purpose === "create" && env.TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED !== "true")) return unavailable("capability-disabled");
  const accountId = approvedClubSeasonLiveTarget(env);
  if (!accountId) return unavailable("live-target-required");
  const secretKey = env.TOUCHLINE_STRIPE_LIVE_SECRET_KEY;
  const webhookSecret = env.TOUCHLINE_STRIPE_LIVE_CLUB_SEASON_WEBHOOK_SECRET;
  if (!secretKey?.startsWith("sk_live_") || secretKey.length <= 8) return unavailable("live-key-required");
  if (!webhookSecret?.startsWith("whsec_") || webhookSecret.length <= 6) return unavailable("webhook-secret-required");
  const config: ClubSeasonProviderConfiguration = { mode: "live", accountId, secretKey, webhookSecret };
  if (purpose !== "create") return { ok: true, config };

  const profileId = env.TOUCHLINE_STRIPE_LIVE_PROFILE_ID;
  const catalogueVersion = env.TOUCHLINE_STRIPE_LIVE_CATALOGUE_VERSION;
  const returnOrigin = env.TOUCHLINE_STRIPE_LIVE_RETURN_ORIGIN;
  if (!profileId || !CLUB_SEASON_PROFILE_ID.test(profileId) || !catalogueVersion
    || !CLUB_SEASON_CATALOGUE_VERSION.test(catalogueVersion)
    || !validClubSeasonReturnOrigin(returnOrigin) || returnOrigin === CLUB_SEASON_TEST_PROFILE.returnOrigin) {
    return unavailable("live-profile-required");
  }
  const catalogue = {} as Record<"standard" | "master" | "vip", { productId: string; priceId: string }>;
  for (const plan of ["standard", "master", "vip"] as const) {
    const productId = env[`TOUCHLINE_STRIPE_LIVE_${plan.toUpperCase()}_PRODUCT_ID`];
    const priceId = env[`TOUCHLINE_STRIPE_LIVE_${plan.toUpperCase()}_PRICE_ID`];
    if (!productId || !/^prod_[A-Za-z0-9]+$/.test(productId) || !priceId || !/^price_[A-Za-z0-9]+$/.test(priceId)
      || Object.values(CLUB_SEASON_TEST_CATALOGUE).some(item => item.productId === productId || item.priceId === priceId)) {
      return unavailable("live-catalogue-required");
    }
    catalogue[plan] = { productId, priceId };
  }
  if (new Set(Object.values(catalogue).map(item => item.productId)).size !== 3
    || new Set(Object.values(catalogue).map(item => item.priceId)).size !== 3) return unavailable("live-catalogue-required");
  const profile: ClubSeasonPaymentProfile = { mode: "live", accountId, profileId, catalogueVersion, returnOrigin, catalogue };
  for (const plan of ["standard", "master", "vip"] as const) paymentForClubSeasonPlan(profile, plan);
  return { ok: true, config: { ...config, profile } };
}
