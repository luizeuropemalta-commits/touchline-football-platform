import { resolveTouchlineTopScorersRanking, type GoldenBootStageScope, type TouchlineTopScorersRankingInput } from "./top-scorers-ranking.ts";
export type { GoldenBootStageScope } from "./top-scorers-ranking.ts";

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

/** The Bota follows first place in the shared goals ranking. It owns no
 * separate max-goals calculation, tie-breaker or provider request. */
export function resolveGoldenBootEligibility(input: TouchlineTopScorersRankingInput): GoldenBootEligibility {
  const unavailable = (reason: string): GoldenBootEligibility => ({
    phase: "unavailable", leaders: [], reason, scope: null, fetchedAt: null,
    freshnessAuthority: "fetch-age-only", publicAwardEligible: false,
  });
  const ranking = resolveTouchlineTopScorersRanking(input);
  if (ranking.status !== "ready") return unavailable(ranking.reason ?? "incomplete-provider-facts");
  const leaders = ranking.rows.filter(row => row.position === 1 && row.goals > 0)
    .map(({ providerPlayerId, providerTeamId, goals }) => ({ providerPlayerId, providerTeamId, goals }));
  if (!leaders.length) return unavailable("no-positive-goals-in-scope");
  return {
    phase: leaders.length === 1 ? "unique" : "shared", leaders, reason: null,
    scope: ranking.scope, fetchedAt: ranking.fetchedAt, freshnessAuthority: "fetch-age-only", publicAwardEligible: false,
  };
}
