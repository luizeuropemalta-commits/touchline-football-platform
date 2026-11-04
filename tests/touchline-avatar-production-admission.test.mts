import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { resolveClubOwnerAvatarRuntimeAdmission, matchesAvatarRuntimeAdmission } from "../lib/touchlineArena/club-owner-avatar-runtime-admission.ts";

// Deliberately synthetic target, not a deployment/project configuration.
const project = "abcdefghijklmnopqrst", origin = "https://touchline.com.br", database = `https://${project}.supabase.co`;
const actor = "11111111-1111-4111-8111-111111111111", operation = "22222222-2222-4222-8222-222222222222";
const publicId = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
const jwt = (role: string, ref = project) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.synthetic_signature`;
const environment = (): Record<string, string | undefined> => ({ VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM", VERCEL_ORG_ID: "team_P1d7YNrmUObvbJJTJRlGcXoz",
  TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: project, SUPABASE_URL: database, NEXT_PUBLIC_SUPABASE_URL: database,
  NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
  TOUCHLINE_CLUB_OWNER_AVATAR_PRODUCTION_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true",
  TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: actor, TOUCHLINE_OWNER_EMAILS: "admin@example.invalid" });

test("Production avatar admission has no implicit target, fallback or request-controlled origin", () => {
  const env = environment();
  const admitted = resolveClubOwnerAvatarRuntimeAdmission(env, origin); assert.ok(admitted);
  assert.equal(admitted.kind, "production"); assert.equal(admitted.projectRef, project);
  const config = { environment: "production", requestOrigin: origin, supabaseOrigin: database,
    publicSupabaseOrigin: database, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  assert.equal(matchesAvatarRuntimeAdmission(admitted, config), true);
  assert.equal(matchesAvatarRuntimeAdmission({ ...admitted }, config), false);
  assert.equal(matchesAvatarRuntimeAdmission(admitted, { ...config, serviceRoleKey: jwt("service_role", "zyxwvutsrqponmlkjihg") }), false);
  for (const patch of [
    { TOUCHLINE_CLUB_OWNER_AVATAR_PRODUCTION_ENABLED: undefined }, { TOUCHLINE_CLUB_OWNER_AVATAR_PRODUCTION_ENABLED: "false" },
    { TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: undefined }, { TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy" },
    { VERCEL_ENV: "preview" }, { VERCEL_PROJECT_ID: "wrong" }, { VERCEL_ORG_ID: "wrong" },
    { SUPABASE_URL: database + "/" }, { NEXT_PUBLIC_SUPABASE_URL: database + "/" }, { NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: origin + "/" },
    { TOUCHLINE_DEPLOYMENT_MODE: "qa-preview" }, { TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy" },
    { TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: "true" }, { TOUCHLINE_ISOLATED_PREVIEW_MODE: "" },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon", "zyxwvutsrqponmlkjihg") }, { SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic" },
  ]) assert.equal(resolveClubOwnerAvatarRuntimeAdmission({ ...env, ...patch }, origin), null);
  for (const requestOrigin of [origin + "/", "https://www.touchline.com.br", "https://touchline-arena-official.vercel.app", "https://example.invalid", "http://localhost:3100"]) {
    assert.equal(resolveClubOwnerAvatarRuntimeAdmission(env, requestOrigin), null);
  }
});

const root = resolve(import.meta.dirname, ".."), native = createRequire(import.meta.url);
const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).webp().toBuffer();
const digest = createHash("sha256").update(bytes).digest("hex");
function fixture(patch: Record<string, string | undefined> = {}) {
  const env = { ...environment(), ...patch }, calls: string[] = [];
  const state = { actor, access: true, owner: false, consent: true, drift: false };
  const current = { actorId: actor, revision: "1", avatarUrl: `/api/account/avatar?version=${operation}`, operationId: operation, digest };
  const authentication = () => ({ data: { user: { id: state.actor, email: "customer@example.invalid", app_metadata: { touchline_arena_access_v1: state.access } } }, error: null });
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push(name);
    if (name !== "touchline_people_read_public_avatars") assert.equal(args.p_actor, actor);
    const data = name === "touchline_read_club_owner_avatar" ? current
      : name === "touchline_read_club_owner_avatar_operation_status" ? { version: 1, actorId: actor, revision: "1", generation: "2",
        activeOperationId: null, fencedThroughGeneration: "-1", requestedOperationId: null, operation: null }
      : name === "touchline_people_read_public_avatars" ? state.consent ? [{ publicId, consentVersion: "1", email: "customer@example.invalid", customerEligible: true, current }] : []
      : assert.fail(`unexpected RPC ${name}`);
    const response = Promise.resolve({ data, error: null, status: 200 });
    const builder = { abortSignal(signal: AbortSignal) { signal.throwIfAborted(); return builder; }, retry(value: boolean) { assert.equal(value, false); return builder; }, then: response.then.bind(response) };
    return builder;
  } };
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, database);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${jwt("service_role")}`);
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
    if (url.pathname === "/storage/v1/bucket/touchline-club-owner-avatars") {
      calls.push("bucket"); return Response.json({ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars", public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/webp"] });
    }
    assert.equal(url.pathname, `/storage/v1/object/authenticated/touchline-club-owner-avatars/${actor}/${operation}/${digest}.webp`);
    calls.push("image"); return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } });
  };
  const cache = new Map<string, Record<string, unknown>>();
  function load(path: string): Record<string, unknown> {
    if (cache.has(path)) return cache.get(path)!;
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const require = (name: string): unknown => {
      if (name === "server-only") return {};
      if (name === "@/lib/admin/owner") return { ownerEmails: () => ["admin@example.invalid"], isOwnerEmail: () => state.owner };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => { calls.push("admin"); return admin; } };
      if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => {
        calls.push("auth"); if (state.drift) env.SUPABASE_URL = "https://changed.invalid"; return authentication();
      } } }) };
      if (name === "next/headers") return { headers: async () => new Headers({ host: "touchline.com.br" }) };
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        if (!target.endsWith(".ts")) target += ".ts"; return load(target);
      }
      return native(name);
    };
    vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { exports, require, process: { env }, fetch: transport, URL, Request, Response, Headers, AbortController, AbortSignal,
      Buffer, Uint8Array, TextDecoder, TextEncoder, atob, performance, setTimeout, clearTimeout }, { filename: path });
    return exports;
  }
  const route = load(resolve(root, "app/api/account/avatar/route.ts")) as { GET(request: Request): Promise<Response>; POST(request: Request): Promise<Response> };
  const recovery = load(resolve(root, "app/api/account/avatar/recovery/route.ts")) as { POST(request: Request): Promise<Response> };
  const readContext = (load(resolve(root, "lib/touchlineArena/club-owner-avatar-context-server.ts")).createClubOwnerAvatarContextReader as () => (auth: unknown, id: string) => Promise<Record<string, unknown> | null>)();
  const publicService = (load(resolve(root, "lib/touchlineArena/clubowner-public-avatar-server.ts")).publicOwnerAvatarService as () => {
    enabled: boolean; urls(ids: string[]): Promise<Record<string, string>>; serve(request: Request, id: string): Promise<Response>;
  })();
  return { env, calls, state, route, recovery, readContext, publicService, authentication };
}
const uploadFlags = { TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_SELECTION_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY: "true" };
const uploadRequest = () => new Request(origin + "/api/account/avatar", { method: "POST", headers: { origin,
  "x-touchline-expected-account": actor, "x-touchline-avatar-operation": other, "if-match": '"1"', "x-touchline-avatar-generation": "2", "content-type": "image/webp" }, body: new Uint8Array(bytes) });
const recoveryRequest = () => new Request(origin + "/api/account/avatar/recovery", { method: "POST", headers: { origin,
  "x-touchline-expected-account": actor, "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) });

test("real Production GET and SSR context work with upload OFF and keep private storage bound", async () => {
  const f = fixture();
  const response = await f.route.GET(new Request(`${origin}/api/account/avatar?version=${operation}`));
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(f.calls.filter(x => x === "auth").length, 1); assert.ok(f.calls.includes("image"));
  f.calls.length = 0;
  const context = await f.readContext(f.authentication(), actor); assert.ok(context);
  assert.equal(context.uploadAllowed, false); assert.equal(context.revision, "1"); assert.equal(f.calls.includes("auth"), false);
  assert.equal(f.calls.includes("image"), false);
  assert.equal((await f.route.POST(uploadRequest())).status, 503);
});

test("real routes deny missing Production approval before privileged work and preserve actor/immutable-context gates", async () => {
  for (const patch of [{ TOUCHLINE_CLUB_OWNER_AVATAR_PRODUCTION_ENABLED: undefined }, { TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: undefined }, { SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", "zyxwvutsrqponmlkjihg") }]) {
    const f = fixture({ ...uploadFlags, ...patch });
    assert.equal((await f.route.GET(new Request(`${origin}/api/account/avatar?version=${operation}`))).status, 503);
    assert.equal((await f.route.POST(uploadRequest())).status, 503);
    assert.equal((await f.recovery.POST(recoveryRequest())).status, 503);
    assert.equal(await f.readContext(f.authentication(), actor), null); assert.deepEqual(f.calls, []);
  }
  const changedActor = fixture(uploadFlags); changedActor.state.actor = other;
  assert.equal((await changedActor.route.POST(uploadRequest())).status, 409); assert.deepEqual(changedActor.calls, ["auth"]);
  const drift = fixture(); drift.state.drift = true;
  assert.equal((await drift.route.GET(new Request(`${origin}/api/account/avatar?version=${operation}`))).status, 503);
  assert.deepEqual(drift.calls, ["auth"]);
});

test("Production recovery uses status authority and never performs image transport", async () => {
  const f = fixture(uploadFlags); const response = await f.recovery.POST(recoveryRequest());
  assert.equal(response.status, 200); assert.equal(f.calls.filter(x => x === "auth").length, 1);
  assert.equal(f.calls.includes("image"), false); assert.ok(f.calls.includes("touchline_read_club_owner_avatar_operation_status"));
  for (const flag of Object.keys(uploadFlags)) {
    const g = fixture({ ...uploadFlags, [flag]: undefined });
    assert.equal((await g.route.POST(uploadRequest())).status, 503); assert.deepEqual(g.calls, []);
  }
});

test("Production public photo keeps consent/versioned mediated URL and does not depend on upload", async () => {
  const f = fixture({ TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED: "true", TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY: "true" });
  assert.equal(f.publicService.enabled, true);
  const urls = await f.publicService.urls([publicId]); assert.match(urls[publicId], /^\/api\/touchline\/clubowners\/.+\/avatar\?v=[a-f0-9]{64}$/);
  const response = await f.publicService.serve(new Request(origin + urls[publicId]), publicId);
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  f.state.consent = false; f.calls.length = 0;
  assert.equal((await f.publicService.serve(new Request(origin + urls[publicId]), publicId)).status, 404);
  assert.equal(f.calls.includes("image"), false);
  assert.doesNotMatch(JSON.stringify(urls), /supabase|synthetic_signature|service_role/);
});
