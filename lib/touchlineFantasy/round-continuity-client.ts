import type { TouchlineFantasySnapshot } from "./server";

export type FantasyContinuityState = Pick<TouchlineFantasySnapshot,
  "userId" | "gameweeks" | "activeGameweek" | "userGameweek" | "selections" | "gameweekScore" | "seasonScore" | "matchHistory" | "gameweekRanking" | "seasonRanking" | "lineupAlerts" | "matchCardIndicators" | "playerAvailabilityIndicators"> & { ok: true };

export function isFantasyContinuityState(value: unknown, accountId: string, gameweekId: string): value is FantasyContinuityState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<FantasyContinuityState>;
  return state.ok === true && state.userId === accountId && state.activeGameweek?.id === gameweekId
    && typeof state.userGameweek?.id === "string" && state.userGameweek.id.length > 0
    && Array.isArray(state.selections) && state.selections.every(entry => typeof entry?.playerId === "string" && typeof entry?.slotId === "string")
    && typeof state.gameweekScore === "number" && Number.isFinite(state.gameweekScore)
    && typeof state.seasonScore === "number" && Number.isFinite(state.seasonScore)
    && Array.isArray(state.matchHistory) && Array.isArray(state.gameweekRanking) && Array.isArray(state.seasonRanking)
    && Array.isArray(state.gameweeks) && Array.isArray(state.lineupAlerts);
}

/** One idempotent command, then at most one read after an ambiguous result.
 * No automatic second POST. A foreign session or round is never adopted. */
export async function recoverFantasyRound(options: {
  accountId: string; gameweekId: string; signal: AbortSignal; prepare?: boolean; fetcher?: typeof fetch;
}): Promise<FantasyContinuityState> {
  const transport = options.fetcher ?? fetch;
  if (options.prepare !== false) {
    try {
      const response = await transport("/api/touchline-fantasy/prepare", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: options.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedAccountId: options.accountId, gameweekId: options.gameweekId }),
      });
      const result: unknown = await response.json();
      options.signal.throwIfAborted();
      if (response.ok && isFantasyContinuityState(result, options.accountId, options.gameweekId)) return result;
    } catch { options.signal.throwIfAborted(); }
  }
  const response = await transport("/api/touchline-fantasy/state", {
    credentials: "same-origin", cache: "no-store", signal: options.signal,
  });
  const result: unknown = await response.json();
  options.signal.throwIfAborted();
  if (response.ok && isFantasyContinuityState(result, options.accountId, options.gameweekId)) return result;
  throw new Error("FANTASY_CONTINUITY_UNCONFIRMED");
}
