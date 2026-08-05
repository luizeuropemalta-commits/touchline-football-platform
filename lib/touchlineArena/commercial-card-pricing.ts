import {
  PLAYER_MARKET_TIER_POLICY_VERSION,
  PLAYER_MARKET_TIERS,
  type PlayerMarketTierId,
} from "./player-market-tiers.ts";
import {
  resolveTouchlineVerifiedPlayerEconomy,
  type TouchlineMarketValueSource,
} from "./card-rules.ts";
import {
  touchlineCommercialCurrencyForCompetition,
  type TouchlineCommercialCompetition,
  type TouchlineCommercialCurrency,
} from "./commercial-activation.ts";

const MINOR_UNITS_PER_MAJOR_UNIT = 100;

/**
 * `2026-07-tc-v2` is the retired source table that preceded the approved
 * 0/1/2/4/7/10/15 policy. Active inventory rows may still carry that source
 * marker while their immutable tier key is valid. For those owned cards we
 * deliberately render the current canonical nominal value; the old numeric
 * table is never surfaced again. Any other unknown version remains blocked.
 */
const ACCEPTED_CONTRACTED_CARD_PRICE_TABLE_VERSIONS = new Set([
  PLAYER_MARKET_TIER_POLICY_VERSION,
  "2026-07-tc-v2",
]);

export function isTouchlineAcceptedContractedCardPriceTableVersion(
  priceTableVersion: string | null | undefined,
) {
  return Boolean(priceTableVersion && ACCEPTED_CONTRACTED_CARD_PRICE_TABLE_VERSIONS.has(priceTableVersion));
}

const COMMERCIAL_CURRENCY_SYMBOLS: Record<TouchlineCommercialCurrency, string> = {
  GBP: "£",
  EUR: "€",
  BRL: "R$",
};

export type TouchlineCommercialCardPrice = Readonly<{
  tierKey: PlayerMarketTierId;
  numericPrice: number;
  currency: TouchlineCommercialCurrency;
  amountMinor: number;
}>;

/**
 * Resolves the approved tier number as the nominal commercial card price for
 * one competition. The number never changes by competition or user country;
 * only the official competition currency changes. This is not a TC conversion
 * and it does not calculate foreign exchange, tax, payment or wallet balance.
 */
export function resolveTouchlineCommercialCardPrice(input: {
  tierKey: PlayerMarketTierId;
  competition: TouchlineCommercialCompetition;
}): TouchlineCommercialCardPrice {
  const tier = PLAYER_MARKET_TIERS.find((candidate) => candidate.id === input.tierKey);
  if (!tier || !Number.isSafeInteger(tier.touchCreditPrice) || tier.touchCreditPrice < 0) {
    throw new Error(`Missing valid nominal tier price: ${input.tierKey}`);
  }
  const currency = touchlineCommercialCurrencyForCompetition(input.competition);
  return {
    tierKey: tier.id,
    numericPrice: tier.touchCreditPrice,
    currency,
    amountMinor: tier.touchCreditPrice * MINOR_UNITS_PER_MAJOR_UNIT,
  };
}

/** Canonical product display, deliberately independent from user residence. */
export function formatTouchlineCommercialCardPrice(price: TouchlineCommercialCardPrice) {
  return `${COMMERCIAL_CURRENCY_SYMBOLS[price.currency]}${price.numericPrice}`;
}

/**
 * Public card-price boundary. A visual fallback frame or an old card tier is
 * never enough to expose a nominal commercial price. The price can be shown
 * only when the player economy has a provider-verified market value (or its
 * verified cache); otherwise the UI must remain explicit about the pending
 * verification instead of presenting the approved zero tier as a real offer.
 */
export function formatTouchlineVerifiedCommercialCardPrice(input: {
  marketValue: number | string | null | undefined;
  marketValueSource?: TouchlineMarketValueSource | null;
  competition: TouchlineCommercialCompetition;
  locale?: "pt-BR" | "en" | string;
}) {
  const economy = resolveTouchlineVerifiedPlayerEconomy({
    marketValue: input.marketValue,
    marketValueSource: input.marketValueSource,
  });
  if (economy.status !== "resolved") {
    return input.locale === "pt-BR" ? "Pendente" : "Pending";
  }
  return formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
    tierKey: economy.tierKey,
    competition: input.competition,
  }));
}

/**
 * Resolves the nominal price recorded on an already-contracted card. This is
 * intentionally a different trust boundary from the public Market: an active
 * inventory/contract pair already carries its approved tier and price-table
 * version, so it must not be hidden merely because the live football-value
 * cache is awaiting a refresh. Unknown or stale price tables fail closed.
 */
export function resolveTouchlineContractedCommercialCardPrice(input: {
  tierKey: PlayerMarketTierId | null | undefined;
  priceTableVersion: string | null | undefined;
  competition: TouchlineCommercialCompetition;
}) {
  if (
    !input.tierKey
    || !PLAYER_MARKET_TIERS.some((tier) => tier.id === input.tierKey)
    || !isTouchlineAcceptedContractedCardPriceTableVersion(input.priceTableVersion)
  ) {
    return null;
  }

  return resolveTouchlineCommercialCardPrice({
    tierKey: input.tierKey,
    competition: input.competition,
  });
}

/**
 * User-facing counterpart to the contracted-card resolver. It is used only
 * when the roster mapper has proved ownership from an active server contract.
 */
export function formatTouchlineContractedCommercialCardPrice(input: {
  tierKey: PlayerMarketTierId | null | undefined;
  priceTableVersion: string | null | undefined;
  competition: TouchlineCommercialCompetition;
  locale?: "pt-BR" | "en" | string | null;
}) {
  const price = resolveTouchlineContractedCommercialCardPrice(input);
  return price
    ? formatTouchlineCommercialCardPrice(price)
    : input.locale === "pt-BR" ? "Pendente" : "Pending";
}

/**
 * Formats an aggregate of approved nominal card prices for one competition.
 * This deliberately accepts only whole tier-number totals: it is presentation
 * for card assets, never a wallet conversion, exchange calculation or charge.
 */
export function formatTouchlineCommercialCardTotal(input: {
  numericPrice: number;
  competition: TouchlineCommercialCompetition;
}) {
  if (!Number.isSafeInteger(input.numericPrice) || input.numericPrice < 0) {
    throw new Error("Missing valid nominal card total");
  }
  return `${COMMERCIAL_CURRENCY_SYMBOLS[touchlineCommercialCurrencyForCompetition(input.competition)]}${input.numericPrice}`;
}
