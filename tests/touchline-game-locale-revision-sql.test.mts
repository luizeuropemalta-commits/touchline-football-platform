import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const options = { skip: !modulePath };
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
const migrations = ['017_touchline_notification_preferences.sql',
  '20261002183141_touchline_notification_game_locale.sql',
  '20261002200934_touchline_game_locale_revision.sql'].map(name =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));

async function setup() {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon;
      create table public.users(id uuid primary key);
      insert into public.users values('${owner}'),('${other}');
      create function public.touch_updated_at() returns trigger language plpgsql as
        $$begin new.updated_at=now(); return new; end$$;`);
    await db.exec(`begin;${migrations[0]}${migrations[1]}commit;`);
    // A real pre-revision preference must retain its locale and consent unchanged.
    await db.query(`insert into public.notification_preferences
      (user_id,game_locale,channels,settings,frequency,quiet_hours,explicit_consent_at,created_at,updated_at)
      values($1,'pt-BR','{"push":true,"email":false,"in_app":true}',
        '{"goalsAndEvents":true,"silentPush":true}', 'daily_digest',
        '{"enabled":true,"timezone":"Europe/Malta","start":"23:00","end":"06:00"}',
        '2026-01-01T00:00:00Z','2025-01-01T00:00:00Z','2025-01-01T00:00:00Z')`, [owner]);
    await db.exec(`begin;${migrations[2]}commit;`);
    const authenticate = async (id: string) => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    // The RPC itself must serialize revision as text before JSON/JS parsing.
    const select = (locale: unknown, revision: unknown) => db.query(`select game_locale,
      game_locale_revision,updated_at
      from public.touchline_set_game_locale($1::text,$2::bigint)`, [locale, revision]);
    const row = async (id = owner) => (await db.query(`select
      (to_jsonb(p)-'game_locale_revision') || jsonb_build_object('game_locale_revision',p.game_locale_revision::text) as value
      from public.notification_preferences p where user_id=$1`, [id])).rows[0]?.value;
    return { db, authenticate, select, row };
  } catch (error) { await db.close(); throw error; }
}

test('revision migration adds nonnullable bigint default zero with nonnegative constraint and preserves existing preference', options, async () => {
  const { db, row } = await setup();
  try {
    const column = (await db.query(`select data_type,is_nullable,column_default from information_schema.columns
      where table_schema='public' and table_name='notification_preferences' and column_name='game_locale_revision'`)).rows[0];
    assert.equal(column?.data_type, 'bigint');
    assert.equal(column.is_nullable, 'NO');
    assert.match(column.column_default, /^0(?:::bigint)?$/);
    const original = await row();
    assert.equal(original.game_locale_revision, '0');
    assert.equal(original.game_locale, 'pt-BR');
    assert.equal(new Date(original.explicit_consent_at).toISOString(), '2026-01-01T00:00:00.000Z');
    for (const invalid of [null, '-1']) {
      await assert.rejects(db.query('update public.notification_preferences set game_locale_revision=$1 where user_id=$2', [invalid, owner]));
      assert.deepEqual(await row(), original);
    }
  } finally { await db.close(); }
});

test('revision RPC replaces old overload and preserves invoker, owner-derived arguments, empty search path and execute ACL', options, async () => {
  const { db } = await setup();
  try {
    assert.equal((await db.query("select to_regprocedure('public.touchline_set_game_locale(text)') as old")).rows[0].old, null);
    const rows = (await db.query(`select p.pronargs,p.proargnames,p.proargmodes,p.prosecdef,p.proconfig,
      pg_get_function_identity_arguments(p.oid) as arguments,pg_get_function_result(p.oid) as result
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='touchline_set_game_locale'`)).rows;
    assert.equal(rows.length, 1);
    const fn = rows[0];
    assert.equal(fn.pronargs, 2);
    assert.equal(fn.arguments, 'p_locale text, p_expected_revision bigint');
    assert.deepEqual(fn.proargnames, ['p_locale', 'p_expected_revision', 'game_locale', 'game_locale_revision', 'updated_at']);
    assert.deepEqual(fn.proargmodes, ['i', 'i', 't', 't', 't']);
    assert.equal(fn.result, 'TABLE(game_locale text, game_locale_revision text, updated_at timestamp with time zone)');
    assert.equal(fn.prosecdef, false);
    assert.ok(fn.proconfig?.includes('search_path=""'));
    const acl = (await db.query(`select
      has_function_privilege('authenticated','public.touchline_set_game_locale(text,bigint)','EXECUTE') as authenticated,
      has_function_privilege('anon','public.touchline_set_game_locale(text,bigint)','EXECUTE') as anon,
      exists(select 1 from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid='public.touchline_set_game_locale(text,bigint)'::regprocedure
        and a.grantee=0 and a.privilege_type='EXECUTE') as public_execute`)).rows[0];
    assert.deepEqual(acl, { authenticated: true, anon: false, public_execute: false });
    await db.exec('set role anon');
    await assert.rejects(db.query("select * from public.touchline_set_game_locale('en-GB',0)"), /permission denied/i);
  } finally { await db.close(); }
});

test('expected zero updates only revision zero, all eight locales advance revision and repeated locale also advances', options, async () => {
  const { db, authenticate, select, row } = await setup();
  try {
    await authenticate(owner);
    const before = await row();
    let revision = 0n;
    for (const locale of [...locales, 'de-DE']) {
      const result = await select(locale, revision.toString());
      revision++;
      assert.equal(result.rows.length, 1);
      assert.deepEqual(Object.keys(result.rows[0]).sort(), ['game_locale', 'game_locale_revision', 'updated_at']);
      assert.equal(result.rows[0].game_locale, locale);
      assert.equal(result.rows[0].game_locale_revision, revision.toString());
      const saved = await row();
      assert.equal(saved.game_locale, locale);
      assert.equal(saved.game_locale_revision, revision.toString());
      assert.equal(new Date(result.rows[0].updated_at).toISOString(), new Date(saved.updated_at).toISOString());
      for (const field of ['user_id', 'channels', 'settings', 'frequency', 'quiet_hours', 'explicit_consent_at', 'created_at']) {
        assert.deepEqual(saved[field], before[field], field);
      }
    }
    const final = await row();
    assert.equal((await select('en-GB', '0')).rows.length, 0);
    assert.deepEqual(await row(), final, 'zero cannot overwrite an existing positive revision');
  } finally { await db.close(); }
});

test('expected zero inserts unconsented revision one; positive expected revision never creates a row', options, async () => {
  const { db, authenticate, select, row } = await setup();
  try {
    await authenticate(other);
    assert.equal(await row(other), undefined);
    assert.equal((await select('en-GB', '1')).rows.length, 0);
    assert.equal(await row(other), undefined);
    const first = await select('ar-SA', '0');
    assert.equal(first.rows[0].game_locale_revision, '1');
    const saved = await row(other);
    assert.equal(saved.game_locale, 'ar-SA');
    assert.equal(saved.explicit_consent_at, null);
    assert.deepEqual(saved.channels, { in_app: true, push: false, email: false });
    assert.deepEqual(saved.settings, {});
    assert.equal(saved.frequency, 'realtime');
    assert.deepEqual(saved.quiet_hours, { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' });
    assert.equal((await select('en-GB', '0')).rows.length, 0);
    assert.deepEqual(await row(other), saved);
  } finally { await db.close(); }
});

test('invalid locale, null or negative revisions, missing auth and bigint overflow reject without mutations', options, async () => {
  const { db, authenticate, select, row } = await setup();
  try {
    await authenticate(owner);
    const before = await row();
    for (const locale of [null, '', 'en-US', 'EN-GB', 'pt-PT', ' en-GB', '__proto__']) {
      await assert.rejects(select(locale, '0'));
      assert.deepEqual(await row(), before);
    }
    for (const revision of [null, '-1', '-9223372036854775808', '1.5', 'invalid', '9223372036854775808']) {
      await assert.rejects(select('en-GB', revision));
      assert.deepEqual(await row(), before);
    }
    await authenticate('');
    await assert.rejects(select('en-GB', '0'));
    await db.exec('reset role');
    assert.deepEqual(await row(), before);
    await db.query('update public.notification_preferences set game_locale_revision=$1 where user_id=$2', ['9223372036854775807', owner]);
    const atMaximum = await row();
    await authenticate(owner);
    await assert.rejects(select('en-GB', '9223372036854775807'), /range|overflow/i);
    assert.deepEqual(await row(), atMaximum, 'increment overflow must roll back locale and updated_at');
  } finally { await db.close(); }
});

test('revisions above JavaScript safe integer remain exact decimal strings and stale adjacent values do not match', options, async () => {
  const { db, authenticate, select, row } = await setup();
  try {
    await db.query('update public.notification_preferences set game_locale_revision=$1 where user_id=$2', ['9007199254740993', owner]);
    await authenticate(owner);
    const before = await row();
    assert.equal((await select('en-GB', '9007199254740992')).rows.length, 0);
    assert.deepEqual(await row(), before);
    const changed = await select('en-GB', '9007199254740993');
    assert.equal(changed.rows[0].game_locale_revision, '9007199254740994');
    const saved = await row();
    assert.equal(saved.game_locale_revision, '9007199254740994');
    assert.equal((await select('pt-BR', '9007199254740993')).rows.length, 0);
    assert.deepEqual(await row(), saved);
  } finally { await db.close(); }
});

test('reread then newer selection rejects simulated late writes with stale revision (sequential, not concurrent connections)', options, async () => {
  const { db, authenticate, select, row } = await setup();
  try {
    await authenticate(owner);
    const oldSnapshot = await row();
    // Model an earlier response being lost after its write committed.
    await select('en-GB', oldSnapshot.game_locale_revision);
    const reread = await row();
    assert.equal(reread.game_locale_revision, '1');
    assert.equal((await select('ar-SA', reread.game_locale_revision)).rows[0].game_locale_revision, '2');
    const latest = await row();
    assert.equal((await select('pt-BR', oldSnapshot.game_locale_revision)).rows.length, 0);
    assert.equal((await select('pt-BR', reread.game_locale_revision)).rows.length, 0);
    assert.deepEqual(await row(), latest);
    // If the delayed request had not committed before the reread, the first
    // successful revision-zero writer wins and the delayed zero also conflicts.
    await authenticate(other);
    assert.equal((await select('fr-FR', '0')).rows[0].game_locale_revision, '1');
    const winner = await row(other);
    assert.equal((await select('de-DE', '0')).rows.length, 0);
    assert.deepEqual(await row(other), winner);
  } finally { await db.close(); }
});

test('RLS isolates accounts while existing own-row direct table grants deliberately remain available', options, async () => {
  const { db, authenticate, select, row } = await setup();
  try {
    await authenticate(other);
    await select('de-DE', '0');
    const otherBefore = await row(other);
    await authenticate(owner);
    assert.equal(await row(other), undefined);
    assert.equal((await db.query('update public.notification_preferences set game_locale=$1 where user_id=$2 returning user_id', ['fr-FR', other])).rows.length, 0);
    await assert.rejects(db.query('insert into public.notification_preferences(user_id,game_locale) values($1,$2)', [other, 'fr-FR']), /row-level security/i);
    await select('en-GB', '0');
    assert.equal((await row()).game_locale_revision, '1');
    const grants = (await db.query(`select
      has_table_privilege('authenticated','public.notification_preferences','SELECT') as can_read,
      has_table_privilege('authenticated','public.notification_preferences','INSERT') as can_insert,
      has_table_privilege('authenticated','public.notification_preferences','UPDATE') as can_update`)).rows[0];
    assert.deepEqual(grants, { can_read: true, can_insert: true, can_update: true });
    // CAS orders cooperative application RPCs. It is intentionally NOT a
    // security boundary preventing an owner from editing their row directly.
    await db.query('update public.notification_preferences set game_locale=$1,game_locale_revision=$2 where user_id=$3', ['it-IT', '7', owner]);
    assert.equal((await row()).game_locale, 'it-IT');
    assert.equal((await row()).game_locale_revision, '7');
    await db.exec('reset role');
    assert.deepEqual(await row(other), otherBefore);
  } finally { await db.close(); }
});
