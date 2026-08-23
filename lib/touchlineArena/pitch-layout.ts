import {
  resolveTouchlineFormationGeometry,
  type TouchlineFormationGeometryRegistry,
  type TouchlineFormationGeometrySlot,
} from "./formation-geometry.ts";

export type TouchlinePitchSlot = Readonly<{ x: number; y: number }>;
export type { TouchlineFormationPitchRole } from "./formation-geometry.ts";
export type TouchlineFormationPitchSlot = TouchlineFormationGeometrySlot;

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

/**
 * Shared flat-pitch formation geometry for Market, Club Hub and Matchday.
 * The Arena field/camera pipeline deliberately does not consume this registry:
 * Arena is a separate visual system with independent calibration constraints.
 */
export function touchlineCanonicalFormationSlots(
  formation: string,
  registry?: TouchlineFormationGeometryRegistry,
): TouchlineFormationPitchSlot[] {
  return [...resolveTouchlineFormationGeometry(formation, registry).slots];
}

/** The ClubHub preview selection order remains forwards, midfielders, defenders, goalkeeper. */
export const TOUCHLINE_STANDARD_433_SLOTS = [
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "forward"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "midfielder"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "defender"),
  ...touchlineCanonicalFormationSlots("4-3-3").filter((slot) => slot.role === "goalkeeper"),
] as const;
