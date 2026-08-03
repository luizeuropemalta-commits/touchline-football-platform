import type { TouchlineFantasyPlayerStatistic } from "../football-data/types.ts";

export type TouchLineOfficialStatGroup =
  | "summary"
  | "attack"
  | "distribution"
  | "defending"
  | "discipline"
  | "goalkeeping"
  | "other";

export type TouchLineOfficialStat = TouchlineFantasyPlayerStatistic & {
  label: string;
  group: TouchLineOfficialStatGroup;
  value: number | string;
};

type RawPlayerStatistics = {
  seasonId?: unknown;
  details?: TouchlineFantasyPlayerStatistic[];
};

const SUMMARY_CODES = /^(?:appearances?|games?|lineups?|starts?|minutes?(?:-played)?|goals?|assists?|yellow-?cards?|red-?cards?|rating)$/;

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeStatCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function groupFor(code: string): TouchLineOfficialStatGroup {
  if (SUMMARY_CODES.test(code)) return "summary";
  if (/save|keeper|clean-?sheets?|goals?-conceded|goal-kick|punch|claim/.test(code)) return "goalkeeping";
  if (/card|foul|suspension/.test(code)) return "discipline";
  if (/pass|cross|key|accurate|touch/.test(code)) return "distribution";
  if (/blocked-shots|tackle|interception|clearance|duel|aerial|recover|error|dribbled-past/.test(code)) return "defending";
  if (/goal|shot|attack|penalt|offside|chance|woodwork|dribble|dispossess/.test(code)) return "attack";
  return "other";
}

export function normalizeTouchLineOfficialStats(payload: Record<string, unknown>): {
  seasonId: string | null;
  fetchedAt: string | null;
  stats: TouchLineOfficialStat[];
} {
  const seasons = Array.isArray(payload.statistics)
    ? payload.statistics as RawPlayerStatistics[]
    : [];
  const selected = [...seasons].reverse().find((season) => Array.isArray(season.details) && season.details.length > 0);
  const stats = (selected?.details ?? []).flatMap((detail) => {
    if (detail.value === undefined || detail.value === null || detail.value === "") return [];
    const code = normalizeStatCode(detail.code ?? detail.name ?? detail.typeId);
    const codeGroup = groupFor(code);
    const nameGroup = groupFor(normalizeStatCode(detail.name));
    return [{
      ...detail,
      code,
      label: detail.name?.trim() || humanize(code),
      group: codeGroup === "other" ? nameGroup : codeGroup,
      value: detail.value,
    } satisfies TouchLineOfficialStat];
  });

  return {
    seasonId: selected?.seasonId ? String(selected.seasonId) : null,
    fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : null,
    stats,
  };
}

export function findTouchLineOfficialStat(stats: TouchLineOfficialStat[], patterns: RegExp[]) {
  return stats.find((stat) => patterns.some((pattern) => pattern.test(stat.code ?? "")));
}
