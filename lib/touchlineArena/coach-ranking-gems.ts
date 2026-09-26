/** Decorative rank medals only: never changes a coach's published card tier. */
const COACH_RANK_GEMS = [
  "diamond-gold", "clear-diamond", "emerald-green", "radiant-gold",
  "amethyst-purple", "sapphire-blue", "ruby-red",
] as const;

export function touchlineCoachRankingGem(rank: number): string | undefined {
  if (!Number.isInteger(rank) || rank < 1 || rank > COACH_RANK_GEMS.length) return undefined;
  return `/touchlineArena/cards/coach-ranking-gems/${COACH_RANK_GEMS[rank - 1]}.png`;
}
