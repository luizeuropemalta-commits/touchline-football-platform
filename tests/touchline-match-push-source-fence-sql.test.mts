import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const deduplication = readFileSync(new URL('../supabase/migrations/20261002052449_touchline_match_push_source_key_deduplication.sql', import.meta.url), 'utf8');
test('forward source fence changes only key deduplication before volatile timestamp', () => {
  const old = readFileSync(new URL('../supabase/migrations/20261002010540_touchline_match_push_source_fence.sql', import.meta.url), 'utf8');
  const start = old.indexOf('create function public.touchline_match_push_track_source_evidence()');
  const end = old.indexOf('\n$$;', start) + 4;
  assert.ok(start >= 0 && end > start);
  const expected = old.slice(start, end).replace('create function', 'create or replace function')
    .replace("select distinct k, 1, 'MATCH_PUSH_SOURCE_EVIDENCE_CHANGED', clock_timestamp() from unnest(v_keys) k",
      "select k, 1, 'MATCH_PUSH_SOURCE_EVIDENCE_CHANGED', clock_timestamp()\n      from (select distinct k from unnest(v_keys) k) deduplicated_keys");
  assert.equal(deduplication.slice(deduplication.indexOf('create or replace function')).trim(), expected.trim());
});
test('confirmation and timestamp-only refresh advance source authority atomically', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
      create table touchline_social_source_clock(singleton boolean primary key, revision bigint, updated_at timestamptz);
      insert into touchline_social_source_clock values(true,0,now());
      create table touchline_social_source_revisions(source_key text primary key, revision bigint, last_reason_code text, updated_at timestamptz);
      create table football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,
        events_payload jsonb,last_synced_at timestamptz,updated_at timestamptz,created_at timestamptz);
      create table touchline_social_confirmed_event_observations(fixture_provider_id text,event_provider_id text,
        confirmation_state text,last_observed_at timestamptz);
      grant usage on schema public to service_role;
      grant select,insert,update,delete on football_fantasy_fixture_feeds,touchline_social_confirmed_event_observations to service_role;
      insert into football_fantasy_fixture_feeds values('sportmonks','8','{}','[]','2026-10-01',now(),now());`);
    const migration = readFileSync(new URL('../supabase/migrations/20261002010540_touchline_match_push_source_fence.sql', import.meta.url), 'utf8');
    await db.exec(`begin;${migration}commit;`);
    const metadata = async () => (await db.query(`select p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,
      (select jsonb_agg(jsonb_build_array(t.oid,t.tgname,t.tgfoid,t.tgenabled) order by t.oid)
        from pg_trigger t where t.tgfoid=p.oid) triggers
      from pg_proc p where p.oid='touchline_match_push_track_source_evidence()'::regprocedure`)).rows;
    const originalMetadata = await metadata();
    const definition = async () => (await db.query("select pg_get_functiondef('touchline_match_push_track_source_evidence()'::regprocedure) definition")).rows[0].definition;
    const originalDefinition = await definition();
    await db.exec(`begin;${deduplication}rollback;`);
    assert.equal(await definition(), originalDefinition, 'migration runner rollback restores exact prior function');
    assert.deepEqual(await metadata(), originalMetadata);
    await db.exec(`begin;${deduplication}commit;`);
    assert.deepEqual(await metadata(), originalMetadata, 'forward retains owner, ACL, security and installed trigger identities');
    const revision = async () => Number((await db.query('select revision from touchline_social_source_clock')).rows[0].revision);
    const keys = async () => Object.fromEntries((await db.query('select source_key,revision from touchline_social_source_revisions order by source_key')).rows.map((r: { source_key: string; revision: unknown }) => [r.source_key, Number(r.revision)]));
    await db.exec(`set role service_role;
      insert into touchline_social_confirmed_event_observations values('8','9','OBSERVING',now()); reset role;`);
    assert.equal(await revision(), 1);
    assert.deepEqual((await db.query('select source_key from touchline_social_source_revisions order by source_key')).rows.map((r: { source_key: string }) => r.source_key), ['fixture-event:9', 'fixture-provider:8']);
    await db.exec(`set role service_role; update touchline_social_confirmed_event_observations set confirmation_state='CONFIRMED'; reset role;`);
    assert.equal(await revision(), 2);
    assert.deepEqual(await keys(), { 'fixture-event:9': 2, 'fixture-provider:8': 2 }, 'same OLD/NEW keys increment exactly once');
    const unchangedRows = (await db.query('select * from touchline_social_source_revisions order by source_key')).rows;
    await db.exec('update touchline_social_confirmed_event_observations set confirmation_state=confirmation_state');
    assert.equal(await revision(), 2);
    assert.deepEqual((await db.query('select * from touchline_social_source_revisions order by source_key')).rows, unchangedRows, 'no-op preserves revisions and timestamps');
    await db.exec(`begin;update touchline_social_confirmed_event_observations set event_provider_id='10';`);
    assert.deepEqual(await keys(), { 'fixture-event:9': 3, 'fixture-event:10': 1, 'fixture-provider:8': 3 }, 'changed event invalidates both identities and shared fixture only once');
    await db.exec(`update touchline_social_confirmed_event_observations set fixture_provider_id='11';`);
    assert.deepEqual(await keys(), { 'fixture-event:9': 3, 'fixture-event:10': 2, 'fixture-provider:8': 4, 'fixture-provider:11': 1 }, 'changed fixture invalidates both fixtures and shared event only once');
    await db.exec('rollback');
    assert.equal(await revision(), 2);
    assert.deepEqual((await db.query('select * from touchline_social_source_revisions order by source_key')).rows, unchangedRows, 'identity changes roll back complete per-key preimages');
    await db.exec(`begin; update touchline_social_confirmed_event_observations set confirmation_state='REVIEW_REQUIRED'; rollback;`);
    assert.equal(await revision(), 2);
    assert.equal((await db.query('select confirmation_state from touchline_social_confirmed_event_observations')).rows[0].confirmation_state, 'CONFIRMED');
    await db.exec(`set role service_role; update football_fantasy_fixture_feeds set last_synced_at='2026-10-02',created_at=now(); reset role;`);
    assert.equal(await revision(), 3, 'unrelated metadata cannot bypass timestamp invalidation');
    await db.exec(`update football_fantasy_fixture_feeds set last_synced_at=last_synced_at`);
    assert.equal(await revision(), 3, 'no-op does not churn authority');
    await db.exec(`set role service_role; delete from touchline_social_confirmed_event_observations; reset role;`);
    assert.equal(await revision(), 4);
    for (const role of ['anon','authenticated','service_role']) {
      const permission = await db.query(`select has_function_privilege($1,'touchline_match_push_track_source_evidence()','execute') allowed`, [role]);
      assert.equal(permission.rows[0].allowed, false);
    }
    await db.exec('delete from touchline_social_source_clock');
    await assert.rejects(db.exec(`update football_fantasy_fixture_feeds set last_synced_at='2026-10-03'`), /TL_SOCIAL_SOURCE_CLOCK_UNAVAILABLE/);
    assert.equal((await db.query('select last_synced_at::text as stamp from football_fantasy_fixture_feeds')).rows[0].stamp, '2026-10-02 00:00:00+00');
  } finally { await db.close(); }
});

test('real QA043 observation RPC and guard compose with the new revision trigger', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const { pgcrypto } = await import(new URL('./contrib/pgcrypto.js', 'file://' + modulePath!).href);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table touchline_social_source_clock(singleton boolean primary key,revision bigint,updated_at timestamptz);
      insert into touchline_social_source_clock values(true,0,now());
      create table touchline_social_source_revisions(source_key text primary key,revision bigint,last_reason_code text,updated_at timestamptz);
      create table football_fantasy_fixture_feeds(last_synced_at timestamptz);
      create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text);
      create table football_fixture_events(fixture_id uuid,provider text,provider_event_id text,event_type text,event_status text,
        result text,provider_team_id text,provider_player_id text,minute integer,extra_minute integer,info text,addition text);
      insert into football_fixtures values('33333333-3333-4333-8333-333333333333','sportmonks','8');
      insert into football_fixture_events values('33333333-3333-4333-8333-333333333333','sportmonks','9','Goal','recorded','1-0','10','11',22,null,null,null);`);
    const historical = readFileSync(new URL('../supabase/qa/043_touchline_qa_social_confirmed_events.sql', import.meta.url), 'utf8');
    const start = historical.indexOf('create table public.touchline_social_confirmed_event_observations (');
    const end = historical.indexOf('create or replace function public.touchline_social_043_track_event_dependency()');
    assert.ok(start > 0 && end > start);
    await db.exec(historical.slice(start, end));
    const migration = readFileSync(new URL('../supabase/migrations/20261002010540_touchline_match_push_source_fence.sql', import.meta.url), 'utf8');
    const revision = async () => Number((await db.query('select revision from touchline_social_source_clock')).rows[0].revision);
    const observe = async () => (await db.query(`select touchline_social_043_observe_confirmed_event('8','9') as result`)).rows[0].result;
    assert.equal((await observe()).state, 'OBSERVING');
    assert.equal(await revision(), 0, 'old RPC mutation does not advance source revision');
    await db.exec(`begin;${migration}${deduplication}commit;`);
    await observe();
    assert.equal(await revision(), 1);
    await assert.rejects(db.exec('delete from touchline_social_confirmed_event_observations'), /RPC_REQUIRED/);
    assert.equal(await revision(), 1);
    // Synthetic clock aging only: the production confirmation RPC is unchanged.
    await db.exec(`begin; select set_config('touchline.social_confirmed_event_observation_transition','observe',true);
      update touchline_social_confirmed_event_observations set first_observed_at=clock_timestamp()-interval '30 seconds'; commit;`);
    const before = await revision();
    assert.equal((await observe()).state, 'CONFIRMED');
    assert.equal(await revision(), before + 1);
    await db.exec('begin');
    await observe();
    assert.equal(await revision(), before + 2);
    await db.exec('rollback');
    assert.equal(await revision(), before + 1, 'observation and revision roll back together');
    await db.exec('update football_fixture_events set extra_minute=0');
    assert.equal((await observe()).state, 'REVIEW_REQUIRED', 'old observer wrongly rejects provider zero');
    const forward = readFileSync(new URL('../supabase/migrations/20261002011358_touchline_confirmed_event_zero_extra_minute.sql', import.meta.url), 'utf8');
    // Keep this repair exactly scoped: the original function body differs only
    // in the zero boundary. No checksum, confirmation delay or grants change.
    const originalFunction = historical.slice(historical.indexOf('create or replace function public.touchline_social_043_observe_confirmed_event('), end).trim();
    assert.equal(forward.slice(forward.indexOf('create or replace function')).trim(),
      originalFunction.replace('v_event.extra_minute < 1', 'v_event.extra_minute < 0'));
    await db.exec(`begin;${forward}commit;`);
    assert.equal((await observe()).state, 'OBSERVING');
    await db.exec(`begin; select set_config('touchline.social_confirmed_event_observation_transition','observe',true);
      update touchline_social_confirmed_event_observations set first_observed_at=clock_timestamp()-interval '30 seconds'; commit;`);
    assert.equal((await observe()).state, 'CONFIRMED');
    await db.exec('update football_fixture_events set extra_minute=-1');
    assert.equal((await observe()).state, 'REVIEW_REQUIRED', 'negative extra time remains invalid');
  } finally { await db.close(); }
});
