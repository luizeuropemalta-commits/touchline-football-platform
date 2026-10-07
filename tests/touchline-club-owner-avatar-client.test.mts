import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const actor = "11111111-1111-4111-8111-111111111111", operation = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333", oldPhoto = "https://legacy.invalid/photo.jpg";
const committed = (patch: Record<string, unknown> = {}) => Response.json({ ok: true, state: "committed", requiresRefresh: true,
  accountId: actor, operationId: operation, revision: "1", avatarUrl: `/api/account/avatar?version=${operation}`, ...patch });
async function fixture(patch: Record<string, unknown> = {}) {
  const { createClubOwnerAvatarClient } = await import("../lib/touchlineArena/club-owner-avatar-client.ts");
  const calls: { input: RequestInfo | URL; init?: RequestInit; bytes: Uint8Array }[] = [];
  const bytes = new Uint8Array([1, 2, 3]); // Controller is not an image decoder.
  let current = true, ids = 0, timer: (() => void) | undefined, clock = 0;
  let transport: typeof fetch = async () => committed();
  const options = { enabled: true, current: { actorId: actor, revision: "0", avatarUrl: oldPhoto }, baseGeneration: "0", bytes, contentType: "image/jpeg",
    isCurrent: () => current, randomUUID: () => { ids++; return operation; }, now: () => clock,
    scheduleTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 30_000); timer = callback; return () => { timer = undefined; }; },
    request: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init, bytes: new Uint8Array(init?.body as Uint8Array) }); return transport(input, init);
    }, ...patch };
  const client = createClubOwnerAvatarClient(options as Parameters<typeof createClubOwnerAvatarClient>[0]);
  return { client, calls, bytes, options, ids: () => ids, timer: () => Boolean(timer), advance: (value: number) => { clock = value; },
    timeout: () => { assert.ok(timer); timer(); }, changeAccount: () => { current = false; client.invalidate(); },
    staleWithoutEvent: () => { current = false; }, transport: (value: typeof fetch) => { transport = value; } };
}

test("construction never sends, defaults OFF, and gestures must be explicit booleans", async () => {
  for (const enabled of [undefined, false, "true", 1]) {
    const h = await fixture({ enabled }); assert.equal(await h.client.send(true), "disabled"); assert.equal(h.calls.length, 0); assert.equal(h.ids(), 0);
  }
  const h = await fixture(); assert.equal(h.calls.length, 0);
  for (const gesture of [undefined, null, false, 1, "true"]) assert.equal(await h.client.send(gesture), "invalid");
  assert.equal(h.calls.length, 0); assert.equal(h.client.snapshot().phase, "ready");
});

test("one explicit request uses immutable raw bytes and canonical headers; receipt requires refresh and keeps the old photo", async () => {
  const h = await fixture(); h.bytes.fill(9); h.options.current.revision = "20"; h.options.current.avatarUrl = "/changed";
  assert.equal(await h.client.send(true), "refresh_required");
  assert.equal(h.calls.length, 1); assert.equal(h.ids(), 1); assert.equal(h.timer(), false);
  const { input, init, bytes } = h.calls[0]; assert.equal(input, "/api/account/avatar");
  assert.equal(init?.method, "POST"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("if-match"), '"0"'); assert.equal(headers.get("x-touchline-expected-account"), actor);
  assert.equal(headers.get("x-touchline-avatar-operation"), operation); assert.equal(headers.get("content-type"), "image/jpeg");
  assert.equal(headers.has("origin"), false, "the browser supplies Origin; the controller never spoofs it");
  assert.deepEqual([...bytes], [1, 2, 3]);
  const state = h.client.snapshot(); assert.equal(state.currentAvatarUrl, oldPhoto); assert.equal(state.phase, "refresh_required");
  assert.ok(Object.isFrozen(state)); assert.equal(await h.client.send(true), "blocked"); assert.equal(await h.client.retry(true), "blocked");
});

test("unknown outcome has no automatic retry; explicit retry retains UUID, revision and unmodified bytes", async () => {
  const h = await fixture(); let attempt = 0;
  h.transport(async (_input, init) => { if (++attempt === 1) { (init?.body as Uint8Array).fill(8); throw Error("PRIVATE_TRANSPORT"); } return committed(); });
  assert.equal(await h.client.send(true), "unknown"); assert.equal(h.calls.length, 1);
  assert.equal(await h.client.send(true), "blocked"); assert.equal(await h.client.retry(false), "invalid"); assert.equal(h.calls.length, 1);
  assert.equal(await h.client.retry(true), "refresh_required"); assert.equal(h.calls.length, 2); assert.equal(h.ids(), 1);
  assert.deepEqual(h.calls.map(call => [...call.bytes]), [[1, 2, 3], [1, 2, 3]]);
  assert.deepEqual(h.calls.map(call => new Headers(call.init?.headers).get("x-touchline-avatar-operation")), [operation, operation]);
  assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto); assert.doesNotMatch(JSON.stringify(h.client.snapshot()), /PRIVATE_TRANSPORT/);
});

test("strict receipt validation rejects malformed, numeric, unbound and noncanonical success as unknown", async () => {
  const variants = [{ accountId: other }, { operationId: other }, { revision: 1 }, { revision: "01" }, { revision: "2" },
    { revision: "9223372036854775808" }, { requiresRefresh: false }, { avatarUrl: "https://evil.invalid/photo" },
    { avatarUrl: `/api/account/avatar?version=${operation}&actor=${actor}` }, { state: "saved" }, { ok: "true" }, { extra: "unexpected" }];
  for (const patch of variants) {
    const h = await fixture(); h.transport(async () => committed(patch));
    assert.equal(await h.client.send(true), "unknown", JSON.stringify(patch)); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
  }
  for (const response of [new Response("", { status: 200 }), new Response("not JSON", { headers: { "content-type": "application/json" } }),
    Response.json(null), Response.json([]), Response.json({ ok: true }, { status: 201 }), new Response("x".repeat(8193), { headers: { "content-type": "application/json" } })]) {
    const h = await fixture(); h.transport(async () => response); assert.equal(await h.client.send(true), "unknown");
  }
});

test("known explicit conflicts remain conflicts without automatic rebase or retry; unknown errors are never exposed", async () => {
  for (const error of ["REVISION_CONFLICT", "OPERATION_CONFLICT", "OPERATION_SUPERSEDED"]) {
    const h = await fixture(); h.transport(async () => Response.json({ ok: false, state: "rejected", error }, { status: 409 }));
    assert.equal(await h.client.send(true), "conflict"); assert.equal(h.client.snapshot().error, error);
    assert.equal(await h.client.retry(true), "blocked"); assert.equal(h.calls.length, 1); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
  }
  for (const response of [Response.json({ ok: false, state: "unknown", error: "PRIVATE" }, { status: 503 }),
    Response.json({ ok: false, state: "rejected", error: "PRIVATE" }, { status: 409 }),
    Response.json({ ok: false, state: "unknown", error: "REVISION_CONFLICT" }, { status: 409 })]) {
    const h = await fixture(); h.transport(async () => response); assert.equal(await h.client.send(true), "unknown"); assert.doesNotMatch(JSON.stringify(h.client.snapshot()), /PRIVATE/);
  }
});

test("known validation rejection does not replace the photo, and authentication/account rejection invalidates", async () => {
  const h = await fixture(); h.transport(async () => Response.json({ ok: false, state: "rejected", error: "heic_unsupported" }, { status: 422 }));
  assert.equal(await h.client.send(true), "rejected"); assert.equal(h.client.snapshot().error, "heic_unsupported"); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
  for (const [status, error] of [[401, "AUTHENTICATION_REQUIRED"], [403, "ACCESS_REQUIRED"], [409, "ACCOUNT_CHANGED"]] as const) {
    const denied = await fixture(); denied.transport(async () => Response.json({ ok: false, state: "rejected", error }, { status }));
    assert.equal(await denied.client.send(true), "invalidated"); assert.equal(await denied.client.retry(true), "invalidated");
  }
});

test("invalid initial identity/revision/bytes/type and random UUID never send", async () => {
  for (const patch of [{ current: { actorId: "bad", revision: "0", avatarUrl: oldPhoto } },
    { current: { actorId: actor, revision: "01", avatarUrl: oldPhoto } }, { current: { actorId: actor, revision: 0, avatarUrl: oldPhoto } },
    { current: { actorId: actor, revision: "9223372036854775807", avatarUrl: null } },
    { bytes: new Uint8Array() }, { bytes: new Uint8Array(4_000_001) }, { contentType: "image/svg+xml" },
    { randomUUID: () => "bad" }, { randomUUID: () => { throw Error("PRIVATE"); } }]) {
    const h = await fixture(patch); assert.equal(await h.client.send(true), "rejected"); assert.equal(h.calls.length, 0); assert.equal(h.timer(), false);
  }
});

test("decimal bigint revisions retain exact precision without numeric coercion", async () => {
  const h = await fixture({ current: { actorId: actor, revision: "9007199254740992", avatarUrl: `/api/account/avatar?version=${other}` } });
  h.transport(async () => committed({ revision: "9007199254740993" })); assert.equal(await h.client.send(true), "refresh_required");
  assert.equal(new Headers(h.calls[0].init?.headers).get("if-match"), '"9007199254740992"');
});

test("concurrent send/retry clicks do not create duplicate requests or UUIDs", async () => {
  const h = await fixture(); let finish!: (value: Response) => void;
  h.transport(async () => new Promise(resolve => { finish = resolve; }));
  const pending = h.client.send(true); assert.equal(await h.client.send(true), "busy"); assert.equal(await h.client.retry(true), "busy");
  finish(Response.json({ ok: false, state: "unknown", error: "UPLOAD_UNCONFIRMED" }, { status: 503 })); assert.equal(await pending, "unknown");
  const retry = h.client.retry(true); assert.equal(await h.client.retry(true), "busy"); finish(committed());
  assert.equal(await retry, "refresh_required"); assert.equal(h.calls.length, 2); assert.equal(h.ids(), 1);
});

test("account change and unmount abort pending work; ignored late answers cannot revive a generation", async () => {
  for (const mode of ["account", "dispose"] as const) {
    const h = await fixture(); let finish!: (value: Response) => void;
    h.transport(async () => new Promise(resolve => { finish = resolve; })); const pending = h.client.send(true);
    if (mode === "account") h.changeAccount(); else h.client.dispose();
    assert.equal(await pending, "invalidated"); assert.equal(h.calls[0].init?.signal?.aborted, true);
    finish(committed()); await Promise.resolve(); assert.equal(h.client.snapshot().phase, "invalidated");
    assert.equal(await h.client.retry(true), "invalidated"); assert.equal(h.calls.length, 1); assert.equal(h.timer(), false);
  }
});

test("deadline bounds transport and response body waiting, without claiming rollback", async () => {
  for (const mode of ["transport", "body"] as const) {
    const h = await fixture(); let cancelled = false;
    h.transport(async () => mode === "transport" ? new Promise(() => {}) : new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } }));
    const pending = h.client.send(true); await Promise.resolve(); await Promise.resolve(); h.timeout();
    assert.equal(await pending, "unknown"); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto); assert.equal(h.timer(), false);
    if (mode === "body") { await Promise.resolve(); assert.equal(cancelled, true); }
  }
});

test("late account observation and elapsed deadline never publish a valid receipt", async () => {
  for (const mode of ["account", "deadline"] as const) {
    const h = await fixture(); h.transport(async () => { if (mode === "account") h.staleWithoutEvent(); else h.advance(30_001); return committed(); });
    assert.equal(await h.client.send(true), mode === "account" ? "invalidated" : "unknown"); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
  }
});

test("browser runtime imports only the client-safe transport constant, with no server/Sharp, storage or automatic effects", async () => {
  const source = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-client.ts", import.meta.url), "utf8");
  const emitted = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText;
  const imports = ts.createSourceFile("client.js", emitted, ts.ScriptTarget.ES2022, true).statements.filter(ts.isImportDeclaration);
  assert.equal(imports.length, 1);
  assert.equal((imports[0].moduleSpecifier as ts.StringLiteral).text, "./club-owner-avatar-transport-limits.ts");
  const limits = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-transport-limits.ts", import.meta.url), "utf8");
  const limitRuntime = ts.transpileModule(limits, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText;
  assert.doesNotMatch(limitRuntime, /\bimport\s|require\(|sharp|process\.|Buffer|localStorage|sessionStorage|\bfetch\(/);
  assert.doesNotMatch(emitted, /require\(|sharp|localStorage|sessionStorage|\bfetch\(/);
  assert.equal((await import("../lib/touchlineArena/club-owner-avatar-transport-limits.ts")).CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES, 4_000_000);
});

test("a rejected retry does not erase uncertainty about an earlier possibly committed attempt", async () => {
  for (const [status, error] of [[408, "UPLOAD_ABORTED"], [422, "invalid_image"], [413, "TOO_LARGE"]] as const) {
    const h = await fixture(); h.transport(async () => { throw Error("lost receipt"); });
    assert.equal(await h.client.send(true), "unknown");
    h.transport(async () => Response.json({ ok: false, state: "rejected", error }, { status }));
    assert.equal(await h.client.retry(true), "unknown"); assert.equal(h.client.snapshot().phase, "unknown");
    assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto); assert.equal(h.ids(), 1);
  }
});

test("rejected response type/length and oversized streaming body are cancelled under the receipt cap", async () => {
  for (const mode of ["type", "declared", "stream"] as const) {
    const h = await fixture(); let cancelled = false;
    h.transport(async () => new Response(new ReadableStream({
      start(controller) { if (mode === "stream") controller.enqueue(new Uint8Array(8193)); },
      cancel() { cancelled = true; },
    }), { headers: { "content-type": mode === "type" ? "text/plain" : "application/json", ...(mode === "declared" ? { "content-length": "8193" } : {}) } }));
    assert.equal(await h.client.send(true), "unknown"); assert.equal(cancelled, true);
  }
});

test("invalidation at final receipt settlement never escapes as refresh_required", async () => {
  for (const mode of ["account", "timeout", "deadline"] as const) {
    const h = await fixture();
    h.transport(async () => {
      const response = committed(), reader = response.body!.getReader();
      return { status: 200, headers: response.headers, redirected: false, body: { getReader: () => ({
        read: async () => {
          const part = await reader.read();
          if (part.done) queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => {
            if (mode === "account") h.changeAccount(); else if (mode === "timeout") h.timeout(); else h.advance(30_001);
          })));
          return part;
        }, cancel: () => reader.cancel(), releaseLock: () => reader.releaseLock(),
      }) } } as Response;
    });
    assert.equal(await h.client.send(true), mode === "account" ? "invalidated" : "unknown");
    assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
  }
});

test("transport cap accepts 3,999,999 and 4,000,000 bytes; rejects one more before UUID or send", async () => {
  for (const size of [3_999_999, 4_000_000, 4_000_001]) {
    const h = await fixture({ bytes: new Uint8Array(size) });
    assert.equal(h.client.snapshot().phase, size <= 4_000_000 ? "ready" : "rejected");
    assert.equal(h.ids(), size <= 4_000_000 ? 1 : 0);
    assert.equal(h.calls.length, 0); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
  }
});

test("platform transport 413 stays unknown; only canonical rejection is classified and retry is explicit", async () => {
  for (const response of [new Response("FUNCTION_PAYLOAD_TOO_LARGE", { status: 413 }),
    Response.json({ error: "FUNCTION_PAYLOAD_TOO_LARGE" }, { status: 413 })]) {
    const h = await fixture(); h.transport(async () => response);
    assert.equal(await h.client.send(true), "unknown"); assert.equal(h.calls.length, 1);
    assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
    assert.equal(await h.client.retry(false), "invalid"); assert.equal(h.calls.length, 1);
    h.transport(async () => committed());
    assert.equal(await h.client.retry(true), "refresh_required"); assert.equal(h.ids(), 1);
    assert.deepEqual(h.calls.map(call => [...call.bytes]), [[1, 2, 3], [1, 2, 3]]);
    assert.deepEqual(h.calls.map(call => new Headers(call.init?.headers).get("if-match")), ['"0"', '"0"']);
  }
  const h = await fixture(); h.transport(async () => Response.json({ ok: false, state: "rejected", error: "TOO_LARGE" }, { status: 413 }));
  assert.equal(await h.client.send(true), "rejected"); assert.equal(h.client.snapshot().currentAvatarUrl, oldPhoto);
});

test("C2 upload captures canonical generation and preserves it across explicit retry", async () => {
  const h = await fixture({ baseGeneration: "9007199254740993" });
  h.options.baseGeneration = "2"; h.transport(async () => { throw Error("lost response"); });
  assert.equal(await h.client.send(true), "unknown");
  h.transport(async () => committed()); assert.equal(await h.client.retry(true), "refresh_required");
  assert.deepEqual(h.calls.map(call => new Headers(call.init?.headers).get("x-touchline-avatar-generation")), ["9007199254740993", "9007199254740993"]);
  assert.equal(h.ids(), 1); assert.deepEqual(h.calls.map(call => [...call.bytes]), [[1, 2, 3], [1, 2, 3]]);
  for (const baseGeneration of [undefined, null, 0, "01", "-1", "9223372036854775808"]) {
    const invalid = await fixture({ baseGeneration }); assert.equal(await invalid.client.send(true), "rejected"); assert.equal(invalid.calls.length, 0); assert.equal(invalid.ids(), 0);
  }
});

const controlContext = (patch: Record<string, unknown> = {}) => ({ accountId: actor, revision: "0", avatarUrl: oldPhoto,
  generation: "0", activeOperationId: null, fencedThroughGeneration: "-1", operationId: null, operationState: null,
  committedRevision: null, uploadAllowed: true, canUpload: false, readyForSelection: false, ...patch });
const observed = (context = controlContext(), barrierStatus?: string) => Response.json({ ok: true, state: "observed", context, ...(barrierStatus ? { barrierStatus } : {}) });
async function controlFixture(patch: Record<string, unknown> = {}) {
  const { createClubOwnerAvatarRecoveryClient } = await import("../lib/touchlineArena/club-owner-avatar-client.ts");
  const calls: { input: RequestInfo | URL; init: RequestInit; body: unknown }[] = [];
  let current = true, clock = 0, timer: (() => void) | undefined, invalidations = 0;
  let transport: typeof fetch = async () => observed();
  const options = { enabled: true, accountId: actor, initialContext: controlContext(), isCurrent: () => current,
    upload: { snapshot: () => ({ accountId: actor }), invalidate: () => { invalidations++; } },
    now: () => clock, scheduleTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 8_000); timer = callback; return () => { timer = undefined; }; },
    request: async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ input, init: init!, body: JSON.parse(String(init?.body)) }); return transport(input, init); }, ...patch };
  const client = createClubOwnerAvatarRecoveryClient(options as Parameters<typeof createClubOwnerAvatarRecoveryClient>[0]);
  return { client, calls, options, invalidations: () => invalidations, transport: (value: typeof fetch) => { transport = value; },
    change: () => { current = false; client.invalidate(); }, stale: () => { current = false; }, timeout: () => { assert.ok(timer); timer(); },
    advance: () => { clock = 8_001; }, timer: () => Boolean(timer) };
}

test("C2 recovery is file-free, default OFF and never upgrades server readiness or sends from observation", async () => {
  for (const enabled of [undefined, false, "true"]) { const off = await controlFixture({ enabled }); assert.equal(await off.client.observe(), "disabled"); assert.equal(off.calls.length, 0); }
  const h = await controlFixture({ initialContext: undefined }); assert.equal(h.client.snapshot().phase, "unobserved"); assert.equal(h.calls.length, 0);
  assert.equal(await h.client.observe(), "observed"); const snapshot = h.client.snapshot();
  assert.equal(snapshot.context?.canUpload, false); assert.equal(snapshot.context?.readyForSelection, false);
  assert.equal(snapshot.context?.uploadAllowed, true); assert.ok(Object.isFrozen(snapshot.context)); assert.equal(h.invalidations(), 0);
  assert.deepEqual(h.calls[0].body, { action: "status" }); assert.equal(h.calls[0].input, "/api/account/avatar/recovery");
  assert.equal(h.calls[0].init.credentials, "same-origin"); assert.equal(h.calls[0].init.cache, "no-store"); assert.equal(h.calls[0].init.redirect, "error");
  assert.equal(new Headers(h.calls[0].init.headers).get("x-touchline-expected-account"), actor);
  assert.equal(new Headers(h.calls[0].init.headers).has("origin"), false);
  for (const gesture of [undefined, false, "true", 1]) assert.equal(await h.client.fence(gesture), "invalid");
  assert.equal(h.calls.length, 1);
});

test("C2 fence and lost-response retry retain the captured epoch/active pair and retire the old upload", async () => {
  const initial = controlContext({ generation: "1", activeOperationId: operation, operationId: operation, operationState: "pending" });
  const h = await controlFixture({ initialContext: initial }); initial.generation = "99";
  h.transport(async () => { throw Error("PRIVATE"); });
  assert.equal(await h.client.fence(true), "unknown"); assert.equal(h.invalidations(), 1);
  assert.equal(await h.client.fence(true), "blocked"); assert.equal(await h.client.retryFence(false), "invalid"); assert.equal(h.calls.length, 1);
  h.transport(async () => observed(controlContext({ generation: "3", fencedThroughGeneration: "1", activeOperationId: other, operationId: other, operationState: "pending" }), "barrier_applied"));
  assert.equal(await h.client.retryFence(true), "refresh_required");
  assert.deepEqual(h.calls.map(call => call.body), Array(2).fill({ action: "fence", generation: "1", expectedActiveOperationId: operation, explicitRecoveryConsent: true }));
  assert.equal(h.client.snapshot().context?.activeOperationId, other); assert.equal(h.client.snapshot().context?.readyForSelection, false);
  assert.equal(await h.client.retryFence(true), "blocked"); assert.equal(h.calls.length, 2);
});

test("C2 idle fence, committed winner and stale-ID conflict never become image receipts or readiness", async () => {
  for (const mode of ["idle", "committed", "conflict"] as const) {
    const initial = mode === "idle" ? controlContext() : controlContext({ generation: "1", activeOperationId: operation, operationId: operation, operationState: "pending" });
    const h = await controlFixture({ initialContext: initial });
    const context = controlContext({ generation: "2", fencedThroughGeneration: mode === "idle" ? "0" : "-1", ...(mode === "committed" ? { revision: "1", avatarUrl: `/api/account/avatar?version=${operation}` } : {}) });
    h.transport(async () => observed(context, mode === "idle" ? "barrier_applied" : mode));
    assert.equal(await h.client.fence(true), "refresh_required"); assert.equal(h.client.snapshot().context?.canUpload, false);
    assert.equal(h.client.snapshot().barrierStatus, mode === "idle" ? "barrier_applied" : mode);
    assert.equal(await h.client.fence(true), "blocked"); assert.equal(h.calls.length, 1);
  }
});

test("C2 malformed, unbound, oversized and false-ready control replies stay unknown", async () => {
  for (const patch of [{ accountId: other }, { generation: 0 }, { generation: "01" }, { fencedThroughGeneration: "0" },
    { readyForSelection: true }, { canUpload: true }, { uploadAllowed: "true" }, { activeOperationId: operation }, { operationState: "committed" },
    { revision: "1", avatarUrl: "https://wrong.invalid/image" }, { digest: "secret" }]) {
    const h = await controlFixture(); h.transport(async () => observed(controlContext(patch)));
    assert.equal(await h.client.observe(), "unknown", JSON.stringify(patch)); assert.equal(h.client.snapshot().context?.avatarUrl, oldPhoto);
  }
  for (const response of [Response.json(null), new Response("", { status: 200 }), Response.json({ ok: false, state: "unknown", error: "PRIVATE" }, { status: 503 }),
    observed(controlContext(), "barrier_applied"), new Response("x".repeat(8193), { headers: { "content-type": "application/json" } })]) {
    const h = await controlFixture(); h.transport(async () => response); assert.equal(await h.client.observe(), "unknown"); assert.doesNotMatch(JSON.stringify(h.client.snapshot()), /PRIVATE/);
  }
});

test("C2 account/unmount, busy clicks and final-settlement timeout cannot revive recovery or upload", async () => {
  for (const mode of ["account", "dispose", "timeout", "deadline"] as const) {
    const h = await controlFixture(); let finish!: (value: Response) => void;
    h.transport(async () => new Promise(resolve => { finish = resolve; })); const pending = h.client.observe();
    assert.equal(await h.client.observe(), "busy"); assert.equal(await h.client.fence(true), "busy");
    if (mode === "account") h.change(); else if (mode === "dispose") h.client.dispose(); else if (mode === "timeout") h.timeout(); else { h.advance(); finish(observed()); }
    assert.equal(await pending, ["account", "dispose"].includes(mode) ? "invalidated" : "unknown");
    finish(observed()); await Promise.resolve(); assert.equal(h.timer(), false); assert.equal(h.calls.length, 1);
    if (["account", "dispose"].includes(mode)) { assert.equal(h.invalidations(), 1); assert.equal(await h.client.observe(), "invalidated"); }
  }
});

test("C2 captured upload invalidation cannot be replaced and account change in that callback stops dispatch", async () => {
  const h = await controlFixture(); h.options.upload.invalidate = () => { throw Error("mutated callback"); };
  h.transport(async () => observed(controlContext({ generation: "1", fencedThroughGeneration: "0" }), "barrier_applied"));
  assert.equal(await h.client.fence(true), "refresh_required"); assert.equal(h.invalidations(), 1);
  let current = true, calls = 0;
  const changed = await controlFixture({ isCurrent: () => current, upload: { snapshot: () => ({ accountId: actor }), invalidate: () => { current = false; } },
    request: async () => { calls++; return observed(); } });
  assert.equal(await changed.client.fence(true), "invalidated"); assert.equal(calls, 0);
});

test("C2 control body cancellation, final settlement and stale epochs fail closed", async () => {
  for (const mode of ["body", "length", "account", "deadline"] as const) {
    const h = await controlFixture(); let cancelled = false;
    if (mode === "body" || mode === "length") h.transport(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      headers: { "content-type": "application/json", ...(mode === "length" ? { "content-length": "8193" } : {}) },
    }));
    else h.transport(async () => {
      const response = observed(), reader = response.body!.getReader();
      return { status: 200, redirected: false, headers: response.headers, body: { getReader: () => ({
        read: async () => { const part = await reader.read(); if (part.done) queueMicrotask(() => { if (mode === "account") h.stale(); else h.advance(); }); return part; },
        cancel: () => reader.cancel(), releaseLock: () => reader.releaseLock(),
      }) } } as Response;
    });
    const pending = h.client.observe(); if (mode === "body") { for (let i = 0; i < 10; i++) await Promise.resolve(); h.timeout(); }
    assert.equal(await pending, mode === "account" ? "invalidated" : "unknown");
    if (mode === "body" || mode === "length") assert.equal(cancelled, true);
  }
  const h = await controlFixture({ initialContext: controlContext({ generation: "3" }) });
  h.transport(async () => observed(controlContext({ generation: "2" })));
  assert.equal(await h.client.observe(), "unknown"); assert.equal(h.client.snapshot().context?.generation, "3");
});
