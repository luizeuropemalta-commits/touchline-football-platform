import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as sdk from "@supabase/supabase-js";

const root = resolve(import.meta.dirname, ".."), native = createRequire(import.meta.url);
const host = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app", origin = `https://${host}`;
const database = "https://xgxbwqxjssxxuihuwmgy.supabase.co", actor = "123e4567-e89b-42d3-a456-426614174000", other = "123e4567-e89b-42d3-a456-426614174001";
function fixture(patch: Record<string, string | undefined> = {}, scenario: "idle" | "active" | "committed" | "stale" = "idle") {
  const environment: Record<string, string | undefined> = {
    TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: actor,
    VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", VERCEL_BRANCH_URL: host, VERCEL_URL: host,
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    NEXT_PUBLIC_SUPABASE_URL: database, SUPABASE_URL: database, NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: origin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key-not-a-credential", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-not-a-credential", TOUCHLINE_OWNER_EMAILS: "admin@example.invalid", ...patch,
  };
  const calls: string[] = []; let generation = scenario === "idle" ? "0" : scenario === "committed" ? "2" : "1", fenced = "-1";
  const newerOperation = "123e4567-e89b-42d3-a456-426614174002";
  let activeOperation: string | null = scenario === "active" ? other : scenario === "stale" ? newerOperation : null;
  let operationState = scenario === "committed" ? "committed" : "pending";
  const state = { actor, email: "customer@example.invalid", error: false, drift: false };
  const cache = new Map<string, unknown>();
  const load = (path: string): unknown => {
    if (cache.has(path)) return cache.get(path);
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const require = (name: string): unknown => {
      if (name === "server-only") return {};
      if (name === "next/headers") return { cookies: async () => ({ getAll: () => [], set: () => {} }) };
      if (name === "@supabase/ssr") return { createServerClient: () => ({ auth: { getUser: async () => {
        calls.push("auth"); if (state.drift) environment.UNRELATED_NEW_KEY = "changed";
        return { data: { user: { id: state.actor, email: state.email, app_metadata: { touchline_arena_access_v1: true } } }, error: state.error ? Error("PRIVATE") : null };
      } } }) };
      if (name === "@supabase/supabase-js") return { ...sdk, createClient: (url: string, key: string) => {
        calls.push("privileged"); assert.equal(url, database); assert.equal(key, "synthetic-service-key-not-a-credential");
        return sdk.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
          const rpc = new URL(String(input)).pathname.split("/").at(-1)!; calls.push(rpc);
          const args = JSON.parse(String(init?.body)); assert.equal(args.p_actor, actor);
          const receipt = { actorId: actor, operationId: other, expectedRevision: "0", revision: "1", digest: "a".repeat(64),
            objectKey: `${actor}/${other}/${"a".repeat(64)}.webp`, avatarUrl: `/api/account/avatar?version=${other}` };
          const snapshot = (requested: string | null = null) => {
            const selected = requested ?? activeOperation;
            const present = selected !== null && (selected === activeOperation || selected === other && scenario !== "stale");
            return { version: 1, actorId: actor, revision: scenario === "committed" ? "1" : "0", generation, activeOperationId: activeOperation,
              fencedThroughGeneration: fenced, requestedOperationId: selected, operation: present ? { operationId: selected, state: operationState,
                expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt: operationState === "committed" ? receipt : null } : null };
          };
          if (rpc === "touchline_read_club_owner_avatar_operation_status") return Response.json(snapshot());
          if (rpc === "touchline_read_club_owner_avatar") return Response.json(scenario === "committed"
            ? { actorId: actor, revision: "1", avatarUrl: receipt.avatarUrl, operationId: other, digest: receipt.digest }
            : { actorId: actor, revision: "0", avatarUrl: null, operationId: null, digest: null });
          assert.equal(rpc, "touchline_fence_club_owner_avatar_operation");
          assert.equal(args.p_generation, scenario === "idle" ? generation : "1"); assert.equal(args.p_expected_active, scenario === "idle" ? null : other);
          if (scenario === "committed" || scenario === "stale") return Response.json({ version: 1, status: scenario === "committed" ? "committed" : "conflict", snapshot: snapshot(args.p_expected_active) });
          assert.equal(args.p_generation, generation); assert.equal(args.p_expected_active, activeOperation);
          fenced = generation; generation = String(BigInt(generation) + BigInt(1));
          activeOperation = null; operationState = "fenced";
          return Response.json({ version: 1, status: "barrier_applied", snapshot: snapshot(args.p_expected_active) });
        } } });
      } };
      if (name.startsWith("@/") || name.startsWith(".")) {
        let path2 = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        if (!/\.[cm]?tsx?$/.test(path2)) path2 += ".ts"; return load(path2);
      }
      return native(name);
    };
    vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { exports, require, process: { env: environment }, Request, Response, URL, Uint8Array, TextDecoder, Buffer, AbortController, AbortSignal, performance, setTimeout, clearTimeout,
        fetch: () => { throw Error("Unexpected real HTTP"); } }, { filename: path });
    return exports;
  };
  const route = load(resolve(root, "app/api/account/avatar/recovery/route.ts")) as { POST: (request: Request) => Promise<Response>; runtime: string };
  const request = (body: unknown = { action: "status" }, headers: Record<string, string> = {}) => new Request(`${origin}/api/account/avatar/recovery`, {
    method: "POST", body: JSON.stringify(body), headers: { origin, "content-type": "application/json", "x-touchline-expected-account": actor, ...headers },
  });
  return { route, request, state, calls };
}

test("recovery real route gates full QA config, both exact flags and dedicated account before auth", async () => {
  for (const patch of [{ TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: undefined }, { TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "TRUE" },
    { TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: undefined }, { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" },
    { SUPABASE_URL: "https://other.invalid" }, { VERCEL_URL: undefined }, { STRIPE_SECRET_KEY: "forbidden" },
    { TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" }]) {
    const f = fixture(patch); assert.equal(f.route.runtime, "nodejs"); assert.equal((await f.route.POST(f.request())).status, 503); assert.deepEqual(f.calls, []);
  }
  for (const headers of [{ origin: "https://other.invalid" }, { "sec-fetch-site": "cross-site" }, { "x-touchline-expected-account": other }]) {
    const f = fixture(); assert.equal((await f.route.POST(f.request(undefined, headers))).status, 403); assert.deepEqual(f.calls, []);
  }
});

test("recovery real route executes status and explicit idle fence through actual SDK without image work or readiness", async () => {
  const f = fixture(), response = await f.route.POST(f.request()); assert.equal(response.status, 200);
  const observed = await response.json(); assert.equal(observed.context.uploadAllowed, true); assert.equal(observed.context.canUpload, false); assert.equal(observed.context.readyForSelection, false);
  assert.equal(f.calls.filter(x => x === "auth").length, 1); assert.equal(f.calls.filter(x => x === "touchline_read_club_owner_avatar_operation_status").length, 2);
  const fenced = await f.route.POST(f.request({ action: "fence", generation: "0", expectedActiveOperationId: null, explicitRecoveryConsent: true }));
  const result = await fenced.json(); assert.equal(fenced.status, 200); assert.equal(result.context.generation, "1"); assert.equal(result.barrierStatus, "barrier_applied");
  assert.doesNotMatch(JSON.stringify(result), /digest|objectKey|synthetic/);
  assert.equal(fenced.headers.get("cache-control"), "private, no-store"); assert.equal(fenced.headers.get("vary"), "Cookie");
});

test("recovery real route refuses auth error, changed actor, admin and environment drift without RPC", async () => {
  for (const mode of ["error", "actor", "admin", "drift"] as const) {
    const f = fixture(); if (mode === "error") f.state.error = true; if (mode === "actor") f.state.actor = other;
    if (mode === "admin") f.state.email = "admin@example.invalid"; if (mode === "drift") f.state.drift = true;
    const response = await f.route.POST(f.request()); assert.ok([403, 409, 503].includes(response.status));
    assert.deepEqual(f.calls, ["auth"]); assert.doesNotMatch(await response.text(), /PRIVATE|synthetic/);
  }
});

test("C2 actual recovery route preserves active/committed/stale-ID fence bindings without readiness", async () => {
  for (const scenario of ["active", "committed", "stale"] as const) {
    const f = fixture({}, scenario);
    const response = await f.route.POST(f.request({ action: "fence", generation: "1", expectedActiveOperationId: other, explicitRecoveryConsent: true }));
    assert.equal(response.status, 200, scenario); const value = await response.json();
    assert.equal(value.barrierStatus, scenario === "active" ? "barrier_applied" : scenario === "committed" ? "committed" : "conflict");
    assert.equal(value.context.generation, scenario === "stale" ? "1" : "2");
    assert.equal(value.context.activeOperationId, scenario === "stale" ? "123e4567-e89b-42d3-a456-426614174002" : null);
    assert.equal(value.context.revision, scenario === "committed" ? "1" : "0");
    assert.equal(value.context.avatarUrl, scenario === "committed" ? `/api/account/avatar?version=${other}` : null);
    assert.equal(value.context.readyForSelection, false); assert.equal(value.context.canUpload, false);
    assert.deepEqual(f.calls, ["auth", "privileged", "touchline_fence_club_owner_avatar_operation", "touchline_read_club_owner_avatar_operation_status", "touchline_read_club_owner_avatar", "touchline_read_club_owner_avatar_operation_status"]);
    assert.doesNotMatch(JSON.stringify(value), /digest|objectKey|synthetic/);
  }
});
