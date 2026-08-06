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
  hasFormation: boolean;
  starterCount: number;
  benchCount: number;
  contractedCount: number;
};

export type TouchlineSquadJourneyStep =
  | "coach"
  | "formation"
  | "starting-xi"
  | "bench"
  | "full-squad"
  | "review"
  | "arena";

export function resolveTouchlineSquadJourney(input: TouchlineSquadJourneyInput) {
  const coachComplete = input.hasCoach;
  const formationComplete = coachComplete && input.hasFormation;
  const startingXiComplete = formationComplete && input.starterCount >= TOUCHLINE_SQUAD_RULES.starters;
  const benchComplete = startingXiComplete && input.benchCount >= TOUCHLINE_SQUAD_RULES.bench;
  const fullSquadComplete = benchComplete && input.contractedCount >= TOUCHLINE_SQUAD_RULES.contracted;
  const reviewAvailable = fullSquadComplete;

  const currentStep: TouchlineSquadJourneyStep = !coachComplete
    ? "coach"
    : !formationComplete
      ? "formation"
      : !startingXiComplete
        ? "starting-xi"
        : !benchComplete
          ? "bench"
          : !fullSquadComplete
            ? "full-squad"
            : "review";

  return {
    coachComplete,
    formationComplete,
    startingXiComplete,
    benchComplete,
    fullSquadComplete,
    reviewAvailable,
    currentStep,
  } as const;
}
