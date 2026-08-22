import {
  touchlineMarketPositionBucket,
  type TouchlineMarketPositionInput,
  type TouchlineRosterRole,
} from "./position-eligibility.ts";

export type TouchlineFormationRole = TouchlineRosterRole;

export type TouchlineFormationCapacities = Readonly<Record<TouchlineFormationRole, number>>;

export type TouchlineFormationVacancy = Readonly<{
  role: TouchlineFormationRole;
  count: number;
}>;

export type TouchlineFormationReconciliation<Player> = Readonly<{
  starters: Player[];
  overflow: Player[];
  vacancies: TouchlineFormationVacancy[];
}>;

const TOUCHLINE_FORMATION_ROLES = [
  "goalkeeper",
  "defender",
  "midfielder",
  "forward",
] as const satisfies readonly TouchlineFormationRole[];

/**
 * Converts the product formation label into the four field lines rendered by
 * Club Construction. It rejects malformed or non-eleven shapes instead of
 * silently inventing a tactical structure.
 */
export function touchlineFormationCapacities(
  formation: string,
): TouchlineFormationCapacities | null {
  const lines = formation.split("-").map((value) => Number.parseInt(value, 10));
  if (
    lines.length < 3
    || lines.some((value) => !Number.isInteger(value) || value < 1 || value > 5)
    || lines.reduce((total, value) => total + value, 0) !== 10
  ) return null;

  return Object.freeze({
    goalkeeper: 1,
    defender: lines[0],
    midfielder: lines.slice(1, -1).reduce((total, value) => total + value, 0),
    forward: lines.at(-1)!,
  });
}

/**
 * A formation switch never changes a player's canonical role. Players who no
 * longer fit are returned explicitly so the caller can preserve their owned
 * contract in Bench/Remaining Squad, while every missing role stays visible
 * as a vacancy on the pitch.
 */
export function reconcileTouchlineFormationStarters<
  Player extends Readonly<{ id: string; role: TouchlineFormationRole }>,
>(
  starters: readonly Player[],
  capacities: TouchlineFormationCapacities,
): TouchlineFormationReconciliation<Player> {
  const remaining = { ...capacities };
  const nextStarters: Player[] = [];
  const overflow: Player[] = [];

  for (const player of starters) {
    if (remaining[player.role] > 0) {
      nextStarters.push(player);
      remaining[player.role] -= 1;
    } else {
      overflow.push(player);
    }
  }

  const vacancies = TOUCHLINE_FORMATION_ROLES.flatMap((role) => (
    remaining[role] > 0 ? [{ role, count: remaining[role] }] : []
  ));

  return Object.freeze({
    starters: nextStarters,
    overflow,
    vacancies,
  });
}

/**
 * Club Construction uses the shared TouchLine/Sportmonks position contract.
 * Unknown/unclassified players remain in the roster but cannot be inserted in
 * an incompatible tactical slot until their canonical position is resolved.
 */
export function isTouchlineFormationCandidateEligible(
  candidate: TouchlineMarketPositionInput,
  targetRole: TouchlineFormationRole,
) {
  const bucket = touchlineMarketPositionBucket(candidate.position, candidate.role);
  if (targetRole === "goalkeeper") return bucket === "goalkeeper";
  if (targetRole === "defender") {
    return bucket === "centre-back" || bucket === "right-back" || bucket === "left-back";
  }
  if (targetRole === "midfielder") {
    return bucket === "defensive-midfield" || bucket === "midfield";
  }
  return bucket === "attacker" || bucket === "centre-forward";
}
