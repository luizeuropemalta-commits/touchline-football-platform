import assert from "node:assert/strict";
import test from "node:test";

const load = () => import("../lib/touchlineArena/club-owner-avatar-upload-contract.ts");
const account = "123e4567-e89b-42d3-a456-426614174000";
const operation = "123e4567-e89b-42d3-a456-426614174001";

test("control status validates nullable identity and idle fencing never proves readiness", async () => {
  const mod = await load();
  const idle = { version: 1, actorId: account, revision: "0", generation: "0", activeOperationId: null,
    fencedThroughGeneration: "-1", requestedOperationId: null, operation: null };
  assert.deepEqual(mod.parseAvatarOperationStatus(idle, account, null), idle);
  for (const patch of [{ actorId: operation }, { generation: 0 }, { generation: "01" }, { fencedThroughGeneration: "0" },
    { requestedOperationId: operation }, { activeOperationId: operation }, { operation: {} }]) {
    assert.throws(() => mod.parseAvatarOperationStatus({ ...idle, ...patch }, account, null));
  }
  const fence = { version: 1, status: "barrier_applied", snapshot: { ...idle, generation: "1", fencedThroughGeneration: "0" } };
  const input = { actorId: account, generation: "0", expectedActiveOperationId: null };
  assert.equal(mod.parseAvatarFenceResult(fence, input).status, "barrier_applied");
  assert.throws(() => mod.parseAvatarFenceResult({ ...fence, snapshot: idle }, input));
  assert.throws(() => mod.parseAvatarFenceResult({ ...fence, status: "ready" }, input));
});

test("configuration guard captures its assertion and latches failure even after restoration", async () => {
  const { createAvatarEnvironmentGuard } = await load();
  let valid = true, calls = 0;
  const guard = createAvatarEnvironmentGuard(() => { calls++; if (!valid) throw Error("PRIVATE_CONFIGURATION"); });
  guard(); valid = false; assert.throws(guard, /AVATAR_CONFIGURATION_CHANGED/);
  valid = true; assert.throws(guard, /AVATAR_CONFIGURATION_CHANGED/); assert.equal(calls, 2);
  createAvatarEnvironmentGuard()();
  for (const value of [null, false, "true", {}]) assert.throws(createAvatarEnvironmentGuard(value as never), /AVATAR_CONFIGURATION_CHANGED/);
});

test("configuration guard stops the next body chunk and propagates unavailable, not invalid_body", async () => {
  const { readAvatarUploadBody } = await load();
  let valid = true, pulls = 0, cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    pulls++; if (pulls > 1) { controller.close(); return; } valid = false; controller.enqueue(new Uint8Array([1]));
  }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  await assert.rejects(readAvatarUploadBody(request(stream), undefined, undefined, () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); }), /AVATAR_CONFIGURATION_CHANGED/);
  assert.equal(pulls, 1); assert.equal(cancelled, 1);
  let accessed = 0;
  const untouched = request(); Object.defineProperty(untouched, "body", { get: () => { accessed++; return null; } });
  await assert.rejects(readAvatarUploadBody(untouched, undefined, undefined, null as never), /AVATAR_CONFIGURATION_CHANGED/);
  assert.equal(accessed, 0);
});

test("configuration rejection at a failed body await remains unavailable instead of invalid_body", async () => {
  const { readAvatarUploadBody } = await load(); let valid = true;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { valid = false; controller.error(Error("PRIVATE_BODY")); } }, { highWaterMark: 0 });
  await assert.rejects(readAvatarUploadBody(request(stream), undefined, undefined, () => { if (!valid) throw Error("PRIVATE_CONFIGURATION"); }), /AVATAR_CONFIGURATION_CHANGED/);
});
function request(body: BodyInit | null = new Uint8Array([1]), extra: Record<string, string> = {}) {
  return new Request("https://local.invalid/api/account/avatar", { method: "POST", body, headers: {
    origin: "https://local.invalid", "sec-fetch-site": "same-origin", "content-type": "application/octet-stream",
    "x-touchline-expected-account": account, "x-touchline-avatar-operation": operation, "x-touchline-avatar-generation": "0", "if-match": '"0"', ...extra,
  }, duplex: "half" } as RequestInit);
}

test("recovery generation is mandatory, canonical and never inferred from revision", async () => {
  const { parseAvatarUploadRequest } = await load();
  for (const value of [undefined, "", "01", "-1", "1.0", "1e2", "9223372036854775808"]) {
    const req = request(); req.headers.delete("x-touchline-avatar-generation");
    if (value !== undefined) req.headers.set("x-touchline-avatar-generation", value);
    assert.deepEqual(parseAvatarUploadRequest(req), { ok: false, status: 428, error: "VALID_GENERATION_REQUIRED" });
  }
  for (const value of ["0", "9007199254740993", "9223372036854775807"]) {
    const result = parseAvatarUploadRequest(request(null, { "x-touchline-avatar-generation": value }));
    assert.equal(result.ok, true); if (result.ok) assert.equal((result as unknown as { baseGeneration: string }).baseGeneration, value);
  }
});

test("request contract requires exact same-origin context, account, operation and strong monotonic revision", async () => {
  const mod = await load();
  assert.deepEqual(mod.parseAvatarUploadRequest(request()), { ok: true, accountId: account, operationId: operation, expectedRevision: "0", baseGeneration: "0" });
  const patches: Record<string, string>[] = [
    { origin: "https://other.invalid" }, { origin: "" }, { "sec-fetch-site": "cross-site" },
    { "x-touchline-expected-account": "" }, { "x-touchline-avatar-operation": "not-uuid" },
    { "if-match": "0" }, { "if-match": 'W/"0"' }, { "if-match": '"-1"' }, { "if-match": '"01"' },
    { "if-match": '"9223372036854775807"' }, { "content-encoding": "gzip" }, { "content-type": "multipart/form-data; boundary=x" },
  ];
  for (const patch of patches) assert.equal(mod.parseAvatarUploadRequest(request(null, patch)).ok, false, JSON.stringify(patch));
  assert.equal(mod.parseAvatarUploadRequest(new Request("https://local.invalid", { method: "GET" })).ok, false);
});

test("transport caps actual bytes at 4,000,000 even with absent/lying Content-Length; boundary is inclusive", async () => {
  const { readAvatarUploadBody } = await load();
  let cancelled = false, pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(new Uint8Array(4_000_000));
    else if (pulls === 2) controller.enqueue(new Uint8Array([1]));
    else controller.close();
  }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const result = await readAvatarUploadBody(request(stream, { "content-length": "1" }));
  assert.deepEqual(result, { ok: false, error: "too_large" }); assert.equal(cancelled, true);
  for (const size of [3_999_999, 4_000_000]) {
    const declaredHeaders: Record<string, string>[] = [{}, { "content-length": String(size) }];
    for (const extra of declaredHeaders) {
      const exact = await readAvatarUploadBody(request(new Uint8Array(size), extra));
      assert.ok(exact.ok); assert.equal(exact.bytes.length, size);
    }
  }
  let declaredCancelled = false;
  const declared = new ReadableStream<Uint8Array>({ cancel() { declaredCancelled = true; } });
  assert.deepEqual(await readAvatarUploadBody(request(declared, { "content-length": "4000001" })), { ok: false, error: "too_large" });
  assert.equal(declaredCancelled, true);
  assert.deepEqual(await readAvatarUploadBody(request(new Uint8Array(4_000_001))), { ok: false, error: "too_large" });
  for (const length of ["-1", "1.5", "NaN", "5e6"]) assert.deepEqual(await readAvatarUploadBody(request(null, { "content-length": length })), { ok: false, error: "invalid_length" });
  assert.deepEqual(await readAvatarUploadBody(request(null, { "content-length": String(4_000_000 + 1) })), { ok: false, error: "too_large" });
  assert.deepEqual(await readAvatarUploadBody(request(new Uint8Array([1]), { "content-length": "2" })), { ok: false, error: "length_mismatch" });
});

test("stalled read, external abort and stream failure settle without awaiting a hostile cancel promise", async () => {
  const { readAvatarUploadBody } = await load();
  let cancels = 0;
  const stalled = () => new ReadableStream<Uint8Array>({ cancel() { cancels++; return new Promise(() => {}); } });
  assert.deepEqual(await readAvatarUploadBody(request(stalled()), undefined, 15), { ok: false, error: "body_timeout" });
  const controller = new AbortController(); const pending = readAvatarUploadBody(request(stalled()), controller.signal);
  controller.abort(); assert.deepEqual(await pending, { ok: false, error: "aborted" }); assert.equal(cancels, 2);
  assert.deepEqual(await readAvatarUploadBody(request(new ReadableStream({ start(controller) { controller.error(Error("PRIVATE")); } }))), { ok: false, error: "invalid_body" });
  assert.deepEqual(await readAvatarUploadBody(request(new Uint8Array())), { ok: false, error: "empty" });
});

test("stream chunks are snapshotted and no string/form-data/URL parser is involved", async () => {
  const { readAvatarUploadBody } = await load();
  const chunk = new Uint8Array([1, 2]); let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(chunk); else { chunk.fill(9); controller.close(); }
  } }, { highWaterMark: 0 });
  const result = await readAvatarUploadBody(request(stream)); assert.ok(result.ok); assert.deepEqual([...result.bytes], [1, 2]);
});

test("immediately-ready empty chunks cannot starve the wall deadline; locked body is structured failure", async () => {
  const { readAvatarUploadBody } = await load(); let cancelled = false;
  const source = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array()); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  assert.deepEqual(await readAvatarUploadBody(request(source), undefined, 5), { ok: false, error: "body_timeout" });
  assert.equal(cancelled, true);
  const locked = request(new Uint8Array([1])); const reader = locked.body!.getReader();
  assert.deepEqual(await readAvatarUploadBody(locked), { ok: false, error: "invalid_body" }); await reader.cancel(); reader.releaseLock();
});
