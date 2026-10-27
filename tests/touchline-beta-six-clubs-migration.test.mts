import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import { resolveTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";
import { resolveTouchlineCanonicalClub } from "../lib/touchlineArena/club-registry.ts";

const read = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}.sql`, import.meta.url), "utf8");
const migration = read("20261025143741_touchline_beta_six_clubs");
const signatures = ["touchline_fantasy_prepare_user_gameweek(uuid,uuid)", "touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)", "touchline_fantasy_enroll_beta(uuid,text)"];
const uid = "10000000-0000-4000-8000-000000000001";

test("the two added Beta identities resolve through the canonical club registry", () => {
  for (const [id, slug] of [["3", "sunderland"], ["13", "everton"]]) {
    const result = resolveTouchlineCanonicalClub(id);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.club.slug, slug);
  }
});

test("six-club forward preserves functions, ACLs and historical enrollment while returning current eligibility", async () => {
  const db = await clubRoundDatabase();
  try {
    await db.exec(`create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
      alter table public.users add column full_name text not null default '';
      create table public.touchline_platform_owner_accounts(user_id uuid,normalized_email text);`);
    await db.exec(read("20260825182600_touchline_fantasy_subscription_event_ordering"));
    await db.exec(read("20261011011000_touchline_fantasy_owner_vip_access"));
    await db.exec(read("20261011012000_touchline_fantasy_beta_enrollment"));
    await db.exec(`insert into auth.users values('${uid}','beta@example.com',now(),'{"touchline_arena_access_v1":true}');
      insert into public.users(id,full_name) values('${uid}','Preserved identity');`);
    const enroll = async () => (await db.query<{ value: Record<string, unknown> }>("select public.touchline_fantasy_enroll_beta($1,'beta@example.com') value", [uid])).rows[0].value;
    const beforeReceipt = await enroll();
    assert.deepEqual(beforeReceipt.allowedClubTeamIds, ["22", "117", "116", "52"]);
    const records = async () => (await db.query("select to_jsonb(e) entitlement,to_jsonb(a) audit from touchline_fantasy_entitlements e join touchline_fantasy_beta_enrollments a on a.user_id=e.user_id")).rows;
    const recordsBefore = await records();
    const functions = async () => (await db.query<{ signature: string; definition: string; owner: number; acl: string | null; config: string[] | null; security: boolean }>(
      "select oid::regprocedure::text signature,pg_get_functiondef(oid) definition,proowner owner,proacl::text acl,proconfig config,prosecdef security from pg_proc where oid=any($1::regprocedure[]) order by oid", [signatures])).rows;
    const before = await functions();
    await db.exec(migration);
    const after = await functions();
    assert.equal(after.length, 3);
    for (let i = 0; i < before.length; i++) {
      const expected = before[i].definition.replace("array['22','117','116','52']::text[]", "array['22','117','116','52','3','13']::text[]")
        .replace("jsonb_build_array('22','117','116','52')", "jsonb_build_array('22','117','116','52','3','13')");
      assert.notEqual(expected, before[i].definition);
      assert.deepEqual(after[i], { ...before[i], definition: expected });
    }
    assert.deepEqual(await records(), recordsBefore, "migration does not alter accounts or immutable receipts");
    const current = await enroll();
    assert.deepEqual(current.allowedClubTeamIds, resolveTouchlineFantasyMarketAccess("beta")!.allowedClubTeamIds);
    assert.equal(current.budgetEur, 50_000_000);
    assert.deepEqual(await records(), recordsBefore, "same-account replay preserves old audit receipt and entitlement");
    await db.exec(migration);
    assert.deepEqual(await functions(), after, "migration replay is a no-op");
    // A drift in a later function must roll back an earlier successful replacement.
    for (const fn of before) await db.exec(fn.definition);
    const broken = before.find(fn => fn.signature.startsWith("touchline_fantasy_save_lineup("))!;
    await db.exec(broken.definition.replace("array['22','117','116','52']::text[]", "array['22','117','116','999']::text[]"));
    const drifted = await functions();
    await assert.rejects(db.exec(migration), /TL_BETA_SIX_CLUB_SOURCE_MISMATCH/);
    await db.exec("rollback");
    assert.deepEqual(await functions(), drifted, "no partial policy update when preimage differs");
    assert.deepEqual(await records(), recordsBefore);
  } finally { await db.close(); }
});
