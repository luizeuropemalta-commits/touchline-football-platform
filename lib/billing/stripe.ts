import Stripe from "stripe";
import type { BillingInterval, PlanKey } from "./plans";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  stripeClient ??= new Stripe(secretKey, { appInfo: { name: "Touchline", version: "1.0.0" } });
  return stripeClient;
}

const priceEnvironmentKeys: Record<PlanKey, Partial<Record<BillingInterval, string>>> = {
  starter_agent: { month: "STRIPE_PRICE_STARTER_AGENT_MONTHLY", year: "STRIPE_PRICE_STARTER_AGENT_YEARLY" },
  pro_agent: { month: "STRIPE_PRICE_PRO_AGENT_MONTHLY", year: "STRIPE_PRICE_PRO_AGENT_YEARLY" },
  elite_agency: { month: "STRIPE_PRICE_ELITE_AGENCY_MONTHLY", year: "STRIPE_PRICE_ELITE_AGENCY_YEARLY" },
  club_basic: { month: "STRIPE_PRICE_CLUB_BASIC_MONTHLY", year: "STRIPE_PRICE_CLUB_BASIC_YEARLY" },
  club_pro: { month: "STRIPE_PRICE_CLUB_PRO_MONTHLY", year: "STRIPE_PRICE_CLUB_PRO_YEARLY" },
  club_elite: { month: "STRIPE_PRICE_CLUB_ELITE_MONTHLY", year: "STRIPE_PRICE_CLUB_ELITE_YEARLY" },
  academy: { month: "STRIPE_PRICE_ACADEMY_MONTHLY", year: "STRIPE_PRICE_ACADEMY_YEARLY" },
  founder: { year: "STRIPE_PRICE_FOUNDER_YEARLY" },
};

export function getPriceId(planKey: PlanKey, interval: BillingInterval) {
  const environmentKey = priceEnvironmentKeys[planKey][interval];
  return environmentKey ? process.env[environmentKey] : undefined;
}

export function resolvePlanFromPrice(priceId: string) {
  for (const [planKey, intervals] of Object.entries(priceEnvironmentKeys) as Array<[PlanKey, Partial<Record<BillingInterval, string>>]>) {
    for (const [interval, environmentKey] of Object.entries(intervals) as Array<[BillingInterval, string]>) {
      if (process.env[environmentKey] === priceId) return { planKey, interval };
    }
  }
  return null;
}

export function getAppUrl(requestOrigin?: string) {
  return (process.env.NEXT_PUBLIC_APP_URL || requestOrigin || "http://localhost:3000").replace(/\/$/, "");
}

