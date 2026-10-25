import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const base = readFileSync(new URL("../supabase/migrations/20260924155921_touchline_fixture_alert_subscriptions.sql", import.meta.url), "utf8");
const revision = readFileSync(new URL("../supabase/migrations/20261024123038_touchline_fixture_alert_revision.sql", import.meta.url), "utf8");
const fixture = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000011";
const other = "00000000-0000-4000-8000-000000000012";

test("fixture interest CAS survives removal, no-ops, delayed old writes and exact bigint revisions", { skip: !modulePath, timeout: 60_000 }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.football_fixtures(id uuid primary key);
      grant usage on schema public to anon,authenticated,service_role;
      insert into auth.users values('${owner}'),('${other}');
      insert into public.football_fixtures values('${fixture}');`);
    await db.exec(base);
    // Existing interest must be retained; no re-enrollment, consent or data reset.
    await db.query("insert into public.touchline_fixture_alert_subscriptions values($1,$2,'2026-10-01T00:00:00Z')", [fixture,other]);
    // A migration-history failure must undo DDL, grants and dropped legacy RPC.
    const catalogue = async () => (await db.query(`select oid::text,proname,pg_get_functiondef(oid) definition,proacl::text acl
      from pg_proc where pronamespace='public'::regnamespace and proname in
      ('touchline_fixture_alert_status','touchline_set_fixture_alert_subscription') order by oid`)).rows;
    const beforeCatalogue = await catalogue();
    await db.exec("create table migration_history_test(version text primary key check(version <> 'reject'))");
    await db.exec("begin");
    await db.exec(revision);
    await assert.rejects(db.exec("insert into migration_history_test values('reject')"), /check constraint/);
    await db.exec("rollback");
    assert.equal((await db.query("select to_regclass('public.touchline_fixture_alert_revisions') value")).rows[0].value,null);
    assert.deepEqual(await catalogue(),beforeCatalogue);
    assert.equal((await db.query("select count(*)::int n from migration_history_test")).rows[0].n,0);
    await db.exec(`begin;${revision}commit;`);
    assert.equal((await db.query("select to_regprocedure('public.touchline_set_fixture_alert_subscription(uuid,uuid,boolean)') old")).rows[0].old, null);
    await db.exec("set role service_role");
    const status = async (user = owner) => (await db.query("select public.touchline_fixture_alert_status($1,$2) value", [fixture,user])).rows[0].value;
    const write = async (active: boolean, expected: string | null, user = owner) => (await db.query(
      "select public.touchline_set_fixture_alert_subscription($1,$2,$3,$4::bigint) value", [fixture,user,active,expected])).rows[0].value;
    assert.deepEqual(await status(), { subscribed:false, revision:"0" });
    assert.equal((await db.query("select count(*)::text n from public.touchline_fixture_alert_revisions")).rows[0].n, "0", "GET does not create state");
    assert.deepEqual(await status(other), { subscribed:true, revision:"0" });
    assert.deepEqual(await write(true,"0",other), { subscribed:true, revision:"1" });
    assert.equal(new Date((await db.query("select created_at from public.touchline_fixture_alert_subscriptions where user_id=$1",[other])).rows[0].created_at).toISOString(), "2026-10-01T00:00:00.000Z");
    // New mounting wins then removes. The old mounting's original save is late.
    assert.deepEqual(await write(true,"0"), { subscribed:true, revision:"1" });
    assert.deepEqual(await write(false,"1"), { subscribed:false, revision:"2" });
    assert.deepEqual(await write(true,"0"), { conflict:true });
    assert.deepEqual(await status(), { subscribed:false, revision:"2" });
    assert.deepEqual(await write(false,"2"), { subscribed:false, revision:"3" }, "accepted no-op consumes revision");
    assert.deepEqual(await write(true,"2"), { conflict:true });
    assert.deepEqual(await write(true,"3"), { subscribed:true, revision:"4" }, "ABA never resets revision");
    assert.deepEqual(await write(false,"3"), { conflict:true }, "duplicate command cannot apply twice");
    await assert.rejects(write(true,null), /FIXTURE_ALERT_INVALID_INPUT/);
    await assert.rejects(write(true,"-1"), /FIXTURE_ALERT_INVALID_INPUT/);
    await assert.rejects(write(true,"9223372036854775807"), /FIXTURE_ALERT_REVISION_OVERFLOW/);
    await db.exec("reset role");
    await db.query("update public.touchline_fixture_alert_revisions set revision=9007199254740993 where user_id=$1", [owner]);
    await db.exec("set role service_role");
    assert.deepEqual(await write(false,"9007199254740993"), { subscribed:false, revision:"9007199254740994" });
    for (const role of ["anon","authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(status(), /permission denied/);
      await assert.rejects(write(true,"0"), /permission denied/);
      await assert.rejects(db.query("select * from public.touchline_fixture_alert_revisions"), /permission denied/);
    }
    await db.exec("reset role");
    const acl = (await db.query(`select relrowsecurity,relforcerowsecurity,
      has_table_privilege('service_role',oid,'DELETE') can_delete,
      has_table_privilege('service_role',oid,'TRUNCATE') can_truncate
      from pg_class where oid='public.touchline_fixture_alert_revisions'::regclass`)).rows[0];
    assert.deepEqual(acl, { relrowsecurity:true,relforcerowsecurity:true,can_delete:false,can_truncate:false });
    // A failed command must roll its revision increment back atomically too.
    await db.exec(`create function public.reject_interest() returns trigger language plpgsql as $$
      begin raise exception 'INTENTIONAL_INTEREST_FAILURE'; end $$;
      create trigger reject_interest before insert on public.touchline_fixture_alert_subscriptions
        for each row execute function public.reject_interest(); set role service_role;`);
    await assert.rejects(write(true,"9007199254740994"), /INTENTIONAL_INTEREST_FAILURE/);
    assert.deepEqual(await status(), { subscribed:false,revision:"9007199254740994" });
  } finally { await db.close(); }
});

test("CAS upgrade preserves real enrollment/outbox triggers, no-op epochs and removal fences", { skip: !modulePath, timeout: 60_000 }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  const device = "00000000-0000-4000-8000-000000000021";
  const otherDevice = "00000000-0000-4000-8000-000000000022";
  try {
    // Only foundational account/fixture and auth helpers are reduced. Load the
    // notification tables, constraints and every enrollment/outbox trigger from
    // unmodified migrations. This is an upgrade test, NOT admission/send proof.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table public.users(id uuid primary key references auth.users(id) on delete cascade);
      create table public.football_fixtures(id uuid primary key);
      create function public.touch_updated_at() returns trigger language plpgsql as $$
        begin new.updated_at=now(); return new; end $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      insert into auth.users values('${owner}'),('${other}');
      insert into public.users values('${owner}'),('${other}');
      insert into public.football_fixtures values('${fixture}');`);
    for (const name of ["017_touchline_notification_preferences.sql", "20260910183000_touchline_notification_devices.sql",
      "20260926233755_touchline_notification_devices_forward_restore.sql"]) {
      await db.exec(`begin;${readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8")}commit;`);
    }
    await db.exec(base); // Already-installed legacy migration owns its transaction.
    await db.exec(`insert into public.notification_preferences(user_id,channels,settings,explicit_consent_at)
        select id,'{"push":true}','{"goalsAndEvents":true}','2026-10-01T00:00:00Z' from public.users;
      insert into public.notification_devices(id,user_id,installation_id,permission,push_subscription) values
        ('${device}','${owner}','${device}','granted','{"endpoint":"https://example.invalid/push","keys":{"auth":"aaaaaaaaaaaaaaaa","p256dh":"bbbbbbbbbbbbbbbb"}}'),
        ('${otherDevice}','${other}','${otherDevice}','granted','{"endpoint":"https://example.invalid/push","keys":{"auth":"aaaaaaaaaaaaaaaa","p256dh":"bbbbbbbbbbbbbbbb"}}');
      insert into public.touchline_fixture_alert_subscriptions
        select '${fixture}',id,'2026-10-01T00:00:00Z' from public.users;`);
    for (const name of [
      "20260924222644_touchline_match_push_outbox.sql",
      "20260927005940_touchline_match_push_subscription_binding.sql",
      "20260927023959_touchline_match_push_delivery_kind.sql",
      "20261002003838_touchline_match_push_identity_ledger.sql",
      "20261002010527_touchline_match_push_enrollment.sql",
    ]) await db.exec(`begin;${readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8")}commit;`);
    // Seed already-existing coverage and receipts before the CAS upgrade. The
    // real AFTER INSERT outbox trigger must create its own identity ledger.
    await db.exec(`insert into public.touchline_match_push_enrollments
        (device_id,fixture_id,generation,interest_created_at,consent_at,subscription,subscription_fingerprint,baseline,last_checkpoint,excluded_event_ids,needs_baseline)
      select id,'${fixture}',1,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',push_subscription,'sha256:'||repeat('f',64),'{}','{}','{}',false
        from public.notification_devices;
      insert into public.touchline_match_push_outbox
        (device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at,subscription_fingerprint,delivery_kind,enrollment_generation)
      select id,'${fixture}','9','sha256:'||repeat('a',64),now(),'{}',now()+interval '1 hour','sha256:'||repeat('f',64),'initial',1
        from public.notification_devices;`);
    const tables = ["notification_preferences","notification_devices","touchline_fixture_alert_subscriptions",
      "touchline_match_push_enrollments","touchline_match_push_outbox","touchline_match_push_identity_ledger"];
    const snapshot = async () => Promise.all(tables.map(async table => (await db.query(
      `select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`)).rows));
    const before = await snapshot();
    assert.equal(before[5].length,2,"actual outbox trigger generated both ledger receipts");
    await db.exec(`begin;${revision}commit;`);
    assert.deepEqual(await snapshot(),before,"upgrade cannot rewrite existing interest, consent, coverage or receipts");
    const epoch = async () => (await db.query(`select generation::text,needs_baseline
      from public.touchline_match_push_enrollments where device_id=$1`,[device])).rows[0];
    const write = async (active: boolean, expected: string) => (await db.query(
      "select public.touchline_set_fixture_alert_subscription($1,$2,$3,$4::bigint) value",[fixture,owner,active,expected])).rows[0].value;
    await db.exec("set role service_role");
    assert.deepEqual(await write(true,"0"),{subscribed:true,revision:"1"});
    assert.deepEqual(await snapshot(),before,"accepted existing-interest no-op consumes CAS only, never enrollment epoch");
    assert.deepEqual(await write(false,"1"),{subscribed:false,revision:"2"});
    assert.deepEqual(await epoch(),{generation:"2",needs_baseline:true});
    assert.deepEqual(await write(true,"0"),{conflict:true});
    assert.deepEqual(await write(false,"2"),{subscribed:false,revision:"3"});
    assert.deepEqual(await epoch(),{generation:"2",needs_baseline:true},"no-row DELETE must not fire row invalidation");
    assert.deepEqual(await write(true,"3"),{subscribed:true,revision:"4"});
    assert.deepEqual(await epoch(),{generation:"3",needs_baseline:true},"re-add cannot revive old coverage");
    const after = await snapshot();
    for (const index of [0,1,4,5]) assert.deepEqual(after[index],before[index],`${tables[index]} unchanged by interest mutations`);
    assert.deepEqual((await db.query(`select generation::text,needs_baseline from public.touchline_match_push_enrollments
      where device_id=$1`,[otherDevice])).rows[0],{generation:"1",needs_baseline:false},"other account coverage remains valid");
    assert.equal((await db.query(`select count(*)::int n from public.touchline_match_push_outbox q
      join public.touchline_match_push_enrollments e using(device_id,fixture_id)
      where q.device_id=$1 and q.enrollment_generation=e.generation and not e.needs_baseline`,[device])).rows[0].n,0,
    "old queue generation is never rebound by unsubscribe/re-subscribe");
    // Force a real enrollment-trigger write failure, not a substitute trigger.
    // Its enclosing CAS revision and DELETE must roll back with the coverage.
    await db.exec("reset role; alter table public.touchline_match_push_enrollments add constraint test_epoch_failure check(generation<4); set role service_role");
    await assert.rejects(write(false,"4"),/test_epoch_failure/);
    assert.deepEqual((await db.query("select public.touchline_fixture_alert_status($1,$2) value",[fixture,owner])).rows[0].value,
      {subscribed:true,revision:"4"});
    assert.deepEqual(await epoch(),{generation:"3",needs_baseline:true});
    await db.exec("reset role; alter table public.touchline_match_push_enrollments drop constraint test_epoch_failure; set role service_role");
    await assert.rejects(db.query("select public.touchline_set_fixture_alert_subscription($1,$2,true,0)",
      [fixture,"00000000-0000-4000-8000-000000000099"]),/foreign key constraint/);
    assert.equal((await db.query("select count(*)::int n from public.touchline_fixture_alert_revisions")).rows[0].n,1);
    // Actual fixture FKs cascade together; stale revisions/coverage/receipts
    // must not survive deletion, independent of trigger firing order.
    await db.exec("reset role");
    await db.query("delete from public.football_fixtures where id=$1",[fixture]);
    for (const table of [...tables.slice(2),"touchline_fixture_alert_revisions"]) {
      assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,0,table);
    }
    for (const table of tables.slice(0,2)) assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,2);
  } finally { await db.close(); }
});
