import assert from "node:assert/strict";
import test from "node:test";
import { createSportmonksFixtureAuthority } from "../lib/football-data/sportmonks-fixture-authority.ts";

const requestId = "00000000-0000-4000-8000-000000000001";
const token = "00000000-0000-4000-8000-000000000002";
const attempt = () => ({ attempt: 1, remainingBudgetMs: 1500, signal: new AbortController().signal });
const observation = { requestId, attempt: 1, operation: "fixture" as const,
  observedAt: "2026-10-02T15:00:00.000Z", status: 429, requestedEntity: "Fixture",
  remaining: 0, resetAt: "2026-10-02T15:01:00.000Z", cooldownUntil: "2026-10-02T15:01:00.000Z" };
function harness(responses: unknown[]) {
  const calls: { name: string; args: Record<string, unknown>; signal: AbortSignal }[] = [];
  const guard = createSportmonksFixtureAuthority("qa-main", async (name, args, signal) => {
    calls.push({ name, args, signal }); return responses.shift();
  });
  const port = guard.createPort({ accountScope: "qa-main", entity: "Fixture", requestId, endpoint: "inplay" });
  return { guard, port, calls };
}
test("admission and completion use separate awaited durable receipts", async () => {
  const h = harness([{ allowed: true, token }, { persisted: true }]);
  assert.deepEqual(await h.port.beforeAttempt(attempt()), { allowed: true, token });
  assert.deepEqual(await h.port.afterAttempt({ ...attempt(), token, observation }), { persisted: true });
  assert.deepEqual(h.calls.map(c => c.name), ["touchline_fixture_quota_admit", "touchline_fixture_quota_complete"]);
  assert.deepEqual(h.calls[1].args.p_observation, observation);
  assert.equal(h.calls[0].args.p_account_scope, "qa-main");
  assert.equal(h.calls[0].args.p_budget_ms, 1500);
});
test("denied or malformed admission never grants a request", async () => {
  for (const receipt of [null, {}, { allowed: true }, { allowed: true, token: "bad" }, { allowed: true, token, extra: "leak" }]) {
    const h = harness([receipt]); await assert.rejects(() => h.port.beforeAttempt(attempt()), /authority unavailable/);
  }
  assert.deepEqual(await harness([{ allowed: false }]).port.beforeAttempt(attempt()), { allowed: false });
});
test("abort and scope mismatch fail before persistence", async () => {
  const h = harness([]); const c = new AbortController(); c.abort();
  await assert.rejects(() => h.port.beforeAttempt({ ...attempt(), signal: c.signal }));
  assert.throws(() => h.guard.createPort({ accountScope: "another", entity: "Fixture", requestId, endpoint: "fixture" }));
  assert.equal(h.calls.length, 0);
});
test("completion binds observation to request and attempt; never forwards extra fields", async () => {
  const h = harness([{ persisted: true }]);
  await assert.rejects(() => h.port.afterAttempt({ ...attempt(), token, observation: { ...observation, requestId: token } }));
  await h.port.afterAttempt({ ...attempt(), token, observation: { ...observation, secret: "never forward" } as typeof observation });
  assert.equal(h.calls.length, 1); assert.equal(JSON.stringify(h.calls).includes("never forward"), false);
});
test("unconfirmed completion throws and cannot authorize retry", async () => {
  for (const receipt of [null, {}, { persisted: false }, { persisted: true, extra: true }]) {
    const h = harness([receipt]);
    await assert.rejects(() => h.port.afterAttempt({ ...attempt(), token, observation }), /authority unavailable/);
  }
});

test("new worker endpoints bind exact context and operation without laundering unknown raw entities", async () => {
  const tuples = [["league", "League"], ["season", "Season"], ["stages", "Stage"], ["topscorers", "Topscorer"]] as const;
  for (const [endpoint, entity] of tuples) {
    const h = harness([{allowed:true, token}, {persisted:true}]);
    assert.throws(() => h.guard.createPort({accountScope:"qa-main", requestId, endpoint, entity:"Fixture"}));
    const port = h.guard.createPort({accountScope:"qa-main", requestId, endpoint, entity});
    assert.deepEqual(await port.beforeAttempt(attempt()), {allowed:true, token});
    await assert.rejects(() => port.afterAttempt({...attempt(),token,observation}));
    const unknown = {...observation,operation:endpoint,requestedEntity:"UnexpectedEntity"};
    assert.deepEqual(await port.afterAttempt({...attempt(),token,observation:unknown}), {persisted:true});
    assert.equal(h.calls[1].args.p_endpoint, endpoint);
    assert.deepEqual(h.calls[1].args.p_observation, unknown, "SQL must receive the raw mismatch and persist unknown, not a guessed entity");
  }
});
