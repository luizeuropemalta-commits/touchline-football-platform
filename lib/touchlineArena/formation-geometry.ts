import {
  touchlineMarketPositionBucket,
  type TouchlineMarketPositionBucket,
  type TouchlineMarketPositionInput,
} from "./position-eligibility.ts";

export const TOUCHLINE_FORMATION_GEOMETRY_SCHEMA_VERSION = 1 as const;

export const TOUCHLINE_CALIBRATED_FORMATION_CODES = [
  "4-3-3",
  "4-4-2",
  "4-2-3-1",
  "4-1-4-1",
  "4-5-1",
  "3-4-3",
  "3-5-2",
  "3-4-2-1",
  "5-2-3",
  "5-3-2",
  "5-4-1",
] as const;

export type TouchlineCalibratedFormationCode = (typeof TOUCHLINE_CALIBRATED_FORMATION_CODES)[number];
export type TouchlineFormationPitchRole = "goalkeeper" | "defender" | "midfielder" | "forward";
export type TouchlineFormationSlotSide = "right" | "centre" | "left";
export type TouchlineFormationGeometrySource = "code-default" | "qa-published";

type EligibleBucket = Exclude<TouchlineMarketPositionBucket, "outfield">;

export type TouchlineFormationGeometrySlot = Readonly<{
  id: string;
  x: number;
  y: number;
  role: TouchlineFormationPitchRole;
  roleIndex: number;
  line: string;
  side: TouchlineFormationSlotSide;
  priority: number;
  allowedPositions: readonly EligibleBucket[];
}>;

export type TouchlineFormationGeometry = Readonly<{
  schemaVersion: typeof TOUCHLINE_FORMATION_GEOMETRY_SCHEMA_VERSION;
  formationCode: string;
  geometryVersion: number;
  source: TouchlineFormationGeometrySource;
  publishedAt: string | null;
  slots: readonly TouchlineFormationGeometrySlot[];
}>;

export type TouchlineFormationGeometryRegistry = Readonly<Record<string, TouchlineFormationGeometry>>;

export type TouchlineFormationGeometryViewport = Readonly<{
  id: "1920x1080" | "1440x900" | "1280x720" | "1024x768" | "844x390";
  cardWidth: number;
  cardHeight: number;
  labelWidth: number;
  labelHeight: number;
}>;

export type TouchlineFormationGeometryIssue = Readonly<{
  code:
    | "formation-invalid"
    | "slot-count"
    | "slot-invalid"
    | "slot-duplicate"
    | "priority-duplicate"
    | "role-capacity"
    | "card-out-of-field"
    | "label-out-of-field"
    | "card-collision"
    | "label-collision"
    | "card-label-collision";
  message: string;
  viewport?: TouchlineFormationGeometryViewport["id"];
  slots?: readonly string[];
}>;

export type TouchlineFormationGeometryValidation = Readonly<{
  publishable: boolean;
  formationCode: string;
  slotCount: number;
  issues: readonly TouchlineFormationGeometryIssue[];
  checkedViewports: readonly TouchlineFormationGeometryViewport["id"][];
}>;

const GK = ["goalkeeper"] as const;
const CB = ["centre-back"] as const;
const RB = ["right-back"] as const;
const LB = ["left-back"] as const;
const DM = ["defensive-midfield", "midfield"] as const;
const MID = ["midfield", "defensive-midfield"] as const;
const AM = ["midfield", "attacker"] as const;
const WING = ["attacker", "midfield"] as const;
const ST = ["centre-forward", "attacker"] as const;

type SlotSeed = Readonly<{
  id: string;
  x: number;
  y: number;
  role: TouchlineFormationPitchRole;
  line: string;
  side: TouchlineFormationSlotSide;
  allowedPositions: readonly EligibleBucket[];
}>;

function slot(
  id: string,
  x: number,
  y: number,
  role: TouchlineFormationPitchRole,
  line: string,
  side: TouchlineFormationSlotSide,
  allowedPositions: readonly EligibleBucket[],
): SlotSeed {
  return { id, x, y, role, line, side, allowedPositions };
}

function geometry(formationCode: TouchlineCalibratedFormationCode, seeds: readonly SlotSeed[]): TouchlineFormationGeometry {
  const roleCounts: Record<TouchlineFormationPitchRole, number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };
  return Object.freeze({
    schemaVersion: TOUCHLINE_FORMATION_GEOMETRY_SCHEMA_VERSION,
    formationCode,
    geometryVersion: 0,
    source: "code-default",
    publishedAt: null,
    slots: Object.freeze(seeds.map((seed, index) => Object.freeze({
      ...seed,
      roleIndex: roleCounts[seed.role]++,
      priority: index + 1,
      allowedPositions: Object.freeze([...seed.allowedPositions]),
    }))),
  });
}

const DEFAULT_GEOMETRIES: readonly TouchlineFormationGeometry[] = [
  geometry("4-3-3", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RB", 36, 17, "defender", "defence", "right", RB),
    slot("RCB", 36, 39, "defender", "defence", "right", CB),
    slot("LCB", 36, 61, "defender", "defence", "left", CB),
    slot("LB", 36, 83, "defender", "defence", "left", LB),
    slot("RCM", 64, 25, "midfielder", "midfield", "right", MID),
    slot("CM", 64, 50, "midfielder", "midfield", "centre", MID),
    slot("LCM", 64, 75, "midfielder", "midfield", "left", MID),
    slot("RW", 92, 18, "forward", "attack", "right", WING),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
    slot("LW", 92, 82, "forward", "attack", "left", WING),
  ]),
  geometry("4-4-2", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RB", 36, 17, "defender", "defence", "right", RB),
    slot("RCB", 36, 39, "defender", "defence", "right", CB),
    slot("LCB", 36, 61, "defender", "defence", "left", CB),
    slot("LB", 36, 83, "defender", "defence", "left", LB),
    slot("RM", 64, 17, "midfielder", "midfield", "right", WING),
    slot("RCM", 64, 39, "midfielder", "midfield", "right", MID),
    slot("LCM", 64, 61, "midfielder", "midfield", "left", MID),
    slot("LM", 64, 83, "midfielder", "midfield", "left", WING),
    slot("RST", 92, 38, "forward", "attack", "right", ST),
    slot("LST", 92, 62, "forward", "attack", "left", ST),
  ]),
  geometry("4-2-3-1", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RB", 29, 17, "defender", "defence", "right", RB),
    slot("RCB", 29, 39, "defender", "defence", "right", CB),
    slot("LCB", 29, 61, "defender", "defence", "left", CB),
    slot("LB", 29, 83, "defender", "defence", "left", LB),
    slot("RDM", 50, 34, "midfielder", "holding", "right", DM),
    slot("LDM", 50, 66, "midfielder", "holding", "left", DM),
    slot("RAM", 71, 20, "midfielder", "attacking-midfield", "right", AM),
    slot("CAM", 71, 50, "midfielder", "attacking-midfield", "centre", AM),
    slot("LAM", 71, 80, "midfielder", "attacking-midfield", "left", AM),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
  ]),
  geometry("4-1-4-1", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RB", 29, 17, "defender", "defence", "right", RB),
    slot("RCB", 29, 39, "defender", "defence", "right", CB),
    slot("LCB", 29, 61, "defender", "defence", "left", CB),
    slot("LB", 29, 83, "defender", "defence", "left", LB),
    slot("DM", 50, 50, "midfielder", "holding", "centre", DM),
    slot("RM", 71, 17, "midfielder", "midfield", "right", WING),
    slot("RCM", 71, 39, "midfielder", "midfield", "right", MID),
    slot("LCM", 71, 61, "midfielder", "midfield", "left", MID),
    slot("LM", 71, 83, "midfielder", "midfield", "left", WING),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
  ]),
  geometry("4-5-1", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RB", 36, 17, "defender", "defence", "right", RB),
    slot("RCB", 36, 39, "defender", "defence", "right", CB),
    slot("LCB", 36, 61, "defender", "defence", "left", CB),
    slot("LB", 36, 83, "defender", "defence", "left", LB),
    slot("RM", 72, 16, "midfielder", "wide-midfield", "right", WING),
    slot("RCM", 58, 27, "midfielder", "central-midfield", "right", MID),
    slot("CM", 58, 50, "midfielder", "central-midfield", "centre", MID),
    slot("LCM", 58, 73, "midfielder", "central-midfield", "left", MID),
    slot("LM", 72, 84, "midfielder", "wide-midfield", "left", WING),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
  ]),
  geometry("3-4-3", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RCB", 36, 25, "defender", "defence", "right", CB),
    slot("CB", 36, 50, "defender", "defence", "centre", CB),
    slot("LCB", 36, 75, "defender", "defence", "left", CB),
    slot("RWB", 64, 17, "midfielder", "midfield", "right", RB),
    slot("RCM", 64, 39, "midfielder", "midfield", "right", MID),
    slot("LCM", 64, 61, "midfielder", "midfield", "left", MID),
    slot("LWB", 64, 83, "midfielder", "midfield", "left", LB),
    slot("RW", 92, 18, "forward", "attack", "right", WING),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
    slot("LW", 92, 82, "forward", "attack", "left", WING),
  ]),
  geometry("3-5-2", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RCB", 36, 25, "defender", "defence", "right", CB),
    slot("CB", 36, 50, "defender", "defence", "centre", CB),
    slot("LCB", 36, 75, "defender", "defence", "left", CB),
    slot("RWB", 50, 16, "midfielder", "wing-back", "right", RB),
    slot("RCM", 66, 27, "midfielder", "central-midfield", "right", MID),
    slot("CM", 66, 50, "midfielder", "central-midfield", "centre", MID),
    slot("LCM", 66, 73, "midfielder", "central-midfield", "left", MID),
    slot("LWB", 50, 84, "midfielder", "wing-back", "left", LB),
    slot("RST", 92, 38, "forward", "attack", "right", ST),
    slot("LST", 92, 62, "forward", "attack", "left", ST),
  ]),
  geometry("3-4-2-1", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RCB", 29, 25, "defender", "defence", "right", CB),
    slot("CB", 29, 50, "defender", "defence", "centre", CB),
    slot("LCB", 29, 75, "defender", "defence", "left", CB),
    slot("RWB", 50, 17, "midfielder", "midfield", "right", RB),
    slot("RCM", 50, 39, "midfielder", "midfield", "right", MID),
    slot("LCM", 50, 61, "midfielder", "midfield", "left", MID),
    slot("LWB", 50, 83, "midfielder", "midfield", "left", LB),
    slot("RAM", 71, 34, "midfielder", "attacking-midfield", "right", AM),
    slot("LAM", 71, 66, "midfielder", "attacking-midfield", "left", AM),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
  ]),
  geometry("5-2-3", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RWB", 50, 16, "defender", "wing-back", "right", RB),
    slot("RCB", 30, 27, "defender", "defence", "right", CB),
    slot("CB", 30, 50, "defender", "defence", "centre", CB),
    slot("LCB", 30, 73, "defender", "defence", "left", CB),
    slot("LWB", 50, 84, "defender", "wing-back", "left", LB),
    slot("RCM", 64, 36, "midfielder", "midfield", "right", MID),
    slot("LCM", 64, 64, "midfielder", "midfield", "left", MID),
    slot("RW", 92, 18, "forward", "attack", "right", WING),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
    slot("LW", 92, 82, "forward", "attack", "left", WING),
  ]),
  geometry("5-3-2", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RWB", 50, 16, "defender", "wing-back", "right", RB),
    slot("RCB", 30, 27, "defender", "defence", "right", CB),
    slot("CB", 30, 50, "defender", "defence", "centre", CB),
    slot("LCB", 30, 73, "defender", "defence", "left", CB),
    slot("LWB", 50, 84, "defender", "wing-back", "left", LB),
    slot("RCM", 64, 25, "midfielder", "midfield", "right", MID),
    slot("CM", 64, 50, "midfielder", "midfield", "centre", MID),
    slot("LCM", 64, 75, "midfielder", "midfield", "left", MID),
    slot("RST", 92, 38, "forward", "attack", "right", ST),
    slot("LST", 92, 62, "forward", "attack", "left", ST),
  ]),
  geometry("5-4-1", [
    slot("GK", 8, 50, "goalkeeper", "goal", "centre", GK),
    slot("RWB", 50, 16, "defender", "wing-back", "right", RB),
    slot("RCB", 30, 27, "defender", "defence", "right", CB),
    slot("CB", 30, 50, "defender", "defence", "centre", CB),
    slot("LCB", 30, 73, "defender", "defence", "left", CB),
    slot("LWB", 50, 84, "defender", "wing-back", "left", LB),
    slot("RM", 72, 17, "midfielder", "wide-midfield", "right", WING),
    slot("RCM", 64, 39, "midfielder", "midfield", "right", MID),
    slot("LCM", 64, 61, "midfielder", "midfield", "left", MID),
    slot("LM", 72, 83, "midfielder", "wide-midfield", "left", WING),
    slot("ST", 92, 50, "forward", "attack", "centre", ST),
  ]),
];

export const TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY: TouchlineFormationGeometryRegistry = Object.freeze(
  Object.fromEntries(DEFAULT_GEOMETRIES.map((entry) => [entry.formationCode, entry])),
);

export const TOUCHLINE_FORMATION_GEOMETRY_VIEWPORTS: readonly TouchlineFormationGeometryViewport[] = Object.freeze([
  { id: "1920x1080", cardWidth: 9, cardHeight: 15, labelWidth: 17, labelHeight: 4 },
  { id: "1440x900", cardWidth: 9, cardHeight: 15, labelWidth: 17, labelHeight: 4 },
  { id: "1280x720", cardWidth: 9, cardHeight: 16, labelWidth: 17, labelHeight: 5 },
  { id: "1024x768", cardWidth: 7, cardHeight: 15, labelWidth: 13, labelHeight: 5 },
  { id: "844x390", cardWidth: 8, cardHeight: 16, labelWidth: 14, labelHeight: 5 },
]);

const FORMATION_CODE_PATTERN = /^[1-5](?:-[1-5]){2,3}$/;
const SLOT_ID_PATTERN = /^[A-Z][A-Z0-9]{0,4}$/;
const ELIGIBLE_BUCKETS = new Set<EligibleBucket>([
  "goalkeeper", "centre-back", "right-back", "left-back", "defensive-midfield", "midfield", "attacker", "centre-forward",
]);

function formationCapacities(formationCode: string) {
  if (!FORMATION_CODE_PATTERN.test(formationCode)) return null;
  const lines = formationCode.split("-").map(Number);
  if (lines.reduce((sum, count) => sum + count, 0) !== 10) return null;
  return {
    goalkeeper: 1,
    defender: lines[0]!,
    midfielder: lines.slice(1, -1).reduce((sum, count) => sum + count, 0),
    forward: lines.at(-1)!,
  } satisfies Record<TouchlineFormationPitchRole, number>;
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function parseSlot(value: unknown): TouchlineFormationGeometrySlot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" || !SLOT_ID_PATTERN.test(record.id)
    || !finiteCoordinate(record.x) || !finiteCoordinate(record.y)
    || !["goalkeeper", "defender", "midfielder", "forward"].includes(String(record.role))
    || !Number.isInteger(record.roleIndex) || Number(record.roleIndex) < 0 || Number(record.roleIndex) > 10
    || typeof record.line !== "string" || !record.line.trim() || record.line.length > 40
    || !["right", "centre", "left"].includes(String(record.side))
    || !Number.isInteger(record.priority) || Number(record.priority) < 1 || Number(record.priority) > 11
    || !Array.isArray(record.allowedPositions) || !record.allowedPositions.length
    || record.allowedPositions.some((bucket) => typeof bucket !== "string" || !ELIGIBLE_BUCKETS.has(bucket as EligibleBucket))
  ) return null;
  return Object.freeze({
    id: record.id,
    x: record.x,
    y: record.y,
    role: record.role as TouchlineFormationPitchRole,
    roleIndex: Number(record.roleIndex),
    line: record.line.trim(),
    side: record.side as TouchlineFormationSlotSide,
    priority: Number(record.priority),
    allowedPositions: Object.freeze([...new Set(record.allowedPositions as EligibleBucket[])]),
  });
}

export function parseTouchlineFormationGeometry(
  value: unknown,
  metadata?: Readonly<{
    formationCode?: string;
    geometryVersion?: number;
    source?: TouchlineFormationGeometrySource;
    publishedAt?: string | null;
  }>,
): TouchlineFormationGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const formationCode = metadata?.formationCode ?? (typeof record.formationCode === "string" ? record.formationCode.trim() : "");
  const slots = Array.isArray(record.slots) ? record.slots.map(parseSlot) : [];
  if (
    Number(record.schemaVersion) !== TOUCHLINE_FORMATION_GEOMETRY_SCHEMA_VERSION
    || !formationCapacities(formationCode)
    || slots.length !== 11
    || slots.some((entry) => entry === null)
  ) return null;
  const geometryVersion = metadata?.geometryVersion ?? Number(record.geometryVersion ?? 0);
  if (!Number.isInteger(geometryVersion) || geometryVersion < 0) return null;
  return Object.freeze({
    schemaVersion: TOUCHLINE_FORMATION_GEOMETRY_SCHEMA_VERSION,
    formationCode,
    geometryVersion,
    source: metadata?.source ?? (record.source === "qa-published" ? "qa-published" : "code-default"),
    publishedAt: metadata?.publishedAt ?? (typeof record.publishedAt === "string" ? record.publishedAt : null),
    slots: Object.freeze(slots as TouchlineFormationGeometrySlot[]),
  });
}

export function mergeTouchlineFormationGeometryRegistry(
  published: readonly TouchlineFormationGeometry[],
): TouchlineFormationGeometryRegistry {
  const merged: Record<string, TouchlineFormationGeometry> = { ...TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY };
  for (const entry of published) {
    if (validateTouchlineFormationGeometry(entry).publishable) merged[entry.formationCode] = entry;
  }
  return Object.freeze(merged);
}

export function resolveTouchlineFormationGeometry(
  formationCode: string | null | undefined,
  registry: TouchlineFormationGeometryRegistry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY,
) {
  const normalized = String(formationCode ?? "").trim();
  return registry[normalized]
    ?? TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY[normalized]
    ?? TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"]!;
}

type Rect = Readonly<{ left: number; right: number; top: number; bottom: number }>;

function cardRect(slot: TouchlineFormationGeometrySlot, viewport: TouchlineFormationGeometryViewport): Rect {
  return {
    left: slot.x - viewport.cardWidth / 2,
    right: slot.x + viewport.cardWidth / 2,
    top: slot.y - viewport.cardHeight / 2,
    bottom: slot.y + viewport.cardHeight / 2,
  };
}

function labelRect(slot: TouchlineFormationGeometrySlot, viewport: TouchlineFormationGeometryViewport): Rect {
  const left = slot.x <= 12
    ? slot.x - viewport.cardWidth / 2
    : slot.x >= 88
      ? slot.x + viewport.cardWidth / 2 - viewport.labelWidth
      : slot.x - viewport.labelWidth / 2;
  const bottom = slot.y - viewport.cardHeight / 2 - 1;
  return { left, right: left + viewport.labelWidth, top: bottom - viewport.labelHeight, bottom };
}

function insideField(rect: Rect) {
  return rect.left >= 0 && rect.right <= 100 && rect.top >= 0 && rect.bottom <= 100;
}

function intersects(first: Rect, second: Rect) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function issueKey(issue: TouchlineFormationGeometryIssue) {
  return `${issue.code}:${issue.viewport ?? "all"}:${issue.slots?.join(",") ?? ""}`;
}

export function validateTouchlineFormationGeometry(
  geometryValue: Pick<TouchlineFormationGeometry, "formationCode" | "slots">,
): TouchlineFormationGeometryValidation {
  const issues: TouchlineFormationGeometryIssue[] = [];
  const seenIssues = new Set<string>();
  const addIssue = (issue: TouchlineFormationGeometryIssue) => {
    const key = issueKey(issue);
    if (!seenIssues.has(key)) {
      seenIssues.add(key);
      issues.push(issue);
    }
  };
  const capacities = formationCapacities(geometryValue.formationCode);
  if (!capacities) addIssue({ code: "formation-invalid", message: "Formation code must describe exactly ten outfield players." });
  if (geometryValue.slots.length !== 11) addIssue({ code: "slot-count", message: "A formation geometry must contain exactly eleven slots." });
  const slotIds = new Set<string>();
  const priorities = new Set<number>();
  const roleCounts: Record<TouchlineFormationPitchRole, number> = { goalkeeper: 0, defender: 0, midfielder: 0, forward: 0 };
  for (const entry of geometryValue.slots) {
    if (!parseSlot(entry)) addIssue({ code: "slot-invalid", message: `Slot ${String(entry.id || "unknown")} has an invalid tactical contract.`, slots: [String(entry.id || "unknown")] });
    if (slotIds.has(entry.id)) addIssue({ code: "slot-duplicate", message: `Slot ${entry.id} is duplicated.`, slots: [entry.id] });
    if (priorities.has(entry.priority)) addIssue({ code: "priority-duplicate", message: `Priority ${entry.priority} is duplicated.`, slots: [entry.id] });
    slotIds.add(entry.id);
    priorities.add(entry.priority);
    if (entry.role in roleCounts) roleCounts[entry.role] += 1;
  }
  if (capacities && (Object.keys(capacities) as TouchlineFormationPitchRole[]).some((role) => roleCounts[role] !== capacities[role])) {
    addIssue({ code: "role-capacity", message: "Slot roles do not match the formation line capacities." });
  }

  if (!issues.some((issue) => ["slot-count", "slot-invalid"].includes(issue.code))) {
    for (const viewport of TOUCHLINE_FORMATION_GEOMETRY_VIEWPORTS) {
      const rectangles = geometryValue.slots.map((entry) => ({ entry, card: cardRect(entry, viewport), label: labelRect(entry, viewport) }));
      for (const rectangle of rectangles) {
        if (!insideField(rectangle.card)) addIssue({ code: "card-out-of-field", viewport: viewport.id, slots: [rectangle.entry.id], message: `${rectangle.entry.id} card exits the field at ${viewport.id}.` });
        if (!insideField(rectangle.label)) addIssue({ code: "label-out-of-field", viewport: viewport.id, slots: [rectangle.entry.id], message: `${rectangle.entry.id} label exits the field at ${viewport.id}.` });
      }
      for (let firstIndex = 0; firstIndex < rectangles.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < rectangles.length; secondIndex += 1) {
          const first = rectangles[firstIndex]!;
          const second = rectangles[secondIndex]!;
          const slots = [first.entry.id, second.entry.id] as const;
          if (intersects(first.card, second.card)) addIssue({ code: "card-collision", viewport: viewport.id, slots, message: `${slots.join(" / ")} cards collide at ${viewport.id}.` });
          if (intersects(first.label, second.label)) addIssue({ code: "label-collision", viewport: viewport.id, slots, message: `${slots.join(" / ")} labels collide at ${viewport.id}.` });
          if (intersects(first.card, second.label) || intersects(second.card, first.label)) addIssue({ code: "card-label-collision", viewport: viewport.id, slots, message: `${slots.join(" / ")} card and label collide at ${viewport.id}.` });
        }
      }
    }
  }

  return Object.freeze({
    publishable: issues.length === 0,
    formationCode: geometryValue.formationCode,
    slotCount: geometryValue.slots.length,
    issues: Object.freeze(issues),
    checkedViewports: Object.freeze(TOUCHLINE_FORMATION_GEOMETRY_VIEWPORTS.map((viewport) => viewport.id)),
  });
}

export function isTouchlineTacticalSlotCandidateEligible(
  candidate: TouchlineMarketPositionInput,
  targetSlot: Pick<TouchlineFormationGeometrySlot, "allowedPositions">,
) {
  const bucket = touchlineMarketPositionBucket(candidate.position, candidate.role);
  return targetSlot.allowedPositions.includes(bucket as EligibleBucket);
}

export function touchlineFormationGeometryPayload(geometryValue: TouchlineFormationGeometry) {
  return {
    schemaVersion: TOUCHLINE_FORMATION_GEOMETRY_SCHEMA_VERSION,
    formationCode: geometryValue.formationCode,
    slots: geometryValue.slots.map((entry) => ({
      id: entry.id,
      x: entry.x,
      y: entry.y,
      role: entry.role,
      roleIndex: entry.roleIndex,
      line: entry.line,
      side: entry.side,
      priority: entry.priority,
      allowedPositions: [...entry.allowedPositions],
    })),
  };
}
