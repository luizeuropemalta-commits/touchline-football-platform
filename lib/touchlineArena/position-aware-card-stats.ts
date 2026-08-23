export type TouchlineCardStatId =
  | "goals"
  | "assists"
  | "defense"
  | "cleanSheets"
  | "cards"
  | "yellowCards"
  | "redCards"
  | "saves"
  | "goalsConceded"
  | "minutes"
  | "appearances"
  | "shotsOnTarget"
  | "shotsOffTarget"
  | "defensiveActionsTotal"
  | "penaltySaves"
  | "penaltiesMissed"
  | "ownGoals"
  | "rating";

export type TouchlineCardStats = Readonly<Partial<Record<
  TouchlineCardStatId,
  string | number | null
>>>;

export type TouchlinePlayerPositionKind = "goalkeeper" | "outfield" | "unknown";

const COMMON_MATCH_FACTS = [
  "goals",
  "assists",
  "cleanSheets",
  "yellowCards",
  "redCards",
  "ownGoals",
  "rating",
] as const satisfies readonly TouchlineCardStatId[];

const OUTFIELD_MATCH_FACTS = [
  "goals",
  "assists",
  "defense",
  "cleanSheets",
  "yellowCards",
  "redCards",
  "shotsOnTarget",
  "shotsOffTarget",
  "penaltiesMissed",
  "ownGoals",
  "rating",
] as const satisfies readonly TouchlineCardStatId[];

const GOALKEEPER_MATCH_FACTS = [
  "goals",
  "assists",
  "cleanSheets",
  "saves",
  "penaltySaves",
  "goalsConceded",
  "yellowCards",
  "redCards",
  "ownGoals",
  "rating",
] as const satisfies readonly TouchlineCardStatId[];

const AUXILIARY_CARD_STATS = ["cards", "minutes", "appearances"] as const satisfies readonly TouchlineCardStatId[];

function normalizedPosition(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Position classification for public card facts. Unknown values deliberately
 * stay unknown instead of inheriting a midfielder default: role-exclusive
 * goalkeeper and DEF facts must fail closed until identity is resolved.
 */
export function touchlinePlayerPositionKind(
  position: string | null | undefined,
): TouchlinePlayerPositionKind {
  const normalized = normalizedPosition(position);
  if (!normalized) return "unknown";
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const compact = tokens.join("");
  if (
    normalized.includes("goalkeeper")
    || normalized.includes("goal keeper")
    || normalized.includes("goleiro")
    || normalized.includes("keeper")
    || tokens.includes("gk")
    || compact === "goalie"
  ) return "goalkeeper";
  if (
    tokens.some((token) => [
      "defender", "defence", "defense", "midfielder", "midfield", "forward", "attacker",
      "striker", "winger", "zagueiro", "lateral", "meia", "atacante", "centroavante",
      "cb", "lb", "rb", "lcb", "rcb", "lwb", "rwb", "df", "def", "dm", "cm", "am",
      "lm", "rm", "mf", "mid", "st", "cf", "fw", "fwd", "att", "lw", "rw", "lf", "rf",
    ].includes(token))
    || normalized.includes("centre back")
    || normalized.includes("center back")
    || normalized.includes("full back")
    || normalized.includes("wing back")
    || normalized.includes("left back")
    || normalized.includes("right back")
    || normalized.includes("left wing")
    || normalized.includes("right wing")
  ) return "outfield";
  return "unknown";
}

export function touchlineMatchFactKeysForPosition(
  position: string | null | undefined,
): readonly TouchlineCardStatId[] {
  const kind = touchlinePlayerPositionKind(position);
  if (kind === "goalkeeper") return GOALKEEPER_MATCH_FACTS;
  if (kind === "outfield") return OUTFIELD_MATCH_FACTS;
  return COMMON_MATCH_FACTS;
}

export function touchlineCardStatAppliesToPosition(
  stat: TouchlineCardStatId,
  position: string | null | undefined,
) {
  return touchlineMatchFactKeysForPosition(position).includes(stat)
    || AUXILIARY_CARD_STATS.includes(stat as typeof AUXILIARY_CARD_STATS[number]);
}

/**
 * Canonical read-model projection shared by Arena, Club Hub, profiles,
 * rankings and card overlays. It filters already-persisted facts; it never
 * derives points or converts missing facts into zero.
 */
export function projectTouchlineCardStatsByPosition(input: Readonly<{
  position: string | null | undefined;
  statistics: TouchlineCardStats | null | undefined;
}>): TouchlineCardStats | undefined {
  if (!input.statistics) return undefined;
  const keys = [
    ...touchlineMatchFactKeysForPosition(input.position),
    ...AUXILIARY_CARD_STATS,
  ];
  const entries = keys.flatMap((key) => (
    Object.prototype.hasOwnProperty.call(input.statistics, key)
      ? [[key, input.statistics?.[key]] as const]
      : []
  ));
  return entries.length ? Object.fromEntries(entries) as TouchlineCardStats : undefined;
}
