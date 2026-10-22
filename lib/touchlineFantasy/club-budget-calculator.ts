import { CLUB_ROSTER_CAPACITY } from "./club-roster.ts";

/** Display-only estimate from one confirmed snapshot; never a spending limit. */
export function clubBudgetEstimate(state: {
  balanceEur: number;
  players: readonly { playerId: string }[];
} | null) {
  if (!state || !Number.isSafeInteger(state.balanceEur) || state.balanceEur < 0
    || state.players.length > CLUB_ROSTER_CAPACITY.total
    || state.players.some(player => !player.playerId)
    || new Set(state.players.map(player => player.playerId)).size !== state.players.length) return null;
  const vacancies = CLUB_ROSTER_CAPACITY.total - state.players.length;
  return { vacancies, balance: state.balanceEur,
    average: vacancies === 0 ? null : Math.floor(state.balanceEur / vacancies) };
}
