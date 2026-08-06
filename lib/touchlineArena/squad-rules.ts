export const TOUCHLINE_SQUAD_RULES = Object.freeze({
  contracted: 35,
  matchday: 20,
  starters: 11,
  bench: 9,
  reserveVault: 15,
  goalkeepers: 3,
  matchdayBenchGoalkeepers: 1,
  substitutions: 5,
});

export type TouchlineSquadJourneyInput = {
  hasCoach: boolean;
  starterCount: number;
  benchCount: number;
  contractedCount: number;
};

export type TouchlineSquadJourneyStep =
  | "coach"
  | "starting-xi"
  | "bench"
  | "full-squad"
  | "review"
  | "arena";

export function resolveTouchlineSquadJourney(input: TouchlineSquadJourneyInput) {
  const coachComplete = input.hasCoach;
  const startingXiComplete = coachComplete && input.starterCount >= TOUCHLINE_SQUAD_RULES.starters;
  const benchComplete = startingXiComplete && input.benchCount >= TOUCHLINE_SQUAD_RULES.bench;
  const fullSquadComplete = benchComplete && input.contractedCount >= TOUCHLINE_SQUAD_RULES.contracted;
  const reviewAvailable = fullSquadComplete;

  const currentStep: TouchlineSquadJourneyStep = !coachComplete
    ? "coach"
    : !startingXiComplete
      ? "starting-xi"
      : !benchComplete
        ? "bench"
        : !fullSquadComplete
          ? "full-squad"
          : "review";

  return {
    coachComplete,
    startingXiComplete,
    benchComplete,
    fullSquadComplete,
    reviewAvailable,
    currentStep,
  } as const;
}
