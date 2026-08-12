import {
  planTouchlineTwentyClubRosterReconciliation,
  type TouchlineCanonicalRosterExport,
} from "../football-data/twenty-club-roster-reconciliation.ts";

export type TouchlineNewPlayerMarketValueAlert = Readonly<{
  alertKey: string;
  status: "MARKET_VALUE_REQUIRED";
  canonicalPlayerId: string;
  canonicalClubId: string;
  canonicalMembershipId: string;
  providerPlayerId: string;
  providerTeamId: string;
  detectedAt: string;
  reason: "NEW_CANONICAL_PLAYER" | "TRANSFER_REVIEW" | "UNMATCHED_CANONICAL_PLAYER";
  applicationEligible: false;
}>;

export type TouchlineNewPlayerMarketValueAlertPlan = Readonly<{
  status: "blocked" | "review-required";
  alerts: readonly TouchlineNewPlayerMarketValueAlert[];
  duplicateAlertKeys: readonly string[];
  issues: readonly string[];
}>;

function alertKey(playerId: string, membershipId: string) {
  return `market-value-required:${playerId}:${membershipId}`;
}

type AlertCandidate = Readonly<{
  canonicalPlayerId: string;
  canonicalClubId: string;
  canonicalMembershipId: string | null;
  providerPlayerId: string;
  providerTeamId: string | null;
  reason: TouchlineNewPlayerMarketValueAlert["reason"];
}>;

/**
 * Pure deduplicated review queue. It builds on the strict 20-club roster
 * reconciler and never assigns a value, tier or price to a detected player.
 */
export function planTouchlineNewPlayerMarketValueAlerts(input: Readonly<{
  canonicalBaseline: TouchlineCanonicalRosterExport;
  incomingProviderSnapshot: TouchlineCanonicalRosterExport;
  publishedCardPlayerIds: readonly string[];
  unresolvedAlertKeys: readonly string[];
}>): TouchlineNewPlayerMarketValueAlertPlan {
  const reconciliation = planTouchlineTwentyClubRosterReconciliation({
    canonicalBaseline: input.canonicalBaseline,
    incomingProviderSnapshot: input.incomingProviderSnapshot,
  });
  if (reconciliation.status === "blocked") {
    return Object.freeze({
      status: "blocked",
      alerts: Object.freeze([]),
      duplicateAlertKeys: Object.freeze([]),
      issues: Object.freeze(reconciliation.issues.map((entry) => `${entry.code}:${entry.detail}`)),
    });
  }

  const published = new Set(input.publishedCardPlayerIds);
  const unresolved = new Set(input.unresolvedAlertKeys);
  const duplicateAlertKeys: string[] = [];
  const alerts: TouchlineNewPlayerMarketValueAlert[] = [];
  const detectedAt = input.incomingProviderSnapshot.exportedAt;
  const candidates: AlertCandidate[] = [
    ...reconciliation.operations.flatMap<AlertCandidate>((operation) => {
      if (operation.kind === "ADD_REVIEW_REQUIRED") return [{
        canonicalPlayerId: operation.canonicalPlayerId,
        canonicalClubId: "",
        canonicalMembershipId: operation.incomingMembershipId,
        providerPlayerId: operation.providerPlayerId,
        providerTeamId: operation.incomingClubProviderTeamId,
        reason: "NEW_CANONICAL_PLAYER" as const,
      }];
      if (operation.kind === "TRANSFER_REVIEW_REQUIRED") return [{
        canonicalPlayerId: operation.canonicalPlayerId,
        canonicalClubId: "",
        canonicalMembershipId: operation.incomingMembershipId,
        providerPlayerId: operation.providerPlayerId,
        providerTeamId: operation.incomingClubProviderTeamId,
        reason: "TRANSFER_REVIEW" as const,
      }];
      return [];
    }),
    ...reconciliation.quarantined.map<AlertCandidate>((entry) => ({
      canonicalPlayerId: entry.canonicalPlayerId,
      canonicalClubId: entry.canonicalClubId,
      canonicalMembershipId: entry.canonicalMembershipId,
      providerPlayerId: entry.providerPlayerId,
      providerTeamId: entry.providerTeamId,
      reason: "UNMATCHED_CANONICAL_PLAYER" as const,
    })),
  ];

  for (const candidate of candidates) {
    if (!candidate.canonicalMembershipId || !candidate.providerTeamId || published.has(candidate.canonicalPlayerId)) continue;
    const key = alertKey(candidate.canonicalPlayerId, candidate.canonicalMembershipId);
    if (unresolved.has(key)) {
      duplicateAlertKeys.push(key);
      continue;
    }
    alerts.push(Object.freeze({
      alertKey: key,
      status: "MARKET_VALUE_REQUIRED",
      canonicalPlayerId: candidate.canonicalPlayerId,
      canonicalClubId: candidate.canonicalClubId,
      canonicalMembershipId: candidate.canonicalMembershipId,
      providerPlayerId: candidate.providerPlayerId,
      providerTeamId: candidate.providerTeamId,
      detectedAt,
      reason: candidate.reason,
      applicationEligible: false,
    }));
  }

  return Object.freeze({
    status: "review-required",
    alerts: Object.freeze(alerts),
    duplicateAlertKeys: Object.freeze(duplicateAlertKeys),
    issues: Object.freeze([]),
  });
}
