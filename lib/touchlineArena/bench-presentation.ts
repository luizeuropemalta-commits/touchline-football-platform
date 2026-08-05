export type TouchlineBenchRole = "goalkeeper" | "defender" | "midfielder" | "forward";

type PositionedBenchPlayer = {
  role: string;
  position: string;
  name: string;
};

const ROLE_RANK: Record<TouchlineBenchRole, number> = {
  goalkeeper: 0,
  defender: 1,
  midfielder: 2,
  forward: 3,
};

/**
 * Presentation-only bench ordering. Market value, tier and nominal card price
 * are deliberately absent: the bench is a football view, not an economy view.
 */
export function compareTouchlineBenchByPosition<T extends PositionedBenchPlayer>(
  first: T,
  second: T,
) {
  return (ROLE_RANK[first.role as TouchlineBenchRole] ?? 4) - (ROLE_RANK[second.role as TouchlineBenchRole] ?? 4)
    || first.position.localeCompare(second.position)
    || first.name.localeCompare(second.name);
}

export function orderTouchlineBenchByPosition<T extends PositionedBenchPlayer>(cards: readonly T[]) {
  return [...cards].sort(compareTouchlineBenchByPosition);
}
