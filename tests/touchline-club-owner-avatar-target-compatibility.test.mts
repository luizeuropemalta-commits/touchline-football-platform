import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { isAvatarRevision, parseAvatarUploadRequest, type AvatarPublication } from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";
import { createClubOwnerAvatarPersistence } from "../lib/touchlineArena/club-owner-avatar-persistence.ts";
import { createClubOwnerAvatarClient } from "../lib/touchlineArena/club-owner-avatar-client.ts";
import { handleClubOwnerAvatarUpload } from "../lib/touchlineArena/club-owner-avatar-upload-handler.ts";
import type { AvatarRecoveryUploadDependencies as AvatarUploadDependencies } from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

const actorId = "123e4567-e89b-42d3-a456-426614174000";
const operationId = "123e4567-e89b-42d3-a456-426614174001";
const digest = "a".repeat(64);
const maximum = "9223372036854775807";
const objectKey = `${actorId}/${operationId}/${digest}.webp`;
const avatarUrl = `/api/account/avatar?version=${operationId}`;
const signal = () => new AbortController().signal;

test("avatar dependencies typecheck with the repository's unmodified target/lib and real compiler", () => {
  const root = resolve(import.meta.dirname, ".."), config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.options.target, ts.ScriptTarget.ES2017);
  const modules = readdirSync(resolve(root, "lib/touchlineArena")).filter(name => /^club-owner-avatar-.*\.ts$/.test(name)).sort();
  assert.deepEqual(modules, ["client", "context-server", "control-admission", "output-policy", "persistence", "read-handler", "resource-admission", "selection-contract", "server", "storage", "transport-limits", "ui-i18n", "upload-contract", "upload-handler", "validation"].map(name => `club-owner-avatar-${name}.ts`).sort());
  const roots = [resolve(root, "next-env.d.ts"), resolve(root, "app/api/account/avatar/route.ts"), resolve(root, "app/api/account/avatar/recovery/route.ts"),
    ...modules.map(name => resolve(root, "lib/touchlineArena", name))];
  // Compiler roots are read, never dynamically imported: server-only, GET and
  // native decoder dependencies are not executed by this compatibility check.
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, incremental: false });
  for (const file of roots) assert.ok(program.getSourceFile(file), file);
  // Keep all diagnostics, not just TS2737. No target/lib override or suppression.
  const diagnostics = ts.getPreEmitDiagnostics(program).map(item => ({
    code: item.code, file: item.file?.fileName, line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : null,
    message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
  }));
  assert.deepEqual(diagnostics, []);
});

test("public revision and request admission retain zero, exact bigint bounds and malformed/negative rejection", () => {
  for (const value of ["0", "1", "9007199254740992", "9007199254740993", "9223372036854775806", maximum]) assert.equal(isAvatarRevision(value), true, value);
  for (const value of ["9223372036854775808", "-1", "01", "1.0", "1e3", "", " 1", 0, Number.MAX_SAFE_INTEGER, null, undefined]) assert.equal(isAvatarRevision(value), false, String(value));
  for (const revision of ["0", "9007199254740993", "9223372036854775806", maximum, "9223372036854775808", "-1"]) {
    const request = new Request("https://avatar-test.invalid/api/account/avatar", { method: "POST", headers: {
      origin: "https://avatar-test.invalid", "sec-fetch-site": "same-origin", "content-type": "application/octet-stream",
      "x-touchline-expected-account": actorId, "x-touchline-avatar-operation": operationId, "x-touchline-avatar-generation": "0", "if-match": `"${revision}"`,
    } });
    const result = parseAvatarUploadRequest(request);
    if ([maximum, "9223372036854775808", "-1"].includes(revision)) assert.deepEqual(result, { ok: false, status: 428, error: "VALID_REVISION_REQUIRED" });
    else assert.deepEqual(result, { ok: true, accountId: actorId, operationId, expectedRevision: revision, baseGeneration: "0" });
  }
});

function store(response: () => unknown) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const client = createClient("https://avatar-test.invalid", "synthetic-local-fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      calls.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(response()), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });
  return { api: createClubOwnerAvatarPersistence(client, actorId), calls };
}
function publication(expectedRevision: string): AvatarPublication {
  return { actorId, operationId, expectedRevision, digest, objectKey };
}

test("real adapter and installed SDK retain exact revision+1 above MAX_SAFE_INTEGER through max, without numeric coercion", async () => {
  for (const [expectedRevision, revision] of [["0", "1"], ["9007199254740992", "9007199254740993"], ["9007199254740993", "9007199254740994"], ["9223372036854775806", maximum]]) {
    const receipt = { ...publication(expectedRevision), revision, avatarUrl };
    const fixture = store(() => ({ status: "committed", receipt }));
    assert.deepEqual(await fixture.api.publish(publication(expectedRevision), signal()), { status: "committed", receipt });
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].body.p_expected, expectedRevision);
    assert.equal(fixture.calls[0].path, "/rest/v1/rpc/touchline_publish_club_owner_avatar");
  }
  for (const revision of ["0", maximum]) {
    const current = { actorId, revision, operationId: revision === "0" ? null : operationId, digest: revision === "0" ? null : digest, avatarUrl: revision === "0" ? null : avatarUrl };
    const fixture = store(() => current);
    assert.deepEqual(await fixture.api.readCurrent(actorId, signal()), current);
  }
});

test("invalid publication revisions never dispatch; imprecise/off-by-one receipt revisions stay unknown", async () => {
  const fixture = store(() => { throw Error("Invalid admission must not dispatch"); });
  for (const expectedRevision of [maximum, "9223372036854775808", "-1", "01"]) assert.deepEqual(await fixture.api.publish(publication(expectedRevision), signal()), { status: "unknown" });
  assert.equal(fixture.calls.length, 0);
  const input = publication("9007199254740992");
  for (const revision of ["9007199254740992", "9007199254740994", 9007199254740992, "9223372036854775808"]) {
    const bad = store(() => ({ status: "committed", receipt: { ...input, revision, avatarUrl } }));
    assert.deepEqual(await bad.api.publish(input, signal()), { status: "unknown" });
    assert.equal(bad.calls.length, 1);
  }
  const invalidCurrent = store(() => ({ actorId, revision: "9223372036854775808", operationId, digest, avatarUrl }));
  await assert.rejects(invalidCurrent.api.readCurrent(actorId, signal()), /AVATAR_PERSISTENCE_UNCONFIRMED/);
});

const revisionPairs = [["0", "1"], ["9007199254740992", "9007199254740993"], ["9007199254740993", "9007199254740994"], ["9223372036854775806", maximum]] as const;
const priorUrl = "/api/account/avatar?version=123e4567-e89b-42d3-a456-426614174002";
function browserFixture(expectedRevision: string, receiptRevision: unknown, enabled = true) {
  const calls: RequestInit[] = [], bytes = new Uint8Array([1, 2, 3]); let ids = 0;
  const client = createClubOwnerAvatarClient({ enabled, current: { actorId, revision: expectedRevision, avatarUrl: priorUrl }, baseGeneration: "0", bytes,
    contentType: "image/jpeg", isCurrent: () => true, randomUUID: () => { ids++; return operationId; },
    request: async (input, init) => {
      assert.equal(input, "/api/account/avatar"); calls.push(init!);
      return Response.json({ ok: true, state: "committed", requiresRefresh: true, accountId: actorId, operationId, revision: receiptRevision, avatarUrl });
    } });
  return { client, calls, bytes, ids: () => ids };
}

test("actual browser controller preserves exact revisions, gestures, request flags and captured bytes", async () => {
  for (const [before, after] of revisionPairs) {
    const f = browserFixture(before, after); f.bytes.fill(9);
    assert.equal(f.calls.length, 0); assert.equal(await f.client.send(false), "invalid"); assert.equal(f.calls.length, 0);
    assert.equal(await f.client.send(true), "refresh_required"); assert.equal(f.calls.length, 1); assert.equal(f.ids(), 1);
    const request = f.calls[0], headers = new Headers(request.headers);
    assert.equal(request.method, "POST"); assert.equal(request.credentials, "same-origin"); assert.equal(request.cache, "no-store"); assert.equal(request.redirect, "error");
    assert.deepEqual([...request.body as Uint8Array], [1, 2, 3]);
    assert.equal(headers.get("if-match"), `"${before}"`); assert.equal(headers.get("x-touchline-expected-account"), actorId);
    assert.equal(headers.get("x-touchline-avatar-generation"), "0");
    assert.equal(headers.get("x-touchline-avatar-operation"), operationId); assert.equal(headers.get("content-type"), "image/jpeg");
    assert.equal(headers.has("origin"), false); assert.equal(f.client.snapshot().currentAvatarUrl, priorUrl);
    assert.equal(await f.client.send(true), "blocked"); assert.equal(await f.client.retry(true), "blocked"); assert.equal(f.calls.length, 1);
  }
  const off = browserFixture("0", "1", false); assert.equal(await off.client.send(true), "disabled"); assert.equal(off.calls.length, 0); assert.equal(off.ids(), 0);
  for (const before of [maximum, "9223372036854775808", "-1", "01"]) {
    const f = browserFixture(before, "1"); assert.equal(await f.client.send(true), "rejected"); assert.equal(f.calls.length, 0); assert.equal(f.ids(), 0);
  }
  for (const after of ["9007199254740992", "9007199254740994", 9007199254740992, "9223372036854775808"]) {
    const f = browserFixture("9007199254740992", after); assert.equal(await f.client.send(true), "unknown");
    assert.equal(f.calls.length, 1); assert.equal(f.client.snapshot().currentAvatarUrl, priorUrl);
    assert.equal(await f.client.retry(false), "invalid"); assert.equal(f.calls.length, 1);
  }
});

function recovery(status: "started" | "committed", revision: string, receipt: import("../lib/touchlineArena/club-owner-avatar-upload-contract.ts").AvatarReceipt | null = null) {
  return { status, snapshot: { version: 1 as const, actorId, revision, generation: receipt ? "2" : "1", activeOperationId: receipt ? null : operationId,
    fencedThroughGeneration: "-1", requestedOperationId: operationId,
    operation: { operationId, state: receipt ? "committed" as const : "pending" as const, expectedRevision: receipt?.expectedRevision ?? revision,
      baseGeneration: "0", generation: "1", legacy: false, receipt } } };
}

function handlerFixture(expectedRevision: string, receiptRevision: unknown) {
  const calls: string[] = [], publications: AvatarPublication[] = [], raw = new Uint8Array([1, 2, 3]), normalized = Buffer.from([4, 5, 6]);
  // Validation is a deliberate boundary double: these bytes are not a claim
  // of decodable image data. This test never invokes Sharp or HTTP/SQL/Storage.
  const deps: AvatarUploadDependencies = {
    actor: async () => { calls.push("actor"); return { id: actorId, allowed: true }; },
    validate: async bytes => { calls.push("validate"); assert.deepEqual([...bytes], [...raw]); return { ok: true, bytes: normalized, contentType: "image/webp", width: 1, height: 1 }; },
    readCurrent: async actor => { calls.push("read"); assert.equal(actor, actorId); return { actorId, revision: expectedRevision, avatarUrl: priorUrl, operationId: null, digest: null }; },
    beginOperation: async input => { calls.push("begin"); assert.deepEqual(input, { actorId, operationId, expectedRevision, baseGeneration: "0" }); return recovery("started", expectedRevision); },
    createImmutable: async input => { calls.push("create"); assert.deepEqual(input.bytes, normalized); assert.equal(input.contentType, "image/webp"); return { objectKey: input.objectKey, digest: input.digest }; },
    publishV2: async input => { calls.push("publish"); publications.push(input); return recovery("committed", String(receiptRevision), { ...input, revision: receiptRevision as string, avatarUrl }); },
  };
  const request = (account = actorId) => new Request("https://avatar-test.invalid/api/account/avatar", { method: "POST", body: new Uint8Array(raw), headers: {
    origin: "https://avatar-test.invalid", "sec-fetch-site": "same-origin", "content-type": "application/octet-stream",
    "x-touchline-expected-account": account, "x-touchline-avatar-operation": operationId, "x-touchline-avatar-generation": "0", "if-match": `"${expectedRevision}"`,
  } });
  return { deps, request, calls, publications };
}

test("actual upload handler keeps exact receipt increment, request identity and uncertain invalid receipts", async () => {
  for (const [before, after] of revisionPairs) {
    const f = handlerFixture(before, after), response = await handleClubOwnerAvatarUpload(f.request(), f.deps);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, state: "committed", requiresRefresh: true, accountId: actorId, operationId, revision: after, avatarUrl });
    assert.deepEqual(f.calls, ["actor", "begin", "validate", "read", "create", "publish"]);
    assert.equal(f.publications.length, 1); assert.equal(f.publications[0].expectedRevision, before);
    assert.equal(f.publications[0].actorId, actorId); assert.equal(f.publications[0].operationId, operationId);
    assert.equal(f.publications[0].objectKey, `${actorId}/${operationId}/${f.publications[0].digest}.webp`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const receipt = { ...f.publications[0], revision: after, avatarUrl };
    f.deps.readCurrent = async () => ({ actorId, revision: after, operationId, digest: receipt.digest, avatarUrl });
    f.deps.beginOperation = async () => recovery("committed", after, receipt);
    const replay = await handleClubOwnerAvatarUpload(f.request(), f.deps);
    assert.equal(replay.status, 200); assert.equal((await replay.json()).revision, after);
    assert.equal(f.publications.length, 1); assert.equal(f.calls.filter(call => call === "create").length, 1);
  }
  for (const before of [maximum, "9223372036854775808", "-1", "01"]) {
    const f = handlerFixture(before, "1"), response = await handleClubOwnerAvatarUpload(f.request(), f.deps);
    assert.equal(response.status, 428); assert.deepEqual(f.calls, []);
  }
  const swapped = handlerFixture("0", "1"), denied = await handleClubOwnerAvatarUpload(swapped.request("123e4567-e89b-42d3-a456-426614174003"), swapped.deps);
  assert.equal(denied.status, 409); assert.equal((await denied.json()).error, "ACCOUNT_CHANGED"); assert.deepEqual(swapped.calls, ["actor"]);
  for (const after of ["9007199254740992", "9007199254740994", 9007199254740992, "9223372036854775808"]) {
    const f = handlerFixture("9007199254740992", after), response = await handleClubOwnerAvatarUpload(f.request(), f.deps);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false, state: "unknown", error: "UPLOAD_UNCONFIRMED" });
    assert.equal(f.publications.length, 1);
  }
});
