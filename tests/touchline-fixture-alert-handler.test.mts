import assert from "node:assert/strict";
import test from "node:test";
import { handleFixtureAlert } from "../lib/touchlineArena/fixture-alert-handler.ts";
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function harness() {
  const calls: unknown[][] = [];
  const deps = {
    enabled: true,
    actor: async (): Promise<{ id: string; allowed: boolean } | null> => ({ id: accountId, allowed: true }),
    resolveFixture: async (id: string): Promise<string | null> => { calls.push(["resolve", id]); return "fixture-uuid"; },
    read: async (...args: string[]): Promise<unknown> => { calls.push(["read", ...args]); return { subscribed: false, revision: "0" }; },
    write: async (id: string, actor: string, active: boolean, revision: string): Promise<unknown> => { calls.push(["write", id, actor, active, revision]); return { subscribed: active, revision: (BigInt(revision) + 1n).toString() }; },
  };
  return { deps, calls };
}
const get = () => new Request("https://qa.example/api/notifications/fixtures/123", { headers: { "X-Touchline-Expected-Account": accountId } });
const put = (body: unknown, origin = "https://qa.example") => new Request(get(), {
  method: "PUT", headers: { origin, "Content-Type": "application/json", "X-Touchline-Expected-Account": accountId }, body: JSON.stringify(body),
});

test("fixture alerts are off until approved activation and never access storage while disabled", async () => {
  const { deps, calls } = harness(); deps.enabled = false;
  deps.actor = async () => { throw new Error("must not authenticate"); };
  const response = await handleFixtureAlert(put({ active: true, expectedRevision: "0" }), "123", deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "ALERTS_NOT_ENABLED" });
  assert.deepEqual(calls, []);
});
test("subscription uses canonical fixture and authenticated identity, not browser account data", async () => {
  const { deps, calls } = harness();
  const response = await handleFixtureAlert(put({ active: true, expectedRevision: "0" }), "123", deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { accountId, fixtureId: "123", subscribed: true, revision: "1" }, delivery: "unavailable" });
  assert.deepEqual(calls, [["resolve", "123"], ["write", "fixture-uuid", accountId, true, "0"]]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("anonymous, denied, foreign-origin and malformed requests cannot write", async () => {
  for (const [request, actor, expected] of [
    [put({ active: true }), null, 401],
    [put({ active: true }), { id: "user", allowed: false }, 403],
    [put({ active: true }, "https://foreign.test"), { id: "user", allowed: true }, 403],
    [put({ active: true, userId: "victim" }), { id: accountId, allowed: true }, 400],
    [put({ active: "true" }), { id: accountId, allowed: true }, 400],
  ] as const) {
    const { deps, calls } = harness(); deps.actor = async () => actor;
    assert.equal((await handleFixtureAlert(request, "123", deps)).status, expected);
    assert.deepEqual(calls, []);
  }
});
test("reads do not mutate, missing fixtures fail closed and malformed summaries do not imply subscription", async () => {
  const { deps, calls } = harness();
  assert.equal((await handleFixtureAlert(get(), "123", deps)).status, 200);
  assert.deepEqual(calls, [["resolve", "123"], ["read", "fixture-uuid", accountId]]);
  deps.resolveFixture = async () => null;
  assert.equal((await handleFixtureAlert(put({ active: false, expectedRevision: "0" }), "123", deps)).status, 404);
  deps.resolveFixture = async () => "fixture-uuid"; deps.read = async () => ({ subscribed: "true", secret: "private" });
  const failed = await handleFixtureAlert(get(), "123", deps);
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /secret|private/);
});

test("revision is mandatory decimal bigint and only an exact increment confirms a write", async () => {
  for (const expectedRevision of [undefined, null, 0, "00", "-1", "1e3", "9223372036854775807", "9223372036854775808"]) {
    const { deps, calls } = harness();
    assert.equal((await handleFixtureAlert(put({ active: true, expectedRevision }), "123", deps)).status, 400);
    assert.deepEqual(calls, []);
  }
  const { deps } = harness();
  const result = await handleFixtureAlert(put({ active: true, expectedRevision: "9007199254740993" }), "123", deps);
  assert.equal((await result.json()).data.revision, "9007199254740994");
  deps.write = async () => ({ conflict: true });
  const conflict = await handleFixtureAlert(put({ active: true, expectedRevision: "0" }), "123", deps);
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error, "REVISION_CONFLICT");
  for (const receipt of [{ subscribed: true }, { subscribed: true, revision: "0" }, { subscribed: false, revision: "1" }]) {
    deps.write = async () => receipt;
    assert.equal((await handleFixtureAlert(put({ active: true, expectedRevision: "0" }), "123", deps)).status, 503);
  }
});
test("cookie account replacement and missing expected account cannot read or write another owner's interest", async () => {
  for (const request of [get(), put({ active: true })]) {
    const { deps, calls } = harness(); deps.actor = async () => ({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", allowed: true });
    assert.equal((await handleFixtureAlert(request, "123", deps)).status, 409);
    assert.deepEqual(calls, []);
    const noHeader = new Request(request); noHeader.headers.delete("X-Touchline-Expected-Account");
    assert.equal((await handleFixtureAlert(noHeader, "123", deps)).status, 400);
    assert.deepEqual(calls, []);
  }
});
