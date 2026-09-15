import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_STUDIO_PGLITE_MODULE;
const owner = "c0f7c72b-93a7-49cd-b5e0-a7a6081587d9";
const otherOwner = "c0f7c72b-93a7-49cd-b5e0-a7a6081587d8";
const identity = `sha256:${"d".repeat(64)}`;
const key = "MATCH_PREVIEW:INSTAGRAM:FEED";

test("Studio v3 requires recent server-timed two-loop evidence bound to actor, record and media", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'),('${otherOwner}');
      create role anon; create role authenticated; create role service_role bypassrls;`);
    for (const file of [
      "20260914212250_touchline_social_studio_review_plans.sql",
      "20260914222454_touchline_social_studio_review_desk.sql",
      "20260915110000_touchline_social_studio_server_review_evidence.sql",
    ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    await db.exec("set role service_role");
    assert.deepEqual((await db.query("select public.touchline_social_studio_capabilities() result")).rows[0].result,
      { schemaVersion: 3, outbound: "DISABLED", reviewEvidence: "SERVER_TIMED" });
    await assert.rejects(db.query("select public.touchline_social_studio_save(null,null,null,null,null,null,null)"), /permission denied/);
    await assert.rejects(db.query("select public.touchline_social_studio_save_v2(null,null,null,null,null,null,null,null,null)"), /permission denied/);

    const interruptedSessionId = randomUUID();
    await db.query("select public.touchline_social_studio_review_start($1,$2,$3,$4,$5,$6)", [interruptedSessionId, owner, key, 0, identity, 1]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await db.query("select public.touchline_social_studio_review_invalidate($1,$2)", [interruptedSessionId, owner]);
    await assert.rejects(
      db.query("select public.touchline_social_studio_review_tick($1,$2)", [interruptedSessionId, owner]),
      /TL_STUDIO_REVIEW_SESSION_INVALID/,
      "a pause, seek, stall or hidden tab invalidates the server review instead of accruing idle time",
    );

    const liveSessionId = randomUUID();
    await db.query("select public.touchline_social_studio_review_start($1,$2,$3,$4,$5,$6)", [liveSessionId, owner, key, 0, identity, 1]);
    let liveLoops = 0;
    for (let index = 0; index < 6 && liveLoops < 2; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      liveLoops = Number((await db.query("select public.touchline_social_studio_review_tick($1,$2) result", [liveSessionId, owner])).rows[0].result.completed_loops);
    }
    assert.equal(liveLoops, 2, "two real server-timed durations complete without a third playback");

    const sessionId = randomUUID();
    await db.query("select public.touchline_social_studio_review_start($1,$2,$3,$4,$5,$6)", [sessionId, owner, key, 0, identity, 6]);
    const document = { outbound: "DISABLED", permission: "PAUSED", selected: false, schedule: null,
      reviews: { [identity]: { version: "test-v1", sha256: identity, artworkApprovedAt: new Date().toISOString() } } };
    const save = (actor = owner, media = identity, requestId = randomUUID()) => db.query(
      "select public.touchline_social_studio_save_v3($1,0,$2,$3,$4,$5,'approve-artwork',null,null,$6,$7)",
      [key, JSON.stringify(document), actor, requestId, `sha256:${"e".repeat(64)}`, sessionId, media]);
    await assert.rejects(save(), /TL_STUDIO_SERVER_REVIEW_REQUIRED/);
    await assert.rejects(save(otherOwner), /TL_STUDIO_SERVER_REVIEW_REQUIRED/);
    await assert.rejects(save(owner, `sha256:${"f".repeat(64)}`), /TL_STUDIO_SERVER_REVIEW_REQUIRED/);

    // Accelerate the isolated clock fixture; production callers cannot update this protected table directly.
    await db.query("update public.touchline_social_studio_review_evidence set observed_seconds=11.5,last_tick_at=now()-interval '1 second' where id=$1", [sessionId]);
    const tick = (await db.query("select public.touchline_social_studio_review_tick($1,$2) result", [sessionId, owner])).rows[0].result;
    assert.equal(tick.completed_loops, 2);
    assert.ok(tick.completed_at);
    assert.equal((await db.query("select public.touchline_social_studio_review_tick($1,$2) result", [sessionId, owner])).rows[0].result.completed_loops, 2,
      "a completed session remains readable while the video emits its final events");
    const requestId = randomUUID();
    const saved = await save(owner, identity, requestId);
    assert.equal(saved.rows[0].touchline_social_studio_save_v3.revision, 1);
    const secondDocument = structuredClone(document);
    secondDocument.reviews[identity].captionApprovedAt = new Date().toISOString();
    await assert.rejects(db.query(
      "select public.touchline_social_studio_save_v3($1,1,$2,$3,$4,$5,'approve-caption',null,null,$6,$7)",
      [key, JSON.stringify(secondDocument), owner, randomUUID(), `sha256:${"f".repeat(64)}`, sessionId, identity]),
      /TL_STUDIO_SERVER_REVIEW_REQUIRED/,
      "one completed review session cannot approve a second decision",
    );
    assert.ok((await db.query("select consumed_at from public.touchline_social_studio_review_evidence where id=$1", [sessionId])).rows[0].consumed_at);
    await db.query("update public.touchline_social_studio_review_evidence set completed_at=now()-interval '1 hour' where id=$1", [sessionId]);
    const replay = await save(owner, identity, requestId);
    assert.equal(replay.rows[0].touchline_social_studio_save_v3.replayed, true, "receipt recovery precedes evidence expiry");
    await db.exec("reset role");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.touchline_social_studio_review_evidence"), /permission denied/);
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});
