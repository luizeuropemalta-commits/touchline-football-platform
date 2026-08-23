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

export type TouchlinePositionStatistics = Readonly<Record<string, string | number>>;

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

const GOALKEEPER_ONLY_POSITION_STATISTICS = new Set([
  "saves",
  "penalty-saves",
  "penaltysaves",
  "goalkeeper-goals-conceded",
  "goalkeepergoalsconceded",
  "goals-conceded",
  "goalsconceded",
]);

const OUTFIELD_ONLY_POSITION_STATISTICS = new Set([
  "def-score",
  "defscore",
  "defensive-actions-total",
  "defensiveactionstotal",
  "tackles-won",
  "tackleswon",
  "interceptions",
  "clearances",
  "blocked-shots",
  "blockedshots",
  "shots-blocked",
  "shotsblocked",
  "aerials-won",
  "aerialswon",
  "aeriels-won",
  "aerielswon",
]);

function normalizedPosition(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedStatisticKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

/**
 * Filters persisted provider/scoring statistics before they enter a profile,
 * overlay or card read model. Confirmed zeroes remain zero; only facts that do
 * not apply to the resolved position are removed. Unknown positions fail
 * closed for both goalkeeper-only and outfield-only facts.
 */
export function projectTouchlinePositionStatisticsByPosition(input: Readonly<{
  position: string | null | undefined;
  statistics: TouchlinePositionStatistics | null | undefined;
}>): Record<string, string | number> {
  if (!input.statistics) return {};
  const kind = touchlinePlayerPositionKind(input.position);
  return Object.fromEntries(Object.entries(input.statistics).filter(([key]) => {
    const normalizedKey = normalizedStatisticKey(key);
    if (GOALKEEPER_ONLY_POSITION_STATISTICS.has(normalizedKey)) return kind === "goalkeeper";
    if (OUTFIELD_ONLY_POSITION_STATISTICS.has(normalizedKey) || normalizedKey.startsWith("def-")) {
      return kind === "outfield";
    }
    return true;
  }));
}
