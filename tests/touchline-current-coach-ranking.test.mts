import assert from "node:assert/strict";
import test from "node:test";
import { legacyCoachCatalogue, parseCoachCatalogueTransport, type CoachCatalogue } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { projectTouchlineCurrentCoachRanking, parseTouchlineCurrentCoachRanking } from "../lib/touchlineArena/current-coach-ranking.ts";
import { coachCompetitionFromRanking } from "../lib/touchlineArena/coach-competition-projection.ts";
import { buildTouchlineCardLeadershipValue, resolveCoachCardPoints, inheritedCoachCrown, resetCardLeadershipSeed, advanceCardLeadershipRead, resetPlayerLeadershipSeed, advancePlayerLeadershipRead } from "../lib/touchlineArena/card-leadership-authority.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../lib/touchlineArena/card-ranking-live.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

const seasonId = "00000000-0000-4000-8000-000000000001";
const competitionId = "00000000-0000-4000-8000-000000000002";
const seed = legacyCoachCatalogue();
const publishedEntries = seed.current.map((entry, index) => ({ ...entry,
  internalId: `00000000-0000-4000-8000-${String(index + 1001).padStart(12, "0")}`,
  publicationId: `00000000-0000-4000-8000-${String(index + 2001).padStart(12, "0")}`,
}));
const catalogue = parseCoachCatalogueTransport({ phase: "ready", revision: 1, current: publishedEntries, history: publishedEntries })!;
assert.equal(catalogue.phase, "ready");
const scope = { seasonId, competitionId, effectiveSeason: "2026-27",
  clubs: catalogue.current.map(entry => ({ providerTeamId: entry.coach.teamId!, name: `Club ${entry.coach.teamId}` })) };
const first = catalogue.current[0]!.coach.providerId;
const second = catalogue.current[1]!.coach.providerId;
const third = catalogue.current[2]!.coach.providerId;
function source(): TouchLineCoachRankingState {
  return { phase: "ranked", snapshotId: "confirmed-season-ledger", seasonId, scoringVersion: "coach_scoring_v2",
    fixtureIds: ["111", "222"], generatedAt: "2026-11-04T00:00:00Z", catalogue,
    rows: catalogue.current.map((entry, index) => ({ rank: index + 1, coachProviderId: entry.coach.providerId,
      coachName: entry.coach.name, clubName: `Historical club ${index}`, touchlinePoints: 60 - index * 3,
      wins: 20 - index, draws: 0, losses: 0, awayWins: 0,
      home: { wins: 20 - index, draws: 0, losses: 0, touchlinePoints: 60 - index * 3 },
      away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 } })) };
}
function departed(): CoachCatalogue {
  const replacement = { ...catalogue.current[0]!, coach: { ...catalogue.current[0]!.coach, providerId: "999999999", id: "sportmonks:999999999", name: "Replacement", displayName: "Replacement" } };
  return { ...catalogue, current: [replacement, ...catalogue.current.slice(1)] };
}

test("departure removes current ranking and crown, preserves every audited season fact", () => {
  const raw = source(); const before = structuredClone(raw);
  const result = projectTouchlineCurrentCoachRanking(raw, departed(), scope)!;
  assert.equal(result.phase, "ranked");
  assert.equal(result.rows.length, 19);
  assert.deepEqual(result.rows.map(row => row.rank), Array.from({ length: 19 }, (_, index) => index + 1));
  assert.equal(result.rows[0]!.coachProviderId, second);
  assert.deepEqual(result.seasonRows, raw.rows);
  assert.deepEqual(raw, before);
  const historical = coachCompetitionFromRanking(result, first)!;
  assert.equal(historical.rank, null);
  assert.equal(historical.totalTouchlinePoints, 60);
  assert.deepEqual(historical.home, raw.rows[0]!.home);
  const authority = buildTouchlineCardLeadershipValue(null, result);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: first }), false);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: second }), true);
  assert.equal(resolveCoachCardPoints({ authority, coachProviderId: first, liveRankingPoints: true, slotStatus: "audited" }), 60);
});

test("same-season return restores accumulated points without a new identity", () => {
  const raw = source();
  const out = projectTouchlineCurrentCoachRanking(raw, departed(), scope)!;
  const back = projectTouchlineCurrentCoachRanking(raw, catalogue, scope)!;
  assert.equal(back.rows[0]!.coachProviderId, first);
  assert.equal(back.rows[0]!.touchlinePoints, 60);
  assert.equal(back.rows[0]!.rank, 1);
  assert.notEqual(out.currentRevision, back.currentRevision);
  assert.equal(out.snapshotId, back.snapshotId);
});

test("intra-league transfer and return to another club retain person-season totals", () => {
  const raw = source();
  const changed = structuredClone(catalogue);
  const entries = [...changed.current];
  const firstTeam = entries[0]!.coach.teamId;
  entries[0] = { ...entries[0]!, coach: { ...entries[0]!.coach, teamId: entries[1]!.coach.teamId } };
  entries[1] = { ...entries[1]!, coach: { ...entries[1]!.coach, teamId: firstTeam } };
  const result = projectTouchlineCurrentCoachRanking(raw, { ...changed, current: entries }, scope)!;
  assert.equal(result.rows[0]!.clubName, scope.clubs[1]!.name);
  assert.equal(result.rows[0]!.touchlinePoints, 60);
  assert.deepEqual(result.rows[0]!.home, raw.rows[0]!.home);
  assert.equal(result.rows[0]!.coachProviderId, first);
  assert.deepEqual(result.seasonRows, raw.rows);
});

test("a club that is no longer in this competition cannot supply a current coach", () => {
  const result = projectTouchlineCurrentCoachRanking(source(), catalogue, { ...scope, clubs: scope.clubs.slice(1) })!;
  assert.equal(result.rows.some(row => row.coachProviderId === first), false);
  assert.equal(result.rows[0]!.coachProviderId, second);
});

test("new season starts at zero without deleting or relabelling the prior publication", () => {
  const raw = source(); const before = structuredClone(raw);
  const nextScope = { ...scope, seasonId: "00000000-0000-4000-8000-000000000003", effectiveSeason: "2027-28" };
  const result = projectTouchlineCurrentCoachRanking(raw, catalogue, nextScope)!;
  assert.equal(result.phase, "preseason");
  assert.equal(result.snapshotId, null);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.seasonRows, []);
  assert.deepEqual(result.fixtureIds, []);
  const competition = coachCompetitionFromRanking(result, first)!;
  assert.equal(competition.totalTouchlinePoints, 0);
  assert.equal(competition.rank, null);
  assert.equal(competition.snapshotId, null);
  assert.equal(competition.seasonId, nextScope.seasonId);
  assert.equal(competition.seasonLabel, "2027-28");
  assert.deepEqual(raw, before);
  const authority = buildTouchlineCardLeadershipValue(null, result);
  assert.equal(authority.coachLeader, null);
  assert.equal(resolveCoachCardPoints({ authority, coachProviderId: first, liveRankingPoints: true, slotStatus: "audited", slotPoints: 60 }), 0);
});

test("ties use points, wins, away wins, stable identity after eligibility filtering", () => {
  const raw = source(); const rows = [...raw.rows];
  rows[0] = { ...rows[0]!, touchlinePoints: 40, wins: 5, awayWins: 3 };
  rows[1] = { ...rows[1]!, touchlinePoints: 40, wins: 6, awayWins: 1 };
  rows[2] = { ...rows[2]!, touchlinePoints: 40, wins: 6, awayWins: 2 };
  const result = projectTouchlineCurrentCoachRanking({ ...raw, rows: rows.slice(0, 3) }, catalogue, scope)!;
  assert.deepEqual(result.rows.map(row => row.coachProviderId), [third, second, first]);
  const tied = projectTouchlineCurrentCoachRanking({ ...raw, rows: rows.slice(0, 3).map(row => ({ ...row, wins: 6, awayWins: 1 })) }, catalogue, scope)!;
  assert.deepEqual(tied.rows.map(row => row.coachProviderId), [first, second, third].sort());
});

test("unknown scope/catalogue and unavailable ledger never become partial or fake zero rankings", () => {
  assert.equal(projectTouchlineCurrentCoachRanking(source(), catalogue, null), null);
  assert.equal(projectTouchlineCurrentCoachRanking(source(), legacyCoachCatalogue(), scope), null, "Static bootstrap never proves a current appointment");
  assert.equal(projectTouchlineCurrentCoachRanking(source(), { ...catalogue, phase: "unavailable" }, scope), null);
  assert.equal(projectTouchlineCurrentCoachRanking({ ...source(), phase: "unavailable" }, catalogue, scope), null);
  assert.equal(projectTouchlineCurrentCoachRanking(source(), { ...catalogue, current: catalogue.current.slice(1) }, scope), null);
  assert.equal(projectTouchlineCurrentCoachRanking(source(), catalogue, { ...scope, seasonId: "guess" }), null);
});

test("transport recomputes current view and rejects forged scores/ranks/history and source identity", () => {
  const raw = source(); const result = projectTouchlineCurrentCoachRanking(raw, catalogue, scope)!;
  assert.deepEqual(parseTouchlineCurrentCoachRanking(JSON.parse(JSON.stringify(result)), raw), result);
  for (const forged of [
    { ...result, rows: result.rows.map((row, index) => index === 0 ? { ...row, touchlinePoints: 999 } : row) },
    { ...result, rows: result.rows.map((row, index) => index === 0 ? { ...row, rank: 99 } : row) },
    { ...result, seasonRows: result.seasonRows!.map((row, index) => index === 0 ? { ...row, touchlinePoints: 999 } : row) },
    { ...result, currentRevision: "invented" },
    { ...result, currentProjection: { ...result.currentProjection!, sourceSnapshotId: "other" } },
  ]) {
    assert.equal(parseTouchlineCurrentCoachRanking(forged, raw), null);
  }
});

test("live updates with the same immutable snapshot withdraw and restore current crowns", () => {
  const raw = source();
  const player = { ...TOUCHLINE_PRESEASON_RANKING_STATE, seasonId };
  let state = resetCardLeadershipSeed(buildTouchlineCardLeadershipValue(player, projectTouchlineCurrentCoachRanking(raw, catalogue, scope)), 1, 1);
  for (const [revision, next, leader] of [[2, departed(), second], [3, catalogue, first]] as const) {
    state = advanceCardLeadershipRead(state, { state: player, coachRanking: projectTouchlineCurrentCoachRanking(raw, next, scope), revision, requestEpoch: revision, publicationDigest: "a".repeat(32) });
    assert.equal(state.current.coachLeader?.coachProviderId, leader);
  }
  const nextScope = { ...scope, seasonId: "00000000-0000-4000-8000-000000000003", effectiveSeason: "2027-28" };
  state = advanceCardLeadershipRead(state, { state: { ...TOUCHLINE_PRESEASON_RANKING_STATE, seasonId: nextScope.seasonId }, coachRanking: projectTouchlineCurrentCoachRanking(raw, catalogue, nextScope), revision: 4, requestEpoch: 4, publicationDigest: "a".repeat(32) });
  assert.equal(state.current.coachLeader, null);
  assert.equal(state.current.coachRanking?.seasonId, nextScope.seasonId);
});


test("the standalone player authority advances through confirmed season rollover without keeping the prior watermark", () => {
  const old = { ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked" as const, seasonId, snapshotId: "old", publishedAt: "2026-11-04T00:00:00Z" };
  const nextSeasonId = "00000000-0000-4000-8000-000000000003";
  const currentProjection = { version: 1 as const, revision: "b".repeat(64), competitionId,
    currentSeasonId: nextSeasonId, sourceSnapshotId: "old", sourcePlayerCount: 0,
    eligiblePlayerCount: 0, effectiveSeason: "2027-28", bindings: [] };
  const preseason = { ...TOUCHLINE_PRESEASON_RANKING_STATE, seasonId: nextSeasonId, currentProjection };
  let state = resetPlayerLeadershipSeed(old, 1, 1);
  state = advancePlayerLeadershipRead(state, { state: preseason, revision: 2, requestEpoch: 2, publicationDigest: "a".repeat(32) });
  assert.equal(state.watermark?.seasonId, nextSeasonId);
  const firstRound = { ...preseason, phase: "ranked" as const, snapshotId: "next", publishedAt: "2027-08-10T00:00:00Z" };
  state = advancePlayerLeadershipRead(state, { state: firstRound, revision: 3, requestEpoch: 3, publicationDigest: "b".repeat(32) });
  assert.equal(state.current?.snapshotId, "next");
  const direct = advancePlayerLeadershipRead(resetPlayerLeadershipSeed(old, 1, 1), { state: firstRound, revision: 3, requestEpoch: 3, publicationDigest: "b".repeat(32) });
  assert.equal(direct.current?.snapshotId, "next");
});
