import { createHash } from "node:crypto";
import { isTouchLineSettledFixtureStatus } from "./football-data/fixture-settlement.ts";
import { classifyTouchlineConfirmedMatchEvent, parseTouchlineEventScore, touchlineConfirmedHatTrickGoalFact, countTouchlineConfirmedHatTrickGoals } from "./touchlineArena/social-confirmed-event-contract.ts";
import { touchlineSocialFinalScoreGoalsMatchScore } from "./touchlineArena/social-final-score-events.ts";
import type { RankingsLiveDerived, RankingsLiveSource } from "./social-rankings-live-contract.ts";

type GoalEvent = { providerId: string; type: string; status: string; info?: string | null; addition?: string | null; teamId: string; playerId?: string; playerName?: string; result?: string; sortOrder: number };
export type RankingsGoldenBootEvidence = {
  status: string; competitionId: string; seasonId: string; fetchedAt: string; asOf: string; publishable: false;
  method: { feedEvidenceSha256: string };
  fixtureEvidence: { provider_fixture_id: string; status: string; starts_at: string; finalized_at: string | null; last_synced_at: string | null; home_score: number | null; away_score: number | null; home_provider_team_id: string; away_provider_team_id: string; goal_var_events: GoalEvent[] }[];
  verdict: { leader: { playerId: string; providerPlayerId: string; name: string; clubId: string; clubName: string; goals: number } };
  officialAggregateEvidence: { players: { goals_scored: number }[] };
};

/** Approval-only replay of the latest provider event set, never normalized history. */
export function applyRankingsGoldenBootEvidence(data: RankingsLiveDerived, source: RankingsLiveSource, evidence: RankingsGoldenBootEvidence): RankingsLiveDerived {
  const reject = (reason: string): never => { throw new Error(`GOLDEN_BOOT_${reason}`); };
  if (evidence.status !== "FACTUAL_RECONCILIATION_VERIFIED_FOR_PRIVATE_SAMPLE" || evidence.publishable !== false
    || evidence.competitionId !== data.provenance.competitionId || evidence.seasonId !== data.provenance.seasonId
    || !Number.isFinite(Date.parse(evidence.fetchedAt)) || !Number.isFinite(Date.parse(evidence.asOf))
    || Date.parse(evidence.asOf) > Date.parse(evidence.fetchedAt)) reject("EVIDENCE_SCOPE_INVALID");
  const hash = createHash("sha256").update(JSON.stringify(evidence.fixtureEvidence)).digest("hex");
  if (hash !== evidence.method.feedEvidenceSha256) reject("EVIDENCE_HASH_MISMATCH");
  const finals = evidence.fixtureEvidence.filter((f) => isTouchLineSettledFixtureStatus(f.status));
  if (finals.length !== data.provenance.fixtureIds.length || new Set(finals.map((f) => f.provider_fixture_id)).size !== finals.length
    || finals.some((f) => !data.provenance.fixtureIds.includes(f.provider_fixture_id))) reject("FIXTURE_COVERAGE_MISMATCH");
  const credits: { playerId: string; kind: "goal" | "penalty"; name: string }[] = [];
  const seen = new Set<string>();
  for (const fixture of finals) {
    const original = source.fixtures.find((f) => f.provider_fixture_id === fixture.provider_fixture_id);
    if (!original || original.home_score !== fixture.home_score || original.away_score !== fixture.away_score
      || Date.parse(original.starts_at) !== Date.parse(fixture.starts_at)
      || !fixture.last_synced_at || !fixture.finalized_at || Date.parse(fixture.last_synced_at) < Date.parse(fixture.finalized_at)) reject("FIXTURE_CHANGED");
    const goals = fixture.goal_var_events.map((event) => ({ ...event, info: event.info, addition: event.addition, playerId: event.playerId }))
      .map((event) => ({ ...event, kind: classifyTouchlineConfirmedMatchEvent(event) }))
      .filter((event) => event.kind === "goal" || event.kind === "penalty" || event.kind === "own-goal").sort((a, b) => a.sortOrder - b.sortOrder);
    if (!touchlineSocialFinalScoreGoalsMatchScore(goals, { homeTeamId: fixture.home_provider_team_id, awayTeamId: fixture.away_provider_team_id, homeScore: fixture.home_score!, awayScore: fixture.away_score! })) reject("SCORE_NOT_RECONCILED");
    let home = 0, away = 0;
    for (const [index, event] of goals.entries()) {
      if (seen.has(event.providerId)) reject("DUPLICATE_GOAL");
      seen.add(event.providerId);
      if (event.teamId === fixture.home_provider_team_id) home++; else away++;
      const score = parseTouchlineEventScore(event.result);
      if (event.sortOrder !== index + 1 || !score || score.home !== home || score.away !== away) reject("SCORE_PROGRESSION_MISMATCH");
      const credit = touchlineConfirmedHatTrickGoalFact(event);
      if (credit) credits.push({ ...credit, name: event.playerName ?? "" });
      else if (event.kind !== "own-goal") reject("SCORER_ID_MISSING");
    }
  }
  if (credits.length !== evidence.officialAggregateEvidence.players.reduce((sum, p) => sum + p.goals_scored, 0)) reject("OFFICIAL_AGGREGATE_MISMATCH");
  const totals = [...new Set(credits.map((event) => event.playerId))].map((playerId) => ({ playerId, goals: countTouchlineConfirmedHatTrickGoals(credits, playerId) }));
  const maximum = Math.max(...totals.map((p) => p.goals));
  const leaders = totals.filter((p) => p.goals === maximum);
  // A tied lead needs a shared-lead layout; never silently display the first name.
  if (leaders.length !== 1) reject("SHARED_LEAD_REQUIRES_LAYOUT");
  const leader = evidence.verdict.leader;
  const rankedLeader = data.seasonRanking.snapshot.players.find((p) => p.playerId === leader.playerId && p.providerPlayerId === leader.providerPlayerId);
  if (leaders[0]!.playerId !== leader.providerPlayerId || maximum !== leader.goals
    || !rankedLeader || rankedLeader.name !== leader.name || source.clubs.find((c) => c.id === leader.clubId)?.name !== rankedLeader.clubName) reject("LEADER_IDENTITY_MISMATCH");
  return { ...data, goldenBoot: { state: "FACTUAL_REVIEW", mismatchedFixtureIds: [], candidates: [{ playerId: leader.playerId, providerPlayerId: leader.providerPlayerId, name: rankedLeader!.name, clubId: leader.clubId, goals: maximum }] },
    gates: [...data.gates.filter((gate) => gate !== "GOLDEN_BOOT_GOAL_HISTORY_UNRECONCILED"), "GOLDEN_BOOT_LATEST_FEED_RECONCILED_PRIVATE_REVIEW", "NORMALIZED_GOAL_HISTORY_AND_SEASON_SUMMARY_REPAIR_PENDING", "FPL_ROUND_ADJUDICATION_RECHECK_REQUIRED"] };
}
