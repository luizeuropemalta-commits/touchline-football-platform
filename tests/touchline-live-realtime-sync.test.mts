import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decideLiveSyncCadence,
  isEffectiveLiveSyncCadenceSuccess,
  type LiveSyncCadence,
} from "../lib/football-data/live-sync-cadence.ts";
import { acquireTouchlineLiveSyncRun } from "../lib/football-data/live-sync-lease.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

function fixture(id: string, startsAt: string, status = "Not Started"): TouchlineFixture {
  return {
    id: `sportmonks:${id}`,
    providerId: id,
    provider: "sportmonks",
    startsAt,
    status,
    competitionId: "8",
    source: { provider: "sportmonks", providerId: id },
  };
}

test("live cadence covers pre-kickoff, in-play and delayed final transitions", () => {
  const now = Date.parse("2026-08-21T19:10:00.000Z");
  const decision = decideLiveSyncCadence([
    fixture("19722203", "2026-08-21T19:00:00.000Z"),
  ], { now, lastSuccessfulSyncAt: "2026-08-21T19:08:59.000Z" });

  assert.equal(decision.cadence, "live");
  assert.equal(decision.intervalMs, 60_000);
  assert.equal(decision.due, true);
  assert.deepEqual(decision.candidateFixtureIds, ["19722203"]);
});

test("a successful 15:00 run that completes at 15:00:17 is due again at 15:01", () => {
  const decision = decideLiveSyncCadence([
    fixture("19722203", "2026-08-30T15:00:00.000Z", "Live"),
  ], {
    now: Date.parse("2026-08-30T15:01:00.000Z"),
    lastSuccessfulSyncAt: "2026-08-30T15:00:00.000Z",
  });
  assert.equal(decision.cadence, "live");
  assert.equal(decision.intervalMs, 60_000);
  assert.equal(decision.due, true);
});

test("cadence uses an exact inclusive boundary and fails closed on clock rollback", () => {
  const fixtures = [fixture("19722203", "2026-08-30T15:00:00.000Z", "Live")];
  assert.equal(decideLiveSyncCadence(fixtures, {
    now: Date.parse("2026-08-30T15:00:59.999Z"),
    lastSuccessfulSyncAt: "2026-08-30T15:00:00.000Z",
  }).due, false);
  assert.equal(decideLiveSyncCadence(fixtures, {
    now: Date.parse("2026-08-30T15:01:00.000Z"),
    lastSuccessfulSyncAt: "2026-08-30T15:00:00.000Z",
  }).due, true);
  assert.equal(decideLiveSyncCadence(fixtures, {
    now: Date.parse("2026-08-30T14:59:00.000Z"),
    lastSuccessfulSyncAt: "2026-08-30T15:00:00.000Z",
  }).due, false);
});

test("only an effective successful run can anchor the next cadence", () => {
  for (const status of ["partial", "error", "not_configured"] as const) {
    assert.equal(isEffectiveLiveSyncCadenceSuccess({ status, cadenceExecuted: true }), false);
  }
  assert.equal(isEffectiveLiveSyncCadenceSuccess({ status: "success", cadenceExecuted: false }), false);
  assert.equal(isEffectiveLiveSyncCadenceSuccess({ status: "success", cadenceExecuted: true }), true);

  const sync = readFileSync(new URL("../lib/football-data/live-sync.ts", import.meta.url), "utf8");
  assert.match(sync, /\.eq\("status", "success"\)/);
  assert.match(sync, /\.eq\("source_payload->>cadenceExecuted", "true"\)/);
  assert.match(sync, /cadenceExecuted: result\.status !== "skipped"/);
  assert.match(sync, /\.select\("started_at"\)/);
  assert.match(sync, /\.order\("started_at", \{ ascending: false \}\)/);
});

type SimulatedRun = {
  startedAt: string;
  status: "success" | "partial" | "error" | "not_configured";
  cadenceExecuted: boolean;
  skippedReason?: "cadence_not_due";
};

function latestEffectiveAnchor(runs: SimulatedRun[]) {
  return runs
    .filter((run) => isEffectiveLiveSyncCadenceSuccess(run))
    .map((run) => run.startedAt)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function simulateCronWakes(input: {
  fixture: TouchlineFixture;
  wakes: string[];
  acquired?: (wake: string) => boolean;
  executedStatus?: (wake: string) => SimulatedRun["status"];
}) {
  const runs: SimulatedRun[] = [];
  const decisions: Array<{ wake: string; cadence: LiveSyncCadence; due: boolean; acquired: boolean }> = [];
  for (const wake of input.wakes) {
    const acquired = input.acquired?.(wake) ?? true;
    if (!acquired) {
      decisions.push({ wake, cadence: "idle", due: false, acquired });
      continue;
    }
    const decision = decideLiveSyncCadence([input.fixture], {
      now: Date.parse(wake),
      lastSuccessfulSyncAt: latestEffectiveAnchor(runs),
    });
    decisions.push({ wake, cadence: decision.cadence, due: decision.due, acquired });
    if (!decision.due) {
      runs.push({ startedAt: wake, status: "success", cadenceExecuted: false, skippedReason: "cadence_not_due" });
      continue;
    }
    runs.push({ startedAt: wake, status: input.executedStatus?.(wake) ?? "success", cadenceExecuted: true });
  }
  return { decisions, runs };
}

test("minute wakes execute matchday at 12:05 and idle at 13:00 despite audited skips", () => {
  const matchdayWakes = Array.from({ length: 6 }, (_, minute) => `2026-08-30T12:0${minute}:00.000Z`);
  const matchday = simulateCronWakes({
    fixture: fixture("19722203", "2026-08-30T19:00:00.000Z"),
    wakes: matchdayWakes,
  });
  assert.deepEqual(matchday.decisions.filter((item) => item.due).map((item) => item.wake), [
    "2026-08-30T12:00:00.000Z",
    "2026-08-30T12:05:00.000Z",
  ]);

  const idleWakes = Array.from({ length: 61 }, (_, minute) => new Date(
    Date.parse("2026-08-30T12:00:00.000Z") + minute * 60_000,
  ).toISOString());
  const idle = simulateCronWakes({
    fixture: fixture("old", "2026-08-21T19:00:00.000Z", "Full Time"),
    wakes: idleWakes,
  });
  assert.deepEqual(idle.decisions.filter((item) => item.due).map((item) => item.wake), [
    "2026-08-30T12:00:00.000Z",
    "2026-08-30T13:00:00.000Z",
  ]);
});

test("live jitter uses the last real run and an in-flight wake creates no completed row", () => {
  const wakes = [
    "2026-08-30T15:00:00.000Z",
    "2026-08-30T15:00:59.000Z",
    "2026-08-30T15:01:02.000Z",
    "2026-08-30T15:02:05.000Z",
  ];
  const simulated = simulateCronWakes({
    fixture: fixture("19722203", "2026-08-30T15:00:00.000Z", "Live"),
    wakes,
    acquired: (wake) => wake !== wakes[3],
  });
  assert.deepEqual(simulated.decisions.map(({ due, acquired }) => ({ due, acquired })), [
    { due: true, acquired: true },
    { due: false, acquired: true },
    { due: true, acquired: true },
    { due: false, acquired: false },
  ]);
  assert.equal(simulated.runs.length, 3);
  assert.equal(latestEffectiveAnchor(simulated.runs), wakes[2]);
});

test("provider failures and missing configuration remain immediately retryable", () => {
  const failed = simulateCronWakes({
    fixture: fixture("19722203", "2026-08-30T15:00:00.000Z", "Live"),
    wakes: ["2026-08-30T15:00:00.000Z", "2026-08-30T15:01:00.000Z"],
    executedStatus: (wake) => wake.endsWith("15:00:00.000Z") ? "error" : "success",
  });
  assert.deepEqual(failed.decisions.map((item) => item.due), [true, true]);
  assert.equal(latestEffectiveAnchor(failed.runs), "2026-08-30T15:01:00.000Z");
});

test("the one-minute provider window begins sixty minutes before kickoff", () => {
  const decision = decideLiveSyncCadence([
    fixture("19722203", "2026-08-21T19:00:00.000Z"),
  ], {
    now: Date.parse("2026-08-21T18:00:00.000Z"),
    lastSuccessfulSyncAt: "2026-08-21T17:58:00.000Z",
  });
  assert.equal(decision.cadence, "live");
  assert.equal(decision.intervalMs, 60_000);
  assert.deepEqual(decision.candidateFixtureIds, ["19722203"]);
});

test("idle cadence suppresses provider calls until its interval is due", () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const decision = decideLiveSyncCadence([
    fixture("19722203", "2026-08-21T19:00:00.000Z", "Full Time"),
  ], { now, lastSuccessfulSyncAt: "2026-08-30T11:30:00.000Z" });

  assert.equal(decision.cadence, "idle");
  assert.equal(decision.intervalMs, 3_600_000);
  assert.equal(decision.due, false);
  assert.deepEqual(decision.candidateFixtureIds, []);
});

test("matchday cadence is anchored to the successful start", () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const upcoming = fixture("19722203", "2026-08-30T19:00:00.000Z");
  assert.equal(decideLiveSyncCadence([upcoming], {
    now,
    lastSuccessfulSyncAt: "2026-08-30T11:55:00.001Z",
  }).due, false);
  assert.equal(decideLiveSyncCadence([upcoming], {
    now,
    lastSuccessfulSyncAt: "2026-08-30T11:55:00.000Z",
  }).due, true);
});

test("a protected force request checks exactly the requested official fixture", () => {
  const decision = decideLiveSyncCadence([], {
    now: Date.parse("2026-08-21T23:30:00.000Z"),
    lastSuccessfulSyncAt: "2026-08-21T23:29:30.000Z",
    forceFixtureId: "19722203",
  });
  assert.equal(decision.cadence, "live");
  assert.equal(decision.due, true);
  assert.deepEqual(decision.candidateFixtureIds, ["19722203"]);
});

test("the writer is server-only, constant-time authenticated and provider-scoped", () => {
  const route = readFileSync(new URL("../app/api/football-data/live-sync/route.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../lib/football-data/live-sync.ts", import.meta.url), "utf8");
  assert.match(route, /TOUCHLINE_LIVE_SYNC_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /export async function GET\(\)[\s\S]*status: 405/);
  assert.match(sync, /getLiveScores\(\{ competitionId: COMPETITION_ID \}\)/);
  assert.match(sync, /getFixtureFantasyFeed\(fixtureId\)/);
  assert.match(sync, /persistLiveScoreSnapshot/);
  assert.match(sync, /inspectTouchlineIsolatedPreviewEnvironment\(\)/);
  assert.match(sync, /inspection\.status !== "qa"/);
  assert.match(sync, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(sync, /TOUCHLINE_QA_SUPABASE_PROJECT_REF !== QA_PROJECT_REF/);
  assert.ok(sync.indexOf("const lease = await") < sync.indexOf(": await refreshFixtureScheduleWhenStale"));
  assert.ok(sync.indexOf("const lease = await") < sync.indexOf("const provider = dependencies.provider"));
  assert.ok(sync.indexOf("const lease = await") < sync.indexOf("const liveResponse = await provider.getLiveScores"));
  assert.doesNotMatch(route, /createClient|owner_session|isOwnerEmail/);
  assert.match(route, /export const maxDuration = 300/);
});

test("the lease wrapper handles concurrent outcomes and long-running overlap deterministically", async () => {
  let sequence = 0;
  const admin = {
    async rpc() {
      sequence += 1;
      return sequence === 1
        ? { data: { acquired: true, runId: "11111111-1111-4111-8111-111111111111" }, error: null }
        : { data: { acquired: false, reason: "live_sync_in_flight" }, error: null };
    },
  };
  const now = Date.parse("2026-08-30T08:00:00.000Z");
  const first = await acquireTouchlineLiveSyncRun(admin as never, now);
  const second = await acquireTouchlineLiveSyncRun(admin as never, now + 61_000);
  assert.deepEqual(first, { acquired: true, runId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(second, { acquired: false, reason: "live_sync_in_flight" });
});

test("the lease wrapper rejects RPC errors and acquired responses without a run identity", async () => {
  await assert.rejects(
    acquireTouchlineLiveSyncRun({ rpc: async () => ({ data: null, error: { code: "42501" } }) } as never, Date.now()),
    /Could not acquire live sync lease: 42501/,
  );
  await assert.rejects(
    acquireTouchlineLiveSyncRun({ rpc: async () => ({ data: { acquired: true }, error: null }) } as never, Date.now()),
    /returned no run identity/,
  );
});

test("QA scheduler stores the bearer in Vault and cannot target Production", () => {
  const migration = readFileSync(
    new URL("../supabase/qa/014_touchline_qa_live_realtime_scheduler.sql", import.meta.url),
    "utf8",
  );
  const rollback = readFileSync(
    new URL("../supabase/qa/014_touchline_qa_live_realtime_scheduler_rollback.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migration, /touchline-arena-official-git-qa-fifa-agent-plataform\.vercel\.app\/api\/football-data\/live-sync/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /cron\.schedule/);
  assert.match(migration, /revoke all on function[\s\S]*public, anon, authenticated/);
  assert.doesNotMatch(migration, /touchline\.com\.br|vxireiswggllwhbsmdcj/);
  assert.match(rollback, /cron\.unschedule/);
  assert.match(rollback, /delete from vault\.secrets/);
});

test("public live DTO carries minute/period without exposing provider raw data", () => {
  const publicDto = readFileSync(new URL("../lib/football-data/public-fixture.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../lib/football-data/public-fixture-client.ts", import.meta.url), "utf8");
  assert.match(publicDto, /liveMinute\?: number/);
  assert.match(publicDto, /livePeriod\?: string/);
  assert.match(publicDto, /providerUpdatedAt\?: string/);
  assert.doesNotMatch(publicDto, /raw\?:/);
  assert.match(client, /optionalNonNegativeInteger\(fixture\.liveMinute\)/);
  assert.match(client, /optionalTimestamp\(fixture\.providerUpdatedAt\)/);
});
