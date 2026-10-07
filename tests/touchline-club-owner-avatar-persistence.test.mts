import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AvatarPublication } from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

const load = () => import("../lib/touchlineArena/club-owner-avatar-persistence.ts");
const actorId = "123e4567-e89b-42d3-a456-426614174000";
const operationId = "123e4567-e89b-42d3-a456-426614174001";
const other = "123e4567-e89b-42d3-a456-426614174002";
const digest = "a".repeat(64);
const publication = (revision = "0"): AvatarPublication => ({ actorId, operationId, expectedRevision: revision, digest, objectKey: `${actorId}/${operationId}/${digest}.webp` });
const receipt = (revision = "0") => ({ ...publication(revision), revision: String(BigInt(revision) + 1n), avatarUrl: `/api/account/avatar?version=${operationId}` });
const absent = () => ({ version: 1, status: "absent", actorId, operationId, receipt: null });
const found = (value = receipt()) => ({ version: 1, status: "found", actorId, operationId, receipt: value });
const current = { actorId, revision: "0", avatarUrl: "/legacy.webp", operationId: null, digest: null };
const signal = () => new AbortController().signal;
test("installed SDK empty HTTP 200 lookup is unconfirmed, never authoritative absence", async () => {
  const { createClubOwnerAvatarPersistence } = await load(); let requests = 0;
  const client = createClient("https://avatar-test.invalid", "local-fixture-not-a-secret", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => { requests++; return new Response("", { status: 200 }); } },
  });
  await assert.rejects(createClubOwnerAvatarPersistence(client, actorId).findOperation({ actorId, operationId }, signal()), /AVATAR_PERSISTENCE_UNCONFIRMED/);
  assert.equal(requests, 1);
});
type Reply = { data: unknown; error: unknown; status?: number };
function fake(answer: (name: string, args: Record<string, unknown>) => Promise<Reply> | Reply) {
  const calls: { name: string; args: Record<string, unknown>; signal?: AbortSignal; retry?: boolean }[] = [];
  const client = { rpc(name: string, args: Record<string, unknown>) {
    const call: typeof calls[number] = { name, args }; calls.push(call);
    const builder = {
      abortSignal(value: AbortSignal) { call.signal = value; return builder; },
      retry(value: boolean) { call.retry = value; return builder; },
      then(resolve: (value: Reply) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve().then(() => answer(name, args)).then(value => resolve({ status: 200, ...value }), reject); },
    };
    return builder;
  } } as unknown as Pick<SupabaseClient, "rpc">;
  return { client, calls };
}

test("three real RPC names and scalar arguments; legacy zero and exact receipt bindings", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const f = fake(name => ({ data: name.includes("read_") ? current : name.includes("find_") ? found() : { status: "committed", receipt: receipt() }, error: null }));
  const store = createClubOwnerAvatarPersistence(f.client, actorId);
  assert.deepEqual(await store.readCurrent(actorId, signal()), current);
  assert.deepEqual(await store.findOperation({ actorId, operationId }, signal()), receipt());
  assert.deepEqual(await store.publish(publication(), signal()), { status: "committed", receipt: receipt() });
  assert.deepEqual(f.calls.map(({ name, args }) => ({ name, args })), [
    { name: "touchline_read_club_owner_avatar", args: { p_actor: actorId } },
    { name: "touchline_find_club_owner_avatar_operation", args: { p_actor: actorId, p_operation: operationId } },
    { name: "touchline_publish_club_owner_avatar", args: { p_actor: actorId, p_operation: operationId, p_expected: "0", p_digest: digest, p_key: publication().objectKey } },
  ]);
  assert.ok(f.calls.every(call => call.retry === false && call.signal instanceof AbortSignal));
});

test("captured canonical actor cannot be retargeted; invalid input never dispatches", async () => {
  const { createClubOwnerAvatarPersistence } = await load(); const f = fake(() => ({ data: current, error: null }));
  assert.throws(() => createClubOwnerAvatarPersistence(f.client, "bad"), /AVATAR_PERSISTENCE_UNCONFIRMED/);
  const store = createClubOwnerAvatarPersistence(f.client, actorId);
  await assert.rejects(store.readCurrent(other, signal()), /AVATAR_PERSISTENCE_UNCONFIRMED/);
  await assert.rejects(store.findOperation({ actorId, operationId: "bad" }, signal()));
  for (const input of [{ ...publication(), actorId: other }, { ...publication(), expectedRevision: "01" }, { ...publication(), expectedRevision: "9223372036854775807" }, { ...publication(), objectKey: "other/key" }]) {
    assert.deepEqual(await store.publish(input, signal()), { status: "unknown" });
  }
  assert.equal(f.calls.length, 0);
});

test("decimal strings preserve bigint precision; numeric or malformed revisions are never coerced", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const big = "9223372036854775806";
  const f = fake(() => ({ data: { status: "committed", receipt: receipt(big) }, error: null }));
  assert.deepEqual(await createClubOwnerAvatarPersistence(f.client, actorId).publish(publication(big), signal()), { status: "committed", receipt: receipt(big) });
  assert.equal(f.calls[0].args.p_expected, big);
  for (const revision of [0, 1, "01", "-1", "1e3", "9223372036854775808", null]) {
    const bad = fake(() => ({ data: { ...current, revision }, error: null }));
    await assert.rejects(createClubOwnerAvatarPersistence(bad.client, actorId).readCurrent(actorId, signal()));
  }
});

test("read current enforces zero legacy versus canonical published state", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const published = { actorId, revision: "1", operationId, digest, avatarUrl: receipt().avatarUrl };
  for (const value of [{ ...current, avatarUrl: null }, published]) {
    const f = fake(() => ({ data: value, error: null }));
    assert.deepEqual(await createClubOwnerAvatarPersistence(f.client, actorId).readCurrent(actorId, signal()), value);
  }
  for (const value of [null, [], { ...current, actorId: other }, { ...current, digest }, { ...published, operationId: null }, { ...published, avatarUrl: "https://wrong.invalid" }]) {
    const f = fake(() => ({ data: value, error: null }));
    await assert.rejects(createClubOwnerAvatarPersistence(f.client, actorId).readCurrent(actorId, signal()), /AVATAR_PERSISTENCE_UNCONFIRMED/);
  }
});

test("lookup absence requires an explicit bound v1 envelope; errors and malformed receipts are not absence", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const confirmed = fake(() => ({ data: absent(), error: null }));
  assert.equal(await createClubOwnerAvatarPersistence(confirmed.client, actorId).findOperation({ actorId, operationId }, signal()), null);
  for (const reply of [{ data: absent(), error: { code: "42501", message: "PRIVATE" } }, { data: absent(), error: null, status: 204 }, { data: undefined, error: null }, { data: found({ ...receipt(), actorId: other }), error: null }, { data: found({ ...receipt(), revision: "2" }), error: null }, { data: found({ ...receipt(), objectKey: "wrong" }), error: null }]) {
    const f = fake(() => reply);
    await assert.rejects(createClubOwnerAvatarPersistence(f.client, actorId).findOperation({ actorId, operationId }, signal()), error => error instanceof Error && error.message === "AVATAR_PERSISTENCE_UNCONFIRMED");
  }
  for (const value of [null, [], receipt(), {}, { ...absent(), version: "1" }, { ...absent(), version: 2 },
    { ...absent(), actorId: other }, { ...absent(), operationId: other }, { ...absent(), status: "unknown" },
    { ...absent(), receipt: undefined }, { ...absent(), receipt: receipt() }, { ...found(), receipt: null },
    { ...found(), version: undefined }, { ...found(), actorId: other }, { ...found(), operationId: other }]) {
    const f = fake(() => ({ data: value, error: null }));
    await assert.rejects(createClubOwnerAvatarPersistence(f.client, actorId).findOperation({ actorId, operationId }, signal()), /AVATAR_PERSISTENCE_UNCONFIRMED/);
    assert.equal(f.calls.length, 1);
  }
});

test("only explicit successful payloads classify conflicts; SQL errors and malformed commitments remain unknown", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  for (const status of ["conflict", "operation_conflict"] as const) {
    const f = fake(() => ({ data: { status }, error: null }));
    assert.deepEqual(await createClubOwnerAvatarPersistence(f.client, actorId).publish(publication(), signal()), { status });
  }
  const replies = [
    ...["23505", "42501", "55P03", "57014"].map(code => ({ data: { status: "conflict" }, error: { code, message: "PRIVATE" } })),
    { data: null, error: null }, { data: { status: "revision_conflict" }, error: null },
    ...[{ actorId: other }, { operationId: other }, { expectedRevision: "1" }, { digest: "b".repeat(64) }, { revision: 1 }, { avatarUrl: "https://wrong.invalid" }].map(patch => ({ data: { status: "committed", receipt: { ...receipt(), ...patch } }, error: null })),
  ];
  for (const reply of replies) {
    const f = fake(() => reply);
    assert.deepEqual(await createClubOwnerAvatarPersistence(f.client, actorId).publish(publication(), signal()), { status: "unknown" });
    assert.equal(f.calls.length, 1);
  }
  const thrown = fake(() => { throw new Error("PRIVATE"); });
  assert.deepEqual(await createClubOwnerAvatarPersistence(thrown.client, actorId).publish(publication(), signal()), { status: "unknown" });
});

test("abort before dispatch and after remote settlement never acknowledges success or retries", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const controller = new AbortController(); controller.abort();
  const early = fake(() => ({ data: current, error: null })); const store = createClubOwnerAvatarPersistence(early.client, actorId);
  await assert.rejects(store.readCurrent(actorId, controller.signal));
  assert.deepEqual(await store.publish(publication(), controller.signal), { status: "unknown" }); assert.equal(early.calls.length, 0);
  for (const kind of ["read", "lookup", "publish"] as const) {
    const late = new AbortController();
    const f = fake(async () => { queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => late.abort()))); return { data: kind === "read" ? current : kind === "lookup" ? found() : { status: "committed", receipt: receipt() }, error: null }; });
    const adapter = createClubOwnerAvatarPersistence(f.client, actorId);
    if (kind === "publish") assert.deepEqual(await adapter.publish(publication(), late.signal), { status: "unknown" });
    else await assert.rejects(kind === "read" ? adapter.readCurrent(actorId, late.signal) : adapter.findOperation({ actorId, operationId }, late.signal));
    assert.equal(f.calls.length, 1);
  }
});

test("bounded waiting covers uncooperative SDK and synchronous deadline starvation without claiming SQL cancellation", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const f = fake(() => new Promise<Reply>(() => {}));
  const adapter = createClubOwnerAvatarPersistence(f.client, actorId, { timeoutMs: 5 });
  assert.deepEqual(await adapter.publish(publication(), signal()), { status: "unknown" });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].signal?.aborted, true);
  const slow = fake(() => { const end = performance.now() + 8; while (performance.now() < end) { /* Deliberately starve the timer. */ } return { data: { status: "committed", receipt: receipt() }, error: null }; });
  assert.deepEqual(await createClubOwnerAvatarPersistence(slow.client, actorId, { timeoutMs: 2 }).publish(publication(), signal()), { status: "unknown" });
});

test("deadline at remote settlement fails closed for reads, replay receipt and publication", async t => {
  const { createClubOwnerAvatarPersistence } = await load(); let clock = 0;
  t.mock.method(performance, "now", () => clock);
  for (const kind of ["read", "lookup", "publish"] as const) {
    clock = 0; let interrupted = false;
    const f = fake(async () => {
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { clock = 10_001; interrupted = true; })));
      return { data: kind === "read" ? current : kind === "lookup" ? found() : { status: "committed", receipt: receipt() }, error: null };
    });
    const adapter = createClubOwnerAvatarPersistence(f.client, actorId);
    if (kind === "publish") assert.deepEqual(await adapter.publish(publication(), signal()), { status: "unknown" });
    else await assert.rejects(kind === "read" ? adapter.readCurrent(actorId, signal()) : adapter.findOperation({ actorId, operationId }, signal()));
    assert.equal(interrupted, true); assert.equal(f.calls.length, 1);
  }
});

test("in-flight caller mutation cannot retarget arguments or receipt comparison", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  let release!: (value: Reply) => void;
  const f = fake(() => new Promise<Reply>(resolve => { release = resolve; }));
  const adapter = createClubOwnerAvatarPersistence(f.client, actorId);
  const input = { ...publication() };
  const pending = adapter.publish(input, signal());
  input.actorId = other; input.operationId = other; input.expectedRevision = "1"; input.digest = "b".repeat(64); input.objectKey = "wrong";
  // The builder's thenable begins in the next microtask; it receives a separate
  // captured scalar argument object, not the caller-owned publication object.
  await new Promise<void>(resolve => queueMicrotask(() => queueMicrotask(resolve)));
  release({ data: { status: "committed", receipt: receipt() }, error: null });
  assert.deepEqual(await pending, { status: "committed", receipt: receipt() });
  assert.equal(f.calls[0].args.p_actor, actorId); assert.equal(f.calls[0].args.p_operation, operationId); assert.equal(f.calls[0].args.p_expected, "0");
});

test("installed SDK uses POST with exact decimal JSON and injected fetch only", async () => {
  const { createClubOwnerAvatarPersistence } = await load(); const requests: { url: string; method: string; body: unknown }[] = [];
  const client = createClient("https://avatar-test.invalid", "local-fixture-not-a-secret", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, init) => {
    requests.push({ url: String(url), method: String(init?.method), body: JSON.parse(String(init?.body)) });
    return Response.json({ status: "committed", receipt: receipt("9007199254740992") });
  } } });
  assert.equal((await createClubOwnerAvatarPersistence(client, actorId).publish(publication("9007199254740992"), signal())).status, "committed");
  assert.equal(requests.length, 1); assert.equal(requests[0].url, "https://avatar-test.invalid/rest/v1/rpc/touchline_publish_club_owner_avatar");
  assert.equal(requests[0].method, "POST"); assert.equal((requests[0].body as { p_expected: string }).p_expected, "9007199254740992");
});

test("installed SDK distinguishes v1 lookup envelopes from empty, null and malformed HTTP acknowledgements", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const cases = [
    { response: () => Response.json(absent()), expected: null },
    { response: () => Response.json(found(receipt("9007199254740992"))), expected: receipt("9007199254740992") },
    ...["", "null", "{}", "not json", JSON.stringify({ ...absent(), version: 2 }), JSON.stringify(receipt())]
      .map(body => ({ response: () => new Response(body, { status: 200 }), expected: undefined })),
    { response: () => new Response(null, { status: 204 }), expected: undefined },
    { response: () => Response.json(absent(), { status: 503 }), expected: undefined },
  ];
  for (const entry of cases) {
    let requests = 0;
    const client = createClient("https://avatar-test.invalid", "local-fixture-not-a-secret", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (url, init) => {
        requests++; assert.equal(String(url), "https://avatar-test.invalid/rest/v1/rpc/touchline_find_club_owner_avatar_operation");
        assert.equal(init?.method, "POST");
        assert.deepEqual(JSON.parse(String(init?.body)), { p_actor: actorId, p_operation: operationId });
        return entry.response();
      } },
    });
    const pending = createClubOwnerAvatarPersistence(client, actorId).findOperation({ actorId, operationId }, signal());
    if (entry.expected === undefined) await assert.rejects(pending, /AVATAR_PERSISTENCE_UNCONFIRMED/);
    else assert.deepEqual(await pending, entry.expected);
    assert.equal(requests, 1, "no automatic retry, including HTTP 503");
  }
});

const beginInput = (revision = "0", generation = "0") => ({ actorId, operationId, expectedRevision: revision, baseGeneration: generation });

test("control adapter brackets status/current/status and refuses torn generations without writes", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  let generation = "0", reads = 0;
  const idle = () => ({ version: 1, actorId, revision: "0", generation, activeOperationId: null,
    fencedThroughGeneration: "-1", requestedOperationId: null, operation: null });
  const f = fake(name => ({ data: name === "touchline_read_club_owner_avatar" ? current : idle(), error: null }));
  const adapter = createClubOwnerAvatarPersistence(f.client, actorId);
  const coherent = await adapter.readRecoveryContext(signal());
  assert.equal(coherent.snapshot.generation, "0"); assert.deepEqual(coherent.current, current);
  const torn = fake(name => { if (name === "touchline_read_club_owner_avatar_operation_status" && ++reads === 2) generation = "1";
    return { data: name === "touchline_read_club_owner_avatar" ? current : idle(), error: null }; });
  await assert.rejects(createClubOwnerAvatarPersistence(torn.client, actorId).readRecoveryContext(signal()), /UNCONFIRMED/);
});

test("control adapter retains original SDK work after timeout and never dispatches a second bracket leg", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const { createClubOwnerAvatarControlAdmission } = await import("../lib/touchlineArena/club-owner-avatar-control-admission.ts");
  const pool = createClubOwnerAvatarControlAdmission(), scope = pool.tryAcquire(); assert.ok(scope);
  let finish!: (value: Reply) => void, calls = 0;
  const f = fake(() => { calls++; return new Promise<Reply>(resolve => { finish = resolve; }); });
  const adapter = createClubOwnerAvatarPersistence(f.client, actorId, { timeoutMs: 5, trackControl: work => pool.track(scope, work) });
  try { await assert.rejects(adapter.readRecoveryContext(signal())); pool.close(scope); assert.equal(pool.tryAcquire(), null); assert.equal(calls, 1); }
  finally { finish({ data: null, error: null }); for (let index = 0; index < 40; index++) await Promise.resolve(); }
  const next = pool.tryAcquire(); assert.ok(next); pool.close(next); assert.equal(calls, 1);
});
function recoveryEnvelope(status = "started", expectedRevision = "0", baseGeneration = "0", committedReceipt: unknown = null) {
  const committed = status === "committed", pending = status === "started" || status === "pending";
  return { version: 1, status, snapshot: { version: 1, actorId, revision: committed ? String(BigInt(expectedRevision) + BigInt(1)) : expectedRevision,
    generation: String(BigInt(baseGeneration) + BigInt(committed || status === "fenced" ? 2 : 1)),
    activeOperationId: pending ? operationId : status === "busy" ? other : null, fencedThroughGeneration: "-1", requestedOperationId: operationId,
    operation: ["busy", "conflict", "operation_conflict"].includes(status) ? null : { operationId, state: pending ? "pending" : committed ? "committed" : "fenced",
      expectedRevision, baseGeneration, generation: String(BigInt(baseGeneration) + BigInt(1)), legacy: false, receipt: committedReceipt } } };
}

test("recovery adapter uses actual begin/v2 RPCs, captured decimal generations and retry false", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const base = "9007199254740993", expected = "9007199254740992";
  const f = fake(name => ({ data: recoveryEnvelope(name.includes("begin_") ? "started" : "committed", expected, base, name.includes("begin_") ? null : receipt(expected)), error: null }));
  const adapter = createClubOwnerAvatarPersistence(f.client, actorId);
  assert.equal((await adapter.beginOperation(beginInput(expected, base), signal())).status, "started");
  assert.equal((await adapter.publishV2({ ...publication(expected), generation: "9007199254740994" }, signal())).status, "committed");
  assert.deepEqual(f.calls.map(call => [call.name, call.args, call.retry]), [
    ["touchline_begin_club_owner_avatar_operation", { p_actor: actorId, p_operation: operationId, p_expected: expected, p_base_generation: base }, false],
    ["touchline_publish_club_owner_avatar_v2", { p_actor: actorId, p_operation: operationId, p_expected: expected, p_generation: "9007199254740994", p_digest: digest, p_key: `${actorId}/${operationId}/${digest}.webp` }, false],
  ]);
});

test("recovery adapter rejects malformed, cross-actor, fabricated legacy and inconsistent state envelopes", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const valid = recoveryEnvelope();
  const variants = [null, {}, { ...valid, version: 2 }, { ...valid, status: "absent" },
    ...[{ actorId: other }, { requestedOperationId: other }, { generation: 1 }, { generation: "01" },
      { fencedThroughGeneration: "1" }, { activeOperationId: null },
      { operation: { ...valid.snapshot.operation!, baseGeneration: null, generation: null, legacy: true } },
      { operation: { ...valid.snapshot.operation!, generation: "2" } }].map(patch => ({ ...valid, snapshot: { ...valid.snapshot, ...patch } }))];
  for (const value of variants) {
    const f = fake(() => ({ data: value, error: null }));
    assert.deepEqual(await createClubOwnerAvatarPersistence(f.client, actorId).beginOperation(beginInput(), signal()), { status: "unknown" });
    assert.equal(f.calls.length, 1);
  }
  for (const patch of [{ actorId: other }, { operationId: "bad" }, { expectedRevision: "01" }, { baseGeneration: -1 }]) {
    const f = fake(() => { assert.fail("invalid captured input must not dispatch"); });
    assert.deepEqual(await createClubOwnerAvatarPersistence(f.client, actorId).beginOperation({ ...beginInput(), ...patch } as never, signal()), { status: "unknown" });
    assert.equal(f.calls.length, 0);
  }
});

test("recovery legacy receipt preserves null generations; only explicit bound conflicts are classified", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const legacy = recoveryEnvelope("committed", "0", "0", receipt());
  Object.assign(legacy.snapshot, { generation: "0" });
  Object.assign(legacy.snapshot.operation!, { legacy: true, baseGeneration: null, generation: null });
  const f = fake(() => ({ data: legacy, error: null }));
  const result = await createClubOwnerAvatarPersistence(f.client, actorId).beginOperation(beginInput(), signal());
  assert.equal(result.status, "committed");
  if (result.status !== "unknown") assert.equal(result.snapshot.operation?.generation, null);
  for (const status of ["pending", "busy", "fenced", "conflict", "operation_conflict"]) {
    const value = recoveryEnvelope(status);
    const adapter = createClubOwnerAvatarPersistence(fake(() => ({ data: value, error: null })).client, actorId);
    assert.equal((await adapter.beginOperation(beginInput(), signal())).status, status);
  }
  for (const error of [{ message: "PRIVATE_SQL" }, {}]) {
    assert.deepEqual(await createClubOwnerAvatarPersistence(fake(() => ({ data: recoveryEnvelope("conflict"), error })).client, actorId).beginOperation(beginInput(), signal()), { status: "unknown" });
  }
});

test("recovery installed SDK treats empty HTTP 200 as unknown; real handler never reads body", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  const { handleClubOwnerAvatarUpload } = await import("../lib/touchlineArena/club-owner-avatar-upload-handler.ts");
  for (const body of ["", "null", "{}"]) {
    const requests: string[] = [];
    const client = createClient("https://avatar-test.invalid", "local-fixture-not-a-secret", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (url, init) => { requests.push(String(url)); assert.equal(init?.method, "POST"); return new Response(body, { status: 200 }); } },
    });
    const request = new Request("https://local.invalid/api/account/avatar", { method: "POST", body: new Uint8Array([1]), headers: {
      origin: "https://local.invalid", "content-type": "image/webp", "x-touchline-expected-account": actorId,
      "x-touchline-avatar-operation": operationId, "x-touchline-avatar-generation": "0", "if-match": '"0"',
    } });
    let reads = 0; const stream = request.body; Object.defineProperty(request, "body", { get: () => { reads++; return stream; } });
    const response = await handleClubOwnerAvatarUpload(request, {
      ...createClubOwnerAvatarPersistence(client, actorId), actor: async () => ({ id: actorId, allowed: true }),
      validate: async () => { assert.fail("must not decode"); }, createImmutable: async () => { assert.fail("must not create"); },
    });
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); assert.equal(reads, 0);
    assert.deepEqual(requests.map(url => url.split("/").at(-1)), ["touchline_begin_club_owner_avatar_operation"]);
  }
});

test("recovery abort/deadline after begin or publish settlement never acknowledges success", async t => {
  const { createClubOwnerAvatarPersistence } = await load(); let clock = 0;
  t.mock.method(performance, "now", () => clock);
  for (const action of ["begin", "publish"] as const) for (const interrupt of ["abort", "deadline"] as const) {
    clock = 0; const controller = new AbortController();
    const f = fake(async () => {
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { if (interrupt === "abort") controller.abort(); else clock = 10_001; })));
      return { data: recoveryEnvelope(action === "begin" ? "started" : "committed", "0", "0", action === "begin" ? null : receipt()), error: null };
    });
    const adapter = createClubOwnerAvatarPersistence(f.client, actorId);
    const result = await (action === "begin" ? adapter.beginOperation(beginInput(), controller.signal)
      : adapter.publishV2({ ...publication(), generation: "1" }, controller.signal));
    assert.deepEqual(result, { status: "unknown" }); assert.equal(f.calls.length, 1);
  }
});

test("recovery captures mutable inputs and bounds an uncooperative original promise without retry", async () => {
  const { createClubOwnerAvatarPersistence } = await load();
  let release!: (value: Reply) => void;
  const f = fake(() => new Promise<Reply>(resolve => { release = resolve; }));
  const input = beginInput();
  const pending = createClubOwnerAvatarPersistence(f.client, actorId, { timeoutMs: 5 }).beginOperation(input, signal());
  Object.assign(input, { actorId: other, operationId: other, baseGeneration: "999" });
  try { assert.deepEqual(await pending, { status: "unknown" }); }
  finally { release({ data: recoveryEnvelope(), error: null }); }
  assert.deepEqual(f.calls[0].args, { p_actor: actorId, p_operation: operationId, p_expected: "0", p_base_generation: "0" });
  assert.equal(f.calls.length, 1);
});
