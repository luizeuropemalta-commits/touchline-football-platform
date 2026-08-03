export const TOUCHLINE_CONTRACT_LIFECYCLE_STATES = [
  "ACTIVE",
  "SEASON_FINISHED",
  "RENEWAL_AVAILABLE",
  "RENEWED",
  "NOT_ELIGIBLE",
  "ARCHIVED",
] as const;

export type TouchlineContractLifecycleState =
  typeof TOUCHLINE_CONTRACT_LIFECYCLE_STATES[number];

export const TOUCHLINE_SEASON_PHASES = [
  "COMPETITIVE",
  "DATA_VALIDATION",
  "POST_SEASON",
  "RENEWAL_WINDOW",
  "NEXT_SEASON_LIVE",
] as const;

export type TouchlineSeasonPhase = typeof TOUCHLINE_SEASON_PHASES[number];

export type TouchlineSeasonLifecycleSchedule = {
  competitionEndsAt: string;
  dataValidationEndsAt: string;
  renewalWindowOpensAt: string;
  nextSeasonStartsAt: string;
};

export type TouchlineHistoricalContractLifecycleInput = {
  contractStatus: "active" | "ended" | "reversed";
  belongsToClosingSeason: boolean;
  renewalContractId?: string | null;
  nextSeasonEligible?: boolean | null;
};

function requireTimestamp(value: string, label: string) {
  const normalized = value.trim();
  const timestamp = Date.parse(normalized);
  if (!normalized || Number.isNaN(timestamp)) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

/**
 * Validates the four server-owned season boundaries.  The game must not close
 * directly when a final whistle arrives: data validation remains explicit and
 * configurable before rankings and contracts are finalized.
 */
export function validateTouchlineSeasonLifecycleSchedule(
  schedule: TouchlineSeasonLifecycleSchedule,
) {
  const competitionEndsAt = requireTimestamp(schedule.competitionEndsAt, "Competition end");
  const dataValidationEndsAt = requireTimestamp(schedule.dataValidationEndsAt, "Data validation end");
  const renewalWindowOpensAt = requireTimestamp(schedule.renewalWindowOpensAt, "Renewal window opening");
  const nextSeasonStartsAt = requireTimestamp(schedule.nextSeasonStartsAt, "Next season start");

  if (dataValidationEndsAt < competitionEndsAt) {
    throw new Error("Data validation must end after the competition ends.");
  }
  if (renewalWindowOpensAt < dataValidationEndsAt) {
    throw new Error("Renewal must open after data validation ends.");
  }
  if (nextSeasonStartsAt <= renewalWindowOpensAt) {
    throw new Error("Next season must start after the renewal window opens.");
  }

  return {
    competitionEndsAt,
    dataValidationEndsAt,
    renewalWindowOpensAt,
    nextSeasonStartsAt,
  };
}

export function resolveTouchlineSeasonPhase(
  schedule: TouchlineSeasonLifecycleSchedule,
  now: string,
): TouchlineSeasonPhase {
  const dates = validateTouchlineSeasonLifecycleSchedule(schedule);
  const timestamp = requireTimestamp(now, "Current time");
  if (timestamp <= dates.competitionEndsAt) return "COMPETITIVE";
  if (timestamp <= dates.dataValidationEndsAt) return "DATA_VALIDATION";
  if (timestamp < dates.renewalWindowOpensAt) return "POST_SEASON";
  if (timestamp < dates.nextSeasonStartsAt) return "RENEWAL_WINDOW";
  return "NEXT_SEASON_LIVE";
}

/**
 * Derives a contract's lifecycle state from durable facts.  It does not write
 * to the database and cannot infer eligibility: the server must provide that
 * result from the next season's verified league/player data.
 */
export function resolveTouchlineContractLifecycleState(
  input: TouchlineHistoricalContractLifecycleInput,
  phase: TouchlineSeasonPhase,
): TouchlineContractLifecycleState {
  if (input.contractStatus === "reversed") return "ARCHIVED";
  if (!input.belongsToClosingSeason) return input.contractStatus === "active" ? "ACTIVE" : "ARCHIVED";
  if (input.renewalContractId?.trim()) return "RENEWED";

  if (phase === "COMPETITIVE" || phase === "DATA_VALIDATION") {
    return input.contractStatus === "active" ? "ACTIVE" : "ARCHIVED";
  }
  if (phase === "RENEWAL_WINDOW") {
    return input.nextSeasonEligible === true ? "RENEWAL_AVAILABLE" : "NOT_ELIGIBLE";
  }
  if (phase === "NEXT_SEASON_LIVE") return "ARCHIVED";
  return "SEASON_FINISHED";
}

export function canTouchlineContractScore(phase: TouchlineSeasonPhase) {
  return phase === "COMPETITIVE";
}

export function canTouchlineContractRenew(
  lifecycleState: TouchlineContractLifecycleState,
) {
  return lifecycleState === "RENEWAL_AVAILABLE";
}
