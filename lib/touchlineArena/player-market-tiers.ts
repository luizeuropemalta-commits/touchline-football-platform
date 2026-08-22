import {
  touchlineCardTierName,
  type TouchlineCardTierKey,
} from "./card-tier-names.ts";

/**
 * Approved initial Premier League economy for TouchLine player cards.
 *
 * This module intentionally owns only player market-value classification. It
 * must not be used to rank players or classify coach cards.
 */
export const PLAYER_MARKET_TIER_POLICY_VERSION = "2026-07-premier-v1" as const;

export type PlayerMarketTierConfig = Readonly<{
  id: TouchlineCardTierKey;
  borderName: string;
  minMarketValue: number;
  maxMarketValue: number | null;
  /**
   * Legacy compatibility name. The approved number is the nominal GBP card
   * price; it is not a wallet balance, conversion rate or launch payable
   * amount. New persistence uses `calculated_nominal_price_gbp`.
   */
  touchCreditPrice: number;
  isFree: boolean;
}>;

/**
 * Single source of truth for the approved player market-value bands.
 * Ordered from the lowest to the highest economic category.
 */
export const PLAYER_MARKET_TIERS = [
  {
    id: "ruby-red",
    borderName: touchlineCardTierName("ruby-red"),
    minMarketValue: 0,
    maxMarketValue: 5_999_999,
    touchCreditPrice: 0,
    isFree: true,
  },
  {
    id: "sapphire-blue",
    borderName: touchlineCardTierName("sapphire-blue"),
    minMarketValue: 6_000_000,
    maxMarketValue: 9_999_999,
    touchCreditPrice: 1,
    isFree: false,
  },
  {
    id: "amethyst-purple",
    borderName: touchlineCardTierName("amethyst-purple"),
    minMarketValue: 10_000_000,
    maxMarketValue: 19_999_999,
    touchCreditPrice: 2,
    isFree: false,
  },
  {
    id: "radiant-gold",
    borderName: touchlineCardTierName("radiant-gold"),
    minMarketValue: 20_000_000,
    maxMarketValue: 34_999_999,
    touchCreditPrice: 4,
    isFree: false,
  },
  {
    id: "emerald-green",
    borderName: touchlineCardTierName("emerald-green"),
    minMarketValue: 35_000_000,
    maxMarketValue: 49_999_999,
    touchCreditPrice: 7,
    isFree: false,
  },
  {
    id: "clear-diamond",
    borderName: touchlineCardTierName("clear-diamond"),
    minMarketValue: 50_000_000,
    maxMarketValue: 69_999_999,
    touchCreditPrice: 10,
    isFree: false,
  },
  {
    id: "diamond-gold",
    borderName: touchlineCardTierName("diamond-gold"),
    minMarketValue: 70_000_000,
    maxMarketValue: null,
    touchCreditPrice: 15,
    isFree: false,
  },
] as const satisfies readonly PlayerMarketTierConfig[];

export type PlayerMarketTier = (typeof PLAYER_MARKET_TIERS)[number];
export type PlayerMarketTierId = PlayerMarketTier["id"];

export type PlayerMarketTierUnavailableReason =
  | "missing-market-value"
  | "non-finite-market-value"
  | "negative-market-value"
  | "unclassified-market-value";

export type PlayerMarketTierResolution =
  | Readonly<{
      status: "resolved";
      marketValueEur: number;
      tier: PlayerMarketTier;
      tierIndex: number;
    }>
  | Readonly<{
      status: "unavailable";
      marketValueEur: null;
      reason: PlayerMarketTierUnavailableReason;
    }>;

export type PlayerMarketTierMovement = "up" | "down" | "same" | "unavailable";

export type PlayerMarketTierChange = Readonly<{
  previous: PlayerMarketTierResolution;
  current: PlayerMarketTierResolution;
  movement: PlayerMarketTierMovement;
  tierChanged: boolean;
  marketValueChangeEur: number | null;
  touchCreditPriceChange: number | null;
}>;

/**
 * Resolves one authoritative EUR market value without coercing missing or bad
 * provider data into the free category. A real numeric zero is valid Ruby Red.
 */
export function resolvePlayerMarketTier(
  marketValueEur: number | null | undefined,
): PlayerMarketTierResolution {
  if (marketValueEur === null || marketValueEur === undefined) {
    return {
      status: "unavailable",
      marketValueEur: null,
      reason: "missing-market-value",
    };
  }

  if (!Number.isFinite(marketValueEur)) {
    return {
      status: "unavailable",
      marketValueEur: null,
      reason: "non-finite-market-value",
    };
  }

  if (marketValueEur < 0) {
    return {
      status: "unavailable",
      marketValueEur: null,
      reason: "negative-market-value",
    };
  }

  const tierIndex = PLAYER_MARKET_TIERS.findIndex((tier, index) => {
    const nextTier = PLAYER_MARKET_TIERS[index + 1];

    // The approved maximums are whole-euro display boundaries. Using the next
    // minimum as the exclusive runtime boundary also classifies provider values
    // with cents, such as €5,999,999.99, without gaps or overlap.
    return marketValueEur >= tier.minMarketValue
      && (nextTier === undefined || marketValueEur < nextTier.minMarketValue);
  });

  // The approved bands cover every finite, non-negative value. Retaining an
  // explicit unavailable fallback keeps the resolver fail-closed if a future
  // administrative edit accidentally introduces a gap.
  if (tierIndex < 0) {
    return {
      status: "unavailable",
      marketValueEur: null,
      reason: "unclassified-market-value",
    };
  }

  return {
    status: "resolved",
    marketValueEur,
    tier: PLAYER_MARKET_TIERS[tierIndex],
    tierIndex,
  };
}

/**
 * Compares two authoritative EUR values using the economic order in
 * PLAYER_MARKET_TIERS. Missing or invalid input produces an unavailable
 * movement instead of manufacturing a promotion or relegation.
 */
export function resolvePlayerMarketTierChange(
  previousMarketValueEur: number | null | undefined,
  currentMarketValueEur: number | null | undefined,
): PlayerMarketTierChange {
  const previous = resolvePlayerMarketTier(previousMarketValueEur);
  const current = resolvePlayerMarketTier(currentMarketValueEur);

  if (previous.status === "unavailable" || current.status === "unavailable") {
    return {
      previous,
      current,
      movement: "unavailable",
      tierChanged: false,
      marketValueChangeEur: null,
      touchCreditPriceChange: null,
    };
  }

  const tierIndexChange = current.tierIndex - previous.tierIndex;

  return {
    previous,
    current,
    movement: tierIndexChange > 0 ? "up" : tierIndexChange < 0 ? "down" : "same",
    tierChanged: tierIndexChange !== 0,
    marketValueChangeEur: current.marketValueEur - previous.marketValueEur,
    touchCreditPriceChange:
      current.tier.touchCreditPrice - previous.tier.touchCreditPrice,
  };
}

export function formatPlayerMarketValueEur(
  marketValueEur: number,
  locale: string = "en",
) {
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(marketValueEur);
}

export function formatPlayerMarketTierRange(
  tier: PlayerMarketTier,
  locale: string = "en",
) {
  const minimum = formatPlayerMarketValueEur(tier.minMarketValue, locale);
  if (tier.maxMarketValue === null) return `${minimum}+`;
  return `${minimum} – ${formatPlayerMarketValueEur(tier.maxMarketValue, locale)}`;
}
