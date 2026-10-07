import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { validateClubOwnerAvatar } from "../lib/touchlineArena/club-owner-avatar-validation.ts";
import type { AvatarRecoveryUploadDependencies as AvatarUploadDependencies, AvatarReceipt, AvatarCurrent, AvatarRecoveryResult } from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

const load = () => import("../lib/touchlineArena/club-owner-avatar-upload-handler.ts");
const actorId = "123e4567-e89b-42d3-a456-426614174000";
const op1 = "123e4567-e89b-42d3-a456-426614174001", op2 = "123e4567-e89b-42d3-a456-426614174002";
const other = "123e4567-e89b-42d3-a456-426614174003";

test("recovery begin pending or lost acknowledgement never admits a body worker", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const lost of [false, true]) {
    const f = fixture();
    f.deps.validate = async () => { assert.fail("pending begin must not decode"); };
    Object.assign(f.deps, { beginOperation: async () => {
      f.calls.push("begin");
      if (lost) throw Error("LOST_BEGIN");
      return { status: "pending", snapshot: { version: 1, actorId, revision: "0", generation: "1", activeOperationId: op1,
        fencedThroughGeneration: "-1", requestedOperationId: op1,
        operation: { operationId: op1, state: "pending", expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt: null } } };
    } });
    const req = request(new Uint8Array([1]), op1, "0", { "x-touchline-avatar-generation": "0" });
    let reads = 0; const body = req.body; Object.defineProperty(req, "body", { get: () => { reads++; return body; } });
    const response = await handleClubOwnerAvatarUpload(req, f.deps);
    assert.equal(response.status, lost ? 503 : 409); assert.equal((await response.json()).state, "unknown");
    assert.deepEqual(f.calls, ["actor", "begin"]); assert.equal(reads, 0); assert.equal(f.objects.size, 0);
  }
});

test("recovery busy and fenced snapshots never resume body, decode or creation", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const status of ["busy", "fenced"] as const) {
    const f = fixture();
    f.deps.beginOperation = async () => { f.calls.push("begin"); return { status, snapshot: { version: 1, actorId, revision: "0",
      generation: status === "fenced" ? "2" : "1", activeOperationId: status === "busy" ? op2 : null,
      fencedThroughGeneration: status === "fenced" ? "1" : "-1", requestedOperationId: op1,
      operation: status === "busy" ? null : { operationId: op1, state: "fenced", expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt: null } } }; };
    const req = request(new Uint8Array([1])); let reads = 0;
    Object.defineProperty(req, "body", { get: () => { reads++; throw Error("must not read"); } });
    const response = await handleClubOwnerAvatarUpload(req, f.deps);
    assert.equal(response.status, 409); assert.equal((await response.json()).error, `OPERATION_${status.toUpperCase()}`);
    assert.equal(reads, 0); assert.deepEqual(f.calls, ["actor", "begin"]);
  }
});

test("recovery lost begin or cancellation at begin settlement preserves uncertainty before body", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  const f = fixture(), controller = new AbortController(), begin = f.deps.beginOperation;
  f.deps.beginOperation = async (...args) => { const result = await begin(...args); controller.abort(); return result; };
  const response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1]), op1, "0", {}, controller.signal), f.deps);
  assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
  assert.deepEqual(f.calls, ["actor", "begin"]);
  f.deps.beginOperation = begin;
  const retry = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
  assert.equal(retry.status, 409); assert.equal((await retry.json()).error, "OPERATION_PENDING");
  assert.equal(f.objects.size, 0);
});

test("recovery legacy committed replay verifies bytes and current photo without fabricating generations or writing", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const f = fixture(), bytes = Buffer.from("normalized-legacy-boundary");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const receipt = { actorId, operationId: op1, expectedRevision: "0", revision: "1", digest, objectKey: `${actorId}/${op1}/${digest}.webp`, avatarUrl: `/api/account/avatar?version=${op1}` };
  f.deps.beginOperation = async () => ({ status: "committed", snapshot: { version: 1, actorId, revision: "1", generation: "0", activeOperationId: null,
    fencedThroughGeneration: "-1", requestedOperationId: op1, operation: { operationId: op1, state: "committed", expectedRevision: "0", generation: null, baseGeneration: null, legacy: true, receipt } } });
  f.deps.validate = async () => ({ ok: true, bytes, contentType: "image/webp", width: 1, height: 1 });
  f.deps.readCurrent = async () => receipt;
  const response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
  assert.equal(response.status, 200); assert.equal((await response.json()).requiresRefresh, true);
  assert.equal(f.objects.size, 0); assert.ok(!f.calls.includes("publish"));
  f.deps.validate = async () => ({ ok: true, bytes: Buffer.from("different"), contentType: "image/webp", width: 1, height: 1 });
  const changed = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error, "OPERATION_CONFLICT");
});

test("new avatar output admission caps 128 KiB without changing the current photo or writing Storage", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const size of [128 * 1024, 128 * 1024 + 1]) {
    const f = fixture(); const before = { ...f.current() };
    // Synthetic normalized bytes isolate output admission from decoder quality.
    f.deps.validate = async () => ({ ok: true, bytes: Buffer.alloc(size, 7), contentType: "image/webp", width: 512, height: 512 });
    const response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
    if (size === 128 * 1024) {
      assert.equal(response.status, 200);
      assert.equal(f.objects.size, 1);
    } else {
      assert.equal(response.status, 422);
      const rejection = await response.json();
      assert.equal(rejection.error, "OUTPUT_TOO_LARGE");
      assert.equal(rejection.state, "unknown", "begin already persisted; rejection does not prove operation terminalization");
      assert.deepEqual(f.current(), before);
      assert.equal(f.objects.size, 0);
      assert.ok(!f.calls.includes("create"));
      assert.ok(!f.calls.includes("publish"));
      const retry = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
      assert.equal(retry.status, 409);
      assert.equal((await retry.json()).error, "OPERATION_PENDING");
      assert.deepEqual(f.current(), before);
      assert.equal(f.objects.size, 0);
    }
  }
});

test("historical committed replay above the new output cap remains verifiable for both journal generations", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const legacy of [true, false]) {
    const f = fixture(), bytes = Buffer.alloc(128 * 1024 + 1, 7);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const receipt = { actorId, operationId: op1, expectedRevision: "0", revision: "1", digest,
      objectKey: `${actorId}/${op1}/${digest}.webp`, avatarUrl: `/api/account/avatar?version=${op1}` };
    f.deps.beginOperation = async () => ({ status: "committed", snapshot: { version: 1, actorId, revision: "1",
      generation: legacy ? "0" : "2", activeOperationId: null, fencedThroughGeneration: "-1", requestedOperationId: op1,
      operation: { operationId: op1, state: "committed", expectedRevision: "0", generation: legacy ? null : "1",
        baseGeneration: legacy ? null : "0", legacy, receipt } } });
    f.deps.validate = async () => ({ ok: true, bytes, contentType: "image/webp", width: 512, height: 512 });
    f.deps.readCurrent = async () => ({ ...receipt });
    const response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).requiresRefresh, true);
    assert.equal(f.objects.size, 0);
    assert.ok(!f.calls.includes("create")); assert.ok(!f.calls.includes("publish"));
    f.deps.validate = async () => ({ ok: true, bytes: Buffer.alloc(bytes.length, 8), contentType: "image/webp", width: 512, height: 512 });
    const altered = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps);
    assert.equal(altered.status, 409);
    assert.equal((await altered.json()).error, "OPERATION_CONFLICT");
    assert.equal(f.objects.size, 0);
  }
});

test("configuration guard fences every handler stage including a committed but unacknowledged publication", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const boundary of ["actor", "beginOperation", "validate", "readCurrent", "createImmutable", "publishV2"] as const) {
    const f = fixture(); let valid = true;
    f.deps.validate = async () => { f.calls.push("validate"); return { ok: true, bytes: Buffer.from("synthetic-normalized"), contentType: "image/webp", width: 2, height: 2 }; };
    const original = f.deps[boundary];
    // A boundary double represents external settlement, never the handler's guard.
    Reflect.set(f.deps, boundary, async (...args: unknown[]) => {
      const value = await Reflect.apply(original, f.deps, args); valid = false; return value;
    });
    const response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps, {
      assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); },
    });
    assert.equal(response.status, 503, boundary); assert.equal((await response.json()).state, "unknown", boundary);
    const expected = ["actor", "begin", "validate", "read", "create", "publish"];
    assert.deepEqual(f.calls, expected.slice(0, ["actor", "beginOperation", "validate", "readCurrent", "createImmutable", "publishV2"].indexOf(boundary) + 1));
    assert.equal(f.current().revision, boundary === "publishV2" ? "1" : "0", "no rollback or automatic retry");
  }
});

test("configuration guard rejects invalid hooks before dependencies and maps body drift to 503 unknown", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const assertion of [null, "true", () => { throw Error("PRIVATE_CONFIGURATION"); }]) {
    const f = fixture(), response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1])), f.deps, { assertEnvironment: assertion as never });
    assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); let valid = true, pulls = 0, cancels = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; if (pulls > 1) { controller.close(); return; } valid = false; controller.enqueue(new Uint8Array([1])); }, cancel() { cancels++; } }, { highWaterMark: 0 });
  const req = request(new Uint8Array([1])); Object.defineProperty(req, "body", { value: body });
  const response = await handleClubOwnerAvatarUpload(req, f.deps, { assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); } });
  assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
  assert.deepEqual(f.calls, ["actor", "begin"]); assert.equal(pulls, 1); assert.equal(cancels, 1);
});

test("configuration rejection on a failed dependency is unknown while an unchanged aborted request stays 408", async () => {
  const { handleClubOwnerAvatarUpload } = await load();
  for (const drift of [false, true]) {
    const f = fixture(), controller = new AbortController(); let valid = true;
    f.deps.actor = async () => { if (drift) valid = false; controller.abort(); throw Error("PRIVATE_AUTH"); };
    const response = await handleClubOwnerAvatarUpload(request(new Uint8Array([1]), op1, "0", {}, controller.signal), f.deps, {
      assertEnvironment: () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); },
    });
    assert.equal(response.status, drift ? 503 : 408); assert.equal((await response.json()).state, drift ? "unknown" : "rejected");
    assert.deepEqual(f.calls, []);
  }
});
function request(bytes: Uint8Array, operation = op1, revision = "0", headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request("https://local.invalid/api/account/avatar", { method: "POST", body: bytes as BodyInit, signal, headers: {
    origin: "https://local.invalid", "content-type": "application/octet-stream", "x-touchline-expected-account": actorId,
    "x-touchline-avatar-operation": operation, "x-touchline-avatar-generation": String(BigInt(revision) * BigInt(2)), "if-match": `"${revision}"`, ...headers,
  } });
}
const png = () => sharp({ create: { width: 8, height: 4, channels: 3, background: "red" } }).png().toBuffer();
// An explicitly in-memory adapter model, NOT evidence of DB atomicity/RLS or
// Storage persistence. It lets the real handler's orchestration be tested.
function fixture() {
  let current: AvatarCurrent = { actorId, revision: "0", avatarUrl: "/old-photo.webp", operationId: null, digest: null };
  const receipts = new Map<string, AvatarReceipt>(); const calls: string[] = []; const objects = new Map<string, Buffer>();
  let generation = "0";
  const journal = new Map<string, { expectedRevision: string; baseGeneration: string; generation: string; state: "pending" | "committed" | "fenced" }>();
  const outcome = (status: Exclude<AvatarRecoveryResult["status"], "unknown">, operationId: string): AvatarRecoveryResult => {
    const op = journal.get(operationId), receipt = receipts.get(operationId) ?? null;
    return { status, snapshot: { version: 1, actorId, revision: current.revision, generation,
      activeOperationId: [...journal].find(([, value]) => value.state === "pending")?.[0] ?? null,
      fencedThroughGeneration: "-1", requestedOperationId: operationId,
      operation: op ? { operationId, ...op, legacy: false, receipt } : receipt ? { operationId, expectedRevision: receipt.expectedRevision,
        baseGeneration: null, generation: null, legacy: true, state: "committed", receipt } : null } };
  };
  const deps: AvatarUploadDependencies = {
    actor: async () => { calls.push("actor"); return { id: actorId, allowed: true }; },
    validate: async bytes => { calls.push("validate"); return validateClubOwnerAvatar(bytes); },
    readCurrent: async () => { calls.push("read"); return { ...current }; },
    beginOperation: async input => {
      calls.push("begin");
      const prior = journal.get(input.operationId);
      if (prior) return outcome(prior.expectedRevision === input.expectedRevision && prior.baseGeneration === input.baseGeneration ? prior.state : "operation_conflict", input.operationId);
      if (receipts.has(input.operationId)) return outcome("committed", input.operationId);
      if (current.revision !== input.expectedRevision || generation !== input.baseGeneration) return outcome("conflict", input.operationId);
      if ([...journal.values()].some(value => value.state === "pending")) return outcome("busy", input.operationId);
      generation = String(BigInt(generation) + BigInt(1));
      journal.set(input.operationId, { expectedRevision: input.expectedRevision, baseGeneration: input.baseGeneration, generation, state: "pending" });
      return outcome("started", input.operationId);
    },
    createImmutable: async input => { calls.push("create");
      const stored = objects.get(input.objectKey); if (stored && !stored.equals(input.bytes)) throw Error("immutable-conflict");
      objects.set(input.objectKey, Buffer.from(input.bytes)); return { objectKey: input.objectKey, digest: input.digest };
    },
    publishV2: async input => { calls.push("publish");
      const op = journal.get(input.operationId)!;
      if (current.revision !== input.expectedRevision || op.state !== "pending" || op.generation !== input.generation) return outcome("conflict", input.operationId);
      const receipt = { actorId, operationId: input.operationId, expectedRevision: input.expectedRevision, digest: input.digest, objectKey: input.objectKey,
        revision: String(BigInt(current.revision) + BigInt(1)), avatarUrl: `/api/account/avatar?version=${input.operationId}` };
      receipts.set(input.operationId, receipt); current = receipt; op.state = "committed"; generation = String(BigInt(generation) + BigInt(1));
      return outcome("committed", input.operationId);
    },
  };
  return { deps, calls, receipts, objects, current: () => current };
}

test("real bytes are normalized before immutable create and CAS; response acknowledges commit, requires refresh", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const f = fixture(); const bytes = await png();
  const response = await handleClubOwnerAvatarUpload(request(bytes), f.deps); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.state, "committed"); assert.equal(body.requiresRefresh, true);
  assert.equal(body.accountId, actorId); assert.equal(body.revision, "1"); assert.equal(body.operationId, op1);
  assert.deepEqual(f.calls, ["actor", "begin", "validate", "read", "create", "publish"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const [key, value] = [...f.objects][0]; assert.equal((await sharp(value).metadata()).format, "webp");
  assert.equal(key, `${actorId}/${op1}/${createHash("sha256").update(value).digest("hex")}.webp`);
  assert.doesNotMatch(JSON.stringify(body), /objectKey|digest|old-photo|PRIVATE/);
});

test("origin/auth/account mismatch and invalid content never create objects or publish", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const bytes = await png();
  for (const kind of ["origin", "anonymous", "forbidden", "account", "invalid"] as const) {
    const f = fixture();
    if (kind === "anonymous") f.deps.actor = async () => null;
    if (kind === "forbidden") f.deps.actor = async () => ({ id: actorId, allowed: false });
    if (kind === "account") f.deps.actor = async () => ({ id: other, allowed: true });
    const response = await handleClubOwnerAvatarUpload(request(kind === "invalid" ? new Uint8Array([1]) : bytes, op1, "0", kind === "origin" ? { origin: "https://evil.invalid" } : {}), f.deps);
    assert.equal(response.status, { origin: 403, anonymous: 401, forbidden: 403, account: 409, invalid: 422 }[kind]);
    assert.equal(f.objects.size, 0); assert.equal(f.current().avatarUrl, "/old-photo.webp");
    if (kind !== "invalid") assert.ok(!f.calls.includes("validate"));
    else assert.equal((await response.json()).state, "unknown", "invalid bytes do not erase pending journal state");
  }
});

test("stale revision conflicts without rebasing; same operation with changed digest cannot claim success", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const f = fixture(); const bytes = await png();
  assert.equal((await handleClubOwnerAvatarUpload(request(bytes), f.deps)).status, 200);
  const old = f.current();
  assert.equal((await handleClubOwnerAvatarUpload(request(bytes, op2), f.deps)).status, 409);
  const changed = await sharp({ create: { width: 8, height: 4, channels: 3, background: "blue" } }).png().toBuffer();
  const conflict = await handleClubOwnerAvatarUpload(request(changed), f.deps);
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error, "OPERATION_CONFLICT");
  assert.deepEqual(f.current(), old); assert.equal(f.objects.size, 1);
});

test("two uploads at the same base revision: late publish cannot overwrite the winner", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const f = fixture(); const bytes = await png();
  let release!: () => void, arrived!: () => void;
  const ready = new Promise<void>(resolve => { arrived = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  const publish = f.deps.publishV2;
  f.deps.publishV2 = async (input, signal) => { if (input.operationId === op1) { arrived(); await gate; } return publish(input, signal); };
  const pending = handleClubOwnerAvatarUpload(request(bytes, op1), f.deps); await ready;
  assert.equal((await handleClubOwnerAvatarUpload(request(bytes, op2), f.deps)).status, 409);
  release(); assert.equal((await pending).status, 200);
  assert.equal(f.current().operationId, op1); assert.equal(f.current().revision, "1");
  assert.equal(f.objects.size, 1, "only the admitted worker creates an object");
});

test("lost commit acknowledgement is uncertain; retry with same operation reconciles without another create/CAS", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const f = fixture(); const bytes = await png(); const publish = f.deps.publishV2;
  f.deps.publishV2 = async (...args) => { await publish(...args); throw Error("PRIVATE_SERVER_DETAILS"); };
  const response = await handleClubOwnerAvatarUpload(request(bytes), f.deps);
  assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown"); assert.equal(f.current().revision, "1");
  const before = f.calls.filter(call => call === "create" || call === "publish");
  assert.equal((await handleClubOwnerAvatarUpload(request(bytes), f.deps)).status, 200);
  assert.deepEqual(f.calls.filter(call => call === "create" || call === "publish"), before);
  f.deps.publishV2 = publish; assert.equal((await handleClubOwnerAvatarUpload(request(bytes, op2, "1"), f.deps)).status, 200);
  const old = await handleClubOwnerAvatarUpload(request(bytes), f.deps); assert.equal(old.status, 409); assert.equal((await old.json()).error, "OPERATION_SUPERSEDED");
});

test("deadline/cancel stops waiting but never claims to stop decoder or roll back a started write", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const bytes = await png();
  const stalled = fixture(); let decodeFinished = false;
  stalled.deps.validate = async () => { await new Promise(resolve => setTimeout(resolve, 35)); decodeFinished = true; return validateClubOwnerAvatar(bytes); };
  const early = await handleClubOwnerAvatarUpload(request(bytes), stalled.deps, { totalTimeoutMs: 10 });
  assert.equal(early.status, 503); assert.equal((await early.json()).state, "unknown");
  await new Promise(resolve => setTimeout(resolve, 45)); assert.equal(decodeFinished, true); assert.equal(stalled.objects.size, 0);
  const f = fixture(); const controller = new AbortController(); const publish = f.deps.publishV2;
  f.deps.publishV2 = async (...args) => { const result = await publish(...args); controller.abort(); return result; };
  const late = await handleClubOwnerAvatarUpload(request(bytes, op1, "0", {}, controller.signal), f.deps);
  assert.equal(late.status, 503); assert.equal((await late.json()).state, "unknown"); assert.equal(f.current().revision, "1");
});

test("untrusted adapter receipts and create acknowledgements fail closed without deletion", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const bytes = await png();
  for (const patch of [{ actorId: other }, { operationId: op2 }, { revision: "0" }, { revision: "2" }, { digest: "wrong" }, { avatarUrl: "https://evil.invalid/photo" }]) {
    const f = fixture(); const publish = f.deps.publishV2;
    f.deps.publishV2 = async (...args) => { const result = await publish(...args); if (result.status !== "committed") assert.fail("fixture commit required"); return { ...result, snapshot: { ...result.snapshot, operation: { ...result.snapshot.operation!, receipt: { ...result.snapshot.operation!.receipt!, ...patch } } } }; };
    const response = await handleClubOwnerAvatarUpload(request(bytes), f.deps); assert.equal(response.status, 503); assert.equal((await response.json()).state, "unknown");
    assert.equal(f.objects.size, 1);
  }
  const f = fixture(); f.deps.createImmutable = async () => ({ objectKey: "other/key", digest: "wrong" });
  assert.equal((await handleClubOwnerAvatarUpload(request(bytes), f.deps)).status, 503); assert.ok(!f.calls.includes("publish"));
});

test("missing operation acknowledgement is not absence, and synchronous work cannot bypass the deadline", async () => {
  const { handleClubOwnerAvatarUpload } = await load(); const bytes = await png();
  const f = fixture(); f.deps.beginOperation = async () => undefined as unknown as AvatarRecoveryResult;
  const unconfirmed = await handleClubOwnerAvatarUpload(request(bytes), f.deps);
  assert.equal(unconfirmed.status, 503); assert.equal((await unconfirmed.json()).state, "unknown"); assert.equal(f.objects.size, 0);
  const late = fixture(); late.deps.actor = async () => {
    const end = performance.now() + 8; while (performance.now() < end) { /* Deliberately starve timers to exercise the monotonic check. */ }
    return { id: actorId, allowed: true };
  };
  assert.equal((await handleClubOwnerAvatarUpload(request(bytes), late.deps, { totalTimeoutMs: 2 })).status, 408);
  assert.deepEqual(late.calls, []); assert.equal(late.objects.size, 0);
});

for (const path of ["publish", "replay"] as const) {
  for (const interrupt of ["abort", "deadline"] as const) {
    test(`${path}: ${interrupt} between final step and settlement cannot acknowledge success or roll back`, async t => {
      const { handleClubOwnerAvatarUpload } = await load(); const bytes = await png(); const f = fixture();
      if (path === "replay") assert.equal((await handleClubOwnerAvatarUpload(request(bytes), f.deps)).status, 200);
      const controller = new AbortController(); let clock = 0, interrupted = false;
      t.mock.method(performance, "now", () => clock);
      const interruptSettlement = () => {
        // Cross awaitAvatarStep's resolution and step's guard, then interrupt
        // before the handler continuation creates its committed response.
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => {
          interrupted = true;
          if (interrupt === "abort") controller.abort(); else clock = 30_001;
        })));
      };
      if (path === "publish") {
        const publish = f.deps.publishV2;
        f.deps.publishV2 = (...args) => { const result = publish(...args); interruptSettlement(); return result; };
      } else {
        const read = f.deps.readCurrent;
        f.deps.readCurrent = (...args) => { const result = read(...args); interruptSettlement(); return result; };
      }
      const response = await handleClubOwnerAvatarUpload(request(bytes, op1, "0", {}, controller.signal), f.deps);
      assert.equal(interrupted, true);
      assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false, state: "unknown", error: "UPLOAD_UNCONFIRMED" });
      assert.equal(f.current().revision, "1"); assert.equal(f.current().operationId, op1);
      assert.equal(f.receipts.size, 1); assert.equal(f.objects.size, 1);
      assert.equal(f.calls.filter(call => call === "create").length, 1);
      assert.equal(f.calls.filter(call => call === "publish").length, 1);
    });
  }
}

for (const mode of ["raw", "normalized"] as const) test(`transport ${mode} excess stops before Storage/publication but retains begin uncertainty`, async () => {
  const { handleClubOwnerAvatarUpload } = await load();
    const f = fixture();
    f.deps.validate = async () => {
      f.calls.push("validate");
      return { ok: true, bytes: Buffer.alloc(mode === "normalized" ? 4_000_001 : 20), contentType: "image/webp", width: 8, height: 4 };
    };
    const response = await handleClubOwnerAvatarUpload(request(new Uint8Array(mode === "raw" ? 4_000_001 : 1)), f.deps);
    assert.equal(response.status, mode === "raw" ? 413 : 503);
    assert.deepEqual(await response.json(), mode === "raw"
      ? { ok: false, state: "unknown", error: "TOO_LARGE" }
      : { ok: false, state: "unknown", error: "VALIDATION_UNCONFIRMED" });
    assert.deepEqual(f.calls, mode === "raw" ? ["actor", "begin"] : ["actor", "begin", "validate"]);
    assert.equal(f.objects.size, 0); assert.equal(f.receipts.size, 0);
    assert.equal(f.current().avatarUrl, "/old-photo.webp");
});
