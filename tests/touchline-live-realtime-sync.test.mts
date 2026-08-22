import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { decideLiveSyncCadence } from "../lib/football-data/live-sync-cadence.ts";
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
  assert.doesNotMatch(route, /createClient|owner_session|isOwnerEmail/);
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
