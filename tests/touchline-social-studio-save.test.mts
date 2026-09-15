import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyStudioAction, emptyStudioDocument, type StudioAction, type StudioMedia, type StudioRecord } from "../lib/touchlineArena/social-studio-contract.ts";
import { studioRequestHandler } from "../lib/touchlineArena/social-studio-request.ts";
import { orchestrateStudioSave, type StudioSaveReceipt } from "../lib/touchlineArena/social-studio-save.ts";

const actorId = "c0f7c72b-93a7-49cd-b5e0-a7a6081587d9";
const base = { requestId: "a2c1fa0d-ab0c-4fb1-887a-a5ec75165430", artId: "MATCH_PREVIEW", platform: "INSTAGRAM", placement: "FEED", expectedRevision: 0 } as const;
const identity = `sha256:${"b".repeat(64)}`;
const media: StudioMedia = {
  artId: "MATCH_PREVIEW", version: "test-v1", placement: "FEED", filePath: "artifacts/social-studio/test.mp4", sha256: identity,
  objectKey: `v1/MATCH_PREVIEW/FEED/${"b".repeat(64)}.mp4`, byteSize: 1024, etag: '"test-etag"',
  width: 1080, height: 1350, durationSeconds: 6, caption: "Test fixture only; not a publishable artifact.",
  verification: { reportPath: "artifacts/social-studio/report.json", reportSha256: identity },
  provenance: { source: "test-fixture", fetchedAt: "2026-09-14T11:00:00Z", asOf: "2026-09-14T10:00:00Z", validUntil: "2026-09-15T00:00:00Z", competitionId: "test-league", seasonId: "test-season", fixtureIds: ["test-fixture"], teamIds: ["test-home", "test-away"], playerIds: ["test-home-player", "test-away-player"], snapshotPath: "artifacts/social-studio/snapshot.json", snapshotSha256: identity },
};

for (const action of [
  { ...base, action: "save-plan", selected: true, schedule: { localDateTime: "2026-09-14T14:00", timeZone: "UTC", occurrence: "earlier" } },
  { ...base, action: "approve-artwork", mediaIdentity: identity, reviewSessionId: "b2c1fa0d-ab0c-4fb1-887a-a5ec75165430" },
] satisfies StudioAction[]) {
  test(`${action.action}: lost-response retry recovers the receipt before expired media/time validation`, async () => {
    let now = Date.parse("2026-09-14T12:00:00Z");
    let receipt: StudioSaveReceipt | null = null;
    let preparationCount = 0;
    let commitCount = 0;
    const dependencies = {
      findReceipt: async (requestId: string) => { assert.equal(requestId, action.requestId); return receipt; },
      prepareDocument: async () => {
        preparationCount++;
        return applyStudioAction(emptyStudioDocument(), action, { identity, manifest: media }, now);
      },
      commit: async (document: StudioRecord["document"], attempt: { recordKey: string; requestChecksum: string }): Promise<StudioRecord> => {
        commitCount++;
        receipt = { request_id: action.requestId, record_key: attempt.recordKey, actor_id: actorId, request_checksum: attempt.requestChecksum, action: action.action, revision: 1, document, created_at: new Date(now).toISOString() };
        throw new Error("PERSISTENCE_UNAVAILABLE"); // Committed, but the response was lost at the storage boundary.
      },
    };
    await assert.rejects(orchestrateStudioSave(action, actorId, dependencies), /PERSISTENCE_UNAVAILABLE/);
    now = Date.parse("2026-09-16T12:00:00Z");
    assert.throws(() => applyStudioAction(emptyStudioDocument(), action, { identity, manifest: media }, now), /SCHEDULE_IN_PAST|FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID/);
    const recovered = await orchestrateStudioSave(action, actorId, dependencies);
    assert.equal(recovered.revision, 1);
    assert.equal(recovered.updated_at, "2026-09-14T12:00:00.000Z");
    assert.equal(recovered.document.permission, "PAUSED");
    assert.equal(preparationCount, 1, "retry must not revalidate media, source freshness or schedule time");
    assert.equal(commitCount, 1, "retry must not commit another mutation");
    if (action.action === "save-plan") assert.equal(recovered.document.schedule?.utc, "2026-09-14T14:00:00.000Z");
    else assert.equal(recovered.document.reviews[identity]?.artworkApprovedAt, "2026-09-14T12:00:00.000Z");
  });
}

test("receipt recovery requires the exact actor, request ID, action, key and checksum; new requests retain preparation/CAS", async () => {
  const action: StudioAction = { ...base, action: "save-plan", selected: true, schedule: null };
  let receipt: StudioSaveReceipt | null = null;
  let preparationCount = 0;
  let commitCount = 0;
  const dependencies = {
    findReceipt: async () => receipt,
    prepareDocument: async () => { preparationCount++; return emptyStudioDocument(); },
    commit: async (document: StudioRecord["document"], attempt: { recordKey: string; requestChecksum: string }) => {
      commitCount++;
      receipt = { request_id: action.requestId, record_key: attempt.recordKey, actor_id: actorId, request_checksum: attempt.requestChecksum, action: action.action, revision: 1, document, created_at: "2026-09-14T12:00:00.000Z" };
      return { record_key: attempt.recordKey, revision: 1, document, updated_at: receipt.created_at };
    },
  };
  await orchestrateStudioSave(action, actorId, dependencies);
  const original = receipt! as StudioSaveReceipt;
  await assert.rejects(orchestrateStudioSave({ ...action, selected: false }, actorId, dependencies), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(orchestrateStudioSave(action, "c0f7c72b-93a7-49cd-b5e0-a7a6081587d8", dependencies), /IDEMPOTENCY_CONFLICT/);
  for (const changed of [
    { request_id: "a2c1fa0d-ab0c-4fb1-887a-a5ec75165431" },
    { record_key: "MATCH_PREVIEW:FACEBOOK:FEED" },
    { action: "approve-caption" as const },
    { request_checksum: identity },
  ]) {
    receipt = { ...original, ...changed };
    await assert.rejects(orchestrateStudioSave(action, actorId, dependencies), /IDEMPOTENCY_CONFLICT/);
  }
  assert.equal(preparationCount, 1);
  assert.equal(commitCount, 1);
  await assert.rejects(orchestrateStudioSave({ ...action, requestId: "a2c1fa0d-ab0c-4fb1-887a-a5ec75165431" }, actorId, {
    ...dependencies, findReceipt: async () => null, commit: async () => { throw new Error("REVISION_CONFLICT"); },
  }), /REVISION_CONFLICT/);
  assert.equal(preparationCount, 2, "an unseen request still reaches validation and the transaction fence");
});

test("receipt lookup failure prevents validation/write and infrastructure errors ask for history reconciliation", async () => {
  const action: StudioAction = { ...base, action: "save-plan", selected: false, schedule: null };
  await assert.rejects(orchestrateStudioSave(action, actorId, {
    findReceipt: async () => { throw new Error("PERSISTENCE_UNAVAILABLE"); },
    prepareDocument: async () => { assert.fail("No validation after an uncertain receipt lookup"); },
    commit: async () => { assert.fail("No write after an uncertain receipt lookup"); },
  }), /PERSISTENCE_UNAVAILABLE/);
  for (const code of ["PERSISTENCE_UNAVAILABLE", "IDEMPOTENCY_CONFLICT", "transport timeout"]) {
    const handler = studioRequestHandler({ authorize: async () => actorId, save: async () => { throw new Error(code); } });
    const result = await handler(new Request("https://qa.example.test/api/admin/social-publications/studio", { method: "POST", headers: { Origin: "https://qa.example.test", "Content-Type": "application/json" }, body: JSON.stringify(action) }));
    const body = await result.json();
    assert.match(body.error, /histórico/i);
    assert.doesNotMatch(body.error, /nada foi salvo|nenhuma alteração foi salva/i);
    if (code === "PERSISTENCE_UNAVAILABLE") assert.equal(result.status, 503);
    if (code === "IDEMPOTENCY_CONFLICT") assert.equal(result.status, 409);
  }
});

test("the protected server invokes the tested orchestration while preserving QA and transaction controls", async () => {
  const server = await readFile(new URL("../lib/touchlineArena/social-studio-server.ts", import.meta.url), "utf8");
  const save = server.slice(server.indexOf("export async function saveStudioAction"));
  assert.ok(save.indexOf("assertTouchlineSocialQaRuntime()") < save.indexOf("return orchestrateStudioSave(action, actorId"));
  assert.match(save, /from\("touchline_social_studio_history"\)[\s\S]*\.eq\("request_id", requestId\)/);
  assert.match(save, /p_expected_revision: action\.expectedRevision/);
  assert.match(save, /p_actor_id: actorId, p_request_id: action\.requestId, p_request_checksum: requestChecksum/);
});
