import {
  resolveTouchlineSeasonPhase,
  type TouchlineSeasonLifecycleSchedule,
  type TouchlineSeasonPhase,
} from "./season-lifecycle.ts";

export const TOUCHLINE_SEASON_HONOUR_TYPES = [
  "champion",
  "top_11",
  "record",
  "achievement",
] as const;

export type TouchlineSeasonHonourType = typeof TOUCHLINE_SEASON_HONOUR_TYPES[number];

export const TOUCHLINE_POST_SEASON_SUMMARY_STATES = [
  "DRAFT",
  "VALIDATED",
  "FROZEN",
] as const;

export type TouchlinePostSeasonSummaryState =
  typeof TOUCHLINE_POST_SEASON_SUMMARY_STATES[number];

export type TouchlineSeasonHonour = {
  type: TouchlineSeasonHonourType;
  title: string;
  detail?: string | null;
};

export type TouchlineServerPostSeasonSummaryInput = {
  now: string;
  lifecycleSchedule: TouchlineSeasonLifecycleSchedule;
  season: {
    id: string;
    label: string;
  };
  clubOwner: {
    userId: string;
    summaryState: TouchlinePostSeasonSummaryState;
    validatedAt: string | null;
    frozenAt: string | null;
    finalRank: number | null;
    totalTouchlinePoints: number | null;
    bestWeeklyRank: number | null;
    honours: readonly TouchlineSeasonHonour[];
  };
};

export type TouchlinePostSeasonSummary = {
  available: boolean;
  phase: TouchlineSeasonPhase;
  season: { id: string; label: string };
  owner: {
    userId: string;
    summaryState: Exclude<TouchlinePostSeasonSummaryState, "DRAFT">;
    validatedAt: string;
    frozenAt: string | null;
    finalRank: number | null;
    totalTouchlinePoints: number | null;
    bestWeeklyRank: number | null;
    honours: TouchlineSeasonHonour[];
  } | null;
};

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function nonNegativeIntegerOrNull(value: number | null, label: string) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer when present.`);
  }
  return value;
}

function positiveIntegerOrNull(value: number | null, label: string) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer when present.`);
  }
  return value;
}

function requiredTimestamp(value: string | null, label: string) {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return value;
}

function validateSummaryState(input: TouchlineServerPostSeasonSummaryInput["clubOwner"]) {
  if (!TOUCHLINE_POST_SEASON_SUMMARY_STATES.includes(input.summaryState)) {
    throw new Error("Post-season summary state is invalid.");
  }

  if (input.summaryState === "DRAFT") {
    if (input.validatedAt !== null || input.frozenAt !== null) {
      throw new Error("A draft post-season summary cannot be validated or frozen.");
    }
    return null;
  }

  const validatedAt = requiredTimestamp(input.validatedAt, "Summary validation date");
  if (input.summaryState === "VALIDATED") {
    if (input.frozenAt !== null) {
      throw new Error("A validated post-season summary cannot have a frozen date.");
    }
    return { validatedAt, frozenAt: null };
  }

  return {
    validatedAt,
    frozenAt: requiredTimestamp(input.frozenAt, "Frozen summary date"),
  };
}

/**
 * Produces a durable, read-only season history view. It deliberately does not
 * fill absent ranking or point data with zero: missing final data stays null
 * until the server has validated and frozen the official result.
 */
export function buildTouchlinePostSeasonSummary(
  input: TouchlineServerPostSeasonSummaryInput,
): TouchlinePostSeasonSummary {
  const phase = resolveTouchlineSeasonPhase(input.lifecycleSchedule, input.now);
  const season = {
    id: requiredText(input.season.id, "Season ID"),
    label: requiredText(input.season.label, "Season label"),
  };
  const available = phase === "POST_SEASON"
    || phase === "RENEWAL_WINDOW"
    || phase === "NEXT_SEASON_LIVE";
  const state = validateSummaryState(input.clubOwner);
  if (!available || state === null || input.clubOwner.summaryState === "DRAFT") {
    return { available: false, phase, season, owner: null };
  }

  const honourKeys = new Set<string>();
  const honours = input.clubOwner.honours.map((honour) => {
    const title = requiredText(honour.title, "Season honour title");
    const key = `${honour.type}:${title.toLowerCase()}`;
    if (honourKeys.has(key)) throw new Error("Season honours must be unique.");
    honourKeys.add(key);
    return {
      type: honour.type,
      title,
      detail: honour.detail?.trim() || null,
    };
  });

  return {
    available: true,
    phase,
    season,
    owner: {
      userId: requiredText(input.clubOwner.userId, "ClubOwner user ID"),
      summaryState: input.clubOwner.summaryState,
      validatedAt: state.validatedAt,
      frozenAt: state.frozenAt,
      finalRank: positiveIntegerOrNull(input.clubOwner.finalRank, "Final rank"),
      totalTouchlinePoints: nonNegativeIntegerOrNull(
        input.clubOwner.totalTouchlinePoints,
        "Season TouchLine Points",
      ),
      bestWeeklyRank: positiveIntegerOrNull(input.clubOwner.bestWeeklyRank, "Best weekly rank"),
      honours,
    },
  };
}
