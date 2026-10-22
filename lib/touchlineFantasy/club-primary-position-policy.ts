import { clubPlayerPosition } from "./club-position.ts";
import { recognizedSportmonksDetailedPosition } from "../football-data/sportmonks-position-taxonomy.ts";
import type { ExchangePosition } from "./exchange-eligibility.ts";

/** Shared local contract; remote installation has its own migration gates.
 * Primary detail, quota category and tactical function are separate concepts.
 * A winger in wide midfield keeps the same primary detail and quota category.
 */
const detailsByRole = {
  keeper: ["Goalkeeper"], centreBack: ["Centre Back"],
  rightBack: ["Right Back"], leftBack: ["Left Back"],
  holding: ["Defensive Midfield"], pivot: ["Defensive Midfield", "Central Midfield"],
  // Existing flat central lines do not identify individual six/eight/ten jobs.
  // Preserve central-role compatibility without admitting wide midfielders.
  centralLine: ["Defensive Midfield", "Central Midfield", "Attacking Midfield"],
  advancedInterior: ["Central Midfield", "Attacking Midfield"],
  insideTen: ["Attacking Midfield"],
  rightWing: ["Right Wing"], leftWing: ["Left Wing"],
  rightWidth: ["Right Wing", "Right Midfield"], leftWidth: ["Left Wing", "Left Midfield"],
  striker: ["Centre Forward"],
} as const;
export type ClubTacticalFunction = keyof typeof detailsByRole;
type FormationRoles = Readonly<Record<string, ClubTacticalFunction>>;
const backFour: FormationRoles = { GK: "keeper", RB: "rightBack", RCB: "centreBack", LCB: "centreBack", LB: "leftBack" };
const backThree: FormationRoles = { GK: "keeper", RCB: "centreBack", CB: "centreBack", LCB: "centreBack", RWB: "rightBack", LWB: "leftBack" };
const centralThree: FormationRoles = { RCM: "centralLine", CM: "centralLine", LCM: "centralLine" };
const centralTwo: FormationRoles = { RCM: "pivot", LCM: "pivot" };
const frontThree: FormationRoles = { RW: "rightWing", ST: "striker", LW: "leftWing" };
const wideMidfield: FormationRoles = { RM: "rightWidth", LM: "leftWidth" };

// Explicit formation + slot contract: RAM in 3-4-2-1 is an inside ten,
// whereas RAM in the current 4-2-3-1 geometry provides right-hand width.
const formationRoles: Readonly<Record<string, FormationRoles>> = Object.freeze({
  "4-3-3": Object.freeze({ ...backFour, ...centralThree, ...frontThree }),
  "4-4-2": Object.freeze({ ...backFour, ...wideMidfield, ...centralTwo, RST: "striker", LST: "striker" }),
  "4-2-3-1": Object.freeze({ ...backFour, RDM: "pivot", LDM: "pivot", RAM: "rightWidth", CAM: "insideTen", LAM: "leftWidth", ST: "striker" }),
  "4-1-4-1": Object.freeze({ ...backFour, DM: "holding", ...wideMidfield, RCM: "advancedInterior", LCM: "advancedInterior", ST: "striker" }),
  "4-5-1": Object.freeze({ ...backFour, ...wideMidfield, ...centralThree, ST: "striker" }),
  "3-4-3": Object.freeze({ ...backThree, ...centralTwo, ...frontThree }),
  "3-5-2": Object.freeze({ ...backThree, ...centralThree, RST: "striker", LST: "striker" }),
  "3-4-2-1": Object.freeze({ ...backThree, ...centralTwo, RAM: "insideTen", LAM: "insideTen", ST: "striker" }),
  "5-2-3": Object.freeze({ ...backThree, ...centralTwo, ...frontThree }),
  "5-3-2": Object.freeze({ ...backThree, ...centralThree, RST: "striker", LST: "striker" }),
  "5-4-1": Object.freeze({ ...backThree, ...centralTwo, ...wideMidfield, ST: "striker" }),
});

export function tacticalFunctionForSlot(formationCode: string, slotId: string): ClubTacticalFunction | null {
  if (!Object.hasOwn(formationRoles, formationCode)) return null;
  const roles = formationRoles[formationCode];
  return Object.hasOwn(roles, slotId) ? roles[slotId] : null;
}

/** Returns a new array: consumers cannot mutate the shared policy. */
export function eligiblePrimaryDetails(formationCode: string, slotId: string): readonly string[] {
  const role = tacticalFunctionForSlot(formationCode, slotId);
  return role ? [...detailsByRole[role]] : [];
}

/** Inputs are persisted detailed-position fields, not a display role or name. */
export function resolvePrimaryPositionDetails(playerDetail: unknown, membershipDetail: unknown):
  Readonly<{ position: ExchangePosition; detail: string; reason: null }> |
  Readonly<{ position: null; detail: null; reason: "PRIMARY_DETAIL_MISSING" | "PRIMARY_DETAIL_UNSUPPORTED" | "PRIMARY_DETAIL_CONFLICT" }> {
  const detail = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const player = detail(playerDetail), member = detail(membershipDetail);
  if (!player && !member) return { position: null, detail: null, reason: "PRIMARY_DETAIL_MISSING" };
  const p = recognizedSportmonksDetailedPosition(player), m = recognizedSportmonksDetailedPosition(member);
  if ((player && !p) || (member && !m)) return { position: null, detail: null, reason: "PRIMARY_DETAIL_UNSUPPORTED" };
  if (p && m && p !== m) return { position: null, detail: null, reason: "PRIMARY_DETAIL_CONFLICT" };
  const position = clubPlayerPosition(m ?? p);
  return position ? { position, detail: (m ?? p)!, reason: null } : { position: null, detail: null, reason: "PRIMARY_DETAIL_UNSUPPORTED" };
}

export function primaryPositionFitsTacticalSlot(detail: unknown, formationCode: string, slotId: string): boolean {
  const primary = recognizedSportmonksDetailedPosition(detail);
  return primary !== null && eligiblePrimaryDetails(formationCode, slotId).includes(primary);
}
