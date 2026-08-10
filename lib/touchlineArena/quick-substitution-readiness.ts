import { TOUCHLINE_SQUAD_RULES } from "./squad-rules.ts";

export type TouchlineQuickSubstitutionReadiness = Readonly<{
  state: "loading" | "setup-required" | "ready";
  starterCount: number;
  benchCount: number;
  missingStarters: number;
  missingBench: number;
}>;

/**
 * Quick Substitution is only useful when the persisted matchday has a full
 * starting XI and nine eligible substitutes. This is intentionally a pure
 * presentation gate: it never creates players, changes contracts, or writes
 * back to the roster.
 */
export function resolveTouchlineQuickSubstitutionReadiness(input: Readonly<{
  hasLoadedSavedLineup: boolean;
  hasLoadedClubOwnerRoster: boolean;
  starterCount: number;
  benchCount: number;
}>): TouchlineQuickSubstitutionReadiness {
  const starterCount = Math.max(0, Math.floor(input.starterCount));
  const benchCount = Math.max(0, Math.floor(input.benchCount));
  const missingStarters = Math.max(0, TOUCHLINE_SQUAD_RULES.starters - starterCount);
  const missingBench = Math.max(0, TOUCHLINE_SQUAD_RULES.bench - benchCount);

  if (!input.hasLoadedSavedLineup || !input.hasLoadedClubOwnerRoster) {
    return {
      state: "loading",
      starterCount,
      benchCount,
      missingStarters,
      missingBench,
    };
  }

  return {
    state: starterCount === TOUCHLINE_SQUAD_RULES.starters && benchCount === TOUCHLINE_SQUAD_RULES.bench
      ? "ready"
      : "setup-required",
    starterCount,
    benchCount,
    missingStarters,
    missingBench,
  };
}
