import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migration = readFileSync(new URL('../supabase/migrations/20260927023959_touchline_match_push_delivery_kind.sql', import.meta.url), 'utf8');

test('classification DDL and history roll back together in a runner-owned transaction', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.touchline_match_push_outbox(id int primary key, device_id int, fixture_id int,
        provider_event_id text, source_checksum text, subscription_fingerprint text, state text);
      create table public.test_history(version text check(false));`);
    await db.exec('begin;');
    await db.exec(migration);
    await assert.rejects(db.exec("insert into test_history values('20260927023959')"), /check constraint/);
    await db.exec('rollback;');
    assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='touchline_match_push_outbox' and column_name='delivery_kind'")).rows[0].n, 0);
    assert.equal((await db.query("select to_regclass('public.touchline_match_push_one_initial_idx') as idx")).rows[0].idx, null);
    assert.equal((await db.query("select to_regprocedure('public.touchline_guard_match_push_identity()') as fn")).rows[0].fn, null);
    assert.equal((await db.query("select count(*)::int as n from pg_proc where proname='touchline_enqueue_match_push'")).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from test_history')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('delivery classification preserves unknown history and cannot be promoted or reassigned', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.touchline_match_push_outbox(id int primary key, device_id int, fixture_id int,
        provider_event_id text, source_checksum text, subscription_fingerprint text, state text);
      insert into public.touchline_match_push_outbox values(1,10,20,'30','old','binding','uncertain');`);
    await db.exec(`begin;${migration}commit;`);
    assert.equal((await db.query('select delivery_kind from public.touchline_match_push_outbox where id=1')).rows[0].delivery_kind, null);
    await db.exec("insert into public.touchline_match_push_outbox values(2,10,20,'31','a','binding','queued','initial'),(3,10,20,'31','b','binding','queued','revision')");
    await assert.rejects(db.exec("insert into public.touchline_match_push_outbox values(4,10,20,'31','c','binding','queued','initial')"), /unique constraint/);
    await assert.rejects(db.exec("insert into public.touchline_match_push_outbox values(4,10,20,'32','c','binding','queued','unknown')"), /check constraint/);
    for (const assignment of ["delivery_kind='initial'", 'device_id=11', 'fixture_id=21', "provider_event_id='32'", "source_checksum='c'", "subscription_fingerprint='rotated'", 'id=4']) {
      await assert.rejects(db.exec(`update public.touchline_match_push_outbox set ${assignment} where id=3`), /PUSH_EVENT_IDENTITY_IMMUTABLE/);
    }
    await assert.rejects(db.exec("update public.touchline_match_push_outbox set delivery_kind='initial' where id=1"), /PUSH_EVENT_IDENTITY_IMMUTABLE/);
    await db.exec("update public.touchline_match_push_outbox set state='claimed' where id=2");
    assert.equal((await db.query('select state from public.touchline_match_push_outbox where id=2')).rows[0].state, 'claimed');
    const permission = await db.query("select has_function_privilege('anon','public.touchline_guard_match_push_identity()','EXECUTE') as anon, has_function_privilege('authenticated','public.touchline_guard_match_push_identity()','EXECUTE') as authenticated");
    assert.deepEqual(permission.rows[0], { anon: false, authenticated: false });
  } finally { await db.close(); }
});
