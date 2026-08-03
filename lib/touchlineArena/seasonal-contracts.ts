export const TOUCHLINE_COMPETITIVE_SEASON_RESET_AREAS = [
  "activeContracts",
  "squad",
  "startingXi",
  "bench",
  "reserveVault",
  "seasonTouchlinePoints",
  "seasonRankings",
  "roundPoints",
] as const;

export type TouchlineCompetitiveSeasonResetArea =
  typeof TOUCHLINE_COMPETITIVE_SEASON_RESET_AREAS[number];

export type TouchlineSeasonWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
};

export type TouchlineSeasonalContractTerm = {
  seasonId: string;
  contractedAt: string;
  expiresAt: string;
  expiresAtSeasonEnd: true;
};

export type TouchlineActiveSeasonalContract = {
  contractId: string;
  seasonId: string;
  status: "active" | "ended" | "reversed";
};

export type TouchlineSeasonResetPlan = {
  closingSeasonId: string;
  nextSeasonId: string;
  contractIdsToEnd: string[];
  resetAreas: readonly TouchlineCompetitiveSeasonResetArea[];
  historicalRecordsRetained: true;
};

function requireDate(value: string, label: string) {
  const normalized = value.trim();
  const timestamp = Date.parse(normalized);
  if (!normalized || Number.isNaN(timestamp)) {
    throw new Error(`${label} must be an ISO date or timestamp.`);
  }
  return new Date(timestamp);
}

function endOfUtcDay(value: Date) {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
}

function requireSeasonWindow(season: TouchlineSeasonWindow) {
  const id = season.id.trim();
  if (!id) throw new Error("A season ID is required.");
  const startsAt = requireDate(season.startsAt, "Season start");
  const endsAt = endOfUtcDay(requireDate(season.endsAt, "Season end"));
  if (endsAt < startsAt) throw new Error("Season end must not precede season start.");
  return { id, startsAt, endsAt };
}

/**
 * Creates a one-season term.  The end is a snapshot of the season boundary,
 * so later provider edits cannot rewrite a historical contract.
 */
export function createTouchlineSeasonalContractTerm(
  season: TouchlineSeasonWindow,
  contractedAt: string,
): TouchlineSeasonalContractTerm {
  const resolvedSeason = requireSeasonWindow(season);
  const startedAt = requireDate(contractedAt, "Contract start");
  if (startedAt < resolvedSeason.startsAt || startedAt > resolvedSeason.endsAt) {
    throw new Error("Contract start must fall within its season.");
  }

  return {
    seasonId: resolvedSeason.id,
    contractedAt: startedAt.toISOString(),
    expiresAt: resolvedSeason.endsAt.toISOString(),
    expiresAtSeasonEnd: true,
  };
}

export function isTouchlineSeasonalContractActive(
  term: TouchlineSeasonalContractTerm,
  now: string,
) {
  const current = requireDate(now, "Current time");
  const startedAt = requireDate(term.contractedAt, "Contract start");
  const expiresAt = requireDate(term.expiresAt, "Contract expiry");
  return current >= startedAt && current <= expiresAt;
}

/**
 * Plans a season reset without mutating data.  Only active contracts from the
 * closing season are ended; historical records, results and achievements stay
 * in place.  A database transaction will execute this plan only after the
 * local seasonal migration has been reviewed and applied intentionally.
 */
export function planTouchlineSeasonReset(input: {
  closingSeasonId: string;
  nextSeasonId: string;
  contracts: readonly TouchlineActiveSeasonalContract[];
}): TouchlineSeasonResetPlan {
  const closingSeasonId = input.closingSeasonId.trim();
  const nextSeasonId = input.nextSeasonId.trim();
  if (!closingSeasonId || !nextSeasonId || closingSeasonId === nextSeasonId) {
    throw new Error("Distinct closing and next season IDs are required.");
  }

  const seen = new Set<string>();
  const contractIdsToEnd = input.contracts.flatMap((contract) => {
    const contractId = contract.contractId.trim();
    if (!contractId || seen.has(contractId)) {
      throw new Error("Each contract ID must be present exactly once.");
    }
    seen.add(contractId);
    return contract.status === "active" && contract.seasonId.trim() === closingSeasonId
      ? [contractId]
      : [];
  });

  return {
    closingSeasonId,
    nextSeasonId,
    contractIdsToEnd,
    resetAreas: TOUCHLINE_COMPETITIVE_SEASON_RESET_AREAS,
    historicalRecordsRetained: true,
  };
}
