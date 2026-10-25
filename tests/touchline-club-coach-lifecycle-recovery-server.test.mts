import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as authorityModule from "../lib/touchlineFantasy/club-command-authority.ts";
import * as lifecycle from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import * as responseModule from "../lib/touchlineFantasy/club-coach-lifecycle-response.ts";
import * as deadlineModule from "../lib/touchlineArena/server-read-deadline.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
import type { ClubCoachRecoveryScope, ClubCoachRecoveryVerifiedContext, readClubCoachLifecycleRecovery } from "../lib/touchlineFantasy/club-coach-lifecycle-recovery-server.ts";

const source = readFileSync(new URL("../lib/touchlineFantasy/club-coach-lifecycle-recovery-server.ts", import.meta.url), "utf8");
const compile = (value: string) => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function loadRecovery(deadline: unknown = deadlineModule) {
  const modules: Record<string, unknown> = {
    "server-only": {}, "./club-command-authority.ts": authorityModule,
    "./club-coach-lifecycle.ts": lifecycle, "./club-coach-lifecycle-response.ts": responseModule,
    "../touchlineArena/server-read-deadline.ts": deadline,
  };
  const exports = {} as { readClubCoachLifecycleRecovery: typeof readClubCoachLifecycleRecovery };
  runInNewContext(compile(source), {
    exports, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
  });
  return exports.readClubCoachLifecycleRecovery;
}
const read = loadRecovery();
const authority = { expectedAccountId: "11111111-1111-4111-8111-111111111111", expectedSeasonId: "22222222-2222-4222-8222-222222222222" };
const verified = { status: "verified" as const, role: "customer" as const, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId };
const release = { action: "release-coach" as const, currentCoachId: "307", expectedRevision: 3, idempotencyKey: "coach_release_01" };
const hire = { action: "hire-coach" as const, incomingCoachId: "455907", expectedRevision: 4, idempotencyKey: "coach_hire_01" };
const context = { marketOpen: true, roundLocked: false };
function fixture(action: "release" | "hire" = "release") {
  const original: ClubAcquisitionState = { revision: 3, seasonId: authority.expectedSeasonId, plan: "standard", balanceEur: 100_000_000,
    coach: { id: "307", tier: "ruby-red", valueEur: 5_000_000 }, formationCode: "4-3-3",
    players: [{ playerId: "player", clubId: "club", position: "GK", valueEur: 1_000_000, area: "outside", slot: 0 }], receipts: [] };
  const released = lifecycle.releaseClubCoach(original, release, context);
  const before = action === "release" ? original : released.state;
  const transition = action === "release" ? released : lifecycle.hireClubCoach(released.state, hire, {
    ...context, offer: { id: "455907", tier: "sapphire-blue", valueEur: 10_000_000, published: true },
  });
  const command = action === "release" ? release : hire;
  return { schemaVersion: 1, accountId: verified.accountId, seasonId: verified.seasonId, command, before,
    response: { ok: true as const, accountId: verified.accountId, seasonId: verified.seasonId, ...transition, replayed: false } };
}
function repository(value: unknown, reject = false) {
  const calls: ClubCoachRecoveryScope[] = [];
  return { calls, readCommittedOperation: async (scope: ClubCoachRecoveryScope) => {
    assert.equal(Object.isFrozen(scope), true); calls.push(scope);
    if (reject) throw new Error("private provider diagnostic"); return value;
  } };
}
const request = (command = release as lifecycle.ClubCoachLifecycleCommand) => ({ ...authority, ...command });

test("coach recovery is disabled by default with no auth or repository side effects", async () => {
  const repo = repository(fixture());
  const result = await read(repo, verified, request());
  assert.equal(result.status, "disabled"); assert.equal(result.resolved, false); assert.equal(repo.calls.length, 0);
});

test("guest, unavailable, admin and malformed verified context never query storage", async () => {
  const cases: [ClubCoachRecoveryVerifiedContext, string][] = [
    [{ status: "guest" }, "auth_required"], [{ status: "unavailable" }, "auth_unavailable"],
    [{ ...verified, role: "admin" }, "forbidden"], [{ ...verified, accountId: "unverified" }, "auth_unavailable"],
  ];
  for (const [identity, status] of cases) {
    const repo = repository(fixture());
    assert.equal((await read(repo, identity, request(), true)).status, status);
    assert.equal(repo.calls.length, 0);
  }
});

test("request identity is only a guard; invalid or cross-account/season requests never query", async () => {
  for (const [input, status] of [
    [{ ...request(), expectedAccountId: verified.seasonId }, "context_changed"],
    [{ ...request(), expectedSeasonId: verified.accountId }, "context_changed"],
    [{ ...request(), balance: 1 }, "invalid_request"], [{ ...request(), price: 1 }, "invalid_request"],
    [{ ...request(), action: "release-player" }, "invalid_request"], [{ ...request(), expectedRevision: -1 }, "invalid_request"],
    [{ ...request(), idempotencyKey: "short" }, "invalid_request"], [null, "invalid_request"],
  ] as const) {
    const repo = repository(fixture()); assert.equal((await read(repo, verified, input, true)).status, status); assert.equal(repo.calls.length, 0);
  }
});

test("one scoped historical read recovers release or hire without recalculating or mutating", async () => {
  for (const action of ["release", "hire"] as const) {
    const record = fixture(action), original = structuredClone(record), repo = repository(record);
    const result = await read(repo, verified, request(record.command), true);
    assert.equal(repo.calls.length, 1);
    assert.deepEqual({ ...repo.calls[0] }, { ownerId: verified.accountId, seasonId: verified.seasonId, idempotencyKey: record.command.idempotencyKey });
    assert.equal(result.resolved, true);
    if (!result.resolved) throw Error("unresolved");
    assert.equal(result.operationRevision, record.command.expectedRevision + 1);
    assert.equal(result.response.replayed, true);
    assert.deepEqual(result.response.state, record.response.state);
    assert.equal(result.response.state.balanceEur, action === "release" ? 104_500_000 : 94_500_000);
    if (result.response.receipt.action === "release-coach") {
      assert.equal(result.response.receipt.feeCredits, 500_000); assert.equal(result.response.receipt.refundCredits, 4_500_000);
    }
    assert.deepEqual(record, original);
  }
});

test("missing, rejected and malformed stored records remain unresolved, never trigger another operation", async () => {
  const valid = fixture();
  for (const [value, rejection, status] of [
    [null, false, "not_observed"], [valid, true, "unavailable"], [undefined, false, "unavailable"],
    [{ ...valid, schemaVersion: 2 }, false, "unavailable"], [{ ...valid, currentState: valid.response.state }, false, "unavailable"],
    [{ ...valid, accountId: verified.seasonId }, false, "unavailable"], [{ ...valid, seasonId: verified.accountId }, false, "unavailable"],
  ] as const) {
    const repo = repository(value, rejection), result = await read(repo, verified, request(), true);
    assert.equal(result.status, status); assert.equal(result.resolved, false); assert.equal(repo.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private|diagnostic/);
  }
});

test("same key with another exact command conflicts instead of treating it as replay", async () => {
  const record = fixture();
  for (const command of [
    { ...release, currentCoachId: "308" }, { ...release, expectedRevision: 2 },
    { ...release, idempotencyKey: "coach_release_02" }, { ...hire, idempotencyKey: release.idempotencyKey },
  ]) {
    const repo = repository({ ...record, command });
    assert.equal((await read(repo, verified, request(), true)).status, "conflict"); assert.equal(repo.calls.length, 1);
  }
  assert.equal((await read(repository({ ...record, command: { ...release, amount: 1 } }), verified, request(), true)).status, "unavailable");
});

test("current vacancy/wallet or a newer snapshot cannot replace the exact durable before and outcome", async () => {
  for (const action of ["release", "hire"] as const) {
    const record = fixture(action);
    for (const value of [
      { ...record, before: undefined }, { ...record, before: record.response.state },
      { ...record, before: { coach: null, balanceEur: record.before.balanceEur } },
      { ...record, response: { ...record.response, state: { ...record.response.state, revision: record.response.state.revision + 1 } } },
      { ...record, response: { ...record.response, state: { ...record.response.state, players: [] } } },
      { ...record, response: { ...record.response, state: { ...record.response.state, formationCode: "4-4-2" } } },
    ]) assert.equal((await read(repository(value), verified, request(record.command), true)).status, "unavailable");
  }
});

test("recovery rejects forged exchange fees or hiring debit instead of applying them", async () => {
  const released = fixture(), hired = fixture("hire");
  for (const record of [
    { ...released, response: { ...released.response, receipt: { ...released.response.receipt, feeCredits: 250_000, refundCredits: 4_750_000 } } },
    { ...hired, response: { ...hired.response, receipt: { ...hired.response.receipt, signingCredits: 5_000_000 } } },
  ]) assert.equal((await read(repository(record), verified, request(record.command), true)).status, "unavailable");
});

test("stalled recovery has one bounded read and a late record cannot change its unresolved result", async () => {
  let expire: (() => void) | undefined, clearCount = 0, calls = 0;
  const deadlineExports = {};
  const deadlineSource = readFileSync(new URL("../lib/touchlineArena/server-read-deadline.ts", import.meta.url), "utf8");
  runInNewContext(compile(deadlineSource), {
    exports: deadlineExports,
    setTimeout: (callback: () => void, duration: number) => { assert.equal(duration, 8_000); expire = callback; return 1; },
    clearTimeout: () => { clearCount++; },
  });
  const controlledRead = loadRecovery(deadlineExports);
  let deliver!: (value: unknown) => void;
  const pending = controlledRead({ readCommittedOperation: () => { calls++; return new Promise(resolve => { deliver = resolve; }); } }, verified, request(), true);
  assert.ok(expire, "real deadline helper armed without waiting for storage");
  expire();
  const result = await pending;
  assert.equal(result.status, "unavailable"); assert.equal(result.resolved, false); assert.equal(calls, 1);
  deliver(fixture());
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(result.status, "unavailable"); assert.equal(result.resolved, false);
  assert.equal(calls, 1, "timeout never retries the read or a write");
  assert.equal(clearCount, 1, "late settled I/O releases its timer handle");
});
