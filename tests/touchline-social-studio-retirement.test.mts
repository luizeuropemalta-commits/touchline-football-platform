import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import { buildTouchlineRouteAuditManifest } from "../scripts/qa/build-touchline-route-audit-manifest.mts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const retired = [
  "app/api/admin/social-publications/studio/route.ts",
  "app/api/admin/social-publications/studio/review/route.ts",
  "app/api/admin/social-publications/studio/video/route.ts",
  "components/touchline/admin/TouchlineSocialStudio.tsx",
];

test("retired video routes and unused UI are absent while PNG and current approval routes remain inventoried", () => {
  for (const path of retired) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  const rows = buildTouchlineRouteAuditManifest();
  for (const route of ["POST /api/admin/social-publications/studio", "POST /api/admin/social-publications/studio/review", "GET /api/admin/social-publications/studio/video"]) {
    assert.equal(rows.some(row => row.route === route), false, route);
  }
  for (const route of ["/admin/social-publications", "/admin/social-publications/studio", "GET /api/admin/social-publications/studio/png", "POST /api/admin/social-publications/review", "POST /api/admin/social-publications/template-policy"]) {
    assert.equal(rows.find(row => row.route === route)?.role, "OWNER_ADMIN", route);
  }
});

type StudioUser = { id?: string; email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null;
function authFixture(options: { user?: StudioUser; missingSession?: boolean; authError?: boolean; throwAuth?: boolean; owners?: string } = {}) {
  const compile = (text: string) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ownerExports = {};
  vm.runInNewContext(compile(source("lib/admin/owner.ts")), { exports: ownerExports, process: { env: { TOUCHLINE_OWNER_EMAILS: options.owners ?? "owner@example.test" } } });
  let lookups = 0;
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "@/lib/admin/owner": ownerExports,
    "./auth-access": { hasTouchLineArenaAccess },
    "@/lib/supabase/server": { createClient: async () => options.missingSession ? null : { auth: { getUser: async () => {
      lookups++;
      if (options.throwAuth) throw Error("synthetic auth transport failure");
      return { data: { user: options.user === undefined ? { id: "verified-owner", email: " OWNER@EXAMPLE.TEST ", app_metadata: { touchline_arena_access_v1: true } } : options.user }, error: options.authError ? Error("rejected") : null };
    } } } },
  };
  const exports: Record<string, () => Promise<string | null>> = {};
  vm.runInNewContext(compile(source("lib/touchlineArena/social-studio-server.ts")), { exports, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `PNG auth cannot import the retired video runtime: ${name}`);
    return dependencies[name];
  } });
  assert.deepEqual(Object.keys(exports), ["authorizeStudio"]);
  return { authorize: exports.authorizeStudio, lookups: () => lookups };
}

test("PNG authorization verifies current owner and server-owned access on every request", async () => {
  const fixture = authFixture();
  assert.equal(await fixture.authorize(), "verified-owner");
  assert.equal(await fixture.authorize(), "verified-owner");
  assert.equal(fixture.lookups(), 2, "No cached grant or getSession authority");
});

test("PNG authorization rejects absent sessions, nonowners, revoked access and editable metadata", async () => {
  const allowed = { id: "verified-owner", email: "owner@example.test", app_metadata: { touchline_arena_access_v1: true } };
  for (const options of [
    { missingSession: true }, { user: null }, { authError: true }, { owners: "" },
    { user: { ...allowed, id: "" } }, { user: { ...allowed, email: "customer@example.test" } },
    { user: { ...allowed, app_metadata: {} } }, { user: { ...allowed, app_metadata: { touchline_arena_access_v1: false } } },
    { user: { ...allowed, app_metadata: { touchline_arena_access_v1: "true" } } },
    { user: { id: allowed.id, email: allowed.email, user_metadata: { touchline_arena_access_v1: true } } },
  ]) assert.equal(await authFixture(options).authorize(), null);
  await assert.rejects(authFixture({ throwAuth: true }).authorize(), /synthetic auth transport failure/);
});

test("historical review migrations and private media manifest remain available without a product writer", () => {
  for (const path of [
    "supabase/migrations/20260914212250_touchline_social_studio_review_plans.sql",
    "supabase/migrations/20260914222454_touchline_social_studio_review_desk.sql",
    "supabase/migrations/20260915110000_touchline_social_studio_server_review_evidence.sql",
    "lib/touchlineArena/social-studio-media.ts",
  ]) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
  const server = source("lib/touchlineArena/social-studio-server.ts");
  assert.match(server, /^import "server-only";/);
  assert.doesNotMatch(server, /createAdminClient|\.rpc\(|saveStudioAction|StudioSnapshot|createSignedPreview|STUDIO_MEDIA|social-studio-request/);
});
