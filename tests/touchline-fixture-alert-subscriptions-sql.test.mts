import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migration = readFileSync(new URL("../supabase/migrations/20260924155921_touchline_fixture_alert_subscriptions.sql", import.meta.url), "utf8");
const fixture = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const userA = "00000000-0000-4000-8000-000000000011";
const userB = "00000000-0000-4000-8000-000000000012";
const missing = "00000000-0000-4000-8000-000000000099";

test("real SQL fixture alerts persist isolated idempotent opt-ins without changing notification consent", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const directory = await mkdtemp(join(tmpdir(), "touchline-fixture-alert-sql-"));
  let db = new PGlite(directory);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;
      create schema auth;
      grant usage on schema public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create table public.users(id uuid primary key);
      create table public.football_fixtures(id uuid primary key);
      create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      insert into auth.users values ('${userA}'), ('${userB}');
      insert into public.users values ('${userA}'), ('${userB}');
      insert into public.football_fixtures values ('${fixture}'), ('${other}');`);
    // Existing preferences schema is loaded unchanged to prove opt-in isolation.
    await db.exec(readFileSync(new URL("../supabase/migrations/017_touchline_notification_preferences.sql", import.meta.url), "utf8"));
    await db.exec(`insert into public.notification_preferences(user_id, settings, channels, frequency, quiet_hours)
      values ('${userA}', '{"scope":"club"}', '{"in_app":true,"push":false,"email":false}', 'paused', '{"enabled":true,"start":"21:00","end":"08:00","timezone":"Europe/Malta"}');`);
    const originalPreferences = (await db.query("select * from public.notification_preferences")).rows;
    await db.exec(migration);
    const acl = await db.query(`select relrowsecurity,
      has_table_privilege('service_role',oid,'UPDATE') as can_update,
      has_table_privilege('service_role',oid,'TRUNCATE') as can_truncate
      from pg_class where oid='public.touchline_fixture_alert_subscriptions'::regclass`);
    assert.deepEqual(acl.rows[0], { relrowsecurity: true, can_update: false, can_truncate: false });
    await db.exec("set role service_role");
    const status = async (actor: string | null = userA, id: string | null = fixture) => (
      await db.query("select public.touchline_fixture_alert_status($1::uuid,$2::uuid) as value", [id, actor])
    ).rows[0].value;
    const set = async (actor: string | null, active: boolean | null, id: string | null = fixture) => (
      await db.query("select public.touchline_set_fixture_alert_subscription($1::uuid,$2::uuid,$3::boolean) as value", [id, actor, active])
    ).rows[0].value;
    assert.deepEqual(await status(), { subscribed: false });
    assert.deepEqual(await set(userA,true), { subscribed: true });
    const created = (await db.query("select created_at from public.touchline_fixture_alert_subscriptions")).rows[0].created_at;
    assert.deepEqual(await set(userA,true), { subscribed: true });
    assert.deepEqual((await db.query("select created_at from public.touchline_fixture_alert_subscriptions")).rows[0].created_at, created);
    assert.deepEqual(await status(userB), { subscribed: false });
    assert.deepEqual(await status(userA,other), { subscribed: false });
    await set(userB,true);
    await set(userA,false); await set(userA,false);
    assert.deepEqual(await status(), { subscribed: false });
    assert.deepEqual(await status(userB), { subscribed: true });
    await assert.rejects(set(null,true), /FIXTURE_ALERT_INVALID_INPUT/);
    await assert.rejects(set(userA,null), /FIXTURE_ALERT_INVALID_INPUT/);
    await assert.rejects(set(userA,true,null), /FIXTURE_ALERT_INVALID_INPUT/);
    await assert.rejects(status(null), /FIXTURE_ALERT_INVALID_INPUT/);
    await assert.rejects(set(missing,true), /foreign key/);
    await assert.rejects(set(userA,true,missing), /foreign key/);
    for (const role of ["anon","authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(status(), /permission denied/);
      await assert.rejects(set(userA,true), /permission denied/);
      await assert.rejects(db.query("select * from public.touchline_fixture_alert_subscriptions"), /permission denied/);
      await assert.rejects(db.query("delete from public.touchline_fixture_alert_subscriptions"), /permission denied/);
    }
    await db.close(); db = new PGlite(directory);
    await db.exec("set role service_role");
    assert.deepEqual(await status(userB), { subscribed: true }, "reopen retains the subscription");
    assert.deepEqual(await status(), { subscribed: false });
    assert.deepEqual((await db.query("select * from public.notification_preferences")).rows, originalPreferences);
    await db.exec("reset role");
    await db.exec(`delete from auth.users where id='${userB}'`);
    await db.exec("set role service_role");
    assert.deepEqual(await status(userB), { subscribed: false });
  } finally { await db.close(); await rm(directory, { recursive:true, force:true }); }
});
