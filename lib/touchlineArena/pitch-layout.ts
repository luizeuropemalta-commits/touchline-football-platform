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

function midfieldLineX(lineCount: number, lineIndex: number) {
  if (lineCount <= 1) return 61;
  return 52 + ((18 / (lineCount - 1)) * lineIndex);
}

/**
 * Shared Market Transfer formation geometry. Club Hub consumes this exact
 * source so each club's Squad Preview follows the approved Market pitch for
 * the same formation, without per-club coordinate adjustments.
 */
export function touchlineCanonicalFormationSlots(formation: string): TouchlineFormationPitchSlot[] {
  const validFormation = touchlineFormationCapacities(formation) ? formation : "4-3-3";
  const lineCounts = validFormation.split("-").map((value) => Number.parseInt(value, 10));
  const defenderCount = lineCounts[0];
  const midfieldLineCounts = lineCounts.slice(1, -1);
  const forwardCount = lineCounts.at(-1)!;
  let midfielderRoleIndex = 0;

  return [
    { role: "goalkeeper", roleIndex: 0, x: 9, y: 50 },
    ...Array.from({ length: defenderCount }, (_, roleIndex) => ({
      role: "defender" as const,
      roleIndex,
      x: 34,
      y: evenlySpacedFormationY(defenderCount, roleIndex),
    })),
    ...midfieldLineCounts.flatMap((count, lineIndex) => (
      Array.from({ length: count }, (_, index) => ({
        role: "midfielder" as const,
        roleIndex: midfielderRoleIndex++,
        x: midfieldLineX(midfieldLineCounts.length, lineIndex),
        y: evenlySpacedFormationY(count, index),
      }))
    )),
    ...Array.from({ length: forwardCount }, (_, roleIndex) => ({
      role: "forward" as const,
      roleIndex,
      x: 88,
      y: evenlySpacedFormationY(forwardCount, roleIndex),
    })),
  ];
}

/** The ClubHub preview selection order remains forwards, midfielders, defenders, goalkeeper. */
export const TOUCHLINE_STANDARD_433_SLOTS = [
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "forward"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "midfielder"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "defender"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "goalkeeper"),
] as const;
