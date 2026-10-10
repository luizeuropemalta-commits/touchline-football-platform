import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/football-data/fixture-authority-worker-auth-server.ts", import.meta.url), "utf8");
const exports = {} as { createFixtureAuthorityWorkerAuthenticator: typeof import("../lib/football-data/fixture-authority-worker-auth-server.ts").createFixtureAuthorityWorkerAuthenticator };
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, require(name: string) { if (name === "node:crypto") return crypto; assert.equal(name, "server-only"); return {}; },
});
const create = exports.createFixtureAuthorityWorkerAuthenticator;
const qa = { workerId: "qa-live", environment: "qa" as const, accountScope: "shared", token: "q".repeat(40) };
const production = { workerId: "production-live", environment: "production" as const, accountScope: "shared", token: "p".repeat(40) };

test("worker identity is OFF by default, even with valid credentials", () => {
  for (const enabled of [undefined, false]) {
    assert.equal(create({ enabled, workers: [qa] })(`Bearer ${qa.token}`), null);
  }
});
test("distinct credentials resolve frozen server-owned identity on the same subscription", () => {
  const mutable = { ...qa };
  const auth = create({ enabled: true, workers: [mutable, production] });
  mutable.accountScope = "attacker"; mutable.token = "x".repeat(40);
  const result = auth(`Bearer ${qa.token}`)!;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { workerId: qa.workerId, environment: "qa", accountScope: "shared" });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(auth(`Bearer ${production.token}`)?.environment, "production");
  assert.equal(auth(`Bearer ${mutable.token}`), null);
  assert.ok(!JSON.stringify(result).includes(qa.token));
});
test("missing, combined, malformed and unknown tokens never authenticate", () => {
  const auth = create({ enabled: true, workers: [qa, production] });
  for (const value of [null, "", `Basic ${qa.token}`, `Bearer ${qa.token},Bearer ${production.token}`,
    `Bearer ${qa.token}\n`, `Bearer ${"x".repeat(40)}`, `Bearer ${"x".repeat(257)}`, `Bearer  ${qa.token}`]) {
    assert.equal(auth(value), null);
  }
});
test("duplicate identities or credentials and invalid configuration fail closed without echoing secrets", () => {
  for (const workers of [[], [qa, qa], [qa, { ...production, token: qa.token }], [{ ...qa, token: "secret" }],
    [{ ...qa, accountScope: "../other" }], [{ ...qa, workerId: "" }]]) {
    assert.throws(() => create({ enabled: true, workers }), error =>
      (error as Error).message === "Fixture authority identity configuration unavailable.");
  }
});

test("malformed activation, environment, and excess worker count cannot widen access", () => {
  type Config = Parameters<typeof create>[0];
  const stringEnabled = { enabled: "true", workers: [qa] } as unknown as Config;
  assert.equal(create(stringEnabled)(`Bearer ${qa.token}`), null);
  const wrongEnvironment = { enabled: true, workers: [{ ...qa, environment: "admin" }] } as unknown as Config;
  assert.throws(() => create(wrongEnvironment), /identity configuration unavailable/);
  const tooMany = Array.from({ length: 33 }, (_, index) => ({ ...qa, workerId: `worker-${index}`, token: `token-${index}-` + "x".repeat(32) }));
  assert.throws(() => create({ enabled: true, workers: tooMany }), /identity configuration unavailable/);
  const missingScope = { enabled: true, workers: [{ ...qa, accountScope: undefined }] } as unknown as Config;
  assert.throws(() => create(missingScope), /identity configuration unavailable/);
});
