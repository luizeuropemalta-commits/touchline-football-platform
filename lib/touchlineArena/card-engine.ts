import {
  resolvePlayerMarketTier,
  type PlayerMarketTierId,
} from "./player-market-tiers.ts";

export type TouchlineCardClassification = Readonly<{
  tierKey: PlayerMarketTierId;
  nominalPrice: number;
  effectiveSeason: string;
  policyVersion: string;
  reason: "seasonal-classification" | "new-player-approved" | "active-season-frozen";
  availability: "available" | "pending";
}>;

/**
 * The permanent, provider-agnostic card authority. It receives only an
 * already-approved TouchLine value. An active classification always wins for
 * an existing player in the same season; a new approved player is classified
 * immediately. Consumers receive one value object, never recompute a border.
 */
export function resolveTouchlineCardClassification(input: {
  approvedMarketValueEur: number | null;
  effectiveSeason: string;
  policyVersion: string;
  existing?: Pick<TouchlineCardClassification, "tierKey" | "nominalPrice" | "effectiveSeason" | "policyVersion"> | null;
  isNewPlayer?: boolean;
}): TouchlineCardClassification | null {
  const existing = input.existing;
  if (existing && !input.isNewPlayer && existing.effectiveSeason === input.effectiveSeason) {
    return { ...existing, reason: "active-season-frozen", availability: "available" };
  }

  const resolved = resolvePlayerMarketTier(input.approvedMarketValueEur);
  if (resolved.status === "unavailable") return null;
  return {
    tierKey: resolved.tier.id,
    nominalPrice: resolved.tier.touchCreditPrice,
    effectiveSeason: input.effectiveSeason,
    policyVersion: input.policyVersion,
    reason: input.isNewPlayer ? "new-player-approved" : "seasonal-classification",
    availability: "available",
  };
}
