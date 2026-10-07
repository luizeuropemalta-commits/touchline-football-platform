import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as admission from "../lib/touchlineArena/club-owner-avatar-resource-admission.ts";
import * as validation from "../lib/touchlineArena/club-owner-avatar-validation.ts";
import * as contract from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";
import * as transportLimits from "../lib/touchlineArena/club-owner-avatar-transport-limits.ts";
import { validateClubOwnerAvatar, CLUB_OWNER_AVATAR_MAX_BYTES } from "../lib/touchlineArena/club-owner-avatar-validation.ts";

const load = () => import("../lib/touchlineArena/club-owner-avatar-storage.ts");
const origin = "https://storage.example.invalid", secret = "test-only-secret";
const actorId = "123e4567-e89b-42d3-a456-426614174000", operationId = "123e4567-e89b-42d3-a456-426614174001";
async function upload(bytes?: Buffer) {
  const source = bytes ?? await sharp({ create: { width: 8, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  const normalized = await validateClubOwnerAvatar(source); assert.equal(normalized.ok, true);
  if (!normalized.ok) assert.fail("fixture normalization required");
  const digest = createHash("sha256").update(normalized.bytes).digest("hex");
  return { actorId, operationId, expectedRevision: "0", digest, objectKey: `${actorId}/${operationId}/${digest}.webp`, bytes: normalized.bytes, contentType: "image/webp" as const };
}
type Call = { url: string; init: RequestInit };
async function fixture(input: Awaited<ReturnType<typeof upload>>, override?: (call: Call) => Response | Promise<Response> | undefined) {
  const { createClubOwnerAvatarStorage, CLUB_OWNER_AVATAR_BUCKET } = await load(); const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const call = { url: String(url), init: init ?? {} }; calls.push(call);
    const custom = override?.(call); if (custom !== undefined) return custom;
    if (call.url === `${origin}/storage/v1/bucket/${CLUB_OWNER_AVATAR_BUCKET}`) return Response.json({ id: CLUB_OWNER_AVATAR_BUCKET, name: CLUB_OWNER_AVATAR_BUCKET, public: false, file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"] });
    if (call.init.method === "POST") return Response.json({ Key: `${CLUB_OWNER_AVATAR_BUCKET}/${input.objectKey}` });
    return new Response(input.bytes as BodyInit, { headers: { "content-type": "image/webp", "content-length": String(input.bytes.length) } });
  };
  return { calls, fetchImpl, create: (timeoutMs?: number) => createClubOwnerAvatarStorage({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl, timeoutMs }) };
}
const signal = () => new AbortController().signal;
const errorIs = (state: string) => (error: unknown) => {
  assert.ok(error instanceof Error); assert.equal((error as Error & { state: string }).state, state);
  assert.doesNotMatch(String(error), /test-only-secret|PRIVATE_PROVIDER|123e4567|storage\.example/); return true;
};

function controlledStorage() {
  const pool = admission.createClubOwnerAvatarResourceAdmission();
  let clock = 0, sequence = 0; const timers = new Map<number, () => void>();
  let metadataDone!: () => void, pipelineDone!: () => void, metadataCalls = 0, pipelineCalls = 0, nativeStarts = 0;
  const decoder = { metadata: () => { metadataCalls++; return new Promise(resolve => { metadataDone = () => resolve({ format: "webp", width: 8, height: 4 }); }); },
    raw: () => decoder, timeout: () => decoder, toBuffer: () => { pipelineCalls++; return new Promise(resolve => { pipelineDone = () => resolve(Buffer.alloc(96)); }); } };
  const exports: Partial<Awaited<ReturnType<typeof load>>> = {};
  const source = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-storage.ts", import.meta.url), "utf8");
  const deps: Record<string, unknown> = { "node:crypto": { createHash }, sharp: { default: () => decoder },
    "./club-owner-avatar-validation.ts": validation, "./club-owner-avatar-upload-contract.ts": contract,
    "./club-owner-avatar-transport-limits.ts": transportLimits,
    "./club-owner-avatar-resource-admission.ts": { ...admission, getClubOwnerAvatarResourceAdmission: () => ({ ...pool, runNative: (...args: Parameters<typeof pool.runNative>) => { nativeStarts++; return pool.runNative(...args); } }) } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => { assert.ok(name in deps); return deps[name]; }, Buffer, Uint8Array, URL, Response, AbortController, AbortSignal,
      performance: { now: () => clock }, setTimeout: (callback: () => void) => { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id) });
  return { pool, create: exports.createClubOwnerAvatarReader!, createUpload: exports.createClubOwnerAvatarStorage!, calls: () => [metadataCalls, pipelineCalls],
    timerCount: () => timers.size, nativeStarts: () => nativeStarts,
    finishMetadata: () => metadataDone(), finishPipeline: () => pipelineDone(),
    expire: () => { clock = 10_001; for (const callback of [...timers.values()]) callback(); } };
}

// Synthetic container used only with the controlled native decoder above. This
// is NOT a valid-image fixture or evidence that native decoding accepts it.
function controlledUploadInput() {
  const bytes = Buffer.alloc(20);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(12, 4); bytes.write("WEBP", 8); bytes.write("VP8 ", 12);
  const digest = createHash("sha256").update(bytes).digest("hex");
  return { actorId, operationId, expectedRevision: "0", digest, objectKey: `${actorId}/${operationId}/${digest}.webp`, bytes, contentType: "image/webp" as const };
}
async function microtasks() { for (let index = 0; index < 100; index++) await Promise.resolve(); }
async function observedWithin<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("BOUNDED_TEST_OBSERVATION_EXPIRED")), 500); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
function storageFailure(error: unknown, state: "rejected" | "unknown") {
  // Error originates in the isolated VM, so host instanceof Error is invalid.
  assert.ok(error && typeof error === "object");
  assert.equal((error as { name: string }).name, "ClubOwnerAvatarStorageError");
  assert.equal((error as { state: string }).state, state);
  assert.doesNotMatch(String(error), /test-only-secret|PRIVATE_PROVIDER|123e4567|storage\.example/);
}

test("configuration guard fences Storage metadata/pipeline and stays latched on a reused adapter", async () => {
  for (const stage of ["metadata", "pipeline"] as const) {
    const h = controlledStorage(), input = controlledUploadInput(); let valid = true, failures = 0, fetches = 0;
    const adapter = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret,
      assertEnvironment: () => { if (!valid) { valid = true; failures++; throw Error("PRIVATE_CONFIGURATION"); } },
      fetchImpl: async () => { fetches++; throw Error("No network admitted"); },
    });
    const pending = adapter.createImmutable(input, signal()).catch(error => error);
    await microtasks();
    if (stage === "pipeline") { h.finishMetadata(); await microtasks(); }
    valid = false;
    if (stage === "metadata") h.finishMetadata(); else h.finishPipeline();
    await microtasks();
    try {
      storageFailure(await observedWithin(pending), "rejected"); assert.equal(failures, 1); assert.equal(fetches, 0);
      assert.deepEqual(h.calls(), stage === "metadata" ? [1, 0] : [1, 1]);
      storageFailure(await observedWithin(adapter.createImmutable(input, signal()).catch(error => error)), "rejected");
      assert.deepEqual(h.calls(), stage === "metadata" ? [1, 0] : [1, 1]);
    } finally { h.expire(); if (h.calls()[1]) h.finishPipeline(); await pending; await microtasks(); }
    assert.equal(h.timerCount(), 0); const scope = h.pool.tryAcquire(); assert.ok(scope); h.pool.close(scope);
  }
});

test("configuration guard fences bucket/POST/readback settlement without retry or success after a possible write", async () => {
  for (const stage of ["bucket", "POST", "readback"] as const) {
    const h = controlledStorage(), input = controlledUploadInput(); let valid = true;
    const calls: string[] = [];
    const adapter = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret,
      assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); },
      fetchImpl: async (url, init) => {
        const label = String(url).includes("/bucket/") ? "bucket" : init?.method === "POST" ? "POST" : "readback";
        calls.push(label); if (stage === label) valid = false;
        if (label === "bucket") return Response.json({ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars", public: false, file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"] });
        if (label === "POST") return Response.json({}, { status: 201 });
        return new Response(new Uint8Array(input.bytes), { headers: { "content-type": "image/webp" } });
      },
    });
    const pending = adapter.createImmutable(input, signal()).catch(error => error);
    await microtasks(); h.finishMetadata(); await microtasks(); h.finishPipeline();
    storageFailure(await observedWithin(pending), stage === "bucket" ? "rejected" : "unknown");
    assert.deepEqual(calls, ["bucket", "POST", "readback"].slice(0, ["bucket", "POST", "readback"].indexOf(stage) + 1));
    assert.equal(h.timerCount(), 0);
  }
});

test("configuration rejection during failed Storage fetch latches even when the environment is then restored", async () => {
  const h = controlledStorage(), input = controlledUploadInput(); let valid = true, fetches = 0;
  const adapter = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret,
    assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); },
    fetchImpl: async () => { fetches++; valid = false; throw Error("PRIVATE_FETCH"); },
  });
  const pending = adapter.createImmutable(input, signal()).catch(error => error);
  await microtasks(); h.finishMetadata(); await microtasks(); h.finishPipeline();
  storageFailure(await observedWithin(pending), "rejected"); valid = true;
  const next = adapter.createImmutable(input, signal()).catch(error => error); await microtasks();
  try { storageFailure(await observedWithin(next), "rejected"); assert.deepEqual(h.calls(), [1, 1]); assert.equal(fetches, 1); }
  finally { h.expire(); h.finishMetadata(); h.finishPipeline(); await next; await microtasks(); }
});

test("configuration invalid Storage hook starts zero native or fetch work", async () => {
  for (const assertion of [null, "true", async () => { throw Error("PRIVATE_ASYNC"); }]) {
    const h = controlledStorage(); let fetches = 0;
    const adapter = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment: assertion as never,
      fetchImpl: async () => { fetches++; throw Error("forbidden"); },
    });
    const pending = adapter.createImmutable(controlledUploadInput(), signal()).catch(error => error);
    try { storageFailure(await observedWithin(pending), "rejected"); assert.equal(h.nativeStarts(), 0); assert.equal(fetches, 0); }
    finally { h.expire(); if (h.calls()[0]) h.finishMetadata(); if (h.calls()[1]) h.finishPipeline(); await pending; await microtasks(); }
  }
});

test("resource upload POST-path native timeout retains original child until settlement with no late Storage dispatch", async () => {
  for (const stage of ["metadata", "pipeline"] as const) for (const borrowed of [false, true]) {
    const h = controlledStorage(), input = controlledUploadInput(), scope = borrowed ? h.pool.tryAcquire()! : undefined;
    const requests: string[] = [];
    const fetchImpl: typeof fetch = async (url, init) => { requests.push(`${init?.method} ${String(url)}`); throw Error("No Storage dispatch admitted"); };
    const adapter = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl, ...(scope ? { resourceScope: scope } : {}) });
    assert.deepEqual(Object.keys(adapter), ["createImmutable"]); // No publication or deletion API at this seam.
    const pending = adapter.createImmutable(input, signal()).then(value => ({ value }), error => ({ error }));
    try {
      await microtasks(); assert.deepEqual(h.calls(), [1, 0]);
      if (stage === "pipeline") { h.finishMetadata(); await microtasks(); assert.deepEqual(h.calls(), [1, 1]); }
      h.expire();
      const result = await observedWithin(pending); assert.ok("error" in result); storageFailure(result.error, "rejected");
      assert.equal(h.timerCount(), 0);
      if (scope) { h.pool.close(scope); h.pool.close(scope); }
      assert.equal(h.pool.tryAcquire(), null, `${stage}/${borrowed}: original native child owns capacity`);
      const contender = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl });
      const rejected = await observedWithin(contender.createImmutable(input, signal()).catch(error => error));
      storageFailure(rejected, "rejected");
      assert.deepEqual(h.calls(), stage === "metadata" ? [1, 0] : [1, 1]); assert.deepEqual(requests, []);
    } finally {
      h.expire();
      if (scope) { h.pool.close(scope); h.pool.close(scope); }
      if (h.calls()[0]) h.finishMetadata();
      if (h.calls()[1]) h.finishPipeline();
      await observedWithin(pending);
      await microtasks();
    }
    assert.deepEqual(requests, []); assert.equal(h.timerCount(), 0);
    assert.deepEqual(h.calls(), stage === "metadata" ? [1, 0] : [1, 1], "expired metadata cannot launch pipeline");
    const next = h.pool.tryAcquire(); assert.ok(next);
    try {
      if (scope) h.pool.close(scope); // A late duplicate close cannot release the next request.
      assert.equal(h.pool.tryAcquire(), null);
    } finally { h.pool.close(next); h.pool.close(next); }
  }
});

test("resource upload POST-path timeout after dispatch stays unknown and discards late response without readback or deletion", async () => {
  const h = controlledStorage(), input = controlledUploadInput();
  const requests: Array<{ method: string; path: string }> = [];
  let finishPost: ((response: Response) => void) | undefined, cancelled = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, method = String(init?.method);
    requests.push({ method, path });
    if (method === "GET" && path === "/storage/v1/bucket/touchline-club-owner-avatars") return Response.json({
      id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars", public: false,
      file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"],
    });
    assert.equal(method, "POST"); assert.equal(path, `/storage/v1/object/touchline-club-owner-avatars/${input.objectKey}`);
    assert.equal(new Headers(init?.headers).get("x-upsert"), "false");
    return new Promise<Response>(resolve => { finishPost = resolve; });
  };
  const adapter = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl });
  const pending = adapter.createImmutable(input, signal()).then(value => ({ value }), error => ({ error }));
  try {
    await microtasks(); assert.deepEqual(h.calls(), [1, 0]); h.finishMetadata();
    await microtasks(); assert.deepEqual(h.calls(), [1, 1]); h.finishPipeline();
    await microtasks(); assert.ok(finishPost); assert.deepEqual(requests.map(item => item.method), ["GET", "POST"]);
    h.expire();
    const result = await observedWithin(pending); assert.ok("error" in result); storageFailure(result.error, "unknown");
    assert.equal(h.timerCount(), 0);
    // Native work settled. The resource pool does not claim to hold/cancel an
    // already-started remote HTTP write or prove that Storage rolled it back.
    const next = h.pool.tryAcquire(); assert.ok(next);
    try {
      finishPost(new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 201 }));
      await microtasks(); assert.equal(cancelled, 1);
      assert.equal(h.pool.tryAcquire(), null, "late cleanup must not free a later scope");
    } finally { h.pool.close(next); h.pool.close(next); }
    assert.deepEqual(requests.map(item => item.method), ["GET", "POST"]);
    assert.ok(requests.every(item => !item.path.includes("/rpc/") && item.method !== "DELETE"));
  } finally {
    h.expire();
    if (h.calls()[0]) h.finishMetadata(); if (h.calls()[1]) h.finishPipeline();
    finishPost?.(new Response(null, { status: 201 }));
    await observedWithin(pending);
    await microtasks();
  }
  assert.equal(h.timerCount(), 0);
});

test("resource reader holds its native child beyond timeout wrapper and never starts a late pipeline", async () => {
  const input = await upload(), f = await fixture(input), h = controlledStorage(), scope = h.pool.tryAcquire()!, controller = new AbortController();
  const reader = h.create({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl, resourceScope: scope });
  const pending = reader.readImmutable(input, controller.signal);
  for (let index = 0; index < 100; index++) await Promise.resolve(); assert.deepEqual(h.calls(), [1, 0]);
  h.expire(); await assert.rejects(pending); h.pool.close(scope);
  try { assert.equal(h.pool.tryAcquire(), null); }
  finally { h.finishMetadata(); for (let index = 0; index < 20; index++) await Promise.resolve(); }
  assert.deepEqual(h.calls(), [1, 0]); const next = h.pool.tryAcquire(); assert.ok(next); h.pool.close(next);
});

test("resource reader keeps processing child after response rejection and rejects foreign scope without Storage", async () => {
  const input = await upload(), f = await fixture(input), h = controlledStorage(), scope = h.pool.tryAcquire()!, controller = new AbortController();
  const reader = h.create({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl, resourceScope: scope });
  const pending = reader.readImmutable(input, controller.signal);
  for (let index = 0; index < 100; index++) await Promise.resolve(); h.finishMetadata();
  for (let index = 0; index < 10; index++) await Promise.resolve(); assert.deepEqual(h.calls(), [1, 1]);
  controller.abort(); await assert.rejects(pending); h.pool.close(scope); assert.equal(h.pool.tryAcquire(), null);
  h.finishPipeline(); for (let index = 0; index < 20; index++) await Promise.resolve();
  const next = h.pool.tryAcquire(); assert.ok(next); h.pool.close(next);
  const previousCalls = f.calls.length;
  const foreign = h.create({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl, resourceScope: {} as typeof scope });
  await assert.rejects(foreign.readImmutable(input, signal())); assert.equal(f.calls.length, previousCalls);
});

test("verified private bucket and normalized bytes use canonical create-only path, then exact bounded readback", async () => {
  const input = await upload(); const f = await fixture(input); const { CLUB_OWNER_AVATAR_BUCKET } = await load();
  assert.deepEqual(await f.create().createImmutable(input, signal()), { objectKey: input.objectKey, digest: input.digest });
  assert.deepEqual(f.calls.map(call => call.init.method), ["GET", "POST", "GET"]);
  assert.equal(f.calls[1].url, `${origin}/storage/v1/object/${CLUB_OWNER_AVATAR_BUCKET}/${input.objectKey}`);
  assert.equal(f.calls[2].url, `${origin}/storage/v1/object/authenticated/${CLUB_OWNER_AVATAR_BUCKET}/${input.objectKey}`);
  for (const call of f.calls) { assert.equal(call.init.redirect, "error"); assert.equal(call.init.cache, "no-store"); assert.ok(call.init.signal); }
  const headers = new Headers(f.calls[1].init.headers);
  assert.equal(headers.get("x-upsert"), "false"); assert.equal(headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(f.calls[1].init.body as Uint8Array), input.bytes);
  assert.deepEqual(Object.keys(f.create()), ["createImmutable"]);
});

test("explicit already-exists codes require exact existing bytes; HTTP conflict alone is not a duplicate", async () => {
  for (const code of ["ResourceAlreadyExists", "KeyAlreadyExists", "already_exists"]) {
    const input = await upload(); const f = await fixture(input, call => call.init.method === "POST" ? Response.json({ code }, { status: 409 }) : undefined);
    assert.equal((await f.create().createImmutable(input, signal())).digest, input.digest);
    assert.equal(f.calls.filter(call => call.init.method === "POST").length, 1);
  }
  for (const status of [400, 403, 409, 500]) {
    const input = await upload(); const f = await fixture(input, call => call.init.method === "POST" ? Response.json({ code: "PRIVATE_PROVIDER", message: secret }, { status }) : undefined);
    await assert.rejects(f.create().createImmutable(input, signal()), errorIs("unknown")); assert.equal(f.calls.length, 2);
  }
});

test("malformed source, mismatched digest/key and metadata-rich or oversized WebP never reach Storage", async () => {
  const original = await upload();
  const wide = await sharp({ create: { width: 513, height: 1, channels: 3, background: "red" } }).webp().toBuffer();
  const metadata = await sharp(original.bytes).withExif({ IFD0: { Artist: "private" } }).webp().toBuffer();
  for (const patch of [{ digest: "0".repeat(64) }, { objectKey: `../${original.objectKey}` }, { actorId: operationId }, { contentType: "image/png" }, { bytes: Buffer.from("https://evil.invalid/a") }, { bytes: Buffer.alloc(4_000_001) }, ...[wide, metadata].map(bytes => { const digest = createHash("sha256").update(bytes).digest("hex"); return { bytes, digest, objectKey: `${actorId}/${operationId}/${digest}.webp` }; })]) {
    const f = await fixture(original);
    await assert.rejects(f.create().createImmutable({ ...original, ...patch } as typeof original, signal()), errorIs("rejected")); assert.equal(f.calls.length, 0);
  }
});

test("bucket visibility, limit and MIME are checked before create, without a cached assumption", async () => {
  const input = await upload(); const { CLUB_OWNER_AVATAR_BUCKET } = await load();
  for (const patch of [{ public: true }, { file_size_limit: null }, { allowed_mime_types: ["image/png"] }, { id: "other" }]) {
    const f = await fixture(input, call => call.url.includes("/bucket/") ? Response.json({ id: CLUB_OWNER_AVATAR_BUCKET, name: CLUB_OWNER_AVATAR_BUCKET, public: false, file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"], ...patch }) : undefined);
    await assert.rejects(f.create().createImmutable(input, signal()), errorIs("rejected")); assert.equal(f.calls.length, 1);
  }
  const f = await fixture(input); const storage = f.create(); await storage.createImmutable(input, signal()); await storage.createImmutable(input, signal());
  assert.equal(f.calls.filter(call => call.url.includes("/bucket/")).length, 2);
});

test("readback is incrementally capped even with missing/lying length; wrong bytes, encoding and partial reads fail", async () => {
  const input = await upload();
  for (const kind of ["oversized", "lying", "digest", "encoding", "partial", "length"] as const) {
    let cancelled = false;
    const f = await fixture(input, call => {
      if (!call.url.includes("/object/authenticated/")) return;
      if (kind === "oversized" || kind === "lying") return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(input.bytes.length + 1)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "image/webp", ...(kind === "lying" ? { "content-length": "1" } : {}) } });
      return new Response((kind === "digest" ? Buffer.alloc(input.bytes.length) : input.bytes) as BodyInit, { status: kind === "partial" ? 206 : 200, headers: { "content-type": "image/webp", ...(kind === "encoding" ? { "content-encoding": "gzip" } : {}), ...(kind === "length" ? { "content-length": "1" } : {}) } });
    });
    await assert.rejects(f.create().createImmutable(input, signal()), errorIs("unknown")); assert.equal(f.calls.length, 3);
    if (kind === "oversized" || kind === "lying") assert.equal(cancelled, true);
  }
});

test("abort/timeout never retry a started create or start later requests; late responses are cancelled", async () => {
  const input = await upload(); const aborted = new AbortController(); aborted.abort(); const f = await fixture(input);
  await assert.rejects(f.create().createImmutable(input, aborted.signal), errorIs("rejected")); assert.equal(f.calls.length, 0);
  let resolve!: (response: Response) => void, cancelled = false;
  const late = await fixture(input, call => call.init.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : undefined);
  await assert.rejects(late.create(20).createImmutable(input, signal()), errorIs("unknown")); assert.equal(late.calls.length, 2);
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(done => setImmediate(done)); assert.equal(cancelled, true); assert.equal(late.calls.length, 2);
});

test("input is snapshotted before awaiting and unsafe configured origins are rejected without requests", async () => {
  const input = await upload(); const original = { ...input, bytes: Buffer.from(input.bytes) }; const f = await fixture(original);
  const pending = f.create().createImmutable(input, signal()); input.bytes.fill(0); input.objectKey = "other";
  assert.deepEqual(await pending, { objectKey: original.objectKey, digest: original.digest });
  const { createClubOwnerAvatarStorage } = await load();
  for (const supabaseOrigin of ["http://example.invalid", `${origin}/path`, `${origin}?key=x`, "https://user:pass@example.invalid", `${origin}#x`]) {
    assert.throws(() => createClubOwnerAvatarStorage({ supabaseOrigin, serviceRoleKey: secret, fetchImpl: f.fetchImpl }), errorIs("rejected"));
  }
});

test("already-existing object with different bytes is uncertain and is never overwritten or deleted", async () => {
  const input = await upload();
  const f = await fixture(input, call => {
    if (call.init.method === "POST") return Response.json({ code: "ResourceAlreadyExists" }, { status: 409 });
    if (call.url.includes("/object/authenticated/")) return new Response(Buffer.alloc(input.bytes.length), { headers: { "content-type": "image/webp" } });
  });
  await assert.rejects(f.create().createImmutable(input, signal()), errorIs("unknown"));
  assert.deepEqual(f.calls.map(call => call.init.method), ["GET", "POST", "GET"]);
});

test("stalled read and a never-settling stream cancellation respect the total deadline", async () => {
  const input = await upload(); let cancelled = false;
  const f = await fixture(input, call => call.url.includes("/object/authenticated/")
    ? new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }), { headers: { "content-type": "image/webp" } }) : undefined);
  await assert.rejects(f.create(30).createImmutable(input, signal()), errorIs("unknown"));
  assert.equal(cancelled, true); assert.equal(f.calls.length, 3);
});

test("immediately ready empty chunks cannot starve the monotonic deadline", async t => {
  const input = await upload(); let clock = 0, cancelled = false;
  t.mock.method(performance, "now", () => clock);
  const f = await fixture(input, call => call.url.includes("/object/authenticated/")
    ? new Response(new ReadableStream({ pull(controller) { clock += 1; controller.enqueue(new Uint8Array()); }, cancel() { cancelled = true; } }), { headers: { "content-type": "image/webp" } }) : undefined);
  await assert.rejects(f.create(10).createImmutable(input, signal()), errorIs("unknown"));
  assert.equal(cancelled, true); assert.equal(f.calls.length, 3);
});

test("bucket/error JSON bodies are capped and a redirected response cannot authorize another request", async () => {
  const input = await upload();
  for (const kind of ["bucket", "error", "redirect"] as const) {
    let cancelled = false;
    const f = await fixture(input, call => {
      if (kind === "redirect" && call.url.includes("/bucket/")) {
        const response = new Response(null, { status: 200 }); Object.defineProperty(response, "redirected", { value: true }); return response;
      }
      if ((kind === "bucket" && call.url.includes("/bucket/")) || (kind === "error" && call.init.method === "POST")) return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(4097)); }, cancel() { cancelled = true; } }), { status: kind === "error" ? 409 : 200, headers: { "content-type": "application/json" } });
    });
    await assert.rejects(f.create().createImmutable(input, signal()), errorIs(kind === "error" ? "unknown" : "rejected"));
    assert.equal(f.calls.length, kind === "error" ? 2 : 1);
    if (kind !== "redirect") assert.equal(cancelled, true);
  }
});

test("separate private reader derives the canonical key, returns verified bytes and has no write surface", async () => {
  const input = await upload(), f = await fixture(input);
  const { createClubOwnerAvatarReader } = await load();
  const reader = createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl });
  const identity = { actorId, operationId, digest: input.digest };
  assert.deepEqual(await reader.readImmutable(identity, signal()), input.bytes);
  assert.deepEqual(Object.keys(reader), ["readImmutable"]);
  assert.deepEqual(f.calls.map(call => call.init.method), ["GET", "GET"]);
  assert.ok(f.calls[1].url.endsWith(`/object/authenticated/touchline-club-owner-avatars/${input.objectKey}`));
  assert.ok(f.calls.every(call => call.init.redirect === "error" && call.init.cache === "no-store"));
});

test("reader distinguishes explicit object 404 from unavailable bucket/provider and never retries", async () => {
  const input = await upload(); const { createClubOwnerAvatarReader } = await load();
  for (const status of [404, 403, 500]) {
    const f = await fixture(input, call => call.url.includes("/object/authenticated/") ? new Response(null, { status }) : undefined);
    const reader = createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl });
    if (status === 404) assert.equal(await reader.readImmutable(input, signal()), null);
    else await assert.rejects(reader.readImmutable(input, signal()));
    assert.deepEqual(f.calls.map(call => call.init.method), ["GET", "GET"]);
  }
});

test("reader rejects real digest-matching unsafe WebP as well as wrong bytes and metadata", async () => {
  const input = await upload(); const { createClubOwnerAvatarReader } = await load();
  const wide = await sharp({ create: { width: 513, height: 1, channels: 3, background: "red" } }).webp().toBuffer();
  const metadata = await sharp(input.bytes).withExif({ IFD0: { Artist: "private" } }).webp().toBuffer();
  for (const bytes of [Buffer.from("bad"), wide, metadata]) {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const f = await fixture(input, call => call.url.includes("/object/authenticated/") ? new Response(bytes, { headers: { "content-type": "image/webp" } }) : undefined);
    const reader = createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl });
    await assert.rejects(reader.readImmutable({ actorId, operationId, digest }, signal()));
    assert.equal(f.calls.length, 2);
  }
});

test("reader caps actual stream at 4,000,000 bytes without trusting length; encoding/MIME/partial/digest/redirect fail closed", async () => {
  const input = await upload(); const { createClubOwnerAvatarReader } = await load();
  for (const kind of ["oversized", "length", "encoding", "mime", "partial", "digest", "redirect"] as const) {
    let cancelled = false;
    const f = await fixture(input, call => {
      if (!call.url.includes("/object/authenticated/")) return;
      if (kind === "oversized") return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(CLUB_OWNER_AVATAR_MAX_BYTES + 1)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "image/webp" } });
      const response = new Response(new Uint8Array(kind === "digest" ? Buffer.alloc(input.bytes.length) : input.bytes), { status: kind === "partial" ? 206 : 200, headers: {
        "content-type": kind === "mime" ? "image/png" : "image/webp", ...(kind === "length" ? { "content-length": "1" } : {}), ...(kind === "encoding" ? { "content-encoding": "gzip" } : {}),
      } });
      if (kind === "redirect") Object.defineProperty(response, "redirected", { value: true }); return response;
    });
    await assert.rejects(createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl }).readImmutable(input, signal()));
    assert.equal(f.calls.length, 2); if (kind === "oversized") assert.equal(cancelled, true);
  }
});

test("reader validates identity before fetch, preserves captured inputs and cancels stalled responses", async () => {
  const input = await upload(); const { createClubOwnerAvatarReader } = await load();
  const f = await fixture(input); const reader = createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: f.fetchImpl });
  for (const patch of [{ actorId: "../bad" }, { operationId: "https://wrong.invalid" }, { digest: "bad" }]) await assert.rejects(reader.readImmutable({ ...input, ...patch }, signal()));
  assert.equal(f.calls.length, 0);
  const identity = { actorId, operationId, digest: input.digest }; const pending = reader.readImmutable(identity, signal()); identity.operationId = actorId;
  assert.deepEqual(await pending, input.bytes);
  let cancelled = false;
  const stalled = await fixture(input, call => call.url.includes("/object/authenticated/") ? new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }), { headers: { "content-type": "image/webp" } }) : undefined);
  await assert.rejects(createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: stalled.fetchImpl, timeoutMs: 10 }).readImmutable(input, signal()));
  assert.equal(cancelled, true); assert.equal(stalled.calls.length, 2);
});

test("reader accepts canonical 512px boundary but rejects non-private bucket and any credentialed origin override", async () => {
  const { createClubOwnerAvatarReader } = await load();
  const input = await upload(await sharp({ create: { width: 512, height: 1, channels: 3, background: "red" } }).png().toBuffer());
  const good = await fixture(input);
  assert.deepEqual(await createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: good.fetchImpl }).readImmutable(input, signal()), input.bytes);
  const wrong = await fixture(input, call => call.url.includes("/bucket/") ? Response.json({ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars", public: true, file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"] }) : undefined);
  await assert.rejects(createClubOwnerAvatarReader({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: wrong.fetchImpl }).readImmutable(input, signal()));
  assert.equal(wrong.calls.length, 1);
  for (const supabaseOrigin of ["http://wrong.invalid", `${origin}/path`, "https://user:password@wrong.invalid"]) {
    assert.throws(() => createClubOwnerAvatarReader({ supabaseOrigin, serviceRoleKey: secret, fetchImpl: wrong.fetchImpl }));
  }
  assert.equal(wrong.calls.length, 1);
});

test("transport direct Storage creation rejects matching-key excess before native admission or fetch", async () => {
  const h = controlledStorage(), bytes = Buffer.alloc(4_000_001);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const input = { ...controlledUploadInput(), bytes, digest, objectKey: `${actorId}/${operationId}/${digest}.webp` };
  let fetches = 0;
  const storage = h.createUpload({ supabaseOrigin: origin, serviceRoleKey: secret,
    fetchImpl: async () => { fetches++; throw Error("UNEXPECTED_FETCH"); } });
  await assert.rejects(storage.createImmutable(input, signal()), error => { storageFailure(error, "rejected"); return true; });
  assert.equal(h.nativeStarts(), 0); assert.deepEqual(h.calls(), [0, 0]); assert.equal(fetches, 0);
  assert.equal(h.timerCount(), 0);
});

test("transport direct reader cancels declared, absent and lying-length excess before native work", async () => {
  for (const mode of ["declared", "absent", "lying"] as const) {
    const h = controlledStorage(), bytes = Buffer.alloc(4_000_001);
    const digest = createHash("sha256").update(bytes).digest("hex"); let cancelled = false, fetches = 0, pulls = 0;
    const reader = h.create({ supabaseOrigin: origin, serviceRoleKey: secret, fetchImpl: async input => {
      fetches++;
      if (String(input).includes("/bucket/")) return Response.json({ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars",
        public: false, file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"] });
      return new Response(new ReadableStream({ pull(controller) {
        if (pulls++ === 0) controller.enqueue(bytes.subarray(0, 4_000_000));
        else if (pulls === 2) controller.enqueue(bytes.subarray(4_000_000));
        else controller.close();
      }, cancel() { cancelled = true; } }, { highWaterMark: 0 }), { headers: { "content-type": "image/webp",
        ...(mode === "declared" ? { "content-length": "4000001" } : mode === "lying" ? { "content-length": "1" } : {}) } });
    } });
    await assert.rejects(reader.readImmutable({ actorId, operationId, digest }, signal()));
    assert.equal(h.nativeStarts(), 0); assert.deepEqual(h.calls(), [0, 0]); assert.equal(fetches, 2);
    assert.equal(cancelled, true); assert.equal(h.timerCount(), 0);
  }
});
