import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import { TOUCHLINE_LIVE_QUICK_SUB_ENABLED } from "../lib/touchlineArena/quick-substitution-product-policy.ts";

const sessionRoute = await readFile(fileURLToPath(new URL(
  "../app/api/touchline-arena/quick-substitution/session/route.ts",
  import.meta.url,
)), "utf8");
const eventRoute = await readFile(fileURLToPath(new URL(
  "../app/api/touchline-arena/quick-substitution/event/route.ts",
  import.meta.url,
)), "utf8");
const gameweekMigration = await readFile(fileURLToPath(new URL(
  "../supabase/migrations/20261011007000_touchline_quick_sub_active_gameweek_binding.sql",
  import.meta.url,
)), "utf8");
const liveGameweekMigration = await readFile(fileURLToPath(new URL(
  "../supabase/migrations/20261011008000_touchline_quick_sub_live_gameweek_guard.sql",
  import.meta.url,
)), "utf8");
const commandAuditMigration = await readFile(fileURLToPath(new URL(
  "../supabase/migrations/20261011009000_touchline_quick_sub_command_audit.sql",
  import.meta.url,
)), "utf8");

test("Quick Sub session route derives XI from the authenticated owner's locked Fantasy gameweek", () => {
  assert.match(sessionRoute, /hasTouchLineArenaAccess\(user\)/);
  assert.match(sessionRoute, /if \(!isSameOriginMutation\(request\)\)/);
  assert.match(sessionRoute, /readAuthoritativeTouchlineRoster\(admin, user\.id\)/);
  assert.match(sessionRoute, /from\("football_fixtures"\)[\s\S]*?eq\("provider", "sportmonks"\)/);
  assert.match(sessionRoute, /from\("touchline_fantasy_gameweeks"\)[\s\S]*?eq\("round_id", fixtureResult\.data\.round_id\)/);
  assert.match(sessionRoute, /from\("touchline_fantasy_user_gameweeks"\)[\s\S]*?eq\("user_id", user\.id\)[\s\S]*?eq\("state", "LOCKED"\)/);
  assert.match(sessionRoute, /from\("touchline_fantasy_locked_selections"\)[\s\S]*?eq\("user_gameweek_id", userGameweek\.id\)/);
  assert.match(sessionRoute, /inventoryByCanonicalPlayer/);
  assert.doesNotMatch(sessionRoute, /touchline_user_arena_state|reconcileStoredArenaLineupWithAuthoritativeRoster/);
  assert.match(sessionRoute, /startingIds\.length !== 11/);
  assert.match(sessionRoute, /benchIds\.length !== 9/);
  assert.match(sessionRoute, /new Set\(canonicalBenchIds\)\.size !== 9/);
  assert.match(sessionRoute, /!ownedIds\.has\(id\) \|\| canonicalStartingIds\.includes\(id\)/);
  assert.match(sessionRoute, /createHash\("sha256"\)/);
  assert.match(sessionRoute, /rpc\("touchline_arena_quick_substitution_start"/);
  assert.match(sessionRoute, /gameweek_id/);
  assert.match(sessionRoute, /Cache-Control.: .private, no-store/);
  assert.doesNotMatch(sessionRoute, /SPORTMONKS_API_TOKEN|fetch\(/);
});

test("Quick Sub maps the public provider fixture key to the canonical database UUID server-side", () => {
  assert.match(sessionRoute, /searchParams\.get\("providerFixtureId"\)/);
  assert.match(sessionRoute, /strictSportmonksId\(new URL\(request\.url\)/);
  assert.match(sessionRoute, /body\?\.providerFixtureId/);
  assert.match(sessionRoute, /\.eq\("provider_fixture_id", providerFixtureId\)/);
  assert.match(sessionRoute, /const fixtureId = uuid\(fixtureResult\.data\.id\)/);
  assert.doesNotMatch(sessionRoute, /uuid\(body\?\.fixtureId\)|\.eq\("id", providerFixtureId\)/);
});

test("Quick Sub event route binds the actor to authenticated identity and only calls the durable command", () => {
  assert.match(eventRoute, /hasTouchLineArenaAccess\(user\)/);
  assert.match(eventRoute, /if \(!isSameOriginMutation\(request\)\)/);
  assert.match(eventRoute, /p_user_id: user\.id/);
  assert.match(eventRoute, /p_expected_revision: expectedRevision/);
  assert.match(eventRoute, /p_expected_roster_revision: expectedRosterRevision/);
  assert.match(eventRoute, /createHash\("sha256"\)/);
  assert.match(eventRoute, /p_release_sha: releaseLink/);
  assert.match(eventRoute, /rpc\("touchline_arena_quick_substitution_apply"/);
  assert.doesNotMatch(eventRoute, /from\("touchline_user_arena_state"\)\.(?:update|upsert)|persistArenaRoster|SPORTMONKS_API_TOKEN|fetch\(/);
  assert.match(eventRoute, /Cache-Control.: .private, no-store/);
});

test("Quick Sub session initializer derives an active canonical matchweek from fixture round", () => {
  assert.match(gameweekMigration, /join public\.touchline_fantasy_gameweeks as gameweek on gameweek\.round_id = fixture\.round_id/);
  assert.match(gameweekMigration, /gameweek\.state in \('LOCKED', 'LIVE'\)/);
  assert.match(gameweekMigration, /clock_timestamp\(\) >= gameweek\.locks_at/);
  assert.match(gameweekMigration, /clock_timestamp\(\) <= gameweek\.last_fixture_at/);
  assert.match(gameweekMigration, /TL_QUICK_SUB_MATCH_NOT_ACTIVE/);
  assert.match(gameweekMigration, /add column gameweek_id uuid references/);
  assert.match(gameweekMigration, /alter column gameweek_id set not null/);
});

test("Quick Sub event insertion rechecks the same live canonical matchweek transactionally", () => {
  assert.match(liveGameweekMigration, /join public\.touchline_fantasy_gameweeks as gameweek on gameweek\.id = session\.gameweek_id/);
  assert.match(liveGameweekMigration, /v_gameweek_state not in \('LOCKED', 'LIVE'\)/);
  assert.match(liveGameweekMigration, /fixture\.round_id = gameweek\.round_id/);
  assert.match(liveGameweekMigration, /for share of fixture, gameweek/);
  assert.match(liveGameweekMigration, /TL_QUICK_SUB_FIXTURE_NOT_LIVE_OR_STALE/);
});

test("Quick Sub event audit stores append-only before/after state and release linkage", () => {
  assert.match(commandAuditMigration, /command_hash text not null/);
  assert.match(commandAuditMigration, /actor_id uuid not null/);
  assert.match(commandAuditMigration, /expected_roster_revision text not null/);
  assert.match(commandAuditMigration, /before_state jsonb not null/);
  assert.match(commandAuditMigration, /after_state jsonb not null/);
  assert.match(commandAuditMigration, /release_sha text not null/);
  assert.match(commandAuditMigration, /TL_QUICK_SUB_AUDIT_BACKFILL_REVIEW_REQUIRED/);
});

const ownerId = "10000000-0000-4000-8000-000000000001";
const fixtureId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";

function sessionReadHarness(options: {
  route?: "session" | "event";
  revision?: number;
  events?: Array<{ resulting_revision: number; expected_revision: number }>;
  authenticated?: boolean;
  allowed?: boolean;
  failureTable?: string;
} = {}) {
  const queries: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const calls = { adminCreated: 0, rpc: 0 };
  const admin = {
    rpc() { calls.rpc += 1; throw new Error("Disabled experimental mutation must not write"); },
    from(table: string) {
      const query = { table, filters: [] as Array<[string, string, unknown]> };
      queries.push(query);
      const builder = {
        select() { return builder; },
        eq(key: string, value: unknown) { query.filters.push(["eq", key, value]); return builder; },
        lte(key: string, value: unknown) { query.filters.push(["lte", key, value]); return builder; },
        order() { return builder; },
        maybeSingle() { return builder; },
        then(resolve: (value: unknown) => unknown) {
          if (options.failureTable === table) return Promise.resolve(resolve({ data: null, error: { message: "offline" } }));
          let data: unknown = null;
          if (table === "football_fixtures") data = { id: fixtureId, provider: "sportmonks" };
          if (table === "touchline_arena_quick_substitution_sessions") data = {
            id: sessionId, user_id: ownerId, fixture_id: fixtureId, revision: options.revision ?? 1,
          };
          if (table === "touchline_arena_quick_substitution_events") {
            // The second event committed after the route read session revision1.
            // A version-bound read must still return the first complete snapshot.
            data = (options.events ?? [
              { expected_revision: 0, resulting_revision: 1 },
              { expected_revision: 1, resulting_revision: 2 },
            ]).filter((event) => query.filters.every(([op, key, value]) => op !== "lte"
              || event[key as keyof typeof event] <= Number(value)));
          }
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return builder;
    },
  };
  const exports: { GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(ts.transpileModule(options.route === "event" ? eventRoute : sessionRoute, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText, {
    exports, URL, process: { env: { TOUCHLINE_LIVE_QUICK_SUB_ENABLED: "true" } },
    require(name: string) {
      if (name === "node:crypto") return { createHash };
      if (name === "next/server") return { NextResponse: { json: Response.json.bind(Response) } };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => { calls.adminCreated += 1; return admin; } };
      if (name === "@/lib/touchlineArena/quick-substitution-product-policy") return { TOUCHLINE_LIVE_QUICK_SUB_ENABLED };
      if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => ({
        data: { user: options.authenticated === false ? null : { id: ownerId } }, error: null,
      }) } }) };
      if (name === "@/lib/touchlineArena/auth-access") return { hasTouchLineArenaAccess: () => options.allowed !== false };
      if (name === "@/lib/touchlineArena/authoritative-roster-server") return { readAuthoritativeTouchlineRoster: () => { throw new Error("GET must not rebuild the frozen XI"); } };
      if (name === "@/lib/football-data/sportmonks-season-topscorers") return { strictSportmonksId: (value: unknown) => typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? value : null };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  assert.ok(exports.POST);
  return { get: exports.GET!, post: exports.POST, queries, calls };
}

test("owner-approved closed-market rule retires both LIVE mutations before body, database or provider access", async () => {
  assert.equal(TOUCHLINE_LIVE_QUICK_SUB_ENABLED, false);
  for (const route of ["session", "event"] as const) {
    const harness = sessionReadHarness({ route });
    let bodyReads = 0;
    const request = new Request(`https://qa.example/api/touchline-arena/quick-substitution/${route}`, {
      method: "POST", headers: { origin: "https://qa.example", "sec-fetch-site": "same-origin" },
    });
    request.json = async () => { bodyReads += 1; throw new Error("Must not read command"); };
    const response = await harness.post(request);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).error, "TL_QUICK_SUB_DISABLED_MARKET_RULE");
    assert.equal(bodyReads, 0);
    assert.equal(harness.calls.adminCreated, 0);
    assert.equal(harness.calls.rpc, 0);
    assert.equal(harness.queries.length, 0);
  }
});

test("retired LIVE routes retain same-origin and authentication boundaries", async () => {
  for (const route of ["session", "event"] as const) {
    const url = `https://qa.example/api/touchline-arena/quick-substitution/${route}`;
    const foreign = sessionReadHarness({ route });
    assert.equal((await foreign.post(new Request(url, { method: "POST", headers: { origin: "https://foreign.example" } }))).status, 403);
    for (const options of [{ authenticated: false }, { allowed: false }]) {
      const harness = sessionReadHarness({ route, ...options });
      assert.equal((await harness.post(new Request(url, { method: "POST", headers: { origin: "https://qa.example" } }))).status, 401);
      assert.equal(harness.calls.adminCreated, 0);
      assert.equal(harness.calls.rpc, 0);
    }
  }
});

test("session GET returns one complete revision when another command commits between the two reads", async () => {
  const { get, queries } = sessionReadHarness();
  const response = await get(new Request("https://qa.example/api/touchline-arena/quick-substitution/session?providerFixtureId=123"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.session.revision, 1);
  assert.deepEqual(body.events, [{ expected_revision: 0, resulting_revision: 1 }]);
  const eventQuery = queries.find(({ table }) => table === "touchline_arena_quick_substitution_events")!;
  assert.ok(eventQuery.filters.some(([op, key, value]) => op === "eq" && key === "session_id" && value === sessionId));
  assert.ok(eventQuery.filters.some(([op, key, value]) => op === "lte" && key === "resulting_revision" && value === 1));
  for (const query of queries.filter(({ table }) => table !== "football_fixtures")) {
    assert.ok(query.filters.some(([op, key, value]) => op === "eq" && key === "user_id" && value === ownerId));
  }
});

test("session GET rejects missing, gapped or malformed history instead of returning a partial recovery", async () => {
  for (const options of [
    { revision: 1, events: [] },
    { revision: 2, events: [{ expected_revision: 0, resulting_revision: 1 }] },
    { revision: 2, events: [{ expected_revision: 0, resulting_revision: 1 }, { expected_revision: 0, resulting_revision: 2 }] },
    { revision: -1, events: [] },
    { revision: 10, events: [] },
  ]) {
    const response = await sessionReadHarness(options).get(new Request("https://qa.example/api/touchline-arena/quick-substitution/session?providerFixtureId=123"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "TL_QUICK_SUB_HISTORY_INCOMPLETE");
  }
  const empty = await sessionReadHarness({ revision: 0, events: [] }).get(new Request("https://qa.example/api/touchline-arena/quick-substitution/session?providerFixtureId=123"));
  assert.equal(empty.status, 200);
});

test("session GET does not query private rows for unauthenticated or forbidden users", async () => {
  for (const options of [{ authenticated: false }, { allowed: false }]) {
    const harness = sessionReadHarness(options);
    assert.equal((await harness.get(new Request("https://qa.example/api/touchline-arena/quick-substitution/session?providerFixtureId=123"))).status, 401);
    assert.equal(harness.queries.length, 0);
  }
});

test("session recovery refuses database read failures without exposing partial history", async () => {
  for (const table of ["football_fixtures", "touchline_arena_quick_substitution_sessions", "touchline_arena_quick_substitution_events"]) {
    const response = await sessionReadHarness({ failureTable: table }).get(new Request("https://qa.example/api/touchline-arena/quick-substitution/session?providerFixtureId=123"));
    assert.ok(response.status >= 500);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.session, undefined);
    assert.equal(body.events, undefined);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});
