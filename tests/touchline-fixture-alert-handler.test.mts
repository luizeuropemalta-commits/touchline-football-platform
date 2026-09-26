import assert from "node:assert/strict";
import test from "node:test";
import { handleFixtureAlert } from "../lib/touchlineArena/fixture-alert-handler.ts";

function harness() {
  const calls: unknown[][] = [];
  const deps = {
    enabled: true,
    actor: async (): Promise<{ id: string; allowed: boolean } | null> => ({ id: "account-verified", allowed: true }),
    resolveFixture: async (id: string): Promise<string | null> => { calls.push(["resolve", id]); return "fixture-uuid"; },
    read: async (...args: string[]): Promise<unknown> => { calls.push(["read", ...args]); return { subscribed: false }; },
    write: async (id: string, actor: string, active: boolean): Promise<unknown> => { calls.push(["write", id, actor, active]); return { subscribed: active }; },
  };
  return { deps, calls };
}
const get = () => new Request("https://qa.example/api/notifications/fixtures/123");
const put = (body: unknown, origin = "https://qa.example") => new Request(get(), {
  method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("fixture alerts are off until approved activation and never access storage while disabled", async () => {
  const { deps, calls } = harness(); deps.enabled = false;
  deps.actor = async () => { throw new Error("must not authenticate"); };
  const response = await handleFixtureAlert(put({ active: true }), "123", deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "ALERTS_NOT_ENABLED" });
  assert.deepEqual(calls, []);
});
test("subscription uses canonical fixture and authenticated identity, not browser account data", async () => {
  const { deps, calls } = harness();
  const response = await handleFixtureAlert(put({ active: true }), "123", deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { subscribed: true }, delivery: "unavailable" });
  assert.deepEqual(calls, [["resolve", "123"], ["write", "fixture-uuid", "account-verified", true]]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("anonymous, denied, foreign-origin and malformed requests cannot write", async () => {
  for (const [request, actor, expected] of [
    [put({ active: true }), null, 401],
    [put({ active: true }), { id: "user", allowed: false }, 403],
    [put({ active: true }, "https://foreign.test"), { id: "user", allowed: true }, 403],
    [put({ active: true, userId: "victim" }), { id: "user", allowed: true }, 400],
    [put({ active: "true" }), { id: "user", allowed: true }, 400],
  ] as const) {
    const { deps, calls } = harness(); deps.actor = async () => actor;
    assert.equal((await handleFixtureAlert(request, "123", deps)).status, expected);
    assert.deepEqual(calls, []);
  }
});
test("reads do not mutate, missing fixtures fail closed and malformed summaries do not imply subscription", async () => {
  const { deps, calls } = harness();
  assert.equal((await handleFixtureAlert(get(), "123", deps)).status, 200);
  assert.deepEqual(calls, [["resolve", "123"], ["read", "fixture-uuid", "account-verified"]]);
  deps.resolveFixture = async () => null;
  assert.equal((await handleFixtureAlert(put({ active: false }), "123", deps)).status, 404);
  deps.resolveFixture = async () => "fixture-uuid"; deps.read = async () => ({ subscribed: "true", secret: "private" });
  const failed = await handleFixtureAlert(get(), "123", deps);
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /secret|private/);
});
