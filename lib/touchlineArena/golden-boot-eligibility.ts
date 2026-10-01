import type { FootballDataResult, TouchlineSeasonTopScorers } from "../football-data/types.ts";
import { strictSportmonksId } from "../football-data/sportmonks-season-topscorers.ts";

/** Must come from a separately verified canonical season/stage relationship,
 * never from the first row, ranking position or a request parameter alone. */
export type GoldenBootStageScope = Readonly<{
  authority: "canonical-season-stage";
  leagueId: string;
  seasonId: string;
  stageId: string;
}>;

type Leader = Readonly<{ providerPlayerId: string; providerTeamId: string; goals: number }>;
export type GoldenBootEligibility = Readonly<{
  phase: "unique" | "shared" | "unavailable";
  leaders: readonly Leader[];
  reason: string | null;
  scope: GoldenBootStageScope | null;
  fetchedAt: string | null;
  freshnessAuthority: "fetch-age-only";
  /** UUID/membership/publication and current provider evidence still need
   * validation before any public award. This module never grants that gate. */
  publicAwardEligible: false;
}>;

/** Stateless: stale, failed or ambiguous evidence revokes any previous lead.
 * Goals belong to the externally confirmed stage; stages are never summed. */
export function resolveGoldenBootEligibility(input: {
  evidence: FootballDataResult<TouchlineSeasonTopScorers> | null;
  scope: GoldenBootStageScope | null;
  maxAgeMs: number;
  nowMs?: number;
}): GoldenBootEligibility {
  const unavailable = (reason: string): GoldenBootEligibility => ({
    phase: "unavailable", leaders: [], reason, scope: null, fetchedAt: null,
    freshnessAuthority: "fetch-age-only", publicAwardEligible: false,
  });
  const { evidence, scope } = input;
  const now = input.nowMs ?? Date.now();
  if (!scope || scope.authority !== "canonical-season-stage"
    || ![scope.leagueId, scope.seasonId, scope.stageId].every(strictSportmonksId)) return unavailable("unverified-stage-scope");
  if (!Number.isFinite(now) || !Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs <= 0) return unavailable("invalid-freshness-policy");
  if (!evidence?.ok || evidence.provider !== "sportmonks") return unavailable("provider-unavailable");
  const data = evidence.data;
  if (data.coverage !== "complete" || !Number.isSafeInteger(data.pagesRead) || data.pagesRead < 1
    || data.scopeStatus !== "complete") return unavailable(data.scopeStatus === "ambiguous" ? "ambiguous-provider-facts" : "incomplete-provider-facts");
  const fetchedAt = Date.parse(data.fetchedAt);
  if (!Number.isFinite(fetchedAt) || Date.parse(evidence.fetchedAt) !== fetchedAt
    || fetchedAt > now || now - fetchedAt > input.maxAgeMs) return unavailable("stale-or-invalid-fetch-time");
  if (data.requestedSeasonId !== scope.seasonId || !Array.isArray(data.rows)) return unavailable("scope-mismatch");
  const byPlayer = new Map<string, Leader>();
  const byRecord = new Map<string, string>();
  for (const row of data.rows) {
    if (![row.providerRecordId, row.providerPlayerId, row.providerTeamId, row.leagueId, row.seasonId, row.stageId].every(strictSportmonksId)
      || row.goals === null || !Number.isSafeInteger(row.goals) || row.goals < 0) return unavailable("invalid-provider-row");
    if (row.leagueId !== scope.leagueId || row.seasonId !== scope.seasonId) return unavailable("scope-mismatch");
    const signature = JSON.stringify(row);
    const previousRecord = byRecord.get(row.providerRecordId!);
    if (previousRecord && previousRecord !== signature) return unavailable("conflicting-duplicate");
    byRecord.set(row.providerRecordId!, signature);
    if (row.stageId !== scope.stageId) continue;
    const previous = byPlayer.get(row.providerPlayerId!);
    if (previous && (previous.goals !== row.goals || previous.providerTeamId !== row.providerTeamId)) return unavailable("conflicting-duplicate");
    byPlayer.set(row.providerPlayerId!, { providerPlayerId: row.providerPlayerId!, providerTeamId: row.providerTeamId!, goals: row.goals });
  }
  const maximum = Math.max(0, ...Array.from(byPlayer.values(), row => row.goals));
  if (maximum === 0) return unavailable("no-positive-goals-in-scope");
  const leaders = [...byPlayer.values()].filter(row => row.goals === maximum)
    .sort((first, second) => first.providerPlayerId.localeCompare(second.providerPlayerId));
  return {
    phase: leaders.length === 1 ? "unique" : "shared", leaders, reason: null,
    scope, fetchedAt: data.fetchedAt, freshnessAuthority: "fetch-age-only", publicAwardEligible: false,
  };
}
