import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Real adapter and real authority reducer; only the clock and fetch envelope are
// supplied by this harness. Transpilation resolves the production extensionless import.
const require = createRequire(import.meta.url);
function load(name: string): unknown {
  const filename = fileURLToPath(new URL(`../lib/touchlineArena/${name}.ts`, import.meta.url));
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports,
    require: (specifier: string) => specifier === "./golden-boot-public-authority"
      ? load("golden-boot-public-authority") : require(specifier) }, { filename });
  return loadedModule.exports;
}
const { createGoldenBootClientState: create, beginGoldenBootClientRequest: begin,
  receiveGoldenBootClientResponse: receiveResponse, failGoldenBootClientRequest: failRequest,
  tickGoldenBootClient: tick, revokeGoldenBootClient: hide } = load("golden-boot-client-state") as
    typeof import("../lib/touchlineArena/golden-boot-client-state.ts");
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const epoch = Date.parse("2026-10-01T12:00:00Z");
const ready = (revision = "90071992547409930", expires = epoch + 60_000) => ({
  status: "ready", snapshotId: id(3), revision, competitionId: id(1), seasonId: id(2),
  playerIds: [id(4), id(5)], expiresAt: new Date(expires).toISOString(), freshnessAuthority: "fetch-age-only",
});
function envelope(): { authority: ReturnType<typeof ready>; servedAtMs: number };
function envelope<T>(authority: T, servedAtMs?: number): { authority: T; servedAtMs: number };
function envelope(authority: unknown = ready(), servedAtMs = epoch) { return { authority, servedAtMs }; }
function receive(state: Parameters<typeof receiveResponse>[0], requestId: number | null,
  payload: unknown, performanceMs: number) {
  assert.ok(requestId !== null, "the response must belong to an emitted request");
  return receiveResponse(state, requestId, payload, performanceMs);
}
function fail(state: Parameters<typeof failRequest>[0], requestId: number | null, performanceMs: number) {
  assert.ok(requestId !== null, "the failure must belong to an emitted request");
  return failRequest(state, requestId, performanceMs);
}
function fetchReady() {
  const request = begin(create(), 10);
  return receive(request.state, request.requestId, envelope(), 110);
}

test("fetch-only initial state and full RTT anchor, including fractional performance times", () => {
  assert.equal(create().authority, null);
  const request = begin(create(), 10.25);
  const state = receive(request.state, request.requestId, envelope(), 110.75);
  assert.equal(state.clock?.serverNowMs, epoch + 101);
  assert.equal(state.clock?.performanceMs, 110.75);
  assert.equal(state.authority?.current?.playerIds.length, 2);
  assert.equal(tick(state, 60_009.75).authority?.current, null);
});

test("local clock never uses Date.now and an older server anchor cannot extend expiry", () => {
  const state = fetchReady();
  const request = begin(state, 1_110);
  const result = receive(request.state, request.requestId, envelope(ready(), epoch - 10_000), 1_210);
  assert.equal(result.clock?.serverNowMs, epoch + 1_200);
  assert.equal(tick(result, 60_010).authority?.current, null);
});

test("one active request, monotonic IDs, stale success/failure cannot affect a newer response", () => {
  const first = begin(create(), 0);
  const overlap = begin(first.state, 1);
  assert.equal(overlap.requestId, null);
  const second = begin(fail(overlap.state, first.requestId, 2), 3);
  assert.ok(first.requestId !== null);
  assert.equal(second.requestId, first.requestId + 1);
  const state = receive(second.state, second.requestId, envelope(), 4);
  assert.equal(receive(state, first.requestId, envelope({ ...ready(), seasonId: id(9) }), 5), state);
  assert.equal(fail(state, first.requestId, 6), state);
  assert.equal(receive(state, second.requestId, envelope(), 7), state);
});

test("transport failure, hidden visibility and expiry retain watermark and reject equal-revision replay", () => {
  for (const reason of ["failure", "hidden", "expiry"]) {
    let state = fetchReady();
    if (reason === "hidden") state = hide(state, 120);
    if (reason === "expiry") state = tick(state, 60_010);
    if (reason === "failure") {
      const pending = begin(state, 120);
      state = fail(pending.state, pending.requestId, 130);
    }
    assert.equal(state.authority?.current, null);
    assert.equal(state.authority?.watermark?.revision, ready().revision);
    const time = reason === "expiry" ? 60_020 : 140;
    const request = begin(state, time);
    state = receive(request.state, request.requestId, envelope(), time + 1);
    assert.equal(state.authority?.current, null);
  }
});

test("hidden state invalidates the pending response; a genuinely newer revision may restore", () => {
  const request = begin(fetchReady(), 120);
  const hidden = hide(request.state, 121);
  assert.equal(receive(hidden, request.requestId, envelope(), 122), hidden);
  const next = begin(hidden, 130);
  const state = receive(next.state, next.requestId, envelope(ready("90071992547409931")), 140);
  assert.ok(state.authority?.current);
});

test("explicit unavailable tombstone persists and old payload cannot restore it", () => {
  const unavailable = { ...ready("90071992547409931"), status: "unavailable", snapshotId: null,
    playerIds: [], expiresAt: null };
  let request = begin(fetchReady(), 120);
  let state = receive(request.state, request.requestId, envelope(unavailable), 130);
  assert.equal(state.authority?.current, null);
  request = begin(state, 140);
  state = receive(request.state, request.requestId, envelope(), 150);
  assert.equal(state.authority?.current, null);
  assert.equal(state.authority?.watermark?.revision, unavailable.revision);
});

test("invalid timestamps, backwards performance, excessive RTT and overlong leases fail closed", () => {
  for (const invalid of [NaN, Infinity, -1]) {
    assert.equal(begin(create(), invalid).requestId, null);
    const request = begin(create(), 0);
    assert.equal(receive(request.state, request.requestId, envelope(ready(), invalid), 1).authority, null);
    assert.equal(receive(request.state, request.requestId, envelope(), invalid).authority, null);
  }
  const backwards = begin(fetchReady(), 100);
  assert.equal(backwards.requestId, null);
  assert.equal(backwards.state.authority?.current, null);
  const request = begin(create(), 100);
  assert.equal(receive(request.state, request.requestId, envelope(), 99).authority, null);
  assert.equal(receive(request.state, request.requestId, envelope(), 5_101).authority, null);
  assert.ok(receive(request.state, request.requestId, envelope(), 5_100).authority?.current);
  assert.equal(receive(request.state, request.requestId,
    envelope(ready(undefined, epoch + 60_002)), 101).authority, null);
});

test("expired or malformed first envelope cannot establish scope; newer scope never silently replaces known one", () => {
  for (const payload of [null, {}, envelope(ready(undefined, epoch)), envelope({ ...ready(), seasonId: "bad" })]) {
    const request = begin(create(), 0);
    assert.equal(receive(request.state, request.requestId, payload, 1).authority, null);
  }
  const request = begin(fetchReady(), 120);
  const state = receive(request.state, request.requestId,
    envelope({ ...ready("90071992547409932"), seasonId: id(9) }), 130);
  assert.equal(state.authority?.seasonId, id(2));
  assert.equal(state.authority?.current, null);
  assert.equal(state.authority?.watermark?.revision, ready().revision);
});

test("timer timeout revokes without awaiting transport, and payload mutation cannot alter accepted leaders", () => {
  const request = begin(fetchReady(), 120);
  const expiredRequest = tick(request.state, 5_121);
  assert.equal(expiredRequest.pending, null);
  assert.equal(expiredRequest.authority?.current, null);
  const fresh = begin(create(), 0);
  const payload = envelope();
  const state = receive(fresh.state, fresh.requestId, payload, 1);
  payload.authority.playerIds.length = 0;
  assert.equal(state.authority?.current?.playerIds.length, 2);
});
