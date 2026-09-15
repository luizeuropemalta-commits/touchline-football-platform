import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { applyStudioAction, emptyStudioDocument, type StudioAction, type StudioDocument } from "../lib/touchlineArena/social-studio-contract.ts";
import { studioChecksum } from "../lib/touchlineArena/social-studio-artifact.ts";

// Optional isolated PostgreSQL harness; no remote credentials or application database are used.
// Run with TOUCHLINE_STUDIO_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js.
const modulePath = process.env.TOUCHLINE_STUDIO_PGLITE_MODULE;
const migrationUrl = new URL("../supabase/migrations/20260914212250_touchline_social_studio_review_plans.sql", import.meta.url);
const owner = "c0f7c72b-93a7-49cd-b5e0-a7a6081587d9";
type Saved = { record_key: string; revision: number; document: StudioDocument; replayed: boolean };

test("SQL enforces RLS, atomic revision fence, audit/idempotency, paused-only storage and refresh persistence", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users (id uuid primary key); insert into auth.users values ('${owner}');
      create role anon; create role authenticated; create role service_role bypassrls;`);
    await db.exec(await readFile(migrationUrl, "utf8"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.touchline_social_studio_records"), /permission denied/);
      await assert.rejects(db.query("insert into public.touchline_social_studio_records(record_key, document) values ('forged', '{}'::jsonb)"), /permission denied/);
      await assert.rejects(db.query("select public.touchline_social_studio_save(null,null,null,null,null,null,null)"), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const save = async (action: StudioAction, document: StudioDocument): Promise<Saved> => {
      const result = await db.query("select public.touchline_social_studio_save($1,$2,$3,$4,$5,$6,$7) as result", [
        `${action.artId}:${action.platform}:${action.placement}`, action.expectedRevision, JSON.stringify(document), owner, action.requestId, studioChecksum(JSON.stringify(action)), action.action,
      ]);
      return result.rows[0].result;
    };
    const action: StudioAction = { requestId: randomUUID(), artId: "MATCH_PREVIEW", platform: "INSTAGRAM", placement: "FEED", expectedRevision: 0, action: "save-plan", selected: true, schedule: { localDateTime: "2026-10-25T02:30", timeZone: "Europe/Malta", occurrence: "later" } };
    const document = applyStudioAction(emptyStudioDocument(), action, null, Date.parse("2026-09-14T00:00:00Z"));
    const first = await save(action, document);
    assert.equal(first.revision, 1);
    assert.equal(first.replayed, false);
    const duplicate = await save(action, document);
    assert.equal(duplicate.revision, 1);
    assert.equal(duplicate.replayed, true);
    assert.equal((await db.query("select count(*)::integer as count from public.touchline_social_studio_history")).rows[0].count, 1);
    const reloaded = (await db.query("select document from public.touchline_social_studio_records where record_key=$1", [first.record_key])).rows[0].document;
    assert.deepEqual(reloaded, document);
    assert.equal(reloaded.schedule.utc, "2026-10-25T01:30:00.000Z");
    await assert.rejects(save({ ...action, selected: false }, document), /TL_STUDIO_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(save({ ...action, requestId: randomUUID() }, document), /TL_STUDIO_REVISION_CONFLICT/);
    const race = await Promise.allSettled([
      save({ ...action, requestId: randomUUID(), expectedRevision: 1 }, document),
      save({ ...action, requestId: randomUUID(), expectedRevision: 1 }, document),
    ]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(race.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await save(action, document)).revision, 1, "retry of old request returns its original receipt");
    assert.equal((await db.query("select revision from public.touchline_social_studio_records")).rows[0].revision, 2);
    assert.equal((await db.query("select count(*)::integer as count from public.touchline_social_studio_history")).rows[0].count, 2);
    await assert.rejects(db.query("update public.touchline_social_studio_records set document=jsonb_set(document, '{permission}', '\"ACTIVE\"'::jsonb)"), /check constraint/);
    await assert.rejects(db.query("insert into public.touchline_social_studio_records(record_key, document) values ('missing-guards', '{}'::jsonb)"), /check constraint/);
    await assert.rejects(db.query("delete from public.touchline_social_studio_history"), /permission denied/);
    await db.exec("reset role");
    assert.deepEqual((await db.query("select relrowsecurity from pg_class where relname in ('touchline_social_studio_records','touchline_social_studio_history') order by relname")).rows.map((row: { relrowsecurity: boolean }) => row.relrowsecurity), [true, true]);
  } finally { await db.close(); }
});
