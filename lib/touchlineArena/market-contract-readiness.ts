import type { TouchlineCardTierKey } from "./card-rules.ts";
import type { TouchlinePublicProjectionStatus } from "./public-player-projection.ts";
import { resolvePlayerMarketTier } from "./player-market-tiers.ts";

/**
 * Joins the two deliberately separate Market authorities without turning a
 * transaction price into a player classification rule:
 *
 * - the public projection owns a verified market value, tier and nominal TC
 *   price for the current season;
 * - the inventory owns the immutable product id, availability and the TC
 *   amount that checkout will actually debit.
 *
 * A valid promotion may make the transaction price differ from the nominal
 * tier price. That is not a pending market value and must not make a verified
 * player unselectable. Checkout remains inventory/RPC-authoritative.
 */

export type TouchlineMarketContractReadinessInput = Readonly<{
  marketValueState?: TouchlinePublicProjectionStatus | null;
  classificationState?: TouchlinePublicProjectionStatus | null;
  marketValueEur?: number | null;
  marketValueUpdatedAt?: string | null;
  canonicalTierKey?: TouchlineCardTierKey | null;
  inventoryId?: string | null;
  inventoryTierKey?: TouchlineCardTierKey | null;
  transactionPriceTc?: number | null;
  transactionPriceTableVersion?: string | null;
}>;

export type TouchlineMarketContractReadiness =
  | Readonly<{
      status: "contract-ready";
      nominalTierKey: TouchlineCardTierKey;
      nominalPriceTc: number;
      transactionPriceTc: number;
      transactionPriceTableVersion: string;
    }>
  | Readonly<{
      status: "pending-value";
      reason: "market-value-pending" | "classification-pending";
    }>
  | Readonly<{
      status: "unavailable-value";
      reason:
        | "market-value-unavailable"
        | "market-value-error"
        | "classification-unavailable"
        | "classification-error"
        | "canonical-value-invalid";
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "canonical-tier-mismatch"
        | "inventory-missing"
        | "inventory-tier-mismatch"
        | "inventory-price-invalid"
        | "inventory-price-table-invalid";
    }>;

function validIsoTimestamp(value: string | null | undefined) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function nonNegativeInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Resolves whether a displayed public player can be added to the Market cart.
 * It is intentionally name- and URL-free: provider/club matching happens at
 * the server-derived inventory read-model boundary before this function runs.
 */
export function resolveTouchlineMarketContractReadiness(
  input: TouchlineMarketContractReadinessInput,
): TouchlineMarketContractReadiness {
  if (input.marketValueState === "pending") {
    return { status: "pending-value", reason: "market-value-pending" };
  }
  if (input.classificationState === "pending") {
    return { status: "pending-value", reason: "classification-pending" };
  }
  if (input.marketValueState === "error") {
    return { status: "unavailable-value", reason: "market-value-error" };
  }
  if (input.classificationState === "error") {
    return { status: "unavailable-value", reason: "classification-error" };
  }
  if (input.marketValueState !== "verified") {
    return { status: "unavailable-value", reason: "market-value-unavailable" };
  }
  if (input.classificationState !== "verified") {
    return { status: "unavailable-value", reason: "classification-unavailable" };
  }
  if (!nonNegativeInteger(input.marketValueEur) || !validIsoTimestamp(input.marketValueUpdatedAt)) {
    return { status: "unavailable-value", reason: "canonical-value-invalid" };
  }

  const nominal = resolvePlayerMarketTier(input.marketValueEur);
  if (nominal.status !== "resolved") {
    return { status: "unavailable-value", reason: "canonical-value-invalid" };
  }
  if (input.canonicalTierKey !== nominal.tier.id) {
    return { status: "blocked", reason: "canonical-tier-mismatch" };
  }
  if (!input.inventoryId?.trim()) {
    return { status: "blocked", reason: "inventory-missing" };
  }
  if (input.inventoryTierKey !== nominal.tier.id) {
    return { status: "blocked", reason: "inventory-tier-mismatch" };
  }
  if (!nonNegativeInteger(input.transactionPriceTc)) {
    return { status: "blocked", reason: "inventory-price-invalid" };
  }
  const transactionPriceTableVersion = input.transactionPriceTableVersion?.trim();
  if (!transactionPriceTableVersion) {
    return { status: "blocked", reason: "inventory-price-table-invalid" };
  }

  return {
    status: "contract-ready",
    nominalTierKey: nominal.tier.id,
    nominalPriceTc: nominal.tier.touchCreditPrice,
    transactionPriceTc: input.transactionPriceTc,
    transactionPriceTableVersion,
  };
}
