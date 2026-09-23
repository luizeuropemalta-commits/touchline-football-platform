import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { NextRequest, NextResponse } from "next/server.js";
import ts from "typescript";

const routeSource = fs.readFileSync(
  new URL("../app/api/football-data/sync-starter/route.ts", import.meta.url),
  "utf8",
);
const controlSource = fs.readFileSync(
  new URL("../components/admin-football-data-sync-controls.tsx", import.meta.url),
  "utf8",
);
const diagnosticSource = fs.readFileSync(
  new URL("../app/api/football-data/provider-diagnostic/route.ts", import.meta.url),
  "utf8",
);

const routeJavascript = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const syntheticSecret = "synthetic-sync-contract-secret";
const syntheticRunId = "00000000-0000-4000-8000-000000000001";

function forbidden(): never { throw new Error("Unexpected external capability in sync route test"); }

// Run the complete, unchanged route body with real Next request/response objects.
// Stub only its external boundaries: no provider module, database SDK, credentials
// or session is loaded, and unlisted dependencies/effect capabilities fail closed.
function loadSyncRoute(options: {
  result?: Record<string, unknown>;
  thrown?: Error;
  environment?: Record<string, string>;
  adminConfigured?: boolean;
} = {}) {
  const calls: string[] = [];
  const result = options.result ?? { ok: true, status: "success" };
  const sync = (scope: string) => async () => {
    calls.push(scope);
    if (options.thrown) throw options.thrown;
    return result;
  };
  const imports: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "node:crypto": { randomUUID: () => syntheticRunId },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => false },
    "@/lib/supabase/admin": {
      createAdminClient: () => options.adminConfigured === false ? null : new Proxy({}, { get: forbidden }),
    },
    "@/lib/supabase/server": {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    },
    "@/lib/football-data/capability-sync": { syncSportmonksProviderCapabilities: sync("capabilities") },
    "@/lib/football-data/fixture-schedule-sync": { syncSportmonksFixtureSchedule: sync("fixture_schedule") },
    "@/lib/football-data/starter-sync": { syncSportmonksStarterFoundation: sync("foundation") },
    "@/lib/football-data/qa-country-sync": { syncQaCountryData: sync("qa_country_sync") },
    "@/lib/football-data/qa-twenty-club-roster-sync": { syncQaTwentyClubRosters: sync("qa_twenty_club_roster_sync") },
  };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(routeJavascript, {
    exports, Error,
    process: { env: {
      NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa",
      FOOTBALL_DATA_SYNC_SECRET: syntheticSecret,
      ...options.environment,
    } },
    fetch: forbidden, setTimeout: forbidden, setInterval: forbidden,
    require: (specifier: string) => {
      assert.ok(Object.hasOwn(imports, specifier), `Unexpected route dependency: ${specifier}`);
      return imports[specifier];
    },
  }, { timeout: 1_000 });
  return {
    calls,
    GET: exports.GET as (request: NextRequest) => Promise<NextResponse>,
    POST: exports.POST as (request: NextRequest) => Promise<NextResponse>,
  };
}

function syncRequest(scope: string, authorized = true, method = "POST") {
  return new NextRequest(`https://sync-contract.invalid/api/football-data/sync-starter?scope=${scope}`, {
    method,
    headers: authorized ? { authorization: `Bearer ${syntheticSecret}` } : {},
  });
}

test("football-data synchronization rejects state-changing GET requests", () => {
  const getHandler = routeSource.match(
    /export async function GET[\s\S]*?\n}\n\nexport async function POST/,
  )?.[0] ?? "";

  assert.match(getHandler, /status:\s*405/);
  assert.match(getHandler, /Allow:\s*"POST"/);
  assert.doesNotMatch(getHandler, /runStarterSync\(request\)/);
});

test("football-data synchronization remains available only through POST", () => {
  assert.match(
    routeSource,
    /export async function POST\(request: NextRequest\)\s*{\s*return runFootballDataSync\(request\);\s*}/,
  );
  assert.match(routeSource, /scope === "fixture_schedule"[\s\S]*?syncSportmonksFixtureSchedule/);
  assert.match(routeSource, /scope === "foundation"[\s\S]*?syncSportmonksStarterFoundation/);
  assert.match(routeSource, /scope === "capabilities"[\s\S]*?syncSportmonksProviderCapabilities/);
  assert.match(routeSource, /scope === "qa_country_sync"[\s\S]*?syncQaCountryData/);
  assert.match(routeSource, /scope === "qa_twenty_club_roster_sync"[\s\S]*?syncQaTwentyClubRosters/);
  assert.match(routeSource, /randomUUID\(\)/);
  assert.match(routeSource, /Owner session or football data sync secret required/);
  assert.match(routeSource, /authorization === `Bearer \$\{secret\}`/);
  assert.match(routeSource, /hasTouchLineArenaAccess\(user\) && isOwnerEmail\(user\?\.email\)/);
  assert.match(routeSource, /fromDate: request\.nextUrl\.searchParams\.get\("fromDate"\)/);
  assert.match(routeSource, /throughDate: request\.nextUrl\.searchParams\.get\("throughDate"\)/);
});

test("production exposes only foundation and official fixture schedule mutations", () => {
  assert.match(routeSource, /function allowsQaOnlySyncScopes/);
  assert.match(routeSource, /vercelEnvironment === "production"\) return false/);
  assert.match(routeSource, /vercelEnvironment === "preview"\) return gitBranch === "qa"/);
  assert.match(routeSource, /qaOnlyScopeAllowed && scope === "capabilities"/);
  assert.match(routeSource, /qaOnlyScopeAllowed && scope === "qa_country_sync"/);
  assert.match(routeSource, /qaOnlyScopeAllowed && scope === "qa_twenty_club_roster_sync"/);
  assert.match(routeSource, /Use scope=foundation or scope=fixture_schedule/);
});

test("QA country reconciliation is an explicit owner POST control", () => {
  assert.match(controlSource, /scope:\s*"qa_country_sync"/);
  assert.match(controlSource, /runId:\s*crypto\.randomUUID\(\)/);
  assert.match(controlSource, /method:\s*"POST"/);
  assert.match(controlSource, /Reconcile QA country data/);
});

test("QA twenty-club roster reconciliation is an explicit owner POST control", () => {
  assert.match(controlSource, /scope:\s*"qa_twenty_club_roster_sync"/);
  assert.match(controlSource, /runId:\s*crypto\.randomUUID\(\)/);
  assert.match(controlSource, /Reconcile 20 QA squads/);
});

for (const scope of ["foundation", "fixture_schedule", "capabilities"]) {
  for (const ok of [false, true]) {
    test(`POST ${scope} preserves explicit provider ok=${ok} and the result details`, async () => {
      const result = Object.freeze({
        ok, status: ok ? "success" : "error", recordsUpdated: ok ? 2 : 0,
        errors: ok ? [] : ["Synthetic provider refusal"],
      });
      const route = loadSyncRoute({ result });
      const response = await route.POST(syncRequest(scope));
      const body = await response.json();

      assert.equal(response.status, 200, "returned results retain the existing HTTP contract");
      assert.equal(body.ok, ok, "an explicit provider failure must not become success");
      for (const [key, value] of Object.entries(result)) assert.deepEqual(body[key], value);
      assert.equal(body.mode, "sync_secret");
      assert.match(body.syncedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(typeof body.note, "string");
      assert.deepEqual(route.calls, [scope]);
    });
  }
}

for (const scope of ["foundation", "fixture_schedule"]) {
  for (const status of ["partial", "not_configured"]) {
    test(`POST ${scope} preserves ok=false for ${status}`, async () => {
      const route = loadSyncRoute({ result: { ok: false, status, errors: ["Synthetic incomplete sync"] } });
      const response = await route.POST(syncRequest(scope));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.status, status);
      assert.deepEqual(body.errors, ["Synthetic incomplete sync"]);
      assert.deepEqual(route.calls, [scope]);
    });
  }
}

for (const scope of ["qa_country_sync", "qa_twenty_club_roster_sync"]) {
  for (const status of ["applied", "already-current"]) {
    test(`POST ${scope} keeps legacy ${status} successful when no ok field is returned`, async () => {
      const result = Object.freeze({ status, runId: syntheticRunId, recordsUpdated: status === "applied" ? 2 : 0 });
      const route = loadSyncRoute({ result });
      const response = await route.POST(syncRequest(scope));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      for (const [key, value] of Object.entries(result)) assert.deepEqual(body[key], value);
      assert.equal(Object.hasOwn(result, "ok"), false, "the legacy result itself must not be mutated");
      assert.deepEqual(route.calls, [scope]);
    });
  }
}

for (const scope of ["foundation", "qa_twenty_club_roster_sync"]) {
  test(`POST ${scope} still reports thrown failures as HTTP 500`, async () => {
    const route = loadSyncRoute({ thrown: new Error("Synthetic SportMonks failure") });
    const response = await route.POST(syncRequest(scope));
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.status, "error");
    assert.equal(body.error, "Synthetic TouchLine Data failure");
    assert.deepEqual(route.calls, [scope]);
  });
}

test("GET and unauthorized POST never call a sync producer", async () => {
  const route = loadSyncRoute();
  const get = await route.GET(syncRequest("foundation", true, "GET"));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal((await get.json()).ok, false);
  const post = await route.POST(syncRequest("foundation", false));
  assert.equal(post.status, 401);
  assert.equal((await post.json()).ok, false);
  assert.deepEqual(route.calls, []);
});

test("missing admin configuration never calls a sync producer or reports success", async () => {
  const route = loadSyncRoute({ adminConfigured: false });
  const response = await route.POST(syncRequest("foundation"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.status, "not_configured");
  assert.deepEqual(route.calls, []);
});

test("invalid scopes and production QA-only scopes remain fail-closed before sync", async () => {
  for (const environment of [
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" },
  ]) {
    for (const scope of ["invalid", "capabilities", "qa_country_sync", "qa_twenty_club_roster_sync"]) {
      const route = loadSyncRoute({ environment });
      const response = await route.POST(syncRequest(scope));
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.ok, false);
      assert.equal(body.status, "invalid_scope");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(route.calls, []);
    }
  }
});

test("twenty-club provider diagnostic remains owner-only and read-only", () => {
  assert.match(diagnosticSource, /if \(!await authorizeOwner\(\)\)/);
  assert.match(diagnosticSource, /scope === "twenty"/);
  assert.match(diagnosticSource, /sportmonks-live-read-only/);
  assert.match(diagnosticSource, /scope === "positions"/);
  assert.match(diagnosticSource, /safePositionEvidence/);
  assert.match(diagnosticSource, /squadDetailedPositionId/);
  assert.match(diagnosticSource, /playerDetailedPositionId/);
  assert.match(diagnosticSource, /providerDetailedPosition/);
  assert.match(diagnosticSource, /providerPlayerDetailedPositionId/);
  assert.match(diagnosticSource, /hardcodedConflicts/);
  assert.match(diagnosticSource, /loadTouchlineCardEditorialOverrides/);
  assert.doesNotMatch(diagnosticSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
