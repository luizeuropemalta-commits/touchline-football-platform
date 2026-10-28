import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Result = { status: number; body: Record<string, unknown>; headers: Record<string, string> };
function harness(options: { owner?: boolean; access?: boolean; authError?: boolean; throws?: boolean; status?: string; ok?: boolean } = {}) {
  let calls = 0;
  let clients = 0;
  const exports: Record<string, (request?: unknown) => Promise<Result>> = {};
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: Record<string, unknown>, init: { status: number; headers: Record<string, string> }) => ({ body, ...init }) } },
    "@/lib/admin/owner": { isOwnerEmail: () => options.owner !== false },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => options.access !== false },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "owner@example.invalid" } }, error: options.authError ? {} : null }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => { clients++; return { marker: "authorized-admin" }; } },
    "@/lib/football-data/live-sync": { syncSportmonksLiveState: async (...args: unknown[]) => {
      calls++; assert.equal(args.length, 1, "no caller overrides reach the shared pipeline");
      if (options.throws) throw new Error("secret-provider-detail");
      return { ok: options.ok ?? true, status: options.status ?? "success", syncRunId: "run-1", updated: 2, playerFixtureRowsWritten: 3, coachPointsReconciled: 1, errors: ["private-provider-detail"] };
    } },
  };
  const source = readFileSync(new URL("../app/api/admin/football-data/sync/route.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name)); return dependencies[name]; } });
  const request = (origin = "https://qa.example", site = "same-origin") => ({ nextUrl: new URL("https://qa.example/api/admin/football-data/sync?fixtureId=evil"), headers: new Headers({ origin, "sec-fetch-site": site }) });
  return { ...exports, request, counts: () => ({ calls, clients }) };
}

test("admin sync rejects cross-site and unauthorised sessions before privileged work", async () => {
  for (const options of [{ owner: false }, { access: false }, { authError: true }]) {
    const h = harness(options); assert.equal((await h.POST(h.request())).status, 403); assert.deepEqual(h.counts(), { calls: 0, clients: 0 });
  }
  for (const [origin, site] of [["https://other.example", "same-origin"], ["https://qa.example", "cross-site"], ["", "same-origin"]]) {
    const h = harness(); assert.equal((await h.POST(h.request(origin, site))).status, 403); assert.deepEqual(h.counts(), { calls: 0, clients: 0 });
  }
});

test("admin sync uses the shared pipeline once and exposes only its bounded outcome", async () => {
  const h = harness(); const result = await h.POST(h.request());
  assert.equal(result.status, 200); assert.equal(result.body.fixturesUpdated, 2); assert.equal(result.body.issueCount, 1);
  assert.equal(result.headers["Cache-Control"], "private, no-store"); assert.deepEqual(h.counts(), { calls: 1, clients: 1 });
  assert.ok(!JSON.stringify(result).includes("private-provider-detail"));
});

test("skip, partial failure and ambiguous failure are never transformed into a successful refresh", async () => {
  const skipped = await harness({ status: "skipped" }).POST(harness().request()); assert.equal(skipped.body.status, "skipped");
  const partial = await harness({ status: "partial", ok: false }).POST(harness().request()); assert.equal(partial.status, 502); assert.equal(partial.body.ok, false);
  const failed = await harness({ throws: true }).POST(harness().request()); assert.equal(failed.status, 503); assert.equal(failed.body.error, "SYNC_NOT_CONFIRMED");
  assert.ok(!JSON.stringify(failed).includes("secret-provider-detail"));
  const h = harness(); assert.equal((await h.GET()).status, 405); assert.deepEqual(h.counts(), { calls: 0, clients: 0 });
});
