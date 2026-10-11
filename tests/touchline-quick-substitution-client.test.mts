import assert from "node:assert/strict";
import test from "node:test";
import { createTouchlineQuickSubstitutionClient, parseQuickSubSnapshot } from "../lib/touchlineArena/quick-substitution-client.ts";

const id = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
function server(count = 0) {
  const starting = Array.from({ length: 11 }, (_, index) => id(index + 1));
  const bench = Array.from({ length: 9 }, (_, index) => id(index + 12));
  const active = [...starting];
  const events = Array.from({ length: count }, (_, index) => {
    active[index] = bench[index];
    return { command_id: id(200 + index), user_id: id(101), actor_id: id(101), expected_revision: index,
      resulting_revision: index + 1, expected_roster_revision: "a".repeat(64),
      outgoing_inventory_id: starting[index], incoming_inventory_id: bench[index] };
  });
  return { ok: true, session: { id: id(100), user_id: id(101), fixture_id: id(102), gameweek_id: id(103),
    roster_revision: "a".repeat(64), revision: count, starting_inventory_ids: starting, bench_inventory_ids: bench,
    active_inventory_ids: active, available_bench_inventory_ids: bench.slice(count), substituted_out_inventory_ids: starting.slice(0, count) }, events };
}
function applied(count = 1, status = "applied") {
  const data = server(count);
  return { ok: true, result: { status, session: data.session, event: data.events[count - 1] } };
}
type Step = { method: "GET" | "POST"; payload?: unknown; status?: number; fail?: boolean; wait?: Promise<void>; raw?: string };
function client(steps: Step[]) {
  let generated = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport = createTouchlineQuickSubstitutionClient({
    providerFixtureId: "19722190",
    createCommandId: () => id(200 + generated++),
    fetch: async (input, init = {}) => {
      const step = steps.shift();
      assert.ok(step, `unexpected request ${String(input)}`);
      assert.equal(init.method, step.method);
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.cache, "no-store");
      calls.push({ url: String(input), init });
      if (step.wait) await step.wait;
      if (step.fail) throw new Error("synthetic private transport error");
      if (step.raw !== undefined) return new Response(step.raw, { status: step.status ?? 200 });
      return Response.json(step.payload, { status: step.status ?? 200 });
    },
  });
  return { transport, calls, generated: () => generated, done: () => assert.equal(steps.length, 0) };
}

test("strict snapshots accept initial and all nine server substitutions without exposing extra fields", () => {
  for (const count of [0, 1, 9]) {
    const raw = server(count);
    const snapshot = parseQuickSubSnapshot({ ...raw, server_secret: "private" });
    assert.ok(snapshot);
    assert.equal(snapshot.session.revision, count);
    assert.equal(snapshot.events.length, count);
    assert.equal(snapshot.session.activeInventoryIds.length, 11);
    assert.equal(snapshot.session.availableBenchInventoryIds.length, 9 - count);
    assert.equal(snapshot.session.substitutedOutInventoryIds.length, count);
    assert.equal(JSON.stringify(snapshot).includes("private"), false);
    assert.ok(Object.isFrozen(snapshot.session.activeInventoryIds));
    assert.throws(() => (snapshot.events as unknown[]).push({}));
  }
});

test("invalid identity, partition, revision and incomplete histories fail closed", () => {
  const cases: Array<(raw: ReturnType<typeof server>) => void> = [
    (raw) => { raw.session.id = "not-a-uuid"; },
    (raw) => { raw.session.gameweek_id = "not-a-uuid"; },
    (raw) => { raw.session.roster_revision = ""; },
    (raw) => { raw.session.revision = 10; },
    (raw) => { raw.session.revision = 1.5; },
    (raw) => { raw.session.active_inventory_ids[0] = raw.session.active_inventory_ids[1]; },
    (raw) => { raw.session.available_bench_inventory_ids[0] = id(999); },
    (raw) => { raw.events.pop(); },
    (raw) => { raw.events.reverse(); },
    (raw) => { raw.events[1].command_id = raw.events[0].command_id; },
    (raw) => { raw.events[1].actor_id = id(999); },
    (raw) => { raw.events[1].user_id = id(999); },
    (raw) => { raw.events[1].expected_roster_revision = "b".repeat(64); },
    (raw) => { raw.events[1].resulting_revision = 3; },
    (raw) => { raw.events[1].incoming_inventory_id = id(1); },
    (raw) => { raw.session.active_inventory_ids.reverse(); },
  ];
  for (const change of cases) { const raw = server(2); change(raw); assert.equal(parseQuickSubSnapshot(raw), null); }
  assert.equal(parseQuickSubSnapshot({ ...server(), ok: false }), null);
});

test("load reads the provider-keyed session and preserves the last verified snapshot on bad responses", async () => {
  const run = client([{ method: "GET", payload: server(1) }, { method: "GET", payload: server(0) }, { method: "GET", raw: "bad-json" }]);
  assert.equal((await run.transport.load()).status, "ready");
  const before = run.transport.getSnapshot().snapshot;
  assert.equal(run.calls[0].url, "/api/touchline-arena/quick-substitution/session?providerFixtureId=19722190");
  assert.deepEqual(await run.transport.load(), { status: "rejected", reason: "invalid_response" });
  assert.equal((await run.transport.load()).status, "rejected");
  assert.equal(run.transport.getSnapshot().snapshot, before);
  run.done();
});

test("the controller refuses a different owner or fixture after its first verified session", async () => {
  for (const field of ["user_id", "fixture_id", "gameweek_id", "id"] as const) {
    const wrong = server(); wrong.session[field] = id(999);
    const run = client([{ method: "GET", payload: server() }, { method: "GET", payload: wrong }]);
    await run.transport.load();
    assert.deepEqual(await run.transport.load(), { status: "rejected", reason: "invalid_response" });
  }
});

test("substitution is never optimistic and overlapping commands never generate another ID", async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const run = client([{ method: "GET", payload: server() }, { method: "POST", payload: applied(), wait }, { method: "GET", payload: server(1) }]);
  await run.transport.load();
  const before = run.transport.getSnapshot().snapshot;
  const change = run.transport.substitute(id(1), id(12));
  assert.equal(run.transport.getSnapshot().snapshot, before);
  assert.equal(run.transport.getSnapshot().pending?.kind, "event");
  assert.deepEqual(await run.transport.substitute(id(2), id(13)), { status: "busy" });
  assert.equal(run.generated(), 1);
  release();
  const result = await change;
  assert.equal(result.status, "applied");
  assert.equal(run.transport.getSnapshot().snapshot?.session.revision, 1);
  assert.equal(run.transport.getSnapshot().pending, null);
  assert.equal(run.calls[1].url, "/api/touchline-arena/quick-substitution/event");
  assert.deepEqual(JSON.parse(String(run.calls[1].init.body)), { sessionId: id(100), commandId: id(200), expectedRevision: 0,
    expectedRosterRevision: "a".repeat(64), outgoingInventoryId: id(1), incomingInventoryId: id(12) });
  run.done();
});

test("a lost POST response is recovered by the exact command in a complete GET history", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", payload: server(1) }]);
  await run.transport.load();
  assert.equal((await run.transport.substitute(id(1), id(12))).status, "recovered");
  assert.equal(run.transport.getSnapshot().pending, null);
  assert.equal(run.generated(), 1);
  run.done();
});

test("uncertain retries preserve the exact command body and never silently replace the command", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", payload: server() },
    { method: "GET", payload: server() }, { method: "POST", payload: applied(1, "replayed") }, { method: "GET", payload: server(1) }]);
  await run.transport.load();
  assert.equal((await run.transport.substitute(id(1), id(12))).status, "uncertain");
  const original = run.transport.getSnapshot().pending;
  assert.deepEqual(await run.transport.substitute(id(2), id(13)), { status: "rejected", reason: "command_pending" });
  assert.equal(run.transport.getSnapshot().pending, original);
  assert.equal((await run.transport.retry()).status, "replayed");
  assert.equal(run.generated(), 1);
  const posts = run.calls.filter((call) => call.init.method === "POST");
  assert.equal(posts.length, 2);
  assert.equal(posts[0].init.body, posts[1].init.body);
  run.done();
});

test("retry first checks GET and does not POST when the original command has appeared", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", fail: true },
    { method: "GET", payload: server(1) }]);
  await run.transport.load();
  assert.equal((await run.transport.substitute(id(1), id(12))).status, "uncertain");
  assert.equal((await run.transport.retry()).status, "recovered");
  assert.equal(run.calls.filter((call) => call.init.method === "POST").length, 1);
  run.done();
});

test("a different command or incomplete read cannot confirm a lost POST", async () => {
  for (const malformed of [false, true]) {
    const other = server(1);
    if (malformed) other.events = [];
    else other.events[0].command_id = id(999);
    const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", payload: other }]);
    await run.transport.load();
    assert.equal((await run.transport.substitute(id(1), id(12))).status, "uncertain");
    assert.ok(run.transport.getSnapshot().pending);
    assert.equal(run.generated(), 1);
  }
});

test("an acknowledged POST without a complete GET is still uncertain", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", payload: applied() }, { method: "GET", fail: true }]);
  await run.transport.load();
  assert.equal((await run.transport.substitute(id(1), id(12))).status, "uncertain");
  assert.equal(run.transport.getSnapshot().snapshot?.session.revision, 0);
  assert.ok(run.transport.getSnapshot().pending);
});

test("a structured rejection with complete non-application proof clears the pending command", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", status: 409, payload: { ok: false, error: "TL_QUICK_SUB_MATCH_NOT_LIVE" } },
    { method: "GET", payload: server() }]);
  await run.transport.load();
  assert.deepEqual(await run.transport.substitute(id(1), id(12)), { status: "rejected", reason: "http_error", httpStatus: 409 });
  assert.equal(run.transport.getSnapshot().pending, null);
  assert.equal(run.transport.getSnapshot().snapshot?.session.revision, 0);
});

test("a rejected retry cannot forget an earlier POST whose response was lost", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", payload: server() },
    { method: "GET", payload: server() }, { method: "POST", status: 403, payload: { ok: false, error: "TL_QUICK_SUB_ORIGIN_FORBIDDEN" } },
    { method: "GET", payload: server() }, { method: "GET", payload: server(1) }]);
  await run.transport.load();
  assert.equal((await run.transport.substitute(id(1), id(12))).status, "uncertain");
  const pending = run.transport.getSnapshot().pending;
  assert.equal((await run.transport.retry()).status, "uncertain");
  assert.equal(run.transport.getSnapshot().pending, pending);
  assert.deepEqual(await run.transport.substitute(id(2), id(13)), { status: "rejected", reason: "command_pending" });
  assert.equal((await run.transport.load()).status, "recovered");
  assert.equal(run.generated(), 1);
  run.done();
});

test("matching command_id with a different command payload cannot confirm recovery", async () => {
  const wrong = server(1);
  wrong.events[0].outgoing_inventory_id = id(2);
  wrong.events[0].incoming_inventory_id = id(13);
  wrong.session.active_inventory_ids[0] = id(1);
  wrong.session.active_inventory_ids[1] = id(13);
  wrong.session.substituted_out_inventory_ids = [id(2)];
  wrong.session.available_bench_inventory_ids = server().session.bench_inventory_ids.filter((value) => value !== id(13));
  assert.ok(parseQuickSubSnapshot(wrong), "the conflicting command is independently valid server history");
  const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", payload: wrong }]);
  await run.transport.load();
  assert.equal((await run.transport.substitute(id(1), id(12))).status, "uncertain");
  assert.equal(run.transport.getSnapshot().snapshot?.session.revision, 0);
  assert.ok(run.transport.getSnapshot().pending);
});

test("unavailable recovery reads retain pending identity without resending or generating commands", async () => {
  const run = client([{ method: "GET", payload: server() }, { method: "POST", fail: true }, { method: "GET", fail: true }, { method: "GET", fail: true }]);
  await run.transport.load();
  await run.transport.substitute(id(1), id(12));
  const pending = run.transport.getSnapshot().pending;
  assert.equal((await run.transport.retry()).status, "uncertain");
  assert.equal(run.transport.getSnapshot().pending, pending);
  assert.equal(run.calls.filter((call) => call.init.method === "POST").length, 1);
  assert.equal(run.generated(), 1);
  run.done();
});

test("start validates exactly nine unique bench IDs and confirms only through GET", async () => {
  const run = client([{ method: "POST", payload: { ok: true, session: server().session } }, { method: "GET", payload: server() }]);
  assert.deepEqual(await run.transport.start([id(12)]), { status: "rejected", reason: "invalid_input" });
  assert.equal(run.calls.length, 0);
  const bench = server().session.bench_inventory_ids;
  assert.equal((await run.transport.start(bench)).status, "started");
  assert.deepEqual(JSON.parse(String(run.calls[0].init.body)), { providerFixtureId: "19722190", benchInventoryIds: bench });
  assert.equal(run.generated(), 0);
  run.done();
});

test("lost start responses retain an immutable body and retry after an absent read", async () => {
  const absent = { ok: false, error: "TL_QUICK_SUB_SESSION_NOT_FOUND" };
  const run = client([{ method: "POST", fail: true }, { method: "GET", payload: absent, status: 404 },
    { method: "GET", payload: absent, status: 404 }, { method: "POST", payload: { ok: true, session: server().session } }, { method: "GET", payload: server() }]);
  const bench = server().session.bench_inventory_ids;
  assert.equal((await run.transport.start(bench)).status, "uncertain");
  bench.reverse();
  assert.equal((await run.transport.retry()).status, "started");
  const posts = run.calls.filter((call) => call.init.method === "POST");
  assert.equal(posts[0].init.body, posts[1].init.body);
  run.done();
});

test("an explicitly rejected first start and absent GET release only that rejected request", async () => {
  const run = client([{ method: "POST", status: 409, payload: { ok: false, error: "TL_QUICK_SUB_MATCH_NOT_ACTIVE" } },
    { method: "GET", status: 404, payload: { ok: false, error: "TL_QUICK_SUB_SESSION_NOT_FOUND" } },
    { method: "POST", payload: { ok: true, session: server().session } }, { method: "GET", payload: server() }]);
  const bench = server().session.bench_inventory_ids;
  assert.deepEqual(await run.transport.start(bench), { status: "rejected", reason: "http_error", httpStatus: 409 });
  assert.equal(run.transport.getSnapshot().pending, null);
  assert.equal((await run.transport.start(bench)).status, "started");
  run.done();
});

test("invalid commands, no loaded session and ninth-substitution exhaustion make no requests", async () => {
  const run = client([{ method: "GET", payload: server(9) }]);
  assert.deepEqual(await run.transport.substitute(id(1), id(12)), { status: "rejected", reason: "not_loaded" });
  await run.transport.load();
  assert.deepEqual(await run.transport.substitute(id(11), id(1)), { status: "rejected", reason: "invalid_input" });
  assert.equal(run.generated(), 0);
  run.done();
});
