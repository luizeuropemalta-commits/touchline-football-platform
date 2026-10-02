import type { FootballDataResult, TouchlineSeasonTopScorers } from "../football-data/types.ts";
import { strictSportmonksId } from "../football-data/sportmonks-season-topscorers.ts";

/** Verified independently of the leaderboard; never inferred from its first row. */
export type GoldenBootStageScope = Readonly<{
  authority: "canonical-season-stage";
  leagueId: string;
  seasonId: string;
  stageId: string;
}>;

export type TouchlineTopScorer = Readonly<{
  providerPlayerId: string;
  providerTeamId: string;
  goals: number;
  /** Competition ranking: shared places use 1, 1, 3, not an invented tie-break. */
  position: number;
}>;
export type TouchlineTopScorersRankingInput = Readonly<{
  evidence: FootballDataResult<TouchlineSeasonTopScorers> | null;
  scope: GoldenBootStageScope | null;
  maxAgeMs: number;
  nowMs?: number;
}>;
export type TouchlineTopScorersRanking = Readonly<{
  status: "ready" | "unavailable";
  rows: readonly TouchlineTopScorer[];
  reason: string | null;
  scope: GoldenBootStageScope | null;
  fetchedAt: string | null;
  freshnessAuthority: "fetch-age-only";
  /** Canonical identities/publications still gate a public award downstream. */
  publicAwardEligible: false;
}>;

/** One complete ranking of the supplied Sportmonks leaderboard. No fetches,
 * event re-counts or parallel totals: stage totals are sorted, never summed.
 * Failure exposes no partial/stale ranking. Empty/zero rankings award nothing. */
export function resolveTouchlineTopScorersRanking(input: TouchlineTopScorersRankingInput): TouchlineTopScorersRanking {
  const unavailable = (reason: string): TouchlineTopScorersRanking => ({
    status: "unavailable", rows: [], reason, scope: null, fetchedAt: null,
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
  const byPlayer = new Map<string, Omit<TouchlineTopScorer, "position">>();
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
  // Provider ID stabilizes display order only. Equal goals retain equal places.
  const sorted = [...byPlayer.values()].sort((a, b) => b.goals - a.goals || a.providerPlayerId.localeCompare(b.providerPlayerId));
  let position = 0;
  const rows = sorted.map((row, index) => {
    if (index === 0 || row.goals !== sorted[index - 1].goals) position = index + 1;
    return { ...row, position };
  });
  return { status: "ready", rows, reason: null, scope: { ...scope }, fetchedAt: data.fetchedAt,
    freshnessAuthority: "fetch-age-only", publicAwardEligible: false };
}
