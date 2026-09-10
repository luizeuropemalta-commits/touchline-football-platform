/**
 * Pure presentation contract for the shared player card.
 *
 * This deliberately has no component, asset, provider, or persistence
 * dependency. Consumers can render the returned semantic icon names with
 * their own visual system while preserving the distinction between a genuine
 * zero and a statistic that has not been supplied.
 */

export type TouchlineCardStatId =
  | "goals"
  | "assists"
  | "defense"
  | "saves"
  | "cleanSheets";

export type TouchlineCardStatIcon = "ball" | "boot" | "defense" | "glove" | "clean-sheet";
export type TouchlineCardStatValue = string | number;
export type TouchlineCardStatValueState = "available" | "unavailable";

export type TouchlineCardStatPresentation = Readonly<{
  id: TouchlineCardStatId;
  label: "GOL" | "AST" | "DEF" | "SAVES" | "CS";
  icon: TouchlineCardStatIcon;
  value: TouchlineCardStatValue | null;
  valueState: TouchlineCardStatValueState;
}>;

export type TouchlineCardStatInput = Readonly<{
  role?: string | null;
  position?: string | null;
  /** Current audited season values take precedence over compatibility values. */
  seasonStats?: Partial<Record<TouchlineCardStatId, TouchlineCardStatValue | null>> | null;
  /** Compatibility-only source for legacy Arena payloads. */
  matchStats?: Partial<Record<TouchlineCardStatId, TouchlineCardStatValue | null>> | null;
}>;

type StatDefinition = Readonly<{
  id: TouchlineCardStatId;
  label: TouchlineCardStatPresentation["label"];
  icon: TouchlineCardStatIcon;
}>;

const OUTFIELD_STAT_DEFINITIONS: readonly StatDefinition[] = [
  { id: "goals", label: "GOL", icon: "ball" },
  { id: "assists", label: "AST", icon: "boot" },
  { id: "defense", label: "DEF", icon: "defense" },
  { id: "cleanSheets", label: "CS", icon: "clean-sheet" },
];

const GOALKEEPER_STAT_DEFINITIONS: readonly StatDefinition[] = [
  { id: "goals", label: "GOL", icon: "ball" },
  { id: "assists", label: "AST", icon: "boot" },
  { id: "saves", label: "SAVES", icon: "glove" },
  { id: "cleanSheets", label: "CS", icon: "clean-sheet" },
];

function normalizeRoleValue(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function hasOwnStat(
  stats: TouchlineCardStatInput["seasonStats"] | TouchlineCardStatInput["matchStats"],
  statId: TouchlineCardStatId,
) {
  return Boolean(stats && Object.prototype.hasOwnProperty.call(stats, statId));
}

function normalizeStatValue(value: unknown): TouchlineCardStatValue | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function resolveStatValue(input: TouchlineCardStatInput, statId: TouchlineCardStatId): TouchlineCardStatValue | null {
  if (input.seasonStats) return normalizeStatValue(input.seasonStats[statId]);
  if (hasOwnStat(input.matchStats, statId)) return normalizeStatValue(input.matchStats?.[statId]);
  return null;
}

export function isTouchlineGoalkeeper(input: Pick<TouchlineCardStatInput, "role" | "position">) {
  const role = normalizeRoleValue(input.role);
  if (/\b(?:goalkeeper|goalie|keeper|goleiro)\b/.test(role)) return true;
  return /(?:^|\s)gk(?:\s|$)/.test(normalizeRoleValue(input.position));
}

export function buildTouchlineCardStatPresentation(input: TouchlineCardStatInput): TouchlineCardStatPresentation[] {
  const definitions = isTouchlineGoalkeeper(input)
    ? GOALKEEPER_STAT_DEFINITIONS
    : OUTFIELD_STAT_DEFINITIONS;

  return definitions.map((definition) => {
    const value = resolveStatValue(input, definition.id);
    return { ...definition, value, valueState: value === null ? "unavailable" : "available" };
  });
}
