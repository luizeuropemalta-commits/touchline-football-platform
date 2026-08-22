import { touchlineFormationCapacities } from "./formation-transition.ts";

export type TouchlinePitchSlot = Readonly<{ x: number; y: number }>;
export type TouchlineFormationPitchRole = "goalkeeper" | "defender" | "midfielder" | "forward";
export type TouchlineFormationPitchSlot = Readonly<TouchlinePitchSlot & {
  role: TouchlineFormationPitchRole;
  roleIndex: number;
}>;

const GOALKEEPER: TouchlinePitchSlot = { x: 8, y: 50 };
const DEFENDERS: readonly TouchlinePitchSlot[] = [
  { x: 28, y: 17 }, { x: 28, y: 39 }, { x: 28, y: 61 }, { x: 28, y: 83 },
];
const MIDFIELDERS: readonly TouchlinePitchSlot[] = [
  { x: 54, y: 24 }, { x: 54, y: 50 }, { x: 54, y: 76 },
];
const FORWARDS: readonly TouchlinePitchSlot[] = [
  { x: 82, y: 20 }, { x: 82, y: 50 }, { x: 82, y: 80 },
];

/** The ClubOwner XI order is goalkeeper, defenders, midfielders and forwards. */
export const TOUCHLINE_CLUB_OWNER_XI_SLOTS = [
  GOALKEEPER,
  ...DEFENDERS,
  ...MIDFIELDERS,
  ...FORWARDS,
] as const;

/** The ClubHub builder selects forwards, midfielders, defenders then goalkeeper. */
function evenlySpacedFormationY(count: number, index: number) {
  if (count <= 1) return 50;
  return 14 + ((72 / (count - 1)) * index);
}

/**
 * Shared Market Transfer formation geometry. Club Hub consumes this exact
 * source so each club's Squad Preview follows the approved Market pitch for
 * the same formation, without per-club coordinate adjustments.
 */
export function touchlineCanonicalFormationSlots(formation: string): TouchlineFormationPitchSlot[] {
  const capacities = touchlineFormationCapacities(formation) ?? {
    goalkeeper: 1,
    defender: 4,
    midfielder: 3,
    forward: 3,
  };
  const lines: ReadonlyArray<Readonly<{ role: TouchlineFormationPitchRole; count: number; x: number }>> = [
    { role: "goalkeeper", count: capacities.goalkeeper, x: 9 },
    { role: "defender", count: capacities.defender, x: 34 },
    { role: "midfielder", count: capacities.midfielder, x: 61 },
    { role: "forward", count: capacities.forward, x: 88 },
  ];

  return lines.flatMap(({ role, count, x }) => Array.from({ length: count }, (_, roleIndex) => ({
    role,
    roleIndex,
    x,
    y: evenlySpacedFormationY(count, roleIndex),
  })));
}

/** The ClubHub preview selection order remains forwards, midfielders, defenders, goalkeeper. */
export const TOUCHLINE_STANDARD_433_SLOTS = [
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "forward"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "midfielder"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "defender"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "goalkeeper"),
] as const;
