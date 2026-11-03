/** Private operational diagnostic only. Never supplies a publication decision. */
export const COACH_RANKING_PENDING_REASONS = [
  "season-unavailable", "fixture-attribution-pending",
  "coach-editorial-identity-pending", "fixture-results-unavailable",
  "ranking-unconfirmed", "reconciliation-unconfirmed",
] as const;
export type CoachRankingPendingReason = typeof COACH_RANKING_PENDING_REASONS[number];
export type CoachRankingDiagnostic = Readonly<{
  version: 1;
  reason: CoachRankingPendingReason;
  pendingCoachCount: number | null;
  pendingFixtureCount: number | null;
}>;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const knownReason = (value: unknown): value is CoachRankingPendingReason =>
  typeof value === "string" && (COACH_RANKING_PENDING_REASONS as readonly string[]).includes(value);
function countIds(value: unknown): number | null {
  if (!Array.isArray(value) || value.length > 500
    || value.some(id => typeof id !== "string" || !/^[1-9]\d{0,15}$/.test(id))) return null;
  return new Set(value).size;
}
function countFixtures(value: unknown): number | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const ids = value.map(item => record(item)?.fixtureProviderId);
  return countIds(ids);
}
/** Read only a confirmed RPC envelope; never infer an editorial problem from an old generic error. */
export function summarizeCoachReconciliation(value: unknown, error: unknown = null): CoachRankingDiagnostic | null {
  const receipt = record(value);
  if (error || !receipt || typeof receipt.ok !== "boolean"
    || !Number.isSafeInteger(receipt.reconciled) || Number(receipt.reconciled) < 0) {
    return { version: 1, reason: "reconciliation-unconfirmed", pendingCoachCount: null, pendingFixtureCount: null };
  }
  const ranking = record(receipt.ranking);
  if (receipt.ok === true && ranking?.ok !== true
    || ranking && (typeof ranking.ok !== "boolean" || ranking.ok !== receipt.ok)) {
    return { version: 1, reason: "reconciliation-unconfirmed", pendingCoachCount: null, pendingFixtureCount: null };
  }
  if (receipt.ok === true) return null;
  const reason = ranking?.ok === false && knownReason(ranking.reason)
    && ranking.reason !== "reconciliation-unconfirmed" ? ranking.reason : "ranking-unconfirmed";
  return { version: 1, reason,
    pendingCoachCount: reason === "coach-editorial-identity-pending" ? countIds(ranking?.pendingCoachIds) : null,
    pendingFixtureCount: countFixtures(receipt.pending) };
}
/** Retain legacy fallback categories when the RPC did not confirm a precise reason. */
export function coachReconciliationFailureReason(diagnostic: CoachRankingDiagnostic | null, receiptConfirmed: boolean): string {
  const reason = diagnostic?.reason;
  return reason && reason !== "ranking-unconfirmed" && reason !== "reconciliation-unconfirmed"
    ? reason : receiptConfirmed ? "attribution-pending" : "unconfirmed";
}
/** Re-parse stored JSON before rendering. Extra fields, raw strings and IDs are never returned. */
export function parseCoachRankingDiagnostic(value: unknown): CoachRankingDiagnostic | null {
  const row = record(value);
  const validCount = (value: unknown) => value === null || Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 500;
  if (!row || row.version !== 1 || !knownReason(row.reason)
    || !validCount(row.pendingCoachCount) || !validCount(row.pendingFixtureCount)) return null;
  return { version: 1, reason: row.reason, pendingCoachCount: row.pendingCoachCount as number | null,
    pendingFixtureCount: row.pendingFixtureCount as number | null };
}
