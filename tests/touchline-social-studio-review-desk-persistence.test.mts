import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyStudioAction, emptyStudioDocument, type StudioAction, type StudioDeliveryAttempt, type StudioDocument } from "../lib/touchlineArena/social-studio-contract.ts";
import { studioChecksum } from "../lib/touchlineArena/social-studio-artifact.ts";

// Ephemeral PostgreSQL only. No application/remote database, auth session or secret.
const modulePath = process.env.TOUCHLINE_STUDIO_PGLITE_MODULE;
const owner = "c0f7c72b-93a7-49cd-b5e0-a7a6081587d9";
const otherOwner = "c0f7c72b-93a7-49cd-b5e0-a7a6081587d8";
const hash = `sha256:${"c".repeat(64)}`;

test("desk SQL preserves RLS, immutable reasons, CAS, per-destination paused retry and receipt-first recovery", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users (id uuid primary key); insert into auth.users values ('${owner}'),('${otherOwner}'); create role anon; create role authenticated; create role service_role bypassrls;`);
    for (const file of ["20260914212250_touchline_social_studio_review_plans.sql", "20260914222454_touchline_social_studio_review_desk.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.touchline_social_studio_deliveries"), /permission denied/);
      await assert.rejects(db.query("select public.touchline_social_studio_capabilities()"), /permission denied/);
      await assert.rejects(db.query("select public.touchline_social_studio_save_v2(null,null,null,null,null,null,null,null,null)"), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal((await db.query("select public.touchline_social_studio_capabilities() as result")).rows[0].result.schemaVersion, 2);
    const save = async (action: StudioAction, document: StudioDocument, actor = owner) => (await db.query("select public.touchline_social_studio_save_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) as result", [
      `${action.artId}:${action.platform}:${action.placement}`, action.expectedRevision, JSON.stringify(document), actor, action.requestId, studioChecksum(JSON.stringify(action)), action.action, action.action === "request-retry" ? action.deliveryId : null, action.action === "request-retry" ? action.expectedDeliveryRevision : null,
    ])).rows[0].result;
    const base = { requestId: randomUUID(), artId: "MATCH_PREVIEW", platform: "INSTAGRAM", placement: "STORY", expectedRevision: 0 } as const;
    const plan: StudioAction = { ...base, action: "save-plan", selected: true, schedule: null };
    const approved = emptyStudioDocument();
    approved.reviews[hash] = { version: "test-only-v1", sha256: hash, artworkApprovedAt: "2026-09-15T10:00:00Z", captionApprovedAt: "2026-09-15T10:00:00Z" };
    const first = await save(plan, approved);
    assert.equal(first.revision, 1);
    const failedId = randomUUID();
    const feedId = randomUUID();
    const otherAccountId = randomUUID();
    await save({ ...plan, requestId: randomUUID(), placement: "FEED" }, approved);
    const insertDelivery = async (id: string, placement: string, account: string, state: string, receipt: string | null) => db.query("insert into public.touchline_social_studio_deliveries(id,record_key,instance_id,platform,account_id,placement,media_identity,state,receipt_id,error,retryable,source_current,source_valid_until,attempt_count) values ($1,$2,'test-only-instance','INSTAGRAM',$3,$4,$5,$6,$7,$8,true,true,now()+interval '1 day',1)", [id, `MATCH_PREVIEW:INSTAGRAM:${placement}`, account, placement, hash, state, receipt, state === "FAILED" ? "Test-only destination failure" : null]);
    await insertDelivery(failedId, "STORY", "test-account", "FAILED", null);
    await insertDelivery(feedId, "FEED", "test-account", "CONFIRMED", "test-only-receipt");
    await insertDelivery(otherAccountId, "STORY", "other-test-account", "FAILED", null);
    const delivery = (await db.query("select * from public.touchline_social_studio_deliveries where id=$1", [failedId])).rows[0] as StudioDeliveryAttempt;
    const retry: StudioAction = { ...base, requestId: randomUUID(), expectedRevision: 1, action: "request-retry", deliveryId: failedId, expectedDeliveryRevision: 0, reason: "Falha transitória reconciliada apenas neste Story." };
    const document = applyStudioAction(approved, retry, null, Date.now(), delivery);
    const saved = await save(retry, document);
    assert.equal(saved.revision, 2);
    const rows = (await db.query("select id,state,error,receipt_id,revision,retry_requested_at from public.touchline_social_studio_deliveries")).rows;
    const target = rows.find((row: { id: string }) => row.id === failedId);
    assert.equal(target.state, "FAILED"); assert.equal(target.revision, 1); assert.ok(target.retry_requested_at); assert.equal(target.error, "Test-only destination failure");
    for (const id of [feedId, otherAccountId]) { const row = rows.find((item: { id: string }) => item.id === id); assert.equal(row.revision, 0); assert.equal(row.retry_requested_at, null); }
    assert.equal(rows.find((row: { id: string }) => row.id === feedId).receipt_id, "test-only-receipt");
    // Facts expire after the successful commit; recovery must still return the original receipt.
    await db.query("update public.touchline_social_studio_deliveries set source_current=false,source_valid_until=now()-interval '1 day' where id=$1", [failedId]);
    assert.equal((await save(retry, document)).replayed, true);
    assert.equal((await save(retry, document)).revision, 2);
    await assert.rejects(save({ ...retry, reason: "Pedido alterado depois da gravação." }, document), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(save(retry, document, otherOwner), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(save({ ...retry, requestId: randomUUID(), expectedRevision: 2, expectedDeliveryRevision: 1 }, document), /DELIVERY_NOT_RETRYABLE/);
    await assert.rejects(save({ ...retry, requestId: randomUUID(), placement: "FEED", expectedRevision: 1, deliveryId: feedId }, document), /DELIVERY_NOT_RETRYABLE/);
    const rejected = structuredClone(document);
    rejected.reviews[hash] = { version: "test-only-v1", sha256: hash, decision: "REJECTED", reason: "Revisar o enquadramento do atleta.", decidedAt: "2026-09-15T12:00:00Z" };
    const reject: StudioAction = { ...base, expectedRevision: 2, requestId: randomUUID(), action: "reject-artwork", mediaIdentity: hash, reason: rejected.reviews[hash].reason! };
    await save(reject, rejected);
    assert.equal((await db.query("select document from public.touchline_social_studio_history where request_id=$1", [reject.requestId])).rows[0].document.reviews[hash].reason, reject.reason);
    assert.ok((await db.query("select document from public.touchline_social_studio_history where request_id=$1", [plan.requestId])).rows[0].document.reviews[hash].artworkApprovedAt);
    await assert.rejects(save({ ...reject, requestId: randomUUID() }, rejected), /REVISION_CONFLICT/);
    await assert.rejects(db.query("update public.touchline_social_studio_records set document=jsonb_set(document,'{outbound}','\"ENABLED\"')"), /check constraint/);
    await assert.rejects(db.query("delete from public.touchline_social_studio_history"), /permission denied/);
    await db.exec("reset role");
    assert.equal((await db.query("select relrowsecurity from pg_class where relname='touchline_social_studio_deliveries'")).rows[0].relrowsecurity, true);
    assert.deepEqual((await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row: { tablename: string }) => row.tablename), ["touchline_social_studio_deliveries", "touchline_social_studio_history", "touchline_social_studio_records"], "no publishing queue or worker created");
  } finally { await db.close(); }
});
