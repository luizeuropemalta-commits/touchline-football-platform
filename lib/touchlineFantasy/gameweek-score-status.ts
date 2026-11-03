export type GameweekScoreStatus = "UNAVAILABLE" | "NO_GAMEWEEK" | "AWAITING_CONFIRMATION"
  | "AWAITING_KICKOFF" | "NO_VALID_LINEUP" | "PENDING_SCORE" | "PROVISIONAL" | "FINAL";

/** Presentation of persisted scoring evidence only. Never locks an XI, changes
 * eligibility, or awards the displayed cards' historical points to their owner. */
export function projectGameweekScoreStatus(input: {
  gameweekState: string | null;
  userGameweekState: string | null;
  scoreRow: { gameweek_score?: unknown; settlement_status?: unknown } | null;
  readFailed?: boolean;
}): GameweekScoreStatus {
  if (input.readFailed) return "UNAVAILABLE";
  const { gameweekState, userGameweekState, scoreRow } = input;
  if (!gameweekState) return "NO_GAMEWEEK";
  if (gameweekState === "UPCOMING" || gameweekState === "MARKET_OPEN") {
    return userGameweekState === "CONFIRMED" ? "AWAITING_KICKOFF" : "AWAITING_CONFIRMATION";
  }
  if (!["LOCKED", "LIVE", "FINAL", "SETTLED"].includes(gameweekState)) return "UNAVAILABLE";
  // A confirmed XI can still be awaiting the lock worker. Do not call it
  // ineligible simply because that worker or the score producer has not run.
  if (userGameweekState === "CONFIRMED") return "PENDING_SCORE";
  if (userGameweekState === null || userGameweekState === "DRAFT") {
    return scoreRow === null ? "NO_VALID_LINEUP" : "UNAVAILABLE";
  }
  if (userGameweekState !== "LOCKED" && userGameweekState !== "FINAL") return "UNAVAILABLE";
  if (!scoreRow) return "PENDING_SCORE";
  const value = typeof scoreRow.gameweek_score === "number" ? scoreRow.gameweek_score
    : typeof scoreRow.gameweek_score === "string" && scoreRow.gameweek_score.trim() ? Number(scoreRow.gameweek_score) : NaN;
  if (!Number.isFinite(value) || value < 0) return "UNAVAILABLE";
  return scoreRow.settlement_status === "PROVISIONAL" || scoreRow.settlement_status === "FINAL"
    ? scoreRow.settlement_status : "UNAVAILABLE";
}

export function presentGameweekScore(status: GameweekScoreStatus | undefined, score: number | undefined): {
  status: GameweekScoreStatus; value: number | null;
} {
  if (status === "PROVISIONAL" || status === "FINAL") {
    return typeof score === "number" && Number.isFinite(score) && score >= 0
      ? { status, value: score } : { status: "UNAVAILABLE", value: null };
  }
  const pending = ["NO_GAMEWEEK", "AWAITING_CONFIRMATION", "AWAITING_KICKOFF", "NO_VALID_LINEUP", "PENDING_SCORE"] as const;
  return { status: pending.some(value => value === status) ? status! : "UNAVAILABLE", value: null };
}

export function needsLineupReconfirmation(input: {
  roundEditable: boolean; userGameweekState: string | null; hasUnsavedChanges: boolean;
  collectionKnown: boolean; scoreStatus: GameweekScoreStatus;
}): boolean {
  return input.roundEditable && input.userGameweekState === "CONFIRMED" && input.hasUnsavedChanges
    && input.collectionKnown && input.scoreStatus !== "UNAVAILABLE";
}
