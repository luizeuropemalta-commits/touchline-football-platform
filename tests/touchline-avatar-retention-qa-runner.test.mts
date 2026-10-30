import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QA_PROJECT, QA_ORIGIN, GRACE_MS, parseOptions, validateEnvironment, validateState, requireCurrent,
  requireGrace, checkDueScope, recoveryDecision, captureEnvironment, main, type ProbeState } from "../scripts/qa/verify-touchline-avatar-retention.mts";
import type { AvatarControlSnapshot } from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

const actor = "11111111-1111-4111-8111-111111111111";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const now = "2026-10-30T12:00:00.000Z";
const key = (claims: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic_test_signature`;
const env = () => ({ SUPABASE_URL: QA_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: key({ ref: QA_PROJECT, role: "service_role" }), TOUCHLINE_OWNER_EMAILS: "owner@example.test" });
const args = (folder: string) => ["--project-ref", QA_PROJECT, "--fixture-id", actor, "--env-file", join(folder, "private.env"), "--state-file", join(folder, "state.json")];
function state(): ProbeState {
  return { version: 1, projectRef: QA_PROJECT, fixtureId: actor, createdAt: now,
    baseline: { actorId: actor, revision: "0", avatarUrl: null, operationId: null, digest: null },
    fixtures: ids.map((operationId, index) => { const bytes = Buffer.from(`pure fixture ${index}`); return { operationId,
      digest: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.toString("base64"), expectedRevision: null,
      baseGeneration: null, dispatch: "prepared", receipt: null, committedObservedAt: null }; }) as ProbeState["fixtures"],
    edge: null, bytesVerifiedAt: null };
}
function commit(s: ProbeState, index: 0 | 1) {
  const f = s.fixtures[index]; f.expectedRevision = String(index); f.baseGeneration = String(index * 2); f.dispatch = "committed"; f.committedObservedAt = now;
  f.receipt = { actorId: actor, operationId: f.operationId, expectedRevision: String(index), revision: String(index + 1), digest: f.digest,
    objectKey: `${actor}/${f.operationId}/${f.digest}.webp`, avatarUrl: `/api/account/avatar?version=${f.operationId}` }; return f;
}
function snapshot(s: ProbeState): AvatarControlSnapshot {
  const f = s.fixtures[0]; return { version: 1, actorId: actor, revision: f.receipt?.revision ?? "0", generation: f.receipt ? "2" : "0",
    activeOperationId: null, fencedThroughGeneration: "-1", requestedOperationId: f.operationId,
    operation: f.receipt ? { operationId: f.operationId, state: "committed", expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt: f.receipt } : null };
}

test("default is offline; every remote phase needs explicit execute and exact QA/fixture/path", () => {
  assert.equal(parseOptions(args("/private/probe")).execute, false);
  const inMemory = args("/private/probe").map(v => v === "--env-file" ? "--env-source" : v === "/private/probe/private.env" ? "process" : v);
  assert.equal(parseOptions(inMemory).envSource, "process"); assert.equal(parseOptions(inMemory).envFile, null);
  for (const step of ["inspect", "publish-first", "publish-second", "retain", "verify"]) {
    assert.equal(parseOptions([...args("/private/probe"), "--execute", "--step", step]).step, step);
  }
  for (const invalid of [
    [...args("/private/probe"), "--execute"], [...args("/private/probe"), "--step", "retain"],
    [...args("/private/probe"), "--execute", "--step", "reset"], [...args("/private/probe"), "--execute", "--execute"],
    args("/private/probe").map(v => v === QA_PROJECT ? "production" : v), args("/private/probe").map(v => v === actor ? "*" : v),
    args("relative"), [...args("/private/probe"), "--env-file", "/different.env"],
    [...args("/private/probe"), "--env-source", "process"], inMemory.map(v => v === "process" ? "implicit" : v),
    args("/private/probe").filter((_, index) => ![4, 5].includes(index)),
  ]) assert.throws(() => parseOptions(invalid));
});

test("explicit in-memory source captures only validated names, excluding unrelated environment", () => {
  const input = { ...env(), UNRELATED_SECRET: "never-copy", PATH: "/unrelated" };
  const snapshot = captureEnvironment(input);
  assert.deepEqual(Object.keys(snapshot).sort(), ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "TOUCHLINE_OWNER_EMAILS"]);
  assert.equal(Object.hasOwn(snapshot, "UNRELATED_SECRET"), false);
  input.SUPABASE_URL = "https://other.supabase.co";
  assert.equal(snapshot.SUPABASE_URL, QA_ORIGIN);
  assert.notDeepEqual(snapshot, captureEnvironment(input));
});

test("private credentials are project-bound service credentials, never browser or production", () => {
  assert.equal(validateEnvironment(env()).serviceRoleKey, env().SUPABASE_SERVICE_ROLE_KEY);
  for (const changes of [
    { SUPABASE_URL: QA_ORIGIN + "/" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
    { SUPABASE_SERVICE_ROLE_KEY: key({ ref: "other", role: "service_role" }) },
    { SUPABASE_SERVICE_ROLE_KEY: key({ ref: QA_PROJECT, role: "authenticated", sub: actor }) },
    { SUPABASE_SERVICE_ROLE_KEY: key({ ref: QA_PROJECT, role: "service_role", sub: actor }) },
    { TOUCHLINE_OWNER_EMAILS: "" }, { TOUCHLINE_OWNER_EMAILS: "not-an-email" },
  ]) assert.throws(() => validateEnvironment({ ...env(), ...changes }));
});

test("durable bindings refuse changed actor, duplicate operations, bytes drift and impossible receipts", () => {
  const s = state(); assert.deepEqual(validateState(s, actor), s);
  assert.throws(() => validateState(s, ids[0]));
  for (const mutate of [
    (v: ProbeState) => { v.fixtures[1].operationId = v.fixtures[0].operationId; },
    (v: ProbeState) => { v.fixtures[0].bytes = Buffer.from("changed").toString("base64"); },
    (v: ProbeState) => { v.baseline = { ...v.baseline, revision: "1" }; },
    (v: ProbeState) => { v.fixtures[0].dispatch = "begin_sent"; },
    (v: ProbeState) => { commit(v, 1); },
    (v: ProbeState) => { const f = commit(v, 0); f.receipt = { ...f.receipt!, objectKey: "outside/key.webp" }; },
    (v: ProbeState) => { v.edge = { dispatchedAt: now, status: 200 }; },
  ]) { const modified = state(); mutate(modified); assert.throws(() => validateState(modified, actor)); }
  commit(s, 0); commit(s, 1); s.edge = { dispatchedAt: now, status: null }; assert.deepEqual(validateState(s, actor), s);
});

test("unknown and pending never reserve a replacement worker; committed only reconciles original binding", () => {
  const s = state(), f = s.fixtures[0]; assert.equal(recoveryDecision(snapshot(s), f), "new");
  f.dispatch = "begin_sent"; f.expectedRevision = "0"; f.baseGeneration = "0";
  assert.throws(() => recoveryDecision(snapshot(s), f), /RECOVERY_REQUIRED/);
  const pending: AvatarControlSnapshot = { ...snapshot(s), activeOperationId: f.operationId,
    operation: { operationId: f.operationId, state: "pending", expectedRevision: "0", baseGeneration: "0", generation: "1", legacy: false, receipt: null } };
  assert.throws(() => recoveryDecision(pending, f), /RECOVERY_REQUIRED/);
  commit(s, 0); assert.equal(recoveryDecision(snapshot(s), f), "committed");
  const changed: AvatarControlSnapshot = { ...snapshot(s), operation: { ...snapshot(s).operation!, receipt: { ...f.receipt!, digest: "f".repeat(64) } } };
  assert.throws(() => recoveryDecision(changed, f), /RECOVERY_REQUIRED/);
});

test("real grace cannot be skipped, and a changed current photo blocks retention", () => {
  const s = state(); assert.throws(() => requireGrace(s.fixtures[0], Date.parse(now) + GRACE_MS));
  const first = commit(s, 0), second = commit(s, 1);
  for (const elapsed of [-1, 0, GRACE_MS - 1]) assert.throws(() => requireGrace(first, Date.parse(now) + elapsed), /REAL_GRACE/);
  requireGrace(first, Date.parse(now) + GRACE_MS);
  const current = { actorId: actor, revision: "2", operationId: second.operationId, digest: second.digest, avatarUrl: second.receipt!.avatarUrl };
  requireCurrent(current, actor, second.receipt);
  for (const changed of [{ revision: "3" }, { operationId: ids[0] }, { digest: first.digest }, { actorId: ids[0] }])
    assert.throws(() => requireCurrent({ ...current, ...changed }, actor, second.receipt), /CURRENT_PHOTO_CHANGED/);
});

test("bounded queue page cannot authorize another actor, unknown key or current fixture", () => {
  const s = state(), first = commit(s, 0), second = commit(s, 1);
  const candidate = { candidateId: "44444444-4444-4444-8444-444444444444", actorId: actor, operationId: first.operationId, digest: first.digest, objectKey: first.receipt!.objectKey };
  checkDueScope({ version: 1, candidates: [] }, actor, first);
  checkDueScope({ version: 1, candidates: [candidate] }, actor, first);
  for (const candidates of [[{ ...candidate, actorId: ids[0] }], [{ ...candidate, operationId: second.operationId }],
    [{ ...candidate, objectKey: "other/key" }], [candidate, candidate]]) assert.throws(() => checkDueScope({ version: 1, candidates }, actor, first));
  assert.throws(() => checkDueScope({ candidates: [] }, actor, first));
});

test("default invocation reads only private local configuration and creates no checkpoint or network request", async () => {
  const folder = mkdtempSync(join(tmpdir(), "avatar-retention-offline-")); chmodSync(folder, 0o700);
  // macOS tmpdir already resolves symlinks; the runner intentionally rejects
  // alias paths instead of normalizing a credential target behind the operator.
  const { realpathSync } = await import("node:fs"); const actual = realpathSync(folder);
  const file = join(actual, "private.env"); writeFileSync(file, Object.entries(env()).map(([k, v]) => `${k}=${v}`).join("\n"), { mode: 0o600 });
  const originalFetch = globalThis.fetch, originalLog = console.log; const reports: unknown[] = [];
  globalThis.fetch = async () => { throw Error("NETWORK_FORBIDDEN"); }; console.log = value => { reports.push(JSON.parse(value)); };
  try {
    await main(args(actual)); assert.equal(existsSync(join(actual, "state.json")), false); assert.equal(existsSync(join(actual, "state.json.lock")), false);
    assert.equal((reports[0] as { status: string }).status, "LOCAL_PREFLIGHT_ONLY_NO_NETWORK");
    assert.equal((reports[0] as { completeRetentionProof: boolean }).completeRetentionProof, false);
    assert.ok(!JSON.stringify(reports).includes(env().SUPABASE_SERVICE_ROLE_KEY));
    chmodSync(file, 0o644); await assert.rejects(main(args(actual)), /PRIVATE_FILE_REQUIRED/);
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; rmSync(folder, { recursive: true, force: true }); }
});
