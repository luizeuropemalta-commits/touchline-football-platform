import type { ClubRosterArea } from "./club-roster.ts";

const areaPriority: Readonly<Record<ClubRosterArea, number>> = { starters: 0, reserves: 1, outside: 2 };

/** Presentation only: the player entering the more active group is always
 * left/IN, independent of which card opened the comparison. No allocation,
 * position eligibility, contract or wallet is changed by this ordering. */
export function squadSwapComparisonPlayers<T extends { area: ClubRosterArea }>(
  source: T | null | undefined,
  counterpart: T | null | undefined,
): readonly [] | readonly [T, T] {
  // A vacant slot is not a two-player swap; never invent an outgoing card.
  if (!source || !counterpart || source.area === counterpart.area) return [];
  return areaPriority[source.area] > areaPriority[counterpart.area]
    ? [source, counterpart]
    : [counterpart, source];
}
