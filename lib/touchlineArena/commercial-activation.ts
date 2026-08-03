/**
 * Pure V2.10.1 commercial-domain contract.
 *
 * This module deliberately has no database, Stripe, wallet or UI dependency.
 * It models approved entitlement rules before a future server-owned persistence
 * layer is designed. It must not be interpreted as payment implementation.
 */

export const TOUCHLINE_COMMERCIAL_COMPETITIONS = {
  england: { currency: "GBP", launchEnabled: true },
  europe: { currency: "EUR", launchEnabled: false },
  brazil: { currency: "BRL", launchEnabled: false },
} as const;

export type TouchlineCommercialCompetition = keyof typeof TOUCHLINE_COMMERCIAL_COMPETITIONS;
export type TouchlineCommercialCurrency = typeof TOUCHLINE_COMMERCIAL_COMPETITIONS[TouchlineCommercialCompetition]["currency"];

export type TouchlineCompetitionClubStatus =
  | "ACTIVE"
  | "PAYMENT_PAST_DUE"
  | "INACTIVE_MAINTENANCE"
  | "REACTIVATED";

export type TouchlineCompetitionClubEntitlement = {
  competition: TouchlineCommercialCompetition;
  status: TouchlineCompetitionClubStatus;
  nextEligibleRoundAt: string | null;
};

export type TouchlineCommercialParticipation = {
  allowed: boolean;
  reason:
    | "competition-not-launched"
    | "maintenance-inactive"
    | "next-round-not-reached"
    | "eligible";
};

export function touchlineCommercialCurrencyForCompetition(
  competition: TouchlineCommercialCompetition,
): TouchlineCommercialCurrency {
  return TOUCHLINE_COMMERCIAL_COMPETITIONS[competition].currency;
}

export function isTouchlineCommercialOperationInScope(input: {
  competition: TouchlineCommercialCompetition;
  currency: TouchlineCommercialCurrency;
}) {
  const definition = TOUCHLINE_COMMERCIAL_COMPETITIONS[input.competition];
  return definition.launchEnabled && definition.currency === input.currency;
}

function validTimestamp(value: string | null) {
  return value !== null && Number.isFinite(Date.parse(value));
}

/**
 * A reactivated club may return only at the recorded future round boundary.
 * An active club with no future boundary is eligible immediately. This rule
 * never changes a card contract; it only answers sporting eligibility.
 */
export function resolveTouchlineCommercialParticipation(
  entitlement: TouchlineCompetitionClubEntitlement,
  at: string | Date = new Date(),
): TouchlineCommercialParticipation {
  const definition = TOUCHLINE_COMMERCIAL_COMPETITIONS[entitlement.competition];
  if (!definition.launchEnabled) return { allowed: false, reason: "competition-not-launched" };
  if (entitlement.status === "PAYMENT_PAST_DUE" || entitlement.status === "INACTIVE_MAINTENANCE") {
    return { allowed: false, reason: "maintenance-inactive" };
  }
  const nextEligibleRoundAt = entitlement.nextEligibleRoundAt;
  if (nextEligibleRoundAt
    && Number.isFinite(Date.parse(nextEligibleRoundAt))
    && new Date(at).getTime() < Date.parse(nextEligibleRoundAt)) {
    return { allowed: false, reason: "next-round-not-reached" };
  }
  return { allowed: true, reason: "eligible" };
}

/**
 * Provides the idempotent state portion of reactivation. Callers must persist
 * the result through a future server transaction that also records the audit
 * event; this function has no payment or contract side effect.
 */
export function planTouchlineCompetitionReactivation(input: {
  entitlement: TouchlineCompetitionClubEntitlement;
  nextEligibleRoundAt: string;
}): TouchlineCompetitionClubEntitlement {
  if (!validTimestamp(input.nextEligibleRoundAt)) {
    throw new Error("A valid next eligible round timestamp is required for reactivation.");
  }
  if (input.entitlement.status === "REACTIVATED"
    && input.entitlement.nextEligibleRoundAt === input.nextEligibleRoundAt) {
    return input.entitlement;
  }
  return {
    ...input.entitlement,
    status: "REACTIVATED",
    nextEligibleRoundAt: input.nextEligibleRoundAt,
  };
}

export function canTouchlineCompetitionClubEnterSportingActivity(
  entitlement: TouchlineCompetitionClubEntitlement,
  at?: string | Date,
) {
  return resolveTouchlineCommercialParticipation(entitlement, at).allowed;
}
