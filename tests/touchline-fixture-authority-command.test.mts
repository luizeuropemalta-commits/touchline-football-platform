import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function load(name: string, dependencies: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL(`../lib/football-data/${name}.ts`, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require(id: string) {
      if (id === "server-only") return {};
      assert.ok(Object.hasOwn(dependencies, id), id);
      return dependencies[id];
    },
  });
  return exports;
}
const quota = load("sportmonks-quota-observation");
const parse = load("fixture-authority-command-server", { "./sportmonks-quota-observation.ts": quota })
  .parseFixtureAuthorityCommand as typeof import("../lib/football-data/fixture-authority-command-server.ts").parseFixtureAuthorityCommand;
const authenticate = load("fixture-authority-worker-auth-server", { "node:crypto": crypto })
  .createFixtureAuthorityWorkerAuthenticator as typeof import("../lib/football-data/fixture-authority-worker-auth-server.ts").createFixtureAuthorityWorkerAuthenticator;
const principal = { workerId: "qa-live", environment: "qa" as const, accountScope: "shared" };
const requestId = "12345678-1234-4234-8234-123456789abc";
const token = "12345678-1234-4234-8234-123456789abd";
const args = { p_account_scope: "shared", p_request_id: requestId, p_endpoint: "latest", p_attempt: 1 };
const admit = () => ({ operation: "admit", args: { ...args, p_budget_ms: 1500 } });
const complete = () => ({ operation: "complete", args: { ...args, p_token: token, p_observation: {
  requestId, attempt: 1, operation: "fixture", observedAt: "2026-10-10T15:00:00.000Z", status: 200,
  requestedEntity: "Fixture", remaining: 10, resetAt: null, cooldownUntil: null,
} } });
const rejected = (payload: unknown) => assert.throws(() => parse(principal, payload), error =>
  (error as Error).message === "Fixture authority command rejected.");

test("admit binds a frozen server identity and ignores subsequent caller mutations", () => {
  const identity = { ...principal };
  const input = admit();
  const result = parse(identity, input);
  identity.accountScope = "other"; input.args.p_request_id = token;
  assert.equal(result.principal.accountScope, "shared"); assert.equal(result.requestId, requestId);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.principal), true);
  assert.equal(result.operation, "admit");
  if (result.operation === "admit") assert.equal(result.budgetMs, 1500);
});
test("completion copies an immutable allowlisted observation, retaining unknown quota evidence", () => {
  const input = complete();
  input.args.p_observation.requestedEntity = "UnexpectedEntity";
  const result = parse(principal, input);
  input.args.p_observation.remaining = 999;
  assert.equal(result.operation, "complete");
  if (result.operation === "complete") {
    assert.equal(result.token, token); assert.equal(result.observation.remaining, 10);
    assert.equal(result.observation.requestedEntity, "UnexpectedEntity");
    assert.equal(Object.isFrozen(result.observation), true);
  }
});
test("payload cannot override worker, environment, account, RPC or provider URL", () => {
  for (const key of ["workerId", "environment", "principal", "url", "rpc", "__proto__"]) {
    rejected(JSON.parse(JSON.stringify(admit()).replace('"operation":', `"${key}":"attacker","operation":`)));
    rejected({ operation: "admit", args: { ...admit().args, [key]: "attacker" } });
  }
  rejected({ ...admit(), operation: "arbitrary_rpc" });
  rejected({ operation: "admit", args: { ...admit().args, p_account_scope: "production" } });
});
test("closed schemas deny absent fields, wrong types, invalid UUID and endpoint", () => {
  for (const payload of [null, [], {}, { operation: "admit" }, { operation: "admit", args: [] }]) rejected(payload);
  for (const [key, values] of Object.entries({
    p_attempt: [0, -1, 1.2, "1", 2147483648], p_budget_ms: [0, -1, Infinity, "100", 2147483648],
    p_request_id: ["invalid", null], p_endpoint: ["__proto__", "constructor", "https://example.test", null],
  })) for (const value of values) rejected({ operation: "admit", args: { ...admit().args, [key]: value } });
  const missing: Record<string, unknown> = { ...admit().args }; delete missing.p_attempt;
  rejected({ operation: "admit", args: missing });
});
test("receipt observation must match its request, attempt and operation", () => {
  for (const [key, value] of Object.entries({ requestId: token, attempt: 2, operation: "league", rawBody: "secret" })) {
    const input = complete(); rejected({ ...input, args: { ...input.args, p_observation: { ...input.args.p_observation, [key]: value } } });
  }
  rejected({ ...complete(), args: { ...complete().args, p_token: "not-a-receipt" } });
});
test("invalid timestamps and quota primitives fail without leaking submitted data", () => {
  for (const [key, values] of Object.entries({ observedAt: ["tomorrow", 123, "2026-10-10"],
    status: [-1, 600, 1.5, "200"], requestedEntity: ["secret/url", 1], remaining: [-1, 1.5, "10"],
    resetAt: ["invalid"], cooldownUntil: [false],
  })) for (const value of values) {
    const input = complete(); rejected({ ...input, args: { ...input.args, p_observation: { ...input.args.p_observation, [key]: value } } });
  }
});
test("real authenticator keeps QA and production ownership distinct even for identical payload", () => {
  const qaToken = "q".repeat(40), prodToken = "p".repeat(40);
  const auth = authenticate({ enabled: true, workers: [{ ...principal, token: qaToken },
    { ...principal, workerId: "prod-live", environment: "production", token: prodToken }] });
  const qa = parse(auth(`Bearer ${qaToken}`)!, complete());
  const prod = parse(auth(`Bearer ${prodToken}`)!, complete());
  assert.equal(qa.principal.workerId, "qa-live"); assert.equal(prod.principal.workerId, "prod-live");
  assert.equal(qa.principal.accountScope, prod.principal.accountScope);
  // Different commands, not an ownership proof: the durable store must reject
  // prod's completion of qa's receipt atomically before any remote activation.
  assert.notEqual(JSON.stringify(qa), JSON.stringify(prod));
  assert.throws(() => parse(null as unknown as typeof principal, admit()), /command rejected/);
});

test("noncanonical UUIDs and expanded years are rejected before SQL admission/completion", () => {
  for (const value of [requestId.toUpperCase(), requestId.replace("a", "A")]) {
    rejected({ operation: "admit", args: { ...admit().args, p_request_id: value } });
  }
  rejected({ ...complete(), args: { ...complete().args, p_token: token.toUpperCase() } });
  for (const key of ["observedAt", "resetAt", "cooldownUntil"]) {
    rejected({ ...complete(), args: { ...complete().args, p_observation: {
      ...complete().args.p_observation, [key]: "+010000-01-01T00:00:00.000Z",
    } } });
  }
});
