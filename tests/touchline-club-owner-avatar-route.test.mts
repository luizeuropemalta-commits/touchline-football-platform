import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as sdk from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, ".."), native = createRequire(import.meta.url);
const host = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app", origin = `https://${host}`;
const project = "xgxbwqxjssxxuihuwmgy", database = `https://${project}.supabase.co`;
const actor = "123e4567-e89b-42d3-a456-426614174000", other = "123e4567-e89b-42d3-a456-426614174002";
const version = "123e4567-e89b-42d3-a456-426614174001";
const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).webp().toBuffer();
const digest = createHash("sha256").update(image).digest("hex");
function fixture(patch: Record<string, string | undefined> = {}, clock = performance,
  onBoundary: (name: string, environment: Record<string, string | undefined>) => void = () => {}) {
  const environment: Record<string, string | undefined> = {
    TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", VERCEL_BRANCH_URL: host, VERCEL_URL: host,
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: project, NEXT_PUBLIC_SUPABASE_URL: database, SUPABASE_URL: database,
    NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key-not-a-credential",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-not-a-credential", TOUCHLINE_OWNER_EMAILS: "admin@example.invalid", ...patch,
  };
  const calls: string[] = [], actors: string[] = [], pending: Array<(value: unknown) => void> = [];
  const boundaries: string[] = [], objects = new Map<string, Uint8Array>(), rpcInputs: Array<Record<string, string>> = [];
  let receipt: Record<string, string> | null = null, nativeCalls = 0, begun = false;
  const envelope = (status: string) => ({ version: 1, status, snapshot: { version: 1, actorId: actor, revision: receipt ? "1" : "0",
    generation: receipt ? "2" : "1", activeOperationId: receipt ? null : version, fencedThroughGeneration: "-1", requestedOperationId: version,
    operation: { operationId: version, state: receipt ? "committed" : "pending", expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt } } });
  const boundary = (name: string) => { boundaries.push(name); onBoundary(name, environment); };
  const state = { defer: false, id: actor, email: "customer@example.invalid", drift: false, cookieDrift: false,
    published: false, superseded: false, rpcFailure: false, objectMissing: false, access: true, userMetadataOnly: false, loseReceipt: false };
  const cache = new Map<string, unknown>();
  const load = (path: string): unknown => {
    if (cache.has(path)) return cache.get(path);
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const require = (name: string): unknown => {
      if (name === "server-only") return {};
      if (name === "next/headers") return { cookies: async () => { calls.push("cookies"); boundary("cookies"); if (state.cookieDrift) environment.SUPABASE_SERVICE_ROLE_KEY = "changed"; return { getAll: () => [], set: () => {} }; } };
      if (name === "@supabase/ssr") return { createServerClient: (url: string, key: string, options: { cookies: { getAll: () => unknown } }) => {
        calls.push("session"); assert.equal(url, database); assert.equal(key, "synthetic-anon-key-not-a-credential"); options.cookies.getAll();
        return { auth: { getUser: async () => {
          calls.push("getUser");
          if (state.defer) return new Promise(resolve => pending.push(resolve));
          if (state.drift) environment.SUPABASE_URL = "https://changed.invalid";
          boundary("auth");
          return { data: { user: { id: state.id, email: state.email,
            app_metadata: { touchline_arena_access_v1: state.access && !state.userMetadataOnly },
            user_metadata: { touchline_arena_access_v1: true } } }, error: null };
        } } };
      } };
      if (name === "@supabase/supabase-js") return { ...sdk, createClient: (url: string, key: string) => {
        calls.push("privileged"); assert.equal(url, database); assert.equal(key, "synthetic-service-key-not-a-credential");
        return { rpc: (rpc: string, args: Record<string, string>) => {
          assert.ok(["touchline_begin_club_owner_avatar_operation", "touchline_read_club_owner_avatar", "touchline_publish_club_owner_avatar_v2"].includes(rpc));
          actors.push(args.p_actor); rpcInputs.push({ rpc, ...args });
          const current = state.published ? { actorId: args.p_actor, revision: "1", avatarUrl: `/api/account/avatar?version=${version}`, operationId: version, digest }
            : { actorId: args.p_actor, revision: "0", avatarUrl: null, operationId: null, digest: null };
          const builder = { abortSignal: () => builder, retry: (value: boolean) => { assert.equal(value, false); return builder; },
            then: (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) => Promise.resolve().then(() => {
              boundary(rpc);
              if (state.rpcFailure) return { data: null, error: { message: "PRIVATE_SQL" }, status: 500 };
              if (rpc === "touchline_begin_club_owner_avatar_operation") {
                const status = receipt ? "committed" : begun ? "pending" : "started"; begun = true;
                return { data: envelope(status), error: null, status: 200 };
              }
              if (rpc === "touchline_publish_club_owner_avatar_v2") {
                receipt = { actorId: args.p_actor, operationId: args.p_operation, expectedRevision: args.p_expected, revision: "1",
                  digest: args.p_digest, objectKey: args.p_key, avatarUrl: `/api/account/avatar?version=${args.p_operation}` };
                if (state.loseReceipt) throw Error("PRIVATE_LOST_RECEIPT");
                return { data: envelope("committed"), error: null, status: 200 };
              }
              return { data: receipt ?? (state.superseded && actors.length > 1 ? { ...current, revision: "2" } : current), error: null, status: 200 };
            }).then(yes, no) };
          return builder;
        } };
      } };
      if (name === "sharp") return new Proxy(native(name), { apply(target, thisArg, args) {
        nativeCalls++; boundary("native"); return Reflect.apply(target, thisArg, args);
      } });
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        if (!/\.[cm]?tsx?$/.test(target)) target += ".ts";
        return load(target);
      }
      return native(name);
    };
    const source = readFileSync(path, "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { exports, require, process: { env: environment }, Request, Response, URL, Buffer, Uint8Array, AbortController, AbortSignal,
        performance: path === resolve(root, "app/api/account/avatar/route.ts") ? clock : performance, setTimeout, clearTimeout,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input)); calls.push(`storage:${init?.method}`);
          assert.ok(init?.method === "GET" || init?.method === "POST"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store"); assert.equal(url.origin, database);
          boundary(url.pathname.includes("/bucket/") ? "bucket" : `storage:${init?.method}`);
          if (url.pathname === "/storage/v1/bucket/touchline-club-owner-avatars") return Response.json({ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars", public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/webp"] });
          if (init?.method === "POST") {
            assert.equal(new Headers(init.headers).get("x-upsert"), "false");
            const bytes = new Uint8Array(init.body as Uint8Array), key = url.pathname.replace("/storage/v1/object/", "");
            assert.ok(key.startsWith(`touchline-club-owner-avatars/${actor}/${version}/`));
            objects.set(key, bytes); return Response.json({}, { status: 201 });
          }
          const stored = objects.get(url.pathname.replace("/storage/v1/object/authenticated/", ""));
          if (stored) return new Response(new Uint8Array(stored), { headers: { "content-type": "image/webp" } });
          assert.equal(url.pathname, `/storage/v1/object/authenticated/touchline-club-owner-avatars/${actor}/${version}/${digest}.webp`);
          if (state.objectMissing) return new Response(null, { status: 404 });
          return new Response(new Uint8Array(image), { headers: { "content-type": "image/webp" } });
        } }, { filename: path });
    return exports;
  };
  const route = load(resolve(root, "app/api/account/avatar/route.ts")) as { GET: (request: Request) => Promise<Response>; runtime: string; POST?: (request: Request) => Promise<Response> };
  return { route, environment, calls, actors, pending, state, boundaries, objects, rpcInputs, nativeCalls: () => nativeCalls, receipt: () => receipt,
    request: () => new Request(`${origin}/api/account/avatar?version=${version}`) };
}
function privateHeaders(response: Response) {
  for (const [name, value] of Object.entries({ "cache-control": "private, no-store", vary: "Cookie", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" })) assert.equal(response.headers.get(name), value);
}
test("real GET wiring remains Node-only; default OFF and invalid QA config create zero clients", async () => {
  for (const patch of [{ TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: undefined }, { TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "false" }, { TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "TRUE" },
    { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { SUPABASE_URL: "https://other.invalid" },
    { TOUCHLINE_DATA_SOURCE: "qa-mirror" }, { TOUCHLINE_OWNER_EMAILS: "" }, { TOUCHLINE_OWNER_EMAILS: "invalid" }, { STRIPE_SECRET_KEY: "synthetic-forbidden" },
    { VERCEL_URL: undefined }, { VERCEL_URL: "invalid" }, { NEXT_PUBLIC_TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true" }, { TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED_OTHER: "true" },
    { TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" }]) {
    const f = fixture(patch); assert.equal(f.route.runtime, "nodejs");
    const response = await f.route.GET(f.request()); assert.equal(response.status, 503); privateHeaders(response); assert.deepEqual(f.calls, []);
  }
});
test("real factories receive checked config and asynchronous cookies; GET without Origin reaches own zero revision only", async () => {
  const f = fixture(); const response = await f.route.GET(f.request());
  assert.equal(response.status, 404); privateHeaders(response); assert.deepEqual(f.actors, [actor]);
  assert.deepEqual(f.calls, ["cookies", "session", "getUser", "privileged"]);
});
test("canonical owner denial and changed environment after auth never create privileged client", async () => {
  for (const drift of [false, true]) {
    const f = fixture(); f.state.drift = drift; if (!drift) f.state.email = " ADMIN@example.invalid ";
    const response = await f.route.GET(f.request()); assert.equal(response.status, drift ? 503 : 403); privateHeaders(response);
    assert.ok(!f.calls.includes("privileged")); assert.deepEqual(f.actors, []);
  }
});
test("configuration drift during asynchronous cookies prevents getUser and privileged access", async () => {
  const f = fixture(); f.state.cookieDrift = true;
  const response = await f.route.GET(f.request()); assert.equal(response.status, 503); privateHeaders(response);
  assert.deepEqual(f.calls, ["cookies", "session"]); assert.deepEqual(f.actors, []);
});
test("concurrent GET is busy before auth; the next admitted request captures its own actor", async () => {
  const f = fixture(); f.state.defer = true;
  const first = f.route.GET(f.request()), second = f.route.GET(f.request());
  for (let index = 0; index < 30 && f.pending.length !== 1; index++) await Promise.resolve();
  assert.equal(f.pending.length, 1); assert.equal((await second).status, 503);
  assert.equal(f.calls.filter(x => x === "getUser").length, 1);
  const result = (id: string) => ({ data: { user: { id, email: "customer@example.invalid", app_metadata: { touchline_arena_access_v1: true } } }, error: null });
  f.pending[0](result(actor)); assert.equal((await first).status, 404);
  const next = f.route.GET(f.request());
  for (let index = 0; index < 30; index++) await Promise.resolve();
  assert.equal(f.pending.length, 2); f.pending[1](result(other)); assert.equal((await next).status, 404);
  assert.deepEqual(f.actors.sort(), [actor, other].sort()); assert.equal(f.calls.filter(x => x === "getUser").length, 2);
});

test("real route composes persistence, bounded private reader and recheck without a write or arbitrary URL", async () => {
  const f = fixture(); f.state.published = true;
  const response = await f.route.GET(f.request()); assert.equal(response.status, 200, JSON.stringify(f.calls)); privateHeaders(response);
  assert.equal(response.headers.get("content-type"), "image/webp"); assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  assert.equal(f.actors.length, 2); assert.equal(f.calls.filter(x => x === "storage:GET").length, 2);
  assert.equal(f.calls.filter(x => x === "getUser").length, 1);
});

test("real route keeps superseded/missing as 404 and RPC failure as 503", async () => {
  for (const mode of ["superseded", "objectMissing", "rpcFailure"] as const) {
    const f = fixture(); f.state.published = true; f.state[mode] = true;
    const response = await f.route.GET(f.request()); assert.equal(response.status, mode === "rpcFailure" ? 503 : 404); privateHeaders(response);
    assert.doesNotMatch(await response.text(), /PRIVATE_SQL|synthetic-service/);
  }
});

test("route does not require POST Origin, but rejects foreign origin, host, query and isolated metadata before auth", async () => {
  for (const [url, headers, status] of [
    [`${origin}/api/account/avatar?version=${version}`, { origin: "https://foreign.invalid" }, 403],
    [`https://foreign.invalid/api/account/avatar?version=${version}`, {}, 503],
    [`${origin}/api/account/avatar?version=${version}&actorId=${other}`, {}, 400],
    [`${origin}/api/account/avatar?version=${version}`, { "x-touchline-isolated-preview": "true" }, 403],
  ] as const) {
    const f = fixture(); const response = await f.route.GET(new Request(url, { headers }));
    assert.equal(response.status, status); privateHeaders(response); assert.deepEqual(f.calls, []);
  }
});

test("outer GET route cannot restore image success after deadline or abort at its own settlement", async () => {
  for (const mode of ["abort", "deadline"] as const) {
    const controller = new AbortController(); let checks = 0;
    const clock = { now: () => {
      if (++checks === 1) return 0;
      if (mode === "abort") { controller.abort(); return 0; }
      return 30_001;
    } } as Performance;
    const f = fixture({}, clock); f.state.published = true;
    const response = await f.route.GET(new Request(f.request(), { signal: controller.signal }));
    assert.equal(response.status, 503); privateHeaders(response); assert.equal(checks, 2);
    assert.equal(f.actors.length, 2); assert.equal(f.calls.filter(x => x === "storage:GET").length, 2);
  }
});

const uploadSettings = { TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: actor };
function uploadRequest(headers: Record<string, string> = {}, target = origin, signal?: AbortSignal) {
  const request = new Request(`${target}/api/account/avatar`, { method: "POST", signal, body: new Uint8Array(image), headers: {
    origin: target, "content-type": "image/webp", "x-touchline-expected-account": actor,
    "x-touchline-avatar-operation": version, "x-touchline-avatar-generation": "0", "if-match": '"0"', ...headers,
  } });
  let bodyReads = 0; const body = request.body;
  Object.defineProperty(request, "body", { configurable: true, get: () => { bodyReads++; return body; } });
  return { request, bodyReads: () => bodyReads };
}
async function post(f: ReturnType<typeof fixture>, request: Request) {
  assert.equal(typeof f.route.POST, "function", "Stage B must wire the existing upload composition");
  return f.route.POST!(request);
}
test("prepared POST requires both exact flags and its own configured UUID before all effects", async () => {
  const patches: Record<string, string | undefined>[] = [
    ...["TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED", "TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED"].flatMap(key =>
      [undefined, "false", "TRUE", " true "].map(value => ({ [key]: value }))),
    ...[undefined, "", "bad", ` ${actor}`, `${actor},${other}`].map(value => ({ TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: value })),
    { TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: undefined, TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID: actor, TOUCHLINE_PUSH_REHEARSAL_ENABLED: "true" },
  ];
  for (const patch of patches) {
    const f = fixture({ ...uploadSettings, ...patch }), input = uploadRequest();
    const response = await post(f, input.request);
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); privateHeaders(response);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.rpcInputs, []); assert.equal(f.nativeCalls(), 0); assert.equal(input.bodyReads(), 0);
  }
});
test("prepared POST inspects full exact QA envelope and preserves same-origin fences", async () => {
  const patches: Record<string, string | undefined>[] = [
    { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_BRANCH_URL: "other.vercel.app" },
    { SUPABASE_URL: "https://other.invalid" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.invalid" },
    { TOUCHLINE_DATA_SOURCE: "qa-mirror" }, { TOUCHLINE_OWNER_EMAILS: "" }, { TOUCHLINE_OWNER_EMAILS: "invalid" },
    { STRIPE_SECRET_KEY: "private-forbidden" }, { AWS_ACCESS_KEY_ID: "private-forbidden" },
    { NEXT_PUBLIC_TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: actor }, { TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED_OTHER: "true" },
    { TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" },
  ];
  for (const patch of patches) {
    const f = fixture({ ...uploadSettings, ...patch }), input = uploadRequest();
    const response = await post(f, input.request); assert.equal(response.status, 503); privateHeaders(response);
    assert.deepEqual(f.calls, []); assert.equal(input.bodyReads(), 0); assert.equal(f.nativeCalls(), 0);
  }
  const headers: Record<string, string>[] = [{ origin: "https://foreign.invalid" }, { "sec-fetch-site": "same-site" }, { "x-touchline-isolated-preview": "true" }];
  for (const overrides of headers) {
    const f = fixture(uploadSettings), input = uploadRequest(overrides);
    const response = await post(f, input.request); assert.equal(response.status, 403); assert.deepEqual(f.calls, []); assert.equal(input.bodyReads(), 0);
  }
  const f = fixture(uploadSettings); assert.equal((await post(f, uploadRequest({}, "https://foreign.invalid").request)).status, 503); assert.deepEqual(f.calls, []);
});
test("prepared POST binds configured UUID, expected account and authenticated customer without trusting a header", async () => {
  for (const expected of [other, "invalid"]) {
    const f = fixture(uploadSettings), input = uploadRequest({ "x-touchline-expected-account": expected });
    const response = await post(f, input.request); assert.equal(response.status, expected === other ? 403 : 400);
    assert.deepEqual(f.calls, []); assert.equal(input.bodyReads(), 0); assert.equal(f.nativeCalls(), 0);
  }
  for (const mode of ["other", "admin", "no-access", "user-metadata"] as const) {
    const f = fixture(uploadSettings), input = uploadRequest();
    if (mode === "other") f.state.id = other;
    if (mode === "admin") f.state.email = " ADMIN@example.invalid ";
    if (mode === "no-access") f.state.access = false;
    if (mode === "user-metadata") f.state.userMetadataOnly = true;
    const response = await post(f, input.request); assert.equal(response.status, mode === "other" ? 409 : 403);
    assert.equal(f.calls.filter(x => x === "getUser").length, 1); assert.ok(!f.calls.includes("privileged"));
    assert.equal(input.bodyReads(), 0); assert.equal(f.nativeCalls(), 0); assert.equal(f.objects.size, 0);
  }
});
test("prepared POST composes real adapters with one actor and returns only a refresh-required receipt", async () => {
  const f = fixture(uploadSettings), response = await post(f, uploadRequest().request);
  assert.equal(response.status, 200, JSON.stringify(f.boundaries)); privateHeaders(response);
  const result = await response.json();
  assert.deepEqual(result, { ok: true, state: "committed", requiresRefresh: true, accountId: actor, operationId: version,
    revision: "1", avatarUrl: `/api/account/avatar?version=${version}` });
  assert.equal(f.calls.filter(x => x === "getUser").length, 1); assert.equal(f.calls.filter(x => x === "privileged").length, 1);
  assert.deepEqual(f.rpcInputs.map(input => input.rpc), ["touchline_begin_club_owner_avatar_operation", "touchline_read_club_owner_avatar", "touchline_publish_club_owner_avatar_v2"]);
  assert.ok(f.rpcInputs.every(input => input.p_actor === actor)); assert.equal(f.objects.size, 1);
  const [key, bytes] = [...f.objects.entries()][0];
  assert.equal(key, `touchline-club-owner-avatars/${actor}/${version}/${createHash("sha256").update(bytes).digest("hex")}.webp`);
  assert.ok(!f.boundaries.some(name => /notification|rehearsal|consent/.test(name)));
});
test("prepared POST snapshot hook blocks continuation after cookies, auth, native, RPC and Storage drift", async () => {
  const stages = ["cookies", "auth", "touchline_begin_club_owner_avatar_operation", "native", "touchline_read_club_owner_avatar", "bucket", "storage:POST", "storage:GET", "touchline_publish_club_owner_avatar_v2"];
  for (const boundary of stages) {
    const f = fixture(uploadSettings, performance, (name, environment) => {
      if (name === boundary) environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID = other;
    });
    const response = await post(f, uploadRequest().request);
    assert.equal(response.status, 503, boundary); assert.equal((await response.json()).state, "unknown");
    assert.equal(f.boundaries.at(-1), boundary, JSON.stringify(f.boundaries));
    assert.equal(f.objects.size, ["storage:POST", "storage:GET", "touchline_publish_club_owner_avatar_v2"].includes(boundary) ? 1 : 0);
    if (boundary === "cookies") assert.ok(!f.calls.includes("getUser"));
    if (boundary !== "touchline_publish_club_owner_avatar_v2") assert.equal(f.receipt(), null);
    else assert.ok(f.receipt(), "a committed write is not rolled back by uncertainty");
  }
});
test("prepared POST body drift is unknown and stops before decode, even if the original configuration is restored", async () => {
  const f = fixture(uploadSettings); let reads = 0;
  const request = uploadRequest().request;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    reads++; f.environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID = other;
    controller.enqueue(new Uint8Array(image)); controller.close();
  } }, { highWaterMark: 0 });
  Object.defineProperty(request, "body", { get: () => stream, configurable: true });
  const response = await post(f, request); assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
  f.environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID = actor;
  assert.equal(reads, 1); assert.equal(f.nativeCalls(), 0); assert.deepEqual(f.rpcInputs.map(input => input.rpc), ["touchline_begin_club_owner_avatar_operation"]);
});
test("prepared POST snapshot includes both flags, owner classification and added or removed environment keys", async () => {
  const changes: Array<(environment: Record<string, string | undefined>) => void> = [
    environment => { environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED = "false"; },
    environment => { environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED = "false"; },
    environment => { environment.TOUCHLINE_OWNER_EMAILS = "different@example.invalid"; },
    environment => { environment.STRIPE_SECRET_KEY = "synthetic-forbidden"; },
    environment => { delete environment.VERCEL_URL; },
    environment => { delete environment.VERCEL_URL; environment.UNRELATED_KEY = "replacement"; },
  ];
  for (const change of changes) {
    const f = fixture(uploadSettings, performance, (name, environment) => { if (name === "auth") change(environment); });
    const input = uploadRequest(), response = await post(f, input.request);
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
    assert.equal(f.calls.filter(value => value === "getUser").length, 1);
    assert.equal(input.bodyReads(), 0); assert.equal(f.nativeCalls(), 0); assert.deepEqual(f.rpcInputs, []); assert.equal(f.objects.size, 0);
  }
});
test("prepared POST never repeats an uncertain publication and outer settlement cannot restore success", async () => {
  const f = fixture(uploadSettings); f.state.loseReceipt = true;
  const response = await post(f, uploadRequest().request);
  assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); assert.ok(f.receipt());
  assert.equal(f.rpcInputs.filter(input => input.rpc === "touchline_publish_club_owner_avatar_v2").length, 1);
  assert.equal(f.calls.filter(x => x === "storage:POST").length, 1);
  for (const mode of ["abort", "deadline"] as const) {
    const controller = new AbortController(); let checks = 0;
    const clock = { now: () => { if (++checks === 1) return 0; if (mode === "abort") { controller.abort(); return 0; } return 30_001; } } as Performance;
    const h = fixture(uploadSettings, clock), result = await post(h, uploadRequest({}, origin, controller.signal).request);
    assert.equal(result.status, 503); assert.equal((await result.json()).state, "unknown"); assert.equal(checks, 2); assert.ok(h.receipt());
  }
});
