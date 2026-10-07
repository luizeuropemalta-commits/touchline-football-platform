import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import * as supabase from "@supabase/supabase-js";
import * as contract from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";
import * as handler from "../lib/touchlineArena/club-owner-avatar-upload-handler.ts";
import * as readHandler from "../lib/touchlineArena/club-owner-avatar-read-handler.ts";
import * as validation from "../lib/touchlineArena/club-owner-avatar-validation.ts";
import * as persistence from "../lib/touchlineArena/club-owner-avatar-persistence.ts";
import * as storage from "../lib/touchlineArena/club-owner-avatar-storage.ts";
import * as access from "../lib/touchlineArena/auth-access.ts";
import * as isolation from "../lib/touchlinePreview/isolation.ts";
import * as admission from "../lib/touchlineArena/club-owner-avatar-resource-admission.ts";
import * as controlAdmission from "../lib/touchlineArena/club-owner-avatar-control-admission.ts";

const actorId = "123e4567-e89b-42d3-a456-426614174000", operationId = "123e4567-e89b-42d3-a456-426614174001";
const other = "123e4567-e89b-42d3-a456-426614174002";
const origin = "https://avatar-app.invalid", supabaseOrigin = "https://avatar-storage.invalid";
const config = { enabled: true, requestOrigin: origin, supabaseOrigin, publicSupabaseOrigin: supabaseOrigin,
  serviceRoleKey: "local-synthetic-key", dataSource: "direct", environment: "qa" };
const user = () => ({ id: actorId, email: "owner@example.invalid", app_metadata: { touchline_arena_access_v1: true } });
const png = () => sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();

test("configuration guard captures POST hook and stops cookie/session or auth drift before later access", async () => {
  for (const boundary of ["session", "auth"] as const) {
    const f = fixture(); let valid = true;
    const dependencies = { ...f.dependencies, assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); },
      createSessionClient: async () => {
        f.calls.push("session"); if (boundary === "session") valid = false;
        return { auth: { getUser: async () => { f.calls.push("getUser"); valid = false; return { data: { user: user() }, error: null }; } } };
      } };
    const serve = load()(f.settings, dependencies as never);
    dependencies.assertEnvironment = () => {}; // The admitted assertion must be captured.
    const response = await serve(request(Buffer.from("unread")));
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
    assert.deepEqual(f.calls, boundary === "session" ? ["session"] : ["session", "getUser"]);
  }
  for (const assertion of [null, "true", () => { throw Error("PRIVATE_CONFIGURATION"); }]) {
    const f = fixture(); const serve = load()(f.settings, { ...f.dependencies, assertEnvironment: assertion } as never);
    const response = await serve(request(Buffer.from("unread")));
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); assert.deepEqual(f.calls, []);
  }
});

test("configuration guard propagates POST assertion to native/storage collaborators and actual RPC settlement", async () => {
  for (const boundary of ["touchline_begin_club_owner_avatar_operation", "touchline_read_club_owner_avatar", "touchline_publish_club_owner_avatar_v2"] as const) {
    let valid = true, validationGuards = 0, storageGuards = 0;
    const f = fixture({ onBoundary: name => { if (name === boundary) valid = false; } });
    const serve = load("createClubOwnerAvatarServer", performance, {
      "./club-owner-avatar-validation.ts": { ...validation, validateClubOwnerAvatar: async (_bytes: Uint8Array, options: { assertEnvironment: () => void }) => {
        assert.equal(typeof options.assertEnvironment, "function"); options.assertEnvironment(); validationGuards++;
        return { ok: true, bytes: Buffer.from("synthetic-normalized"), contentType: "image/webp", width: 2, height: 2 };
      } },
      "./club-owner-avatar-storage.ts": { ...storage, createClubOwnerAvatarStorage: (options: { assertEnvironment: () => void }) => ({
        createImmutable: async (input: { objectKey: string; digest: string }) => {
          assert.equal(typeof options.assertEnvironment, "function"); options.assertEnvironment(); storageGuards++;
          return { objectKey: input.objectKey, digest: input.digest };
        },
      }) },
    })(f.settings, { ...f.dependencies, assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); } } as never);
    const response = await serve(request(Buffer.from("controlled")));
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
    assert.equal(validationGuards, boundary === "touchline_begin_club_owner_avatar_operation" ? 0 : 1); assert.equal(storageGuards, boundary === "touchline_publish_club_owner_avatar_v2" ? 1 : 0);
    assert.equal(f.calls.filter(value => value === "getUser").length, 1);
    assert.deepEqual(f.calls.filter(value => value.startsWith("touchline_")), ["touchline_begin_club_owner_avatar_operation", "touchline_read_club_owner_avatar", "touchline_publish_club_owner_avatar_v2"].slice(0, ["touchline_begin_club_owner_avatar_operation", "touchline_read_club_owner_avatar", "touchline_publish_club_owner_avatar_v2"].indexOf(boundary) + 1));
    assert.equal(f.current().revision, boundary === "touchline_publish_club_owner_avatar_v2" ? "1" : "0");
  }
});

test("configuration guard stays latched across a closed request while original native work retains capacity", async () => {
  const f = fixture(), controller = new AbortController(); let valid = true, entered = false, continued = 0, finish!: () => void;
  const serve = load("createClubOwnerAvatarServer", performance, {
    "./club-owner-avatar-validation.ts": { ...validation, validateClubOwnerAvatar: (_bytes: Uint8Array, options: { resourceScope: admission.ClubOwnerAvatarResourceScope; assertEnvironment: () => void }) =>
      admission.getClubOwnerAvatarResourceAdmission().runNative(options.resourceScope, async () => {
        entered = true; await new Promise<void>(resolve => { finish = resolve; });
        options.assertEnvironment(); continued++; return { ok: false, error: "invalid_image" };
      }),
    },
  })(f.settings, { ...f.dependencies, assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); } } as never);
  const pending = serve(request(Buffer.from("controlled"), {}, controller.signal));
  for (let i = 0; i < 50; i++) await Promise.resolve(); assert.equal(entered, true);
  valid = false; controller.abort();
  try {
    const response = await pending; assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
    valid = true; assert.equal(admission.getClubOwnerAvatarResourceAdmission().tryAcquire(), null);
    assert.equal(continued, 0); assert.equal(f.calls.filter(value => value === "touchline_begin_club_owner_avatar_operation").length, 1);
  } finally { finish(); await pending; for (let i = 0; i < 50; i++) await Promise.resolve(); }
  assert.equal(continued, 0, "restored environment cannot reopen an observed failed request");
  const scope = admission.getClubOwnerAvatarResourceAdmission().tryAcquire(); assert.ok(scope); admission.getClubOwnerAvatarResourceAdmission().close(scope);
});

test("configuration guard is not evaluated behind the disabled POST gate", async () => {
  const f = fixture(); let observations = 0;
  const serve = load()({ ...f.settings, enabled: false }, { ...f.dependencies, assertEnvironment: () => { observations++; throw Error("PRIVATE"); } } as never);
  assert.equal((await serve(request(Buffer.from("unread")))).status, 503); assert.equal(observations, 0); assert.deepEqual(f.calls, []);
});

test("configuration guard fences privileged factory settlement before the first RPC", async () => {
  const f = fixture(); let valid = true;
  const serve = load("createClubOwnerAvatarServer", performance, {
    "./club-owner-avatar-validation.ts": { ...validation, validateClubOwnerAvatar: async () => ({
      ok: true, bytes: Buffer.from("controlled-normalized"), contentType: "image/webp", width: 2, height: 2,
    }) },
  })(f.settings, { ...f.dependencies, assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); },
    createPrivilegedClient: () => { const client = f.dependencies.createPrivilegedClient(); valid = false; return client; },
  } as never);
  const response = await serve(request(Buffer.from("controlled")));
  assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
  assert.equal(f.calls.filter(value => value === "privileged").length, 1);
  assert.deepEqual(f.calls.filter(value => value.startsWith("touchline_") || value.startsWith("storage:")), []);
});
function request(bytes: Buffer, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request(`${origin}/api/account/avatar`, { method: "POST", body: new Uint8Array(bytes), signal, headers: {
    origin, "content-type": "image/png", "x-touchline-expected-account": actorId,
    "x-touchline-avatar-operation": operationId, "x-touchline-avatar-generation": "0", "if-match": '"0"', ...headers,
  } });
}
function load(name = "createClubOwnerAvatarServer", clock = performance, replacements: Record<string, unknown> = {}) {
  const source = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-server.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "@supabase/supabase-js": supabase, "./club-owner-avatar-upload-contract.ts": contract,
    "./club-owner-avatar-upload-handler.ts": handler, "./club-owner-avatar-validation.ts": validation,
    "./club-owner-avatar-read-handler.ts": readHandler,
    "./club-owner-avatar-persistence.ts": persistence, "./club-owner-avatar-storage.ts": storage,
    "./auth-access.ts": access, "../touchlinePreview/isolation.ts": isolation,
    "./club-owner-avatar-resource-admission.ts": admission, ...replacements,
    "./club-owner-avatar-control-admission.ts": controlAdmission,
  };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(javascript, { exports, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name];
  }, Request, Response, URL, Uint8Array, TextDecoder, AbortController, AbortSignal, performance: clock, setTimeout, clearTimeout });
  return exports[name] as typeof import("../lib/touchlineArena/club-owner-avatar-server.ts").createClubOwnerAvatarServer;
}

test("resource admission is shared across distinct GET/POST factories and rejects busy before auth/body", async () => {
  for (const method of ["GET", "POST"] as const) {
    let release!: (value: unknown) => void;
    const held = fixture({ auth: () => new Promise(resolve => { release = resolve; }) }), otherFixture = fixture();
    const get = load("createClubOwnerAvatarReadServer")(held.settings, held.dependencies as never);
    const pending = method === "GET" ? get(new Request(`${origin}/api/account/avatar?version=${operationId}`)) : held.serve(request(Buffer.from("bad")));
    for (let index = 0; index < 20; index++) await Promise.resolve();
    let bodyReads = 0;
    const blockedRequest = request(Buffer.from("must-not-read")), body = blockedRequest.body;
    Object.defineProperty(blockedRequest, "body", { get: () => { bodyReads++; return body; } });
    try {
      const response = method === "GET" ? await otherFixture.serve(blockedRequest)
        : await load("createClubOwnerAvatarReadServer")(otherFixture.settings, otherFixture.dependencies as never)(new Request(`${origin}/api/account/avatar?version=${operationId}`));
      assert.equal(response.status, 503); assert.deepEqual(otherFixture.calls, []); assert.equal(bodyReads, 0);
    } finally { release({ data: { user: null }, error: null }); await pending; }
    const scope = admission.getClubOwnerAvatarResourceAdmission().tryAcquire(); assert.ok(scope); admission.getClubOwnerAvatarResourceAdmission().close(scope);
  }
});

test("resource admission preserves pre-aborted POST response and leaves capacity available", async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  const response = await f.serve(request(Buffer.from("unread"), {}, controller.signal));
  assert.equal(response.status, 408); assert.deepEqual(await response.json(), { ok: false, state: "rejected", error: "UPLOAD_ABORTED" });
  assert.deepEqual(f.calls, []);
  const scope = admission.getClubOwnerAvatarResourceAdmission().tryAcquire(); assert.ok(scope); admission.getClubOwnerAvatarResourceAdmission().close(scope);
});

test("resource request remains occupied after HTTP abort until original validation child settles", async () => {
  const f = fixture(), controller = new AbortController(); let finish!: () => void, entered = false;
  const serve = load("createClubOwnerAvatarServer", performance, {
    "./club-owner-avatar-validation.ts": { ...validation, validateClubOwnerAvatar: (_bytes: Uint8Array, options: { resourceScope: admission.ClubOwnerAvatarResourceScope }) => {
      entered = true;
      assert.ok(options?.resourceScope);
      return admission.getClubOwnerAvatarResourceAdmission().runNative(options.resourceScope, () => new Promise(resolve => {
        finish = () => resolve({ ok: false, error: "invalid_image" });
      }));
    } },
  })(f.settings, f.dependencies as never);
  const pending = serve(request(Buffer.from("fixture"), {}, controller.signal));
  for (let index = 0; index < 30; index++) await Promise.resolve();
  try {
    assert.equal(entered, true); controller.abort(); const response = await pending;
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown", "begin may already be durable");
    const probe = fixture(); assert.equal((await probe.serve(request(Buffer.from("blocked")))).status, 503); assert.deepEqual(probe.calls, []);
  } finally { finish?.(); await pending; for (let index = 0; index < 20; index++) await Promise.resolve(); }
  const recovered = fixture(); assert.equal((await recovered.serve(request(await png()))).status, 200);
});
function fixture(options: { config?: Record<string, unknown>; auth?: () => Promise<unknown>; admin?: boolean; ownerCheck?: () => boolean; loseReceipt?: boolean; onBoundary?: (name: string) => void } = {}) {
  const calls: string[] = [], objects = new Map<string, Buffer>();
  let current: Record<string, unknown> = { actorId, revision: "0", avatarUrl: null, operationId: null, digest: null };
  let receipt: Record<string, unknown> | null = null, lost = false, begun = false;
  const envelope = (status: string, operation: string) => ({ version: 1, status, snapshot: { version: 1, actorId, revision: current.revision,
    generation: receipt ? "2" : begun ? "1" : "0", activeOperationId: receipt || !begun ? null : operation,
    fencedThroughGeneration: "-1", requestedOperationId: operation, operation: { operationId: operation,
      state: receipt ? "committed" : "pending", expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt } } });
  const client = { rpc(name: string, args: Record<string, string>) {
    calls.push(name); const builder = {
      abortSignal(value: AbortSignal) { assert.equal(value.aborted, false); return builder; },
      retry(value: boolean) { assert.equal(value, false); return builder; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve().then(() => {
        assert.equal(args.p_actor, actorId);
        options.onBoundary?.(name);
        if (name === "touchline_read_club_owner_avatar") return { data: current, error: null, status: 200 };
        if (name === "touchline_begin_club_owner_avatar_operation") {
          const status = receipt ? "committed" : begun ? "pending" : "started"; begun = true;
          return { data: envelope(status, args.p_operation), error: null, status: 200 };
        }
        assert.equal(name, "touchline_publish_club_owner_avatar_v2");
        receipt = { actorId, operationId: args.p_operation, expectedRevision: args.p_expected, revision: "1", digest: args.p_digest, objectKey: args.p_key, avatarUrl: `/api/account/avatar?version=${args.p_operation}` };
        current = { ...receipt };
        if (options.loseReceipt && !lost) { lost = true; throw new Error("PRIVATE_DIAGNOSTIC"); }
        return { data: envelope("committed", args.p_operation), error: null, status: 200 };
      }).then(resolve, reject); },
    }; return builder;
  } };
  const settings = { ...config, ...options.config };
  const dependencies = {
    createSessionClient: async () => { calls.push("session"); return { auth: { getUser: async () => { calls.push("getUser"); return options.auth ? options.auth() : { data: { user: user() }, error: null }; } } }; },
    isOwnerEmail: (email: string | null | undefined) => { calls.push("admin-check"); assert.equal(email, "owner@example.invalid"); return options.ownerCheck ? options.ownerCheck() : options.admin === true; },
    createPrivilegedClient: () => { calls.push("privileged"); return client; },
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`storage:${init?.method}`); const url = new URL(String(input));
      assert.equal(url.origin, supabaseOrigin); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
      if (url.pathname.includes("/bucket/")) return Response.json({ id: storage.CLUB_OWNER_AVATAR_BUCKET, name: storage.CLUB_OWNER_AVATAR_BUCKET, public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/webp"] });
      if (init?.method === "POST") { objects.set(url.pathname.replace("/storage/v1/object/", ""), Buffer.from(init.body as Buffer)); return Response.json({}, { status: 201 }); }
      const bytes = objects.get(url.pathname.replace("/storage/v1/object/authenticated/", "")); assert.ok(bytes);
      return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } });
    },
  };
  const serve = load()(settings as Parameters<ReturnType<typeof load>>[0], dependencies as unknown as Parameters<ReturnType<typeof load>>[1]);
  return { serve, calls, objects, settings, dependencies, current: () => current };
}

function controlFixture(options: { auth?: () => Promise<unknown>; clock?: Performance; rpc?: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown } = {}) {
  const f = fixture({ auth: options.auth }); let generation = "0", fence = "-1";
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const snapshot = () => ({ version: 1, actorId, revision: "0", generation, activeOperationId: null,
    fencedThroughGeneration: fence, requestedOperationId: null, operation: null });
  const client = supabase.createClient(supabaseOrigin, "synthetic-test-key", { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const name = new URL(String(input)).pathname.split("/").at(-1)!, args = JSON.parse(String(init?.body)); rpcCalls.push({ name, args });
      let data: unknown;
      if (options.rpc) data = await options.rpc(name, args);
      else if (name === "touchline_read_club_owner_avatar_operation_status") data = snapshot();
      else if (name === "touchline_read_club_owner_avatar") data = { actorId, revision: "0", avatarUrl: null, operationId: null, digest: null };
      else { assert.equal(name, "touchline_fence_club_owner_avatar_operation"); assert.equal(args.p_generation, generation);
        fence = generation; generation = String(BigInt(generation) + BigInt(1)); data = { version: 1, status: "barrier_applied", snapshot: snapshot() }; }
      return Response.json(data);
    } } });
  const serve = (load("createClubOwnerAvatarRecoveryServer", options.clock) as typeof import("../lib/touchlineArena/club-owner-avatar-server.ts").createClubOwnerAvatarRecoveryServer)({ ...config, accountId: actorId }, { ...f.dependencies, createPrivilegedClient: () => client } as never);
  const request = (body: unknown = { action: "status" }, signal?: AbortSignal) => new Request(`${origin}/api/account/avatar/recovery`, {
    method: "POST", signal, body: JSON.stringify(body), headers: { origin, "content-type": "application/json", "x-touchline-expected-account": actorId },
  });
  return { serve, request, rpcCalls, calls: f.calls };
}

test("control server status is read-only, independent of native busy, and an idle fence requires explicit consent", async () => {
  const f = controlFixture(), native = admission.getClubOwnerAvatarResourceAdmission(), ticket = native.tryAcquire(); assert.ok(ticket);
  try {
    const observed = await f.serve(f.request()); assert.equal(observed.status, 200);
    const data = await observed.json(); assert.equal(data.context.generation, "0"); assert.equal(data.context.canUpload, false); assert.equal(data.context.readyForSelection, false);
    assert.deepEqual(f.rpcCalls.map(x => x.name), ["touchline_read_club_owner_avatar_operation_status", "touchline_read_club_owner_avatar", "touchline_read_club_owner_avatar_operation_status"]);
    const denied = await f.serve(f.request({ action: "fence", generation: "0", expectedActiveOperationId: null })); assert.equal(denied.status, 400);
    assert.equal(f.rpcCalls.length, 3);
    const fenced = await f.serve(f.request({ action: "fence", generation: "0", expectedActiveOperationId: null, explicitRecoveryConsent: true }));
    assert.equal(fenced.status, 200); const value = await fenced.json(); assert.equal(value.barrierStatus, "barrier_applied");
    assert.equal(value.context.generation, "1"); assert.equal(value.context.readyForSelection, false);
    assert.deepEqual(f.rpcCalls.slice(3).map(x => x.name), ["touchline_fence_club_owner_avatar_operation", "touchline_read_club_owner_avatar_operation_status", "touchline_read_club_owner_avatar", "touchline_read_club_owner_avatar_operation_status"]);
    assert.doesNotMatch(JSON.stringify(value), /objectKey|digest|service|storage/i);
  } finally { native.close(ticket); }
});

test("control server timeout/abort retains unfinished auth capacity, then stops before RPC", async () => {
  let release!: (value: unknown) => void;
  const f = controlFixture({ auth: () => new Promise(resolve => { release = resolve; }) }), controller = new AbortController();
  const work = f.serve(f.request(undefined, controller.signal));
  for (let i = 0; i < 50; i++) await Promise.resolve(); controller.abort();
  try { assert.equal((await work).status, 503); assert.equal((await f.serve(f.request())).status, 503); assert.equal(f.rpcCalls.length, 0); }
  finally { release({ data: { user: user() }, error: null }); for (let i = 0; i < 50; i++) await Promise.resolve(); }
  const pool = controlAdmission.getClubOwnerAvatarControlAdmission(), scope = pool.tryAcquire(); assert.ok(scope); pool.close(scope);
});

test("control server rejects auth errors, changed accounts and malformed actions without privileged RPC", async () => {
  for (const answer of [{ data: { user: user() }, error: Error("PRIVATE") }, { data: { user: { ...user(), id: other } }, error: null }]) {
    const f = controlFixture({ auth: async () => answer }); const response = await f.serve(f.request());
    assert.ok([409, 503].includes(response.status)); assert.equal(f.rpcCalls.length, 0); assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
  for (const body of [{ action: "status", actorId: other }, { action: "upload" }, { action: "fence", generation: "01", expectedActiveOperationId: null, explicitRecoveryConsent: true }]) {
    const f = controlFixture(); assert.equal((await f.serve(f.request(body))).status, 400); assert.equal(f.rpcCalls.length, 0);
  }
});

test("control server high-water fence replay observes newer pending work without claiming readiness or retrying begin", async () => {
  const snapshot = { version: 1, actorId, revision: "0", generation: "2", activeOperationId: other,
    fencedThroughGeneration: "0", requestedOperationId: other,
    operation: { operationId: other, state: "pending", expectedRevision: "0", baseGeneration: "1", generation: "2", legacy: false, receipt: null } };
  const f = controlFixture({ rpc: async (name, args) => {
    if (name === "touchline_fence_club_owner_avatar_operation") {
      assert.equal(args.p_generation, "0"); assert.equal(args.p_expected_active, null);
      return { version: 1, status: "barrier_applied", snapshot };
    }
    if (name === "touchline_read_club_owner_avatar_operation_status") return snapshot;
    assert.equal(name, "touchline_read_club_owner_avatar"); return { actorId, revision: "0", avatarUrl: null, operationId: null, digest: null };
  } });
  const response = await f.serve(f.request({ action: "fence", generation: "0", expectedActiveOperationId: null, explicitRecoveryConsent: true }));
  assert.equal(response.status, 200); const value = await response.json();
  assert.equal(value.barrierStatus, "barrier_applied"); assert.equal(value.context.activeOperationId, other);
  assert.equal(value.context.operationState, "pending"); assert.equal(value.context.readyForSelection, false);
  assert.equal(f.rpcCalls.length, 4); assert.ok(!f.rpcCalls.some(x => /begin|publish/.test(x.name)));
});

test("control server original RPC survives caller abort without freeing capacity or admitting a late next leg", async () => {
  let finish!: (value: unknown) => void;
  const f = controlFixture({ rpc: () => new Promise(resolve => { finish = resolve; }) }), controller = new AbortController();
  const pending = f.serve(f.request(undefined, controller.signal));
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.equal(f.rpcCalls.length, 1);
  controller.abort();
  try {
    assert.equal((await pending).status, 503); assert.equal((await f.serve(f.request())).status, 503);
    assert.equal(f.rpcCalls.length, 1);
  } finally { finish(null); for (let i = 0; i < 100; i++) await Promise.resolve(); }
  const pool = controlAdmission.getClubOwnerAvatarControlAdmission(), scope = pool.tryAcquire(); assert.ok(scope); pool.close(scope);
  assert.equal(f.rpcCalls.length, 1);
});

test("control server body is bounded by actual bytes and rejects extra identity keys without auth", async () => {
  for (const body of [{ action: "status", extra: "x".repeat(600) }, { action: "status", accountId: actorId }]) {
    const f = controlFixture(), response = await f.serve(f.request(body));
    assert.ok([400, 413].includes(response.status)); assert.deepEqual(f.calls, []); assert.deepEqual(f.rpcCalls, []);
  }
});

test("control server deadline at final status settlement cannot acknowledge a late coherent context", async () => {
  let time = 0, statusReads = 0;
  const f = controlFixture({ clock: { now: () => time } as Performance, rpc: name => {
    if (name === "touchline_read_club_owner_avatar") return { actorId, revision: "0", avatarUrl: null, operationId: null, digest: null };
    assert.equal(name, "touchline_read_club_owner_avatar_operation_status");
    if (++statusReads === 2) queueMicrotask(() => { time = 8_001; });
    return { version: 1, actorId, revision: "0", generation: "0", activeOperationId: null, fencedThroughGeneration: "-1", requestedOperationId: null, operation: null };
  } });
  const response = await f.serve(f.request()); assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
  assert.equal(f.rpcCalls.length, 3);
});

test("control server lost fence receipt stays unknown; explicit status can observe the new epoch without readiness", async () => {
  let generation = "0", fenced = "-1";
  const f = controlFixture({ rpc: name => {
    if (name === "touchline_fence_club_owner_avatar_operation") { generation = "1"; fenced = "0"; throw Error("synthetic lost acknowledgement"); }
    if (name === "touchline_read_club_owner_avatar") return { actorId, revision: "0", avatarUrl: null, operationId: null, digest: null };
    assert.equal(name, "touchline_read_club_owner_avatar_operation_status");
    return { version: 1, actorId, revision: "0", generation, activeOperationId: null, fencedThroughGeneration: fenced, requestedOperationId: null, operation: null };
  } });
  const response = await f.serve(f.request({ action: "fence", generation: "0", expectedActiveOperationId: null, explicitRecoveryConsent: true }));
  assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); assert.equal(f.rpcCalls.length, 1);
  const status = await f.serve(f.request()); assert.equal(status.status, 200); const observed = await status.json();
  assert.equal(observed.context.generation, "1"); assert.equal(observed.context.readyForSelection, false);
  assert.equal(f.rpcCalls.filter(x => x.name === "touchline_fence_club_owner_avatar_operation").length, 1);
});

test("control idle fence supplies a new epoch; a late old-epoch begin conflict cannot read image bytes", async () => {
  const f = controlFixture();
  const fenced = await f.serve(f.request({ action: "fence", generation: "0", expectedActiveOperationId: null, explicitRecoveryConsent: true }));
  const observed = await fenced.json(); assert.equal(observed.context.generation, "1");
  // Boundary fixture supplies SQL's stale-begin conflict. This proves handler
  // composition, not the database's atomicity (covered by the separate SQL run).
  const oldRequest = request(Buffer.from("must-not-read")); let bodyReads = 0;
  Object.defineProperty(oldRequest, "body", { get: () => { bodyReads++; throw Error("late body access"); } });
  const denied = async (): Promise<never> => { throw Error("late worker must not run"); };
  const result = await handler.handleClubOwnerAvatarUpload(oldRequest, {
    actor: async () => ({ id: actorId, allowed: true }),
    beginOperation: async input => {
      assert.equal(input.baseGeneration, "0"); return { status: "conflict", snapshot: {
        version: 1, actorId, revision: "0", generation: "1", activeOperationId: null, fencedThroughGeneration: "0",
        requestedOperationId: operationId, operation: null,
      } };
    }, validate: denied, readCurrent: denied, createImmutable: denied, publishV2: denied,
  });
  assert.equal(result.status, 409); assert.equal((await result.json()).state, "unknown"); assert.equal(bodyReads, 0);
});

test("default OFF and incoherent/demo/production/isolated configurations touch no dependency", async () => {
  const bytes = Buffer.from("not-read");
  for (const patch of [{ enabled: undefined }, { enabled: "true" }, { dataSource: "qa-mirror" }, { dataSource: "invalid" }, { environment: "production" }, { environment: undefined }, { deploymentMode: "isolated-preview" }, { publicDeploymentMode: "isolated-preview" }, { deploymentMode: "unknown", publicDeploymentMode: "unknown" }, { deploymentMode: "qa-preview" }, { publicSupabaseOrigin: "https://other.invalid" }, { supabaseOrigin: `${supabaseOrigin}/path` }, { serviceRoleKey: "" }, { requestOrigin: "http://insecure.invalid" }]) {
    const f = fixture({ config: patch }); const response = await f.serve(request(bytes));
    assert.equal(response.status, 503); assert.deepEqual(f.calls, []); assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("failed/non-boolean owner classification fails closed and auth is recaptured for each request", async () => {
  for (const ownerCheck of [() => { throw Error("PRIVATE_ADMIN_DETAILS"); }, () => undefined as unknown as boolean]) {
    const f = fixture({ ownerCheck }); const response = await f.serve(request(Buffer.from("bad")));
    assert.ok([403, 503].includes(response.status)); assert.ok(!f.calls.includes("privileged")); assert.doesNotMatch(await response.text(), /PRIVATE_ADMIN_DETAILS/);
  }
  let active = actorId;
  const f = fixture({ auth: async () => ({ data: { user: { ...user(), id: active } }, error: null }) });
  assert.equal((await f.serve(request(await png()))).status, 200);
  active = other;
  assert.equal((await f.serve(request(await png()))).status, 409);
  assert.equal(f.calls.filter(value => value === "privileged").length, 1);
  assert.equal(f.calls.filter(value => value === "getUser").length, 2);
});

test("request guards run before auth, decoder, privileged factory or Storage", async () => {
  const variants: Record<string, string>[] = [{ origin: "https://cross.invalid" }, { "sec-fetch-site": "same-site" }, { "x-touchline-isolated-preview": "true" }, { "if-match": '"01"' }, { "content-encoding": "gzip" }];
  for (const headers of variants) {
    const f = fixture(); const response = await f.serve(request(Buffer.from("bad"), headers));
    assert.ok([400, 403, 415, 428].includes(response.status)); assert.deepEqual(f.calls, []);
  }
});

test("real SDK missing-session error is 401; a different authentication failure remains unknown", async () => {
  for (const [error, status] of [[new supabase.AuthSessionMissingError(), 401], [new Error("PRIVATE_AUTH_FAILURE"), 503]] as const) {
    const f = fixture({ auth: async () => ({ data: { user: null }, error }) });
    const response = await f.serve(request(Buffer.from("bad")));
    assert.equal(response.status, status); assert.equal((await response.json()).state, status === 401 ? "rejected" : "unknown");
    assert.ok(!f.calls.includes("privileged"));
  }
});

test("missing, errored, no-access, user_metadata-only, changed-account and admin identities never gain privileged dependencies", async () => {
  const variants = [
    { data: { user: null }, error: null }, { data: { user: user() }, error: { message: "PRIVATE" } },
    { data: { user: { ...user(), app_metadata: {} } }, error: null },
    { data: { user: { ...user(), app_metadata: {}, user_metadata: { touchline_arena_access_v1: true } } }, error: null },
    { data: { user: { ...user(), id: other } }, error: null }, { data: {}, error: null },
  ];
  for (const result of variants) {
    const f = fixture({ auth: async () => result }); const response = await f.serve(request(Buffer.from("bad")));
    assert.ok([401, 403, 409, 503].includes(response.status)); assert.ok(!f.calls.includes("privileged")); assert.equal(f.objects.size, 0);
    assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
  const admin = fixture({ admin: true }); assert.equal((await admin.serve(request(Buffer.from("bad")))).status, 403); assert.ok(!admin.calls.includes("privileged"));
});

test("actual validator, immutable Storage and RPC adapters compose without public route or automatic enrollment", async () => {
  const f = fixture(); const response = await f.serve(request(await png()));
  assert.equal(response.status, 200); assert.equal((await response.json()).revision, "1");
  assert.equal(f.objects.size, 1); assert.equal(f.current().revision, "1");
  assert.equal(f.calls.filter(value => value === "getUser").length, 1);
  assert.ok(f.calls.indexOf("admin-check") < f.calls.indexOf("privileged"));
  assert.equal(f.calls.filter(value => value === "privileged").length, 1);
});

test("unknown committed acknowledgement is reconciled only by an explicit repeat with the same operation", async () => {
  const f = fixture({ loseReceipt: true }), bytes = await png();
  const first = await f.serve(request(bytes)); assert.equal(first.status, 503); assert.equal((await first.json()).state, "unknown");
  assert.equal(f.current().revision, "1"); assert.equal(f.calls.filter(value => value === "touchline_publish_club_owner_avatar_v2").length, 1);
  const second = await f.serve(request(bytes)); assert.equal(second.status, 200); assert.equal((await second.json()).revision, "1");
  assert.equal(f.calls.filter(value => value === "touchline_publish_club_owner_avatar_v2").length, 1);
  assert.equal(f.calls.filter(value => value === "storage:POST").length, 1);
  assert.equal(f.calls.filter(value => value === "getUser").length, 2);
});

test("late auth completion after abort cannot create a privileged client", async () => {
  let finish!: (value: unknown) => void;
  const f = fixture({ auth: () => new Promise(resolve => { finish = resolve; }) });
  const controller = new AbortController(); const pending = f.serve(request(Buffer.from("bad"), {}, controller.signal));
  await new Promise<void>(resolve => setTimeout(resolve, 0)); controller.abort();
  assert.equal((await pending).status, 408); finish({ data: { user: user() }, error: null });
  await new Promise<void>(resolve => setTimeout(resolve, 0)); assert.ok(!f.calls.includes("privileged")); assert.equal(f.objects.size, 0);
});

test("configuration snapshot is immutable; invalid image leaves pending work and never creates Storage objects", async () => {
  const f = fixture(); f.settings.supabaseOrigin = "https://changed.invalid"; f.settings.requestOrigin = "https://changed.invalid";
  const bad = await f.serve(request(Buffer.from("bad"))); assert.equal(bad.status, 422); assert.equal((await bad.json()).state, "unknown");
  assert.equal(f.objects.size, 0);
  const good = await f.serve(request(await png())); assert.equal(good.status, 409); assert.equal((await good.json()).error, "OPERATION_PENDING");
});

test("GET composition reads a real normalized publication without exposing write collaborators", async () => {
  const f = fixture();
  assert.equal((await f.serve(request(await png()))).status, 200);
  f.calls.length = 0;
  const serve = load("createClubOwnerAvatarReadServer")(f.settings, f.dependencies as never);
  const response = await serve(new Request(`${origin}/api/account/avatar?version=${operationId}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(f.calls.filter(x => x === "getUser").length, 1);
  assert.equal(f.calls.filter(x => x === "touchline_read_club_owner_avatar").length, 2);
  assert.ok(!f.calls.some(x => /publish|find_club|storage:POST/.test(x)));
});

test("GET default OFF, invalid requests and denied identities never reach privileged clients", async () => {
  for (const options of [{ config: { enabled: undefined } }, { config: { environment: "production" } }, { admin: true },
    { auth: async () => ({ data: { user: null }, error: new supabase.AuthSessionMissingError() }) }]) {
    const f = fixture(options), serve = load("createClubOwnerAvatarReadServer")(f.settings, f.dependencies as never);
    const response = await serve(new Request(`${origin}/api/account/avatar?version=${operationId}`));
    assert.ok([401, 403, 503].includes(response.status));
    assert.ok(!f.calls.includes("privileged"));
    for (const [key, value] of Object.entries({ "cache-control": "private, no-store", vary: "Cookie", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" })) assert.equal(response.headers.get(key), value);
  }
  const f = fixture(), serve = load("createClubOwnerAvatarReadServer")(f.settings, f.dependencies as never);
  assert.equal((await serve(new Request(`${origin}/api/account/avatar?version=${operationId}`, { headers: { origin: "https://cross.invalid" } }))).status, 403);
  assert.deepEqual(f.calls, []);
});

test("GET composition final settlement denies late success even after the real core completed", async () => {
  for (const mode of ["deadline", "abort"] as const) {
    const f = fixture(); assert.equal((await f.serve(request(await png()))).status, 200);
    const controller = new AbortController(); let checks = 0;
    const clock = { now: () => {
      if (++checks === 1) return 0;
      if (mode === "abort") { controller.abort(); return 0; }
      return 30_001;
    } } as Performance;
    const serve = load("createClubOwnerAvatarReadServer", clock)(f.settings, f.dependencies as never);
    const response = await serve(new Request(`${origin}/api/account/avatar?version=${operationId}`, { signal: controller.signal }));
    assert.equal(response.status, 503); assert.equal(checks, 2);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  }
});

test("GET cancelled auth cannot authorize a later client; auth failure and editable metadata do not grant access", async () => {
  let finish!: (value: unknown) => void;
  const f = fixture({ auth: () => new Promise(resolve => { finish = resolve; }) });
  const serve = load("createClubOwnerAvatarReadServer")(f.settings, f.dependencies as never), controller = new AbortController();
  const pending = serve(new Request(`${origin}/api/account/avatar?version=${operationId}`, { signal: controller.signal }));
  await new Promise<void>(resolve => setTimeout(resolve, 0)); controller.abort();
  assert.equal((await pending).status, 503); finish({ data: { user: user() }, error: null });
  await new Promise<void>(resolve => setTimeout(resolve, 0)); assert.ok(!f.calls.includes("privileged"));
  for (const auth of [async () => ({ data: { user: null }, error: { message: "PRIVATE" } }),
    async () => ({ data: { user: { ...user(), app_metadata: {}, user_metadata: { touchline_arena_access_v1: true } } }, error: null })]) {
    const denied = fixture({ auth }), response = await load("createClubOwnerAvatarReadServer")(denied.settings, denied.dependencies as never)(new Request(`${origin}/api/account/avatar?version=${operationId}`));
    assert.ok([403, 503].includes(response.status)); assert.ok(!denied.calls.includes("privileged"));
  }
});
