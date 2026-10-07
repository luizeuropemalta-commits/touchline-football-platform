import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { classifyTouchlineSocialFinalScoreGoalType, touchlineSocialFinalScoreGoalsMatchScore } from "../lib/touchlineArena/social-final-score-events.ts";
import { touchlineFixtureState } from "../lib/touchlineArena/match-centre.ts";
import { buildTouchlineFinalResultCaption } from "../lib/touchlineArena/social-final-result-caption.ts";
import { checksumTouchlineFinalResultRenderSource } from "../lib/touchlineArena/social-final-result-render-source.ts";

const path = new URL("../lib/touchlineArena/social-final-score-draft-server.ts", import.meta.url);
const source = readFileSync(path, "utf8");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-10-03T07:00:00.000Z", now = Date.parse(stamp) + 1000;
const hash = `sha256:${"a".repeat(64)}`;
const request = { canonicalFixtureId: uuid(1), providerFixtureId: "123" };
const options = { enabled: true, now: () => now, maxRows: 10, timeoutMs: 1000 };

function fixture() {
  const canonical = { id: uuid(1), provider: "sportmonks", provider_fixture_id: "123", competition_id: uuid(2), season_id: uuid(3), round_id: uuid(4), home_club_id: uuid(5), away_club_id: uuid(6), source_updated_at: stamp, status: "FT", home_score: 0, away_score: 0 };
  const player = { id: uuid(10), football_player_id: uuid(11), fixture_id: uuid(1), competition_id: uuid(2), season_id: uuid(3), club_id: uuid(5), scoring_version: "player_scoring_v4", settlement_status: "final", source_synced_at: stamp };
  const coach = { id: uuid(20), contract_id: uuid(21), fixture_id: uuid(1), fixture_context: "home", home_score: 0, away_score: 0, scoring_version: "coach_scoring_v2", settlement_status: "final", provider_source_updated_at: stamp, settled_at: stamp, touchline_coach_contracts: { id: uuid(21), club_id: uuid(5) } };
  const data = { canonical, players: [player], coaches: [coach], competition: { id: uuid(2), provider: "sportmonks", provider_competition_id: "8" }, season: { id: uuid(3), provider: "sportmonks", provider_season_id: "99", competition_id: uuid(2) }, clubs: [{ id: uuid(5), provider: "sportmonks", provider_team_id: "10" }, { id: uuid(6), provider: "sportmonks", provider_team_id: "20" }] };
  const calls: { table: string; select: string; filters: [string, unknown][]; range?: number[]; count?: string }[] = [];
  let playerCount: number | null = 1, coachCount: number | null = 1, clock = 4, checkpoints = 0;
  let changeAt = Infinity, failTable = "", capturedAt = stamp;
  let holdPrivate = false, release: (() => void) | undefined;
  const admin = { from(table: string) {
    const call: typeof calls[number] = { table, select: "", filters: [] }; calls.push(call);
    const chain = {
      select(value: string, opt?: { count: string }) { call.select = value; call.count = opt?.count; return chain; },
      eq(k: string, v: unknown) { call.filters.push([k, v]); return chain; }, in(k: string, v: unknown) { call.filters.push([k, v]); return chain; },
      order() { return chain; }, range(a: number, b: number) { call.range = [a, b]; return chain; }, abortSignal() { return chain; }, maybeSingle() { return chain; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        let result: unknown = null, count: number | null = null;
        if (table === "football_fixtures") result = data.canonical;
        if (table === "football_competitions") result = data.competition;
        if (table === "football_seasons") result = data.season;
        if (table === "football_clubs") { result = data.clubs; count = data.clubs.length; }
        if (table === "touchline_player_fixture_score_settlements") { result = data.players; count = playerCount; }
        if (table === "touchline_coach_fixture_points") { result = data.coaches; count = coachCount; }
        const response = { data: structuredClone(result), count, error: table === failTable ? { message: "unavailable" } : null };
        if (holdPrivate && table === "football_fixtures" && call.select.includes("provider_fixture_id")) {
          return new Promise(done => { release = () => done(response); }).then(resolve, reject);
        }
        return Promise.resolve(response).then(resolve, reject);
      },
    }; return chain;
  } };
  const home = { teamId: "10", name: "Home", logoUrl: "/home.svg" }, away = { teamId: "20", name: "Away", logoUrl: "/away.svg" };
  const fixtureData = { competitionId: "8", seasonId: "99", startsAt: stamp, roundName: "Round 2", status: "FT", homeScore: 0, awayScore: 0, homeTeam: { providerId: "10" }, awayTeam: { providerId: "20" } };
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtureByProviderId: async () => fixtureData },
    "@/lib/football-data/public-fantasy-fixture": { toPublicFantasyFixtureFeed: (v: unknown) => v },
    "@/lib/football-data/public-fantasy-snapshot": { readPersistedFantasyFixtureFeed: async () => ({ feed: {}, capturedAt }) },
    "@/lib/football-data/public-fixture-match-detail-server": { readPublicFantasyFixtureMatchDetail: async () => ({ fixture: { ...fixtureData, homeTeam: { id: "10" }, awayTeam: { id: "20" } }, events: [], playerStatistics: [{ settlementStatus: "final", appearanceStatus: "started", rating: 8, minutes: 90, teamId: "10", playerId: "100" }] }) },
    "@/lib/football-data/public-premier-squad-server": { readPublicPremierSquad: async () => ({ status: 200, body: { players: [{}] } }), publicPremierSquadPlayerToCard: () => ({ id: "100", canonicalPlayerId: uuid(11), name: "Player", editorialCard: {}, cardTier: "gold" }) },
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS: [home, away] },
    "@/lib/touchlineArena/matchday-player-points": { applyTouchlineSeasonPoints: (v: unknown) => v },
    "@/lib/touchlineArena/public-season-player-points-server": { readPublicSeasonPlayerPoints: async () => ({}) },
    "@/lib/touchlineArena/match-centre": { touchlineFixtureState },
    "@/lib/touchlineArena/stadium-catalog": { resolveTouchlineFixtureVenue: () => ({ name: "Venue", interiorImageUrl: "/venue.jpg" }) },
    "@/lib/touchlineArena/social-final-result-caption": { buildTouchlineFinalResultCaption },
    "@/lib/touchlineArena/social-final-result-render-source": { checksumTouchlineFinalResultRenderSource },
    "@/lib/touchlineArena/social-final-score-events": { classifyTouchlineSocialFinalScoreGoalType, touchlineSocialFinalScoreGoalsMatchScore },
    "@/lib/touchlineArena/social-source-revision-server": { readTouchlineSocialSourceRevisionCheckpoint: async (keys: string[]) => { if (++checkpoints === changeAt) clock++; return { clockRevision: clock, checksum: hash, manifest: Object.fromEntries(keys.map(k => [k, 4])) }; } },
  };
  const compiledModule = { exports: {} as {
    readTouchlineSocialFinalScoreDraft: (...args: unknown[]) => Promise<unknown>;
    readTouchlineFinalScorePushEvidence: (...args: unknown[]) => Promise<unknown>;
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, {
    module: compiledModule, exports: compiledModule.exports, require: (id: string) => { assert.ok(Object.hasOwn(dependencies, id), id); return dependencies[id]; },
    setTimeout, clearTimeout, AbortController, Date,
  });
  return { ...compiledModule.exports, data, calls, setCounts(p: number | null, c = coachCount) { playerCount = p; coachCount = c; }, change(at: number) { changeAt = at; }, fail(table: string) { failTable = table; }, captured(value: string) { capturedAt = value; }, hold() { holdPrivate = true; }, release() { release?.(); } };
}

test("public reader prefix remains byte-identical and private evidence never enters its DTO/queries", async () => {
  const prefix = source.split("\n// Private FINAL SCORE push evidence.")[0];
  assert.equal(createHash("sha256").update(prefix).digest("hex"), "3565d56eb8ad6293a0a5126e1b24f1d42795c2c6513b4ad433cd56ea91cba32a");
  const h = fixture(), result = await h.readTouchlineSocialFinalScoreDraft("123") as { ok: boolean; data: object };
  assert.equal(result.ok, true); assert.equal(Object.hasOwn(result.data, "evidence"), false);
  assert.deepEqual(h.calls.map(c => c.table), ["football_fixtures", "touchline_coach_fixture_points"]);
});

test("private reader binds zero final score, row identities and persisted timestamps with matching semantic checkpoints", async () => {
  const h = fixture();
  const result = await h.readTouchlineFinalScorePushEvidence(request, options) as { ok: boolean; data: { score: unknown }; evidence: { fixtureId: string; clockRevision: number; capturedAt: string; players: { sourceSyncedAt: string }[]; coaches: { sourceUpdatedAt: string; settledAt: string }[] } };
  assert.equal(result.ok, true); assert.equal(result.evidence.fixtureId, uuid(1)); assert.equal(result.evidence.clockRevision, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.score)), { home: 0, away: 0 });
  assert.equal(result.evidence.capturedAt, stamp); assert.equal(result.evidence.players[0].sourceSyncedAt, stamp);
  assert.equal(result.evidence.coaches[0].sourceUpdatedAt, stamp); assert.equal(result.evidence.coaches[0].settledAt, stamp);
  const settlements = h.calls.filter(c => c.count === "exact" && c.table.includes("touchline_"));
  assert.equal(settlements.length, 2); for (const call of settlements) { assert.deepEqual(call.range, [0, 9]); assert.ok(call.filters.some(([key, value]) => key === "fixture_id" && value === uuid(1))); }
});

test("disabled, malformed scope and policy close before any query", async () => {
  for (const [input, opts] of [[request, { ...options, enabled: false }], [{ ...request, canonicalFixtureId: "123" }, options], [request, { ...options, maxRows: 0 }], [request, { ...options, timeoutMs: 0 }]]) {
    const h = fixture(); assert.equal((await h.readTouchlineFinalScorePushEvidence(input, opts) as { ok: boolean }).ok, false); assert.equal(h.calls.length, 0);
  }
});

test("missing/duplicate/truncated/out-of-scope settlements and canonical/provider conflicts fail closed", async () => {
  const mutations: ((h: ReturnType<typeof fixture>) => void)[] = [
    h => h.setCounts(null), h => h.setCounts(2), h => h.setCounts(1, 2), h => { h.data.players.length = 0; h.setCounts(0); },
    h => { h.data.players.push({ ...h.data.players[0] }); h.setCounts(2); },
    h => { h.data.coaches.push({ ...h.data.coaches[0] }); h.setCounts(1, 2); },
    h => { h.data.players[0].fixture_id = uuid(90); }, h => { h.data.players[0].season_id = uuid(90); }, h => { h.data.players[0].club_id = uuid(90); },
    h => { h.data.players[0].scoring_version = "player_scoring_v3"; }, h => { h.data.players[0].settlement_status = "provisional"; },
    h => { h.data.coaches[0].fixture_context = "HOME"; }, h => { h.data.coaches[0].contract_id = "not-a-uuid"; }, h => { h.data.coaches[0].home_score = 1; },
    h => { h.data.canonical.id = uuid(90); }, h => { h.data.canonical.provider_fixture_id = "124"; }, h => { h.data.canonical.home_score = null as unknown as number; }, h => { h.data.canonical.status = "NS"; },
    h => { h.data.competition.provider_competition_id = "9"; }, h => { h.data.season.competition_id = uuid(90); }, h => { h.data.clubs[0].provider_team_id = "20"; },
    h => h.fail("football_clubs"), h => h.change(4),
  ];
  for (const [i, mutate] of mutations.entries()) { const h = fixture(); mutate(h); assert.equal((await h.readTouchlineFinalScorePushEvidence(request, options) as { ok: boolean }).ok, false, `case ${i}`); }
});

test("historical coach club identity comes only from the strict persisted fixture context, never current contract membership", async () => {
  for (const context of ["home", "away"]) {
    const h = fixture(); h.data.coaches[0].fixture_context = context;
    // The present-day contract may have moved; it is not the historical source.
    h.data.coaches[0].touchline_coach_contracts.club_id = uuid(99);
    if (context === "away") Reflect.deleteProperty(h.data.coaches[0], "touchline_coach_contracts");
    const result = await h.readTouchlineFinalScorePushEvidence(request, options) as {
      ok: boolean; evidence: { coaches: { contractId: string; clubId: string }[] };
    };
    assert.equal(result.ok, true);
    assert.equal(result.evidence.coaches[0].clubId, context === "home" ? uuid(5) : uuid(6));
    assert.equal(result.evidence.coaches[0].contractId, uuid(21));
    const privateCoachQuery = h.calls.find(call => call.table === "touchline_coach_fixture_points" && call.count === "exact");
    assert.ok(privateCoachQuery); assert.doesNotMatch(privateCoachQuery.select, /touchline_coach_contracts/);
  }
});

test("each timestamp must exist and not be future; settled_at cannot replace source timestamp", async () => {
  for (const mutate of [
    (h: ReturnType<typeof fixture>) => { h.data.players[0].source_synced_at = ""; },
    (h: ReturnType<typeof fixture>) => { h.data.coaches[0].provider_source_updated_at = ""; },
    (h: ReturnType<typeof fixture>) => { h.data.canonical.source_updated_at = "2027-01-01T00:00:00Z"; },
    (h: ReturnType<typeof fixture>) => h.captured("2027-01-01T00:00:00Z"),
  ]) { const h = fixture(); mutate(h); assert.equal((await h.readTouchlineFinalScorePushEvidence(request, options) as { ok: boolean }).ok, false); }
});

for (const invalid of ["2026-02-30T07:00:00Z", "2026-10-02T24:00:00Z"]) {
  test(`persisted timestamp rejects normalized invalid calendar/time ${invalid}`, async () => {
    const h = fixture(); h.data.players[0].source_synced_at = invalid;
    assert.equal((await h.readTouchlineFinalScorePushEvidence(request, options) as { ok: boolean }).ok, false);
  });
}

test("strict persisted calendar validation preserves leap days, offsets and fractional precision without rewriting", async () => {
  for (const stamp of ["2024-02-29T23:59:59.123456Z", "2026-10-03T09:00:00+02:00", "2026-10-03T06:00:00-01:00"]) {
    const h = fixture(); h.data.players[0].source_synced_at = stamp;
    const result = await h.readTouchlineFinalScorePushEvidence(request, options) as { ok: boolean; evidence: { players: { sourceSyncedAt: string }[] } };
    assert.equal(result.ok, true); assert.equal(result.evidence.players[0].sourceSyncedAt, stamp);
  }
  for (const stamp of ["2025-02-29T00:00:00Z", "2026-00-03T00:00:00Z", "2026-10-00T00:00:00Z", "2026-10-03T07:60:00Z", "2026-10-03T07:00:60Z", "2026-10-03T07:00:00+24:00"]) {
    const h = fixture(); h.data.players[0].source_synced_at = stamp;
    assert.equal((await h.readTouchlineFinalScorePushEvidence(request, options) as { ok: boolean }).ok, false, stamp);
  }
});

test("private timeout closes the caller, clears continuation and does not retry a late read", async () => {
  const h = fixture(); h.hold();
  const result = await h.readTouchlineFinalScorePushEvidence(request, { ...options, timeoutMs: 5 }) as { ok: boolean; reason: string };
  assert.equal(result.ok, false); assert.equal(result.reason, "private-read-timeout");
  const count = h.calls.length; h.release();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(h.calls.length, count); assert.equal(h.calls.some(call => call.table === "football_competitions"), false);
});
