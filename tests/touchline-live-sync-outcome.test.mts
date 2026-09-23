import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { decideLiveSyncCadence } from "../lib/football-data/live-sync-cadence.ts";
import { touchlineFixtureState } from "../lib/touchlineArena/match-centre.ts";
import { recoveryFixtureMatches, BACKLOG_MAX_PER_RUN, BACKLOG_DEADLINE_MS } from "../lib/football-data/fixture-backlog-recovery.ts";
import type { LiveSyncResult } from "../lib/football-data/live-sync.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";
import { inspectTouchlineProductionSyncRuntime } from "../lib/football-data/production-sync-runtime.ts";

// Execute the production orchestrator and its real cadence/merge helpers. All
// provider, reconciliation and persistence boundaries are isolated in memory.
function executableSource(path: string) {
  return stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*from[^;]*;\s*$/gm, "")
    .replace(/^export /gm, "");
}
const syncSource = executableSource("../lib/football-data/live-sync.ts");
const reconcilePendingTouchlineFantasyGameweeks = runInNewContext(
  `${executableSource("../lib/touchlineFantasy/gameweek-lifecycle.ts")}\nreconcilePendingTouchlineFantasyGameweeks;`,
  {}, { timeout: 1000 },
);
const mergeCanonicalLiveFixture = runInNewContext(
  `${executableSource("../lib/football-data/live-fixture-store.ts")}\nmergeCanonicalLiveFixture;`,
  { touchlineFixtureState },
  { timeout: 1000 },
);
const NOW = Date.parse("2026-09-19T15:30:00.000Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const fixture: TouchlineFixture = {
  id: "sportmonks:19722167", providerId: "19722167", provider: "sportmonks",
  competitionId: "8", seasonId: "25600", startsAt: "2026-09-19T15:00:00.000Z", status: "Live",
  homeScore: 1, awayScore: 0, source: { provider: "sportmonks", providerId: "19722167" },
};

type Input = {
  environment?: Record<string, string | undefined>;
  rankingError?: string;
  playerErrors?: string[];
  coachError?: string;
  liveError?: string;
  feedError?: string;
  feedPersistenceError?: string;
  lineupError?: string;
  stateErrors?: string[];
  stateUpdates?: number;
  fantasyWindowError?: { code?: string; message?: string };
  thrownFantasyWindowError?: boolean;
  fantasyLifecycleError?: { code?: string; message?: string };
  thrownFantasyLifecycleError?: boolean;
  fantasyLifecycleReadError?: boolean;
  settledGameweek?: boolean;
  fantasyStatisticsPending?: boolean;
  noIncomingFixtures?: boolean;
  wrongSeason?: boolean;
  backlog?: boolean;
  backlogError?: string;
  recoveryWriteFailure?: boolean;
  shirtsPending?: boolean;
  noPendingGameweeks?: boolean;
  snapshotError?: string;
  scheduleError?: string;
  cadenceNotDue?: boolean;
  leaseUnavailable?: boolean;
  thrownPlayerError?: boolean;
};
type Write = {
  status: string; error_message: string | null; records_updated: number;
  source_payload: { cadenceExecuted: boolean; playerFixtureRowsWritten: number; snapshotFixtures: number; skippedReason: string | null };
};

function scenario(input: Input = {}) {
  const writes: Write[] = [];
  const calls: string[] = [];
  const snapshots: TouchlineFixture[][] = [];
  const logs: Array<{ status: string; errorCount: number }> = [];
  const admin = {
    from(table: string) {
      if (table === "touchline_fantasy_configs") {
        const query = {
          select() { return query; },
          eq() { return query; },
          async maybeSingle() { return { data: { season_id: "active-season" }, error: null }; },
        };
        return query;
      }
      assert.equal(table, "football_data_sync_runs");
      let syncType = "";
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { if (column === "sync_type") syncType = String(value); return query; },
        not() { return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() {
          return { data: syncType === "live_scores" && input.cadenceNotDue ? { started_at: new Date(NOW - 1_000).toISOString() } : null, error: null };
        },
        update(value: Write) {
          return { async eq(column: string, id: string) {
            assert.equal(column, "id"); assert.equal(id, RUN_ID);
            calls.push("complete-run"); writes.push(value); return { error: null };
          } };
        },
      };
      return query;
    },
    async rpc(name: string, args?: { p_gameweek_id?: string; p_season_id?: string }) {
      if (name === "touchline_fantasy_pending_gameweeks") {
        assert.equal(args?.p_season_id, "active-season");
        calls.push("fantasy-discovery");
        return input.fantasyLifecycleReadError ? { data: null, error: { message: "private-database-details" } }
          : { data: input.noPendingGameweeks ? [] : [{ id: "previous-gameweek", state: input.settledGameweek ? "SETTLED" : "FINAL" }], error: null };
      }
      if (name === "touchline_fantasy_reconcile_gameweek") {
        assert.equal(args?.p_gameweek_id, "previous-gameweek");
        calls.push("fantasy-lifecycle");
        if (input.thrownFantasyLifecycleError) throw new Error("private-transport-details");
        return { data: { ok: true, pendingStatistics: input.fantasyStatisticsPending }, error: input.fantasyLifecycleError ?? null };
      }
      if (name === "touchline_fantasy_sync_gameweeks") {
        calls.push("fantasy-window");
        if (input.thrownFantasyWindowError) throw new Error("private-transport-details");
        return { data: null, error: input.fantasyWindowError ?? null };
      }
      assert.equal(name, "touchline_reconcile_coach_fixture_points");
      calls.push("coaches");
      return { data: { reconciled: 2 }, error: input.coachError ? { code: input.coachError } : null };
    },
  };
  const readFixtures = async () => input.noIncomingFixtures ? [] : [fixture];
  const sync = runInNewContext(`${syncSource}\nsyncSportmonksLiveState;`, {
    decideLiveSyncCadence, mergeCanonicalLiveFixture, reconcilePendingTouchlineFantasyGameweeks,
    recoveryFixtureMatches, BACKLOG_MAX_PER_RUN, BACKLOG_DEADLINE_MS,
    recoveryFeedComplete: () => true,
    process: { env: input.environment ?? { VERCEL_ENV: "preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy" } },
    inspectTouchlineProductionSyncRuntime,
    inspectTouchlineIsolatedPreviewEnvironment: () => ({ status: "qa" }),
    touchlineCompetitionCoachAssignments: () => [],
    console: { info: (message: string) => logs.push(JSON.parse(message)), warn: (message: string) => logs.push(JSON.parse(message)) },
    readPublicCompetitionFixtures: readFixtures,
    syncSportmonksFixtureSchedule: async () => ({ ok: false, errors: [input.scheduleError] }),
    syncTouchLinePlayerSeasonStatistics: async () => {
      calls.push("players");
      if (input.thrownPlayerError) throw new Error("player-reconciliation-threw");
      return {
        // ranking-source-incomplete deliberately retains the scorer's valid
        // settlements and may return ok:true with no ordinary errors.
        ok: !input.playerErrors?.length, fixtureRowsWritten: 22,
        scoringFixtureIds: ["fixture-internal"], failedFixtureIds: [], missingSettlementFixtureIds: [],
        errors: input.playerErrors ?? [], rankingError: input.rankingError ?? null,
      };
    },
  }, { timeout: 1000 }) as (admin: unknown, options: unknown, dependencies: unknown) => Promise<LiveSyncResult>;

  const run = () => sync(admin, input.cadenceNotDue || input.noIncomingFixtures ? {} : { forceFixtureId: fixture.providerId }, {
    now: () => NOW,
    resolveRecoveryScope: async () => ({ seasonId: "active-season", providerSeasonId: "25600", competitionId: "league-a" }),
    claimRecovery: async () => {
      if (!input.backlog) return null;
      const index=calls.filter(c=>c.startsWith("claim-")).length;
      calls.push(`claim-${index}`);
      return {fixtureId:`backlog-${index}`,providerFixtureId:String(380+index),status:"NS",attemptCount:1};
    },
    finishRecovery: async (_a: unknown,_c: unknown,_r: unknown,_n: unknown,outcome: string,code: string) => { calls.push(`finish-${outcome}-${code}`); },
    persistRecoveryFeed: async () => { calls.push("persist-recovery"); return {persisted:!input.recoveryWriteFailure,reconciliationReady:!input.shirtsPending}; },
    acquireRun: async () => { calls.push("lease"); return input.leaseUnavailable
      ? { acquired: false, reason: "live_sync_in_flight" }
      : { acquired: true, runId: RUN_ID }; },
    ...(input.scheduleError ? {} : { readFixtures }),
    provider: {
      async getLiveScores() {
        calls.push("provider-live");
        return input.liveError ? { ok: false, error: { code: input.liveError } } : { ok: true, data: input.noIncomingFixtures ? [] : [fixture] };
      },
      async getFixtureFantasyFeed(providerId: string) {
        if (providerId !== fixture.providerId) {
          calls.push(`fetch-${providerId}`);
          return input.backlogError ? {ok:false,error:{code:input.backlogError,retryAfterSeconds:600}}
            : {ok:true,data:{fixture:{...fixture,providerId,status:"Full Time"}}};
        }
        calls.push("provider-feed");
        return input.feedError ? { ok: false, error: { code: input.feedError } } : { ok: true, data: { fixture: input.wrongSeason ? { ...fixture, seasonId: "wrong-season" } : fixture } };
      },
    },
    persistFantasyFeed: async () => { calls.push("persist-feed"); return { persisted: !input.feedPersistenceError, reason: input.feedPersistenceError }; },
    recordLineupObservation: async () => input.lineupError ? { recorded: false, error: input.lineupError } : { recorded: true },
    persistStates: async () => {
      await Promise.resolve();
      calls.push("states");
      return { updated: input.stateUpdates ?? 1, errors: input.stateErrors ?? [] };
    },
    persistSnapshot: async (snapshot: TouchlineFixture[]) => {
      calls.push("snapshot"); snapshots.push(snapshot);
      return { persisted: !input.snapshotError, reason: input.snapshotError };
    },
  });
  return { run, writes, calls, snapshots, logs };
}

const boundProductionEnvironment = {
  VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM",
  VERCEL_ORG_ID: "team_P1d7YNrmUObvbJJTJRlGcXoz", TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: "true",
  SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://touchline.com.br",
};
test("explicit Production runtime admission reaches the unchanged live orchestrator", async () => {
  const s = scenario({ environment: boundProductionEnvironment });
  assert.equal((await s.run()).ok, true);
  assert.equal(s.calls[0], "lease");
  assert.ok(s.calls.includes("provider-live"));
});
for (const change of [
  { TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: undefined },
  { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co" },
  { VERCEL_ENV: undefined },
  { TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" },
]) test(`invalid Production runtime performs no lease/provider/persistence: ${JSON.stringify(change)}`, async () => {
  const s = scenario({ environment: { ...boundProductionEnvironment, ...change } });
  await assert.rejects(s.run, /verified QA or explicitly enabled Production runtime/);
  assert.deepEqual(s.calls, []);
  assert.deepEqual(s.writes, []);
});

test("a provider feed from another season is rejected before persistence", async () => {
  const s = scenario({ wrongSeason: true });
  await s.run();
  assert.equal(s.calls.includes("persist-feed"), false);
});

test("429 live response stops all further provider work, not a partial success", async () => {
  const s=scenario({liveError:"rate_limited",backlog:true}); const result=await s.run();
  assert.equal(result.status,"error"); assert.equal(result.ok,false);
  assert.equal(s.calls.some(c=>c.startsWith("claim-") || c.startsWith("fetch-")),false);
  assert.equal(s.calls.includes("persist-feed"),false);
});

test("backlog claims precede fetch, cap two and finish only after canonical persistence", async () => {
  const s=scenario({backlog:true}); await s.run();
  assert.equal(s.calls.filter(c=>c.startsWith("claim-")).length,2);
  assert.ok(s.calls.indexOf("claim-0")<s.calls.indexOf("fetch-380"));
  assert.ok(s.calls.indexOf("states")<s.calls.indexOf("finish-recovered-complete"));
});

test("backlog 429 stops batch after durable pending outcome", async () => {
  const s=scenario({backlog:true,backlogError:"rate_limited"}); const result=await s.run();
  assert.equal(result.ok,false);
  assert.equal(s.calls.filter(c=>c.startsWith("claim-")).length,1);
  assert.ok(s.calls.includes("finish-pending-rate_limited"));
});

test("backlog-only canonical writes trigger Fantasy window synchronization", async () => {
  const s=scenario({backlog:true,noIncomingFixtures:true,stateUpdates:0}); const result=await s.run();
  assert.equal(result.updated,2);
  assert.ok(s.calls.includes("fantasy-window"));
  assert.ok(s.calls.indexOf("persist-recovery")<s.calls.indexOf("fantasy-window"));
});

for (const input of [{recoveryWriteFailure:true},{shirtsPending:true}]) test(`partial backlog cannot report recovered: ${JSON.stringify(input)}`,async()=>{
  const s=scenario({backlog:true,...input}); const result=await s.run();
  assert.equal(result.ok,false);
  assert.equal(s.calls.includes("finish-recovered-complete"),false);
  assert.ok(s.calls.includes(input.shirtsPending ? "finish-needs_review-shirt_reconciliation_pending" : "finish-pending-persistence_failed"));
});

function assertCompletion(s: ReturnType<typeof scenario>, result: LiveSyncResult) {
  assert.equal(s.writes.length, 1, "The acquired run must be finalized exactly once");
  assert.equal(s.calls.at(-1), "complete-run");
  assert.equal(s.writes[0].status, result.status === "skipped" ? "success" : result.status);
  assert.equal(s.writes[0].error_message, result.errors.join("\n") || null);
  assert.equal(s.writes[0].source_payload.playerFixtureRowsWritten, result.playerFixtureRowsWritten);
  assert.equal(s.writes[0].source_payload.snapshotFixtures, result.snapshotFixtures);
  assert.equal(s.logs[0].status, result.status);
  assert.equal(s.logs[0].errorCount, result.errors.length);
}

test("a fully successful live sync preserves valid data and finalizes success", async () => {
  const s = scenario(); const result = await s.run();
  assert.equal(result.ok, true); assert.equal(result.status, "success");
  assert.equal(result.errors.length, 0); assert.equal(result.playerFixtureRowsWritten, 22);
  assert.equal(result.coachPointsReconciled, 2); assert.equal(result.snapshotFixtures, 1);
  assert.equal(s.snapshots[0][0].homeScore, 1);
  assert.equal(s.writes[0].source_payload.cadenceExecuted, true);
  assert.equal(s.calls.filter((call) => call === "fantasy-window").length, 1);
  assert.ok(s.calls.indexOf("states") < s.calls.indexOf("fantasy-window"));
  assert.ok(s.calls.indexOf("fantasy-window") < s.calls.indexOf("fantasy-lifecycle"));
  assert.ok(s.calls.indexOf("players") < s.calls.indexOf("fantasy-lifecycle"), "The statistics producer must finish before Fantasy settlement");
  assert.ok(s.calls.indexOf("fantasy-lifecycle") < s.calls.indexOf("snapshot"));
  assert.ok(s.calls.indexOf("fantasy-window") < s.calls.indexOf("snapshot"));
  assertCompletion(s, result);
});

test("a new statistics feed retries its already SETTLED round without rescoring unrelated history", async () => {
  const s = scenario({ settledGameweek: true }); const result = await s.run();
  assert.equal(result.ok, true);
  assert.equal(s.calls.filter((call) => call === "fantasy-lifecycle").length, 1);
  assert.ok(s.calls.indexOf("players") < s.calls.indexOf("fantasy-lifecycle"));
  assertCompletion(s, result);
});

test("a due idle run settles recovered statistics without new incoming fixtures or fixture writes", async () => {
  const s = scenario({ noIncomingFixtures: true, stateUpdates: 0 }); const result = await s.run();
  assert.equal(s.calls.includes("fantasy-window"), false);
  assert.equal(s.calls.filter((call) => call === "fantasy-lifecycle").length, 1);
  assert.ok(s.calls.indexOf("players") < s.calls.indexOf("fantasy-lifecycle"));
  assert.equal(result.playerFixtureRowsWritten, 22);
  assert.equal(result.ok, true);
  assertCompletion(s, result);
});

test("a failed statistics producer still records a canonical round's pending reconciliation", async () => {
  const s = scenario({ thrownPlayerError: true, fantasyStatisticsPending: true });
  await assert.rejects(s.run, /player-reconciliation-threw/);
  assert.ok(s.calls.indexOf("players") < s.calls.indexOf("fantasy-lifecycle"));
  assert.equal(s.calls.includes("fantasy-lifecycle"), true);
  assert.equal(s.writes[0].status, "error");
});

test("an idle tick rediscovers a stale SETTLED round after the preceding reconciliation RPC failed", async () => {
  const first = scenario({ settledGameweek: true, fantasyLifecycleError: { code: "40001" } });
  assert.equal((await first.run()).ok, false);
  // The preceding RPC failed before any state marker could be stored. The
  // unchanged SETTLED round still has a newer, already persisted source feed.
  const retry = scenario({ settledGameweek: true, noIncomingFixtures: true, stateUpdates: 0 });
  const result = await retry.run();
  assert.equal(retry.calls.includes("fantasy-window"), false);
  assert.equal(retry.calls.filter((call) => call === "fantasy-lifecycle").length, 1);
  assert.equal(result.ok, true);
  assertCompletion(retry, result);
});

test("an idle run does not reconcile settled history whose durable source versions match", async () => {
  const s = scenario({ noIncomingFixtures: true, stateUpdates: 0, noPendingGameweeks: true });
  const result = await s.run();
  assert.equal(s.calls.includes("fantasy-discovery"), true);
  assert.equal(s.calls.includes("fantasy-lifecycle"), false);
  assert.equal(result.ok, true);
  assertCompletion(s, result);
});

for (const [input, expectedError] of [
  [{ fantasyWindowError: { code: "40001", message: "private-database-details" } }, "fantasy-window:40001"],
  [{ fantasyWindowError: { code: "PGRST202", message: "private-database-details" } }, "fantasy-window:PGRST202"],
  [{ fantasyWindowError: { code: "private-database-details", message: "private-database-details" } }, "fantasy-window:unknown"],
  [{ fantasyWindowError: { message: "private-database-details" } }, "fantasy-window:unknown"],
  [{ thrownFantasyWindowError: true }, "fantasy-window:unavailable"],
] satisfies Array<[Input, string]>) {
  test(`Fantasy-window failure is visible without discarding valid data: ${expectedError}`, async () => {
    const s = scenario(input); const result = await s.run();
    assert.equal(result.ok, false); assert.equal(result.status, "partial");
    assert.deepEqual([...result.errors], [expectedError]);
    assert.equal(s.calls.includes("fantasy-lifecycle"), true, "A window refresh failure must not strand already canonical pending rounds");
    assert.equal(result.updated, 1); assert.equal(result.snapshotFixtures, 1);
    assert.equal(result.playerFixtureRowsWritten, 22); assert.equal(result.coachPointsReconciled, 2);
    assert.ok(s.calls.indexOf("states") < s.calls.indexOf("fantasy-window"));
    assert.ok(s.calls.indexOf("fantasy-window") < s.calls.indexOf("snapshot"));
    assert.doesNotMatch(JSON.stringify({ result, writes: s.writes, logs: s.logs }), /private-(?:database|transport)-details/);
    assertCompletion(s, result);
  });
}

test("Fantasy windows are not materialized without successfully persisted fixture states", async () => {
  for (const stateErrors of [[], ["fixture-write:failed"]]) {
    const s = scenario({ stateUpdates: 0, stateErrors }); const result = await s.run();
    assert.equal(s.calls.includes("fantasy-window"), false);
    assert.equal(s.calls.includes("fantasy-lifecycle"), true, "Retry existing canonical rounds independently of new window materialization");
    assert.equal(result.ok, stateErrors.length === 0);
    assert.deepEqual([...result.errors], stateErrors);
    assertCompletion(s, result);
  }
});

for (const [input, expectedError] of [
  [{ fantasyLifecycleError: { code: "40001", message: "private-database-details" } }, "fantasy-lifecycle:40001"],
  [{ fantasyLifecycleError: { code: "private-database-details" } }, "fantasy-lifecycle:unknown"],
  [{ thrownFantasyLifecycleError: true }, "fantasy-lifecycle:unavailable"],
  [{ fantasyLifecycleReadError: true }, "fantasy-lifecycle:gameweeks-unavailable"],
  [{ fantasyStatisticsPending: true }, "fantasy-lifecycle:statistics-pending"],
] satisfies Array<[Input, string]>) {
  test(`Fantasy rollover failure remains visible while other valid data persists: ${expectedError}`, async () => {
    const s = scenario(input); const result = await s.run();
    assert.equal(result.ok, false); assert.equal(result.status, "partial");
    assert.deepEqual([...result.errors], [expectedError]);
    assert.equal(result.snapshotFixtures, 1); assert.equal(result.playerFixtureRowsWritten, 22);
    assert.doesNotMatch(JSON.stringify({ result, writes: s.writes, logs: s.logs }), /private-(?:database|transport)-details/);
    assertCompletion(s, result);
  });
}

test("partial fixture persistence still materializes successfully saved canonical states", async () => {
  const s = scenario({ stateUpdates: 1, stateErrors: ["another-fixture-write:failed"] }); const result = await s.run();
  assert.equal(s.calls.filter((call) => call === "fantasy-window").length, 1);
  assert.ok(s.calls.indexOf("states") < s.calls.indexOf("fantasy-window"));
  assert.equal(result.ok, false); assert.equal(result.status, "partial");
  assert.equal(result.snapshotFixtures, 1);
  assert.deepEqual([...result.errors], ["another-fixture-write:failed"]);
  assertCompletion(s, result);
});

for (const rankingError of ["ranking-source-incomplete", "ranking-settlement-read-unavailable"]) {
  test(`ranking pending/failure cannot report sync success: ${rankingError}`, async () => {
    const s = scenario({ rankingError }); const result = await s.run();
    assert.equal(result.ok, false); assert.equal(result.status, "partial");
    assert.deepEqual([...result.errors], [`player-points:ranking:${rankingError}`]);
    assert.equal(result.playerFixtureRowsWritten, 22, "Valid settlements are not rolled back");
    assert.equal(result.snapshotFixtures, 1, "Other valid persisted data remains available");
    assertCompletion(s, result);
  });
}

test("a ranking error already emitted by the scorer is not duplicated", async () => {
  const rankingError = "ranking-snapshot-write-failed";
  const s = scenario({ rankingError, playerErrors: [`ranking:${rankingError}`] }); const result = await s.run();
  assert.equal(result.ok, false); assert.equal(result.status, "partial");
  assert.deepEqual([...result.errors], [`player-points:ranking:${rankingError}`]);
  assertCompletion(s, result);
});

for (const [input, error] of [
  [{ playerErrors: ["aggregate-row:unavailable"] }, "player-points:aggregate-row:unavailable"],
  [{ coachError: "XX001" }, "coach-points:XX001"],
  [{ feedError: "provider_unavailable" }, `${fixture.providerId}:provider_unavailable`],
  [{ feedPersistenceError: "write_failed" }, `${fixture.providerId}:fantasy-feed:write_failed`],
  [{ lineupError: "write_failed" }, `${fixture.providerId}:lineup-observation:write_failed`],
  [{ stateErrors: ["fixture-write:failed"] }, "fixture-write:failed"],
  [{ scheduleError: "unavailable" }, "fixture-schedule:unavailable"],
] satisfies Array<[Input, string]>) {
  test(`partial data cannot produce ok:true: ${error}`, async () => {
    const s = scenario(input); const result = await s.run();
    assert.equal(result.ok, false); assert.equal(result.status, "partial");
    assert.deepEqual([...result.errors], [error]); assert.equal(result.snapshotFixtures, 1);
    assertCompletion(s, result);
  });
}

test("snapshot failure finalizes error instead of successful distribution", async () => {
  const s = scenario({ snapshotError: "write_failed" }); const result = await s.run();
  assert.equal(result.ok, false); assert.equal(result.status, "error");
  assert.deepEqual([...result.errors], ["snapshot:write_failed"]);
  assert.equal(result.snapshotFixtures, 0); assert.equal(result.playerFixtureRowsWritten, 22);
  assertCompletion(s, result);
});

test("provider failure without any incoming fixture finalizes error without reconciliation", async () => {
  const s = scenario({ liveError: "unavailable", feedError: "unavailable" }); const result = await s.run();
  assert.equal(result.ok, false); assert.equal(result.status, "error");
  assert.equal(s.calls.includes("players"), false); assert.equal(s.snapshots.length, 0);
  assertCompletion(s, result);
});

test("a normal cadence no-op stays successful without postponing real work", async () => {
  const s = scenario({ cadenceNotDue: true }); const result = await s.run();
  assert.equal(result.ok, true); assert.equal(result.status, "skipped");
  assert.equal(result.skippedReason, "cadence_not_due");
  assert.equal(s.writes[0].source_payload.cadenceExecuted, false);
  assert.equal(s.calls.includes("provider-live"), false);
  assertCompletion(s, result);
});

test("a schedule failure before the cadence gate must not be recorded as success", async () => {
  const s = scenario({ scheduleError: "unavailable", cadenceNotDue: true }); const result = await s.run();
  assert.equal(result.ok, false); assert.equal(result.status, "partial");
  assert.equal(result.skippedReason, "cadence_not_due");
  assert.equal(s.writes[0].source_payload.cadenceExecuted, false);
  assert.deepEqual([...result.errors], ["fixture-schedule:unavailable"]);
  assert.equal(s.calls.includes("provider-live"), false);
  assertCompletion(s, result);
});

test("an unacquired lease remains a no-op without finalizing another run", async () => {
  const s = scenario({ leaseUnavailable: true }); const result = await s.run();
  assert.equal(result.ok, true); assert.equal(result.status, "skipped");
  assert.deepEqual(s.calls, ["lease"]); assert.equal(s.writes.length, 0);
});

test("a thrown reconciliation error still finalizes the acquired run as error", async () => {
  const s = scenario({ thrownPlayerError: true });
  await assert.rejects(s.run, /player-reconciliation-threw/);
  assert.equal(s.writes.length, 1); assert.equal(s.writes[0].status, "error");
  assert.equal(s.calls.at(-1), "complete-run"); assert.equal(s.snapshots.length, 0);
});
