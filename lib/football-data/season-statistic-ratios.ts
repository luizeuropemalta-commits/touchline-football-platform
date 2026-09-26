/** Sportmonks count pairs; percentages are not additive across fixtures.
 * https://docs.sportmonks.com/v3/definitions/types/statistics/player-statistics
 * No inferred denominator or average of rounded match percentages is used.
 */
const COUNT_PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  "accurate-passes-percentage": ["accurate-passes", "passes"],
  "long-balls-won-percentage": ["long-balls-won", "long-balls"],
  "successful-crosses-percentage": ["accurate-crosses", "total-crosses"],
};

export function isSeasonPercentage(code: string) {
  return /(?:^|[-_])percentage$/i.test(code);
}

export function seasonPercentageFromCounts(code: string, statistics: Readonly<Record<string, unknown>>): number | null {
  const pair = COUNT_PAIRS[code];
  if (!pair) return null;
  const values = pair.map((key) => {
    const value = statistics[key];
    return typeof value === "number" ? value
      : typeof value === "string" && value.trim() ? Number(value) : NaN;
  });
  const [successes, attempts] = values;
  if (!values.every((value) => Number.isFinite(value) && value >= 0)
    || attempts === 0 || successes > attempts) return null;
  return Math.round(successes / attempts * 10000) / 100;
}

/** Also protects old read-only aggregates whose percentage columns were summed.
 * Count totals must describe the same covered fixture set (the aggregate builder
 * only includes a count when it is known for every member of that set).
 */
export function projectSeasonStatisticRatios(statistics: Readonly<Record<string, number | string>>) {
  return Object.fromEntries(Object.entries(statistics).flatMap(([code, value]) => {
    if (!isSeasonPercentage(code)) return [[code, value] as const];
    const percentage = seasonPercentageFromCounts(code, statistics);
    return percentage === null ? [] : [[code, percentage] as const];
  }));
}
