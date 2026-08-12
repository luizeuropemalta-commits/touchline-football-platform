import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  touchlineArenaCompetitionTierForCard,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import {
  touchlineLaunchTestPayablePriceTc,
  type TouchlineLaunchTestCheckoutPolicy,
} from "./launch-test-season.ts";

export type TouchlineMarketCartCandidate = {
  id: string;
  cardTier?: TouchlineCardTierKey | null;
  authoritativeUnitPriceTc?: number | null;
  authoritativePriceTableVersion?: string | null;
  alreadyOwned?: boolean;
  availableCopies?: number;
};

export type TouchlineMarketCartErrorCode =
  | "empty-cart"
  | "duplicate-card"
  | "already-owned"
  | "sold-out"
  | "invalid-price"
  | "roster-capacity"
  | "insufficient-balance";

export type TouchlineMarketCartQuoteItem = {
  id: string;
  cardTier: TouchlineCardTierKey;
  /** The published card price. It is never rewritten for a test checkout. */
  referencePriceTc: number;
  unitPriceTc: number;
  priceTableVersion: string;
};

export type TouchlineMarketCartQuote = {
  valid: boolean;
  errorCode: TouchlineMarketCartErrorCode | null;
  items: TouchlineMarketCartQuoteItem[];
  itemCount: number;
  totalTc: number;
  balanceBeforeTc: number;
  balanceAfterTc: number;
  openSlotsBefore: number;
  openSlotsAfter: number;
  priceTableVersion: string;
  priceTableVersions: string[];
};

function nonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function authoritativePriceOrTierPrice(value: number | null | undefined, tierPrice: number) {
  if (value === null || value === undefined) return tierPrice;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function authoritativePriceTableVersion(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || TOUCHLINE_CARD_PRICE_TABLE_VERSION;
}

export function quoteTouchlineMarketCart({
  candidates,
  walletBalanceTc,
  openContractSlots,
  checkoutPolicy = null,
}: {
  candidates: readonly TouchlineMarketCartCandidate[];
  walletBalanceTc: number;
  openContractSlots: number;
  checkoutPolicy?: TouchlineLaunchTestCheckoutPolicy | null;
}): TouchlineMarketCartQuote {
  const balanceBeforeTc = nonNegativeInteger(walletBalanceTc);
  const openSlotsBefore = nonNegativeInteger(openContractSlots);
  const seenIds = new Set<string>();
  let errorCode: TouchlineMarketCartErrorCode | null = candidates.length ? null : "empty-cart";

  const items = candidates.map((candidate) => {
    const hasAuthoritativePrice = candidate.authoritativeUnitPriceTc !== null
      && candidate.authoritativeUnitPriceTc !== undefined;
    const hasAuthoritativeInventory = Boolean(candidate.authoritativePriceTableVersion?.trim());
    const tier = (hasAuthoritativeInventory ? touchlineArenaTierForKey(candidate.cardTier) : null)
      || touchlineArenaCompetitionTierForCard(candidate.cardTier);
    const id = candidate.id.trim();
    const referencePriceTc = authoritativePriceOrTierPrice(
      candidate.authoritativeUnitPriceTc,
      tier.retailPriceTc,
    );
    const unitPriceTc = referencePriceTc === null
      ? null
      : touchlineLaunchTestPayablePriceTc(referencePriceTc, checkoutPolicy);

    if (!errorCode && seenIds.has(id)) errorCode = "duplicate-card";
    seenIds.add(id);
    if (!errorCode && candidate.alreadyOwned) errorCode = "already-owned";
    if (!errorCode && nonNegativeInteger(candidate.availableCopies ?? 0) === 0) errorCode = "sold-out";
    if (!errorCode && hasAuthoritativePrice !== hasAuthoritativeInventory) errorCode = "invalid-price";
    if (!errorCode && unitPriceTc === null) errorCode = "invalid-price";

    return {
      id,
      cardTier: tier.key,
      referencePriceTc: referencePriceTc ?? 0,
      unitPriceTc: unitPriceTc ?? 0,
      priceTableVersion: authoritativePriceTableVersion(candidate.authoritativePriceTableVersion),
    };
  });

  const totalTc = items.reduce((total, item) => total + item.unitPriceTc, 0);
  const priceTableVersions = [...new Set(items.map((item) => item.priceTableVersion))];
  if (!errorCode && items.length > openSlotsBefore) errorCode = "roster-capacity";
  if (!errorCode && totalTc > balanceBeforeTc) errorCode = "insufficient-balance";

  return {
    valid: errorCode === null,
    errorCode,
    items,
    itemCount: items.length,
    totalTc,
    balanceBeforeTc,
    balanceAfterTc: balanceBeforeTc - totalTc,
    openSlotsBefore,
    openSlotsAfter: openSlotsBefore - items.length,
    priceTableVersion: priceTableVersions.length === 1
      ? priceTableVersions[0]
      : "mixed",
    priceTableVersions,
  };
}
