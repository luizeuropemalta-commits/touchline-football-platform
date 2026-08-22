type TouchLinePlayerSeasonAggregateIdentity = Readonly<{
  coverageStatus: unknown;
  expectedFixtureIds: unknown;
  aggregatedFixtureIds: unknown;
}>;

function canonicalFixtureIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  if (!ids.length || new Set(ids).size !== ids.length) return null;
  return [...ids].sort();
}

/**
 * Rankings and card prices may consume only a complete season settlement.
 * A partial aggregate remains available to honest match/card read models but
 * can never be promoted as an audited competition ranking.
 */
export function isTouchLinePlayerRankingAggregateComplete(
  aggregate: TouchLinePlayerSeasonAggregateIdentity,
) {
  if (aggregate.coverageStatus !== "complete") return false;
  const expected = canonicalFixtureIds(aggregate.expectedFixtureIds);
  const aggregated = canonicalFixtureIds(aggregate.aggregatedFixtureIds);
  return Boolean(
    expected
    && aggregated
    && expected.length === aggregated.length
    && expected.every((fixtureId, index) => fixtureId === aggregated[index]),
  );
}
