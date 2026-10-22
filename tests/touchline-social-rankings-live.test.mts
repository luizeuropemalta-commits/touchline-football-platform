import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveRankingsLive, type RankingsLiveSource, type RankingsLiveEvidence } from "../lib/social-rankings-live-contract.ts";
import { leadershipCrownEligibility } from "../lib/touchlineArena/leadership-decision.ts";
import { syntheticRankingsV4Evidence } from "./fixtures/rankings-v4.synthetic.mts";
import { validateRankingsLocalInput } from "../lib/social-rankings-render-input-local.mjs";

const source = JSON.parse(readFileSync(new URL("../artifacts/social-studio/rankings/snapshot-20260914.json", import.meta.url), "utf8")) as RankingsLiveSource;
const evidence: RankingsLiveEvidence = syntheticRankingsV4Evidence();
const derive = (s = source, e = evidence) => deriveRankingsLive(s, e, evidence.publishedPlayerIds, "fixture-audit");
test("active V4 replay refuses retained V3 settlement authority", () => {
  const historical = structuredClone(evidence);
  historical.settlements.forEach(row => { row.scoring_version = "player_scoring_v3"; });
  assert.throws(() => derive(source, historical), /RANKINGS_MISSING_SETTLEMENT/);
});

test("the whole final season and latest round remain separate", () => {
  const data = derive();
  assert.equal(data.provenance.fixtureIds.length, 40);
  assert.equal(data.seasonRanking.snapshot.players.length, 379);
  assert.equal(data.weeklyRanking.snapshot.fixtureIds.length, 10);
  assert.equal(data.weeklyRanking.snapshot.players.length, 285);
  assert.equal(data.overall.name, "Bruno Fernandes");
  assert.equal(data.overall.totalRating, 31.13);
  assert.equal(data.weeklyLeaders.find((p) => p.positionGroup === "midfielder")?.name, "Pascal Groß");
  assert.equal(data.weeklyLeaders.find((p) => p.positionGroup === "midfielder")?.totalRating, 9.51);
  assert.equal(data.selection.players.length, 11);
  assert.equal(new Set(data.selection.players.map((p) => p.player.playerId)).size, 11);
  assert.equal(data.selection.formation, "4-3-3");
  assert.equal(data.publishable, false);
  assert.notEqual(data.provenance.source, "PUBLISHED");
});

test("missing ratings remain omitted; incomplete fixture evidence blocks instead of becoming zero", () => {
  const data = derive();
  assert.ok(evidence.settlements.some((s) => s.appearance_status === "substitute" && s.rating === null));
  assert.ok(data.weeklyRanking.snapshot.players.every((p) => p.totalRating !== null && p.totalRating > 0));
  const missing = structuredClone(evidence);
  const index = missing.settlements.findIndex((s) => s.football_player_id === data.overall.playerId);
  missing.settlements.splice(index, 1);
  assert.throws(() => derive(source, missing), /RANKINGS_MISSING_SETTLEMENT/);
});

test("unfinished final round cannot produce final ranking or table artwork", () => {
  const partial = structuredClone(source);
  partial.fixtures.find((f) => f.provider_fixture_id === "19722168")!.status = "LIVE";
  assert.throws(() => derive(partial), /RANKINGS_ROUND_INCOMPLETE/);
});

test("a feed missing from the complete season blocks the replay", () => {
  const incomplete = structuredClone(evidence);
  incomplete.ratingFeeds.pop();
  assert.throws(() => derive(source, incomplete), /RANKINGS_LINEUP_COVERAGE_MISSING/);
});

test("a rating disagreement between canonical feed and settlement is not repaired silently", () => {
  const changed = structuredClone(evidence);
  const rating = changed.ratingFeeds.flatMap((f) => f.lineups).find((p) => p.playerId === "129602")!.statistics.find((s) => s.code === "rating")!;
  rating.value = 10;
  assert.throws(() => derive(source, changed), /RANKINGS_FEED_SETTLEMENT_MISMATCH/);
});

test("coach and club table reuse their distinct scoring rules", () => {
  const data = derive();
  assert.equal(data.coaches[0]?.name, "Enzo Maresca");
  assert.equal(data.coaches[0]?.touchlinePoints, 18);
  assert.equal(data.coaches[0]?.home.touchlinePoints, 6);
  assert.equal(data.coaches[0]?.away.touchlinePoints, 12);
  assert.equal(data.table.rows[0]?.team.name, "Arsenal");
  assert.equal(data.table.rows[0]?.points, 12);
  assert.equal(data.table.rows[1]?.team.name, "Manchester City");
  assert.ok(data.table.rows.every((r) => r.played === 4));
});

test("coach artwork fails closed when the published payload changes or loses scope", () => {
  for (const mutate of [
    (s: RankingsLiveSource) => { s.coachSnapshot.ranking_payload[0]!.touchlinePoints = 999; },
    (s: RankingsLiveSource) => { s.coachSnapshot.ranking_payload[0]!.coachProviderId = "307"; },
    (s: RankingsLiveSource) => { s.coachSnapshot.ranking_payload.pop(); },
    (s: RankingsLiveSource) => { s.coachSnapshot.fixture_ids.pop(); },
    (s: RankingsLiveSource) => { s.coachSnapshot.ranking_payload.reverse(); },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => derive(changed), /RANKINGS_COACH_/);
  }
});

test("season coach artwork consumes every exact published ranking row", () => {
  const data = derive();
  assert.deepEqual(data.coaches.map(c => ({ coachProviderId: c.coachProviderId, touchlinePoints: c.touchlinePoints, wins: c.wins, draws: c.draws, losses: c.losses, awayWins: c.awayWins })), source.coachSnapshot.ranking_payload.map(c => ({ coachProviderId: c.coachProviderId, touchlinePoints: c.touchlinePoints, wins: c.wins, draws: c.draws, losses: c.losses, awayWins: c.awayWins })));
});

test("old frozen inputs require explicit validation flags through the gated extracted reader", () => {
  const valid = {
    publicCardsRevalidated: true, coachSnapshotValidated: true,
    goldenBootEvidenceSha256: "synthetic",
    data: { provenance: { source: "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED" }, publishable: false, weeklySelection: { complete: true } },
  };
  assert.equal(validateRankingsLocalInput(valid), valid);
  // The binding suite covers false flags; retained inputs can omit flags or encode truthy non-booleans.
  for (const property of ["publicCardsRevalidated", "coachSnapshotValidated"]) {
    for (const invalid of [undefined, null, 1, "true"]) {
      assert.throws(() => validateRankingsLocalInput({ ...valid, [property]: invalid }), /INVALID_LOCAL_REVIEW_INPUT_REPREPARE_REQUIRED/);
    }
  }
  assert.throws(() => validateRankingsLocalInput({ ...valid, data: { ...valid.data, provenance: { source: "PUBLISHED" } } }), /INVALID_LOCAL_REVIEW_INPUT_REPREPARE_REQUIRED/);
  const server = readFileSync(new URL("../lib/social-rankings-live-server.ts", import.meta.url), "utf8");
  assert.match(server, /import\s*\{\s*readRankingsLocalInput\s*\}\s*from\s*"\.\/social-rankings-render-input-local\.mjs"/);
  const readerStart = server.indexOf("export async function readRankingsLiveRenderInput");
  assert.ok(readerStart >= 0);
  assert.match(server.slice(readerStart), /if\s*\(process\.env\.NODE_ENV !== "development"\) throw new Error\("LOCAL_DEVELOPMENT_ONLY"\);\s*return readRankingsLocalInput\(root\(\), runId, inputSha256\);/);
  const reader = readFileSync(new URL("../lib/social-rankings-render-input-local.mjs", import.meta.url), "utf8");
  assert.match(reader, /const input = validateRankingsLocalInput\(JSON\.parse\(bytes\.toString\("utf8"\)\)\);\s*return \{ input,/);
});

test("unreconciled recorded goals cannot authorize a Golden Boot candidate", () => {
  const data = derive();
  assert.equal(data.goldenBoot.state, "BLOCKED_RECONCILIATION");
  assert.deepEqual([...data.goldenBoot.mismatchedFixtureIds].sort(), ["19722173", "19722179", "19722182", "19722183", "19722187"]);
  assert.ok(data.gates.includes("GOLDEN_BOOT_GOAL_HISTORY_UNRECONCILED"));
});

test("a local crown uses the exact unique overall leader and exact scope", () => {
  const data = derive();
  assert.equal(leadershipCrownEligibility(data.leadership, { subjectType: "player", subjectId: data.overall.playerId }, { rankingId: "touchline-player-overall", snapshotId: data.seasonRanking.snapshot.snapshotId }), true);
  assert.equal(leadershipCrownEligibility(data.leadership, { subjectType: "player", subjectId: data.weeklyLeaders[0]!.playerId }), false);
  assert.equal(leadershipCrownEligibility(data.leadership, { subjectType: "player", subjectId: data.overall.playerId }, { rankingId: "touchline-player-overall", snapshotId: source.playerSnapshot.snapshot_id }), false);
});

test("weekly individual and XI reuse only the completed round and never borrow season totals", () => {
  const data = derive();
  assert.equal(data.weeklyOverall.name, "Pascal Groß");
  assert.equal(data.weeklyOverall.totalRating, 9.51);
  assert.equal(data.weeklySelection.players.length, 11);
  assert.equal(data.weeklySelection.sourceSnapshotId, data.weeklyRanking.snapshot.snapshotId);
  assert.ok(data.weeklySelection.players.every((slot) => slot.player.totalRating <= 10));
  assert.ok(data.weeklyCoaches.every((coach) => coach.wins + coach.draws + coach.losses === 1));
  assert.equal(data.weeklyCoaches[0]!.touchlinePoints, 6);
  assert.equal(data.nextRoundStartsAt, "2026-09-18T19:00:00+00:00");
});
