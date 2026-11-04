import "server-only";
import Stripe from "stripe";
import { approvedClubSeasonLiveTarget } from "./club-season-configuration.server.ts";

let stripeClient: Stripe | null = null;
let clientKey: string | undefined;

/** Mode fence for the existing neutral invoice/finance integration. No Live
 * capability is inferred from possession of a generic secret. */
export function configuredStripeMode(env: Readonly<Record<string, string | undefined>> = process.env): "test" | "live" | null {
  const key = env.STRIPE_SECRET_KEY;
  if (key?.startsWith("sk_test_") && key.length > 8) {
    return env.TOUCHLINE_STRIPE_MODE === undefined || env.TOUCHLINE_STRIPE_MODE === "test" ? "test" : null;
  }
  if (!key?.startsWith("sk_live_") || key.length <= 8 || !approvedClubSeasonLiveTarget(env)
    || env.TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED !== "true") return null;
  return "live";
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !configuredStripeMode()) return null;
  if (!stripeClient || clientKey !== secretKey) {
    stripeClient = new Stripe(secretKey, { appInfo: { name: "Touchline", version: "1.0.0" } });
    clientKey = secretKey;
  }
  return stripeClient;
}
