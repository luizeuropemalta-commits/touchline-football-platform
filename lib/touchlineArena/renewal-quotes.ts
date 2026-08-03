import {
  PLAYER_MARKET_TIERS,
  type PlayerMarketTier,
} from "./player-market-tiers.ts";
import {
  resolveTouchlineVerifiedPlayerEconomy,
  type TouchlineCardTierKey,
  type TouchlineMarketValueSource,
} from "./card-rules.ts";
import {
  canTouchlineContractRenew,
  resolveTouchlineSeasonPhase,
  type TouchlineContractLifecycleState,
  type TouchlineSeasonLifecycleSchedule,
} from "./season-lifecycle.ts";

export const TOUCHLINE_RENEWAL_QUOTE_STATUSES = [
  "READY",
  "NOT_ELIGIBLE",
  "MARKET_VALUE_PENDING",
  "OUTSIDE_RENEWAL_WINDOW",
] as const;

export type TouchlineRenewalQuoteStatus =
  typeof TOUCHLINE_RENEWAL_QUOTE_STATUSES[number];

/**
 * This is deliberately a server snapshot.  A client can request a renewal,
 * but cannot decide the identity, contract, eligibility, tier, market value
 * or price used by a quote.
 */
export type TouchlineServerRenewalQuoteInput = {
  now: string;
  lifecycleSchedule: TouchlineSeasonLifecycleSchedule;
  historicalContract: {
    contractId: string;
    playerId: string;
    closingSeasonId: string;
    lifecycleState: TouchlineContractLifecycleState;
    marketValueAtPurchaseEur: number | null;
    tierAtPurchase: TouchlineCardTierKey;
    pricePaidTc: number;
    priceTableVersion: string;
  };
  nextSeason: {
    id: string;
    startsAt: string;
    endsAt: string;
    playerIsEligible: boolean;
    ineligibilityReason?: string | null;
    verifiedMarketValue: number | string | null | undefined;
    marketValueSource: TouchlineMarketValueSource | null | undefined;
  };
};

export type TouchlineRenewalHistoricalSnapshot = {
  contractId: string;
  playerId: string;
  seasonId: string;
  marketValueEur: number | null;
  tierKey: TouchlineCardTierKey;
  pricePaidTc: number;
  priceTableVersion: string;
};

export type TouchlineRenewalOffer = {
  nextSeasonId: string;
  nextSeasonStartsAt: string;
  nextSeasonEndsAt: string;
  marketValueEur: number;
  tier: PlayerMarketTier;
  priceTc: number;
  marketValueSource: Exclude<TouchlineMarketValueSource, "unavailable">;
  tierDelta: number;
  priceDeltaTc: number;
};

export type TouchlineRenewalQuote = {
  status: TouchlineRenewalQuoteStatus;
  createdAt: string;
  expiresAt: string | null;
  historical: TouchlineRenewalHistoricalSnapshot;
  offer: TouchlineRenewalOffer | null;
  reason: string | null;
};

function requiredId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requiredTimestamp(value: string, label: string) {
  const normalized = value.trim();
  const timestamp = Date.parse(normalized);
  if (!normalized || Number.isNaN(timestamp)) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return { normalized, timestamp };
}

function tierIndex(tierKey: TouchlineCardTierKey) {
  const index = PLAYER_MARKET_TIERS.findIndex((tier) => tier.id === tierKey);
  if (index < 0) throw new Error("Historical contract has an unknown card tier.");
  return index;
}

function historicalSnapshot(
  contract: TouchlineServerRenewalQuoteInput["historicalContract"],
): TouchlineRenewalHistoricalSnapshot {
  const pricePaidTc = contract.pricePaidTc;
  if (!Number.isInteger(pricePaidTc) || pricePaidTc < 0) {
    throw new Error("Historical contract price must be a non-negative integer.");
  }
  if (
    contract.marketValueAtPurchaseEur !== null
    && (!Number.isFinite(contract.marketValueAtPurchaseEur) || contract.marketValueAtPurchaseEur < 0)
  ) {
    throw new Error("Historical market value must be non-negative when present.");
  }

  return {
    contractId: requiredId(contract.contractId, "Historical contract ID"),
    playerId: requiredId(contract.playerId, "Player ID"),
    seasonId: requiredId(contract.closingSeasonId, "Closing season ID"),
    marketValueEur: contract.marketValueAtPurchaseEur,
    tierKey: contract.tierAtPurchase,
    pricePaidTc,
    priceTableVersion: requiredId(contract.priceTableVersion, "Historical price table version"),
  };
}

/**
 * Creates an immutable, server-derived renewal quote.  It does not create a
 * contract, debit a wallet or reserve supply.  Those transactional effects
 * belong to the future server-side renewal checkout.
 */
export function createTouchlineRenewalQuote(
  input: TouchlineServerRenewalQuoteInput,
): TouchlineRenewalQuote {
  const historical = historicalSnapshot(input.historicalContract);
  const now = requiredTimestamp(input.now, "Current time");
  const nextSeasonId = requiredId(input.nextSeason.id, "Next season ID");
  const nextSeasonStartsAt = requiredTimestamp(input.nextSeason.startsAt, "Next season start");
  const nextSeasonEndsAt = requiredTimestamp(input.nextSeason.endsAt, "Next season end");
  if (nextSeasonEndsAt.timestamp < nextSeasonStartsAt.timestamp) {
    throw new Error("Next season end must not precede its start.");
  }

  const phase = resolveTouchlineSeasonPhase(input.lifecycleSchedule, now.normalized);
  const base = {
    createdAt: new Date(now.timestamp).toISOString(),
    historical,
  };

  if (phase !== "RENEWAL_WINDOW" || !canTouchlineContractRenew(input.historicalContract.lifecycleState)) {
    return {
      ...base,
      status: "OUTSIDE_RENEWAL_WINDOW",
      expiresAt: null,
      offer: null,
      reason: "Renewal is not currently available for this contract.",
    };
  }

  if (!input.nextSeason.playerIsEligible) {
    return {
      ...base,
      status: "NOT_ELIGIBLE",
      expiresAt: null,
      offer: null,
      reason: input.nextSeason.ineligibilityReason?.trim()
        || "Player is not eligible for the next TouchLine season.",
    };
  }

  const economy = resolveTouchlineVerifiedPlayerEconomy({
    marketValue: input.nextSeason.verifiedMarketValue,
    marketValueSource: input.nextSeason.marketValueSource,
  });
  if (economy.status !== "resolved" || economy.tier === null || economy.tierKey === null || economy.priceTc === null || economy.marketValueEur === null) {
    return {
      ...base,
      status: "MARKET_VALUE_PENDING",
      expiresAt: null,
      offer: null,
      reason: "Next-season official market value is not available yet.",
    };
  }

  const marketValueSource = input.nextSeason.marketValueSource;
  if (marketValueSource !== "provider" && marketValueSource !== "verified-cache") {
    throw new Error("Resolved renewal economy requires a verified market-value source.");
  }

  const quoteExpiresAt = requiredTimestamp(
    input.lifecycleSchedule.nextSeasonStartsAt,
    "Renewal window close",
  );
  if (quoteExpiresAt.timestamp <= now.timestamp) {
    throw new Error("A renewal quote cannot be created after the next season has started.");
  }

  return {
    ...base,
    status: "READY",
    expiresAt: new Date(quoteExpiresAt.timestamp).toISOString(),
    reason: null,
    offer: {
      nextSeasonId,
      nextSeasonStartsAt: new Date(nextSeasonStartsAt.timestamp).toISOString(),
      nextSeasonEndsAt: new Date(nextSeasonEndsAt.timestamp).toISOString(),
      marketValueEur: economy.marketValueEur,
      tier: economy.tier,
      priceTc: economy.priceTc,
      marketValueSource,
      tierDelta: tierIndex(economy.tierKey) - tierIndex(historical.tierKey),
      priceDeltaTc: economy.priceTc - historical.pricePaidTc,
    },
  };
}
