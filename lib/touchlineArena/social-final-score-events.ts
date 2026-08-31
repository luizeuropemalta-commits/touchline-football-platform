export const TOUCHLINE_SOCIAL_FINAL_SCORE_GOAL_KINDS = [
  "goal",
  "own-goal",
  "penalty",
] as const;

export type TouchlineSocialFinalScoreGoalKind =
  (typeof TOUCHLINE_SOCIAL_FINAL_SCORE_GOAL_KINDS)[number];

export function classifyTouchlineSocialFinalScoreGoalType(
  eventType: string | null | undefined,
): TouchlineSocialFinalScoreGoalKind | null {
  const normalized = eventType?.trim().toLowerCase();
  if (normalized === "goal") return "goal";
  if (normalized === "own goal") return "own-goal";
  if (normalized === "penalty") return "penalty";
  return null;
}

export function touchlineSocialFinalScoreGoalsMatchScore(
  goals: readonly Readonly<{ teamId: string }>[],
  input: Readonly<{
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
  }>,
) {
  if (
    !input.homeTeamId
    || !input.awayTeamId
    || input.homeTeamId === input.awayTeamId
    || !Number.isSafeInteger(input.homeScore)
    || !Number.isSafeInteger(input.awayScore)
    || input.homeScore < 0
    || input.awayScore < 0
  ) return false;
  if (goals.some((goal) => goal.teamId !== input.homeTeamId && goal.teamId !== input.awayTeamId)) return false;
  return goals.length === input.homeScore + input.awayScore
    && goals.filter((goal) => goal.teamId === input.homeTeamId).length === input.homeScore
    && goals.filter((goal) => goal.teamId === input.awayTeamId).length === input.awayScore;
}
