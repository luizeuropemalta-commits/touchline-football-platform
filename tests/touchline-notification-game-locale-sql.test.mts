import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const options = { skip: !modulePath };
const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const absentUser = '33333333-3333-4333-8333-333333333333';
const migration = readFileSync(new URL('../supabase/migrations/20261002183141_touchline_notification_game_locale.sql', import.meta.url), 'utf8');
const preferencesMigration = readFileSync(new URL('../supabase/migrations/017_touchline_notification_preferences.sql', import.meta.url), 'utf8');

async function setup() {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth, public to authenticated, anon;
      create table public.users(id uuid primary key);
      create function public.touch_updated_at() returns trigger language plpgsql as
        $$begin new.updated_at = now(); return new; end$$;
      insert into public.users values ('${owner}'), ('${other}');
    `);
    await db.exec(`begin;${preferencesMigration}commit;`);
    // Existing data predates the new column: migration must not invent a preference.
    await db.query(`insert into public.notification_preferences
      (user_id, settings, channels, frequency, quiet_hours, explicit_consent_at, created_at, updated_at)
      values ($1, '{"goal":false,"custom":{"keep":true}}',
        '{"in_app":false,"push":true,"email":true}', 'daily_digest',
        '{"enabled":true,"start":"23:30","end":"06:15","timezone":"Europe/Malta"}',
        '2026-01-01T12:00:00Z', '2025-01-01T12:00:00Z', '2025-01-01T12:00:00Z')`, [owner]);
    await db.exec(`begin;${migration}commit;`);
    const authenticate = async (id: string) => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    };
    const row = async (id = owner) => (await db.query(
      'select to_jsonb(p) as value from public.notification_preferences p where user_id=$1', [id],
    )).rows[0]?.value;
    const setLocale = (locale: string | null) => db.query(
      'select * from public.touchline_set_game_locale($1::text)', [locale],
    );
    return { db, authenticate, row, setLocale };
  } catch (error) {
    await db.close();
    throw error;
  }
}

test('game locale is nullable text without a default or legacy-row backfill and accepts only exact eight codes', options, async () => {
  const { db, row } = await setup();
  try {
    const column = (await db.query(`select data_type, is_nullable, column_default
      from information_schema.columns where table_schema='public'
      and table_name='notification_preferences' and column_name='game_locale'`)).rows;
    assert.deepEqual(column, [{ data_type: 'text', is_nullable: 'YES', column_default: null }]);
    assert.equal((await row()).game_locale, null);
    for (const locale of locales) {
      await db.query('update public.notification_preferences set game_locale=$1 where user_id=$2', [locale, owner]);
      assert.equal((await row()).game_locale, locale);
    }
    for (const invalid of ['', 'en', 'en-US', 'pt-PT', 'EN-GB', ' en-GB', 'ar-SA ', 'ja-JP', '__proto__']) {
      await assert.rejects(db.query('update public.notification_preferences set game_locale=$1 where user_id=$2', [invalid, owner]), /check constraint/i);
      assert.equal((await row()).game_locale, 'de-DE');
    }
    await db.query('update public.notification_preferences set game_locale=null where user_id=$1', [owner]);
    assert.equal((await row()).game_locale, null, 'null represents a preference not yet explicitly chosen');
  } finally { await db.close(); }
});

test('locale RPC has one locale input, exactly two result fields, invoker security, empty search path and restricted execute ACL', options, async () => {
  const { db } = await setup();
  try {
    const functions = (await db.query(`select p.pronargs, p.proargnames, p.proargmodes,
      p.prosecdef, p.proconfig, pg_get_function_result(p.oid) as result,
      pg_get_function_identity_arguments(p.oid) as arguments
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='touchline_set_game_locale'`)).rows;
    assert.equal(functions.length, 1, 'no caller-supplied owner overload');
    const fn = functions[0];
    assert.equal(fn.pronargs, 1);
    assert.equal(fn.arguments, 'p_locale text');
    assert.deepEqual(fn.proargnames, ['p_locale', 'game_locale', 'updated_at']);
    assert.deepEqual(fn.proargmodes, ['i', 't', 't']);
    assert.equal(fn.result, 'TABLE(game_locale text, updated_at timestamp with time zone)');
    assert.equal(fn.prosecdef, false);
    assert.ok(fn.proconfig?.includes('search_path=""'), 'RPC must explicitly set an empty search_path');
    const acl = (await db.query(`select
      has_function_privilege('authenticated', 'public.touchline_set_game_locale(text)', 'EXECUTE') as authenticated,
      has_function_privilege('anon', 'public.touchline_set_game_locale(text)', 'EXECUTE') as anon,
      exists(select 1 from pg_proc p,
        lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid='public.touchline_set_game_locale(text)'::regprocedure
        and a.grantee=0 and a.privilege_type='EXECUTE') as public_execute`)).rows[0];
    assert.deepEqual(acl, { authenticated: true, anon: false, public_execute: false });
    await db.exec('set role anon');
    await assert.rejects(db.query("select * from public.touchline_set_game_locale('en-GB')"), /permission denied/i);
  } finally { await db.close(); }
});

test('authenticated locale changes round-trip all eight codes and preserve every unrelated preference field', options, async () => {
  const { db, authenticate, row, setLocale } = await setup();
  try {
    await authenticate(owner);
    const original = await row();
    for (const locale of locales) {
      const result = await setLocale(locale);
      assert.equal(result.rows.length, 1);
      assert.deepEqual(Object.keys(result.rows[0]).sort(), ['game_locale', 'updated_at']);
      assert.equal(result.rows[0].game_locale, locale);
      const saved = await row();
      assert.equal(saved.game_locale, locale);
      assert.equal(new Date(result.rows[0].updated_at).toISOString(), new Date(saved.updated_at).toISOString());
      assert.ok(new Date(saved.updated_at).getTime() > new Date(original.updated_at).getTime());
      const { game_locale: savedLocale, updated_at: savedTime, ...unchanged } = saved;
      assert.equal(savedLocale, locale);
      assert.ok(savedTime);
      assert.deepEqual(unchanged, Object.fromEntries(Object.entries(original).filter(([key]) => !['game_locale', 'updated_at'].includes(key))));
    }
    assert.equal((await db.query('select count(*)::int n from public.notification_history')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('first locale selection creates only an unconsented preference with original notification defaults', options, async () => {
  const { db, authenticate, row, setLocale } = await setup();
  try {
    await authenticate(other);
    assert.equal(await row(other), undefined);
    const result = await setLocale('ar-SA');
    assert.equal(result.rows[0].game_locale, 'ar-SA');
    const saved = await row(other);
    assert.equal(saved.user_id, other);
    assert.equal(saved.game_locale, 'ar-SA');
    assert.equal(saved.explicit_consent_at, null);
    assert.deepEqual(saved.settings, {});
    assert.deepEqual(saved.channels, { in_app: true, push: false, email: false });
    assert.equal(saved.frequency, 'realtime');
    assert.deepEqual(saved.quiet_hours, { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' });
    assert.ok(saved.created_at);
    assert.ok(saved.updated_at);
    assert.equal((await db.query('select count(*)::int n from public.notification_history')).rows[0].n, 0);
    // This minimal fixture does not make claims about subscription/enrollment systems.
  } finally { await db.close(); }
});

test('invalid, null and missing-auth selections reject atomically without touching preferences', options, async () => {
  const { db, authenticate, row, setLocale } = await setup();
  try {
    await authenticate(owner);
    await setLocale('pt-BR');
    const before = await row();
    for (const invalid of [null, '', 'en', 'en-US', 'pt-PT', 'EN-GB', ' en-GB', 'ar-SA ', 'ja-JP', '__proto__']) {
      await assert.rejects(setLocale(invalid));
      assert.deepEqual(await row(), before, 'rejected call must not even refresh updated_at');
    }
    await authenticate(other);
    await assert.rejects(setLocale(null));
    await assert.rejects(setLocale('unknown'));
    assert.equal(await row(other), undefined, 'invalid first selection must not insert a row');
    await authenticate('');
    await assert.rejects(setLocale('en-GB'));
    await db.exec('reset role');
    assert.deepEqual(await row(), before);
    assert.equal(await row(other), undefined);
    assert.equal((await db.query('select count(*)::int n from public.notification_preferences')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('RLS isolates owners and locale RPC cannot provision a missing application user', options, async () => {
  const { db, authenticate, row, setLocale } = await setup();
  try {
    await authenticate(other);
    await setLocale('de-DE');
    const otherBefore = await row(other);
    await authenticate(owner);
    await setLocale('fr-FR');
    assert.equal(await row(other), undefined);
    assert.equal((await db.query('update public.notification_preferences set game_locale=$1 where user_id=$2 returning user_id', ['it-IT', other])).rows.length, 0);
    await assert.rejects(db.query('insert into public.notification_preferences(user_id,game_locale) values($1,$2)', [other, 'it-IT']), /row-level security/i);
    await assert.rejects(db.query('update public.notification_preferences set user_id=$1 where user_id=$2', [absentUser, owner]), /row-level security/i);
    await db.exec('reset role');
    assert.deepEqual(await row(other), otherBefore);
    const usersBefore = (await db.query('select id from public.users order by id')).rows;
    await authenticate(absentUser);
    await assert.rejects(setLocale('tr-TR'), /foreign key/i);
    await db.exec('reset role');
    assert.equal(await row(absentUser), undefined);
    assert.deepEqual((await db.query('select id from public.users order by id')).rows, usersBefore);
  } finally { await db.close(); }
});

test('disjoint SQL preference upserts and locale RPC preserve each other in both sequential orders (not PostgREST proof)', options, async () => {
  const { db, authenticate, row, setLocale } = await setup();
  try {
    await authenticate(owner);
    const generalSave = (frequency: string) => db.query(`insert into public.notification_preferences(user_id, settings, frequency)
      values(auth.uid(), '{"goal":true,"custom":{"keep":false}}', $1)
      on conflict(user_id) do update set settings=excluded.settings, frequency=excluded.frequency`, [frequency]);
    await setLocale('es-ES');
    await generalSave('hourly_digest');
    assert.equal((await row()).game_locale, 'es-ES');
    assert.equal((await row()).frequency, 'hourly_digest');
    await generalSave('paused');
    const generalBefore = await row();
    await setLocale('it-IT');
    const final = await row();
    assert.equal(final.game_locale, 'it-IT');
    for (const field of ['settings', 'channels', 'frequency', 'quiet_hours', 'explicit_consent_at', 'created_at', 'user_id']) {
      assert.deepEqual(final[field], generalBefore[field]);
    }
    // No HTTP/PostgREST defaults or concurrent-session behavior is simulated here.
  } finally { await db.close(); }
});

test('actual notification epoch triggers preserve locale-only changes and still invalidate consent revocation', options, async () => {
  const { db, authenticate, row, setLocale } = await setup();
  try {
    // Extract verbatim canonical SQL, failing loudly if an anchor changes or is ambiguous.
    // Admission/source-reader functions are intentionally excluded: this is a trigger
    // regression, not an admission, dispatch, concurrency or PostgREST simulation.
    const slice = (file: string, start: string, end: string) => {
      const source = readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
      assert.equal(source.split(start).length, 2, `unique start anchor in ${file}`);
      assert.equal(source.split(end).length, 2, `unique end anchor in ${file}`);
      const from = source.indexOf(start);
      const to = source.indexOf(end);
      assert.ok(from >= 0 && to > from, `ordered anchored definitions in ${file}`);
      assert.ok(from === 0 || source[from - 1] === '\n', 'start must be a line boundary');
      assert.equal(source[to - 1], '\n', 'end must be a line boundary');
      return source.slice(from, to);
    };
    const matchFile = '20261002010527_touchline_match_push_enrollment.sql';
    const gameFile = '20261002033308_touchline_game_notification_ledger.sql';
    const device = '44444444-4444-4444-8444-444444444444';
    const otherDevice = '55555555-5555-4555-8555-555555555555';
    const fixture = '66666666-6666-4666-8666-666666666666';
    const gameweek = '77777777-7777-4777-8777-777777777777';
    const identity = '88888888-8888-4888-8888-888888888888';
    await db.exec(`
      create table auth.users(id uuid primary key);
      insert into auth.users values('${owner}'),('${other}');
      create table public.notification_devices(id uuid primary key,user_id uuid not null);
      insert into public.notification_devices values('${device}','${owner}'),('${otherDevice}','${other}');
      create table public.football_fixtures(id uuid primary key);
      insert into public.football_fixtures values('${fixture}');
      -- Minimal inert outbox fixture; the canonical enrollment identity column and
      -- guard are installed below. This does not recreate the delivery pipeline.
      create table public.touchline_match_push_outbox(
        id uuid primary key,device_id uuid,fixture_id uuid,state text,payload jsonb
      );
      update public.notification_preferences set settings='{"goalsAndEvents":true,"lineupReminders":true}',
        frequency='realtime',quiet_hours='{"enabled":false}' where user_id='${owner}';
    `);
    await db.exec(`begin;
      ${slice(matchFile, 'create table public.touchline_match_push_enrollments (', '-- Parent writers already own their modified row.')}
      ${slice(matchFile, 'create function public.touchline_match_push_invalidate_enrollment()', 'create trigger touchline_match_push_device_epoch')}
      ${slice(gameFile, 'create table public.touchline_game_notification_enrollments (', 'create function public.touchline_game_notification_admit(')}
      commit;`);
    await db.exec(`
      insert into public.touchline_match_push_enrollments
        (device_id,fixture_id,generation,interest_created_at,consent_at,subscription,
         subscription_fingerprint,baseline,last_checkpoint,excluded_event_ids,needs_baseline)
      values('${device}','${fixture}',7,now(),now(),'{}','sha256:'||repeat('a',64),
        '{"period":"first-half"}','{"minute":20}',array['prior-event'],false);
      insert into public.touchline_match_push_outbox
        (id,device_id,fixture_id,state,payload,enrollment_generation)
      values('${identity}','${device}','${fixture}','queued','{"locale":"en-GB","event":"goal"}',7);
      insert into public.touchline_game_notification_enrollments
        (user_id,device_id,gameweek_id,generation,needs_baseline,baseline_at,deadline,
         lead_seconds,suppressed,subscription,consent_at)
      values('${owner}','${device}','${gameweek}',11,false,now(),now()+interval '1 hour',300,false,'{}',now());
      insert into public.touchline_game_notification_identities(id,user_id,gameweek_id,kind,admitted_at)
      values('${identity}','${owner}','${gameweek}','missing_xi',now());
      insert into public.touchline_game_notification_deliveries
        (identity_id,device_id,generation,subscription,created_at,expires_at,payload)
      values('${identity}','${device}',11,'{}',now(),now()+interval '1 hour','{"locale":"en-GB","kind":"missing_xi"}');
    `);
    const snapshot = async () => {
      await db.exec('reset role');
      return (await db.query(`select
        (select jsonb_agg(to_jsonb(e) order by device_id,fixture_id) from public.touchline_match_push_enrollments e) as match_enrollments,
        (select jsonb_agg(to_jsonb(o) order by id) from public.touchline_match_push_outbox o) as match_outbox,
        (select jsonb_agg(to_jsonb(e) order by user_id,device_id,gameweek_id) from public.touchline_game_notification_enrollments e) as game_enrollments,
        (select jsonb_agg(to_jsonb(i) order by id) from public.touchline_game_notification_identities i) as game_identities,
        (select jsonb_agg(to_jsonb(d) order by id) from public.touchline_game_notification_deliveries d) as game_deliveries`)).rows[0];
    };
    const before = await snapshot();
    for (const locale of locales) {
      for (let repeat = 0; repeat < 2; repeat++) {
        await authenticate(owner);
        assert.equal((await setLocale(locale)).rows[0].game_locale, locale);
        assert.deepEqual(await snapshot(), before, `${locale}, repeat ${repeat}: locale-only RPC must preserve all epoch and queue data`);
      }
    }

    // The second user has a device but no consent, preferences or enrollments.
    // Their first preference insertion fires the actual INSERT triggers too.
    await authenticate(other);
    assert.equal(await row(other), undefined);
    await setLocale('ar-SA');
    assert.equal((await row(other)).explicit_consent_at, null);
    assert.deepEqual((await row(other)).channels, { in_app: true, push: false, email: false });
    assert.deepEqual(await snapshot(), before, 'unconsented insertion must not create enrollment, identity or delivery records');

    await authenticate(owner);
    await db.query('update public.notification_preferences set explicit_consent_at=null where user_id=$1', [owner]);
    const revoked = await snapshot();
    assert.equal(revoked.match_enrollments[0].generation, 8);
    assert.equal(revoked.match_enrollments[0].needs_baseline, true);
    assert.equal(revoked.game_enrollments[0].generation, 12);
    assert.equal(revoked.game_enrollments[0].needs_baseline, true);
    assert.equal(revoked.game_enrollments[0].suppressed, true);
    assert.equal(revoked.game_deliveries[0].state, 'cancelled');
    assert.equal(revoked.game_deliveries[0].payload, null);
    assert.deepEqual(revoked.game_identities, before.game_identities, 'invalidation preserves logical reminder receipts');
    assert.deepEqual(revoked.match_outbox, before.match_outbox, 'match invalidation fences the old queue epoch rather than rewriting the receipt');
    assert.notEqual(revoked.match_outbox[0].enrollment_generation, revoked.match_enrollments[0].generation);
    assert.notEqual(revoked.game_deliveries[0].generation, revoked.game_enrollments[0].generation);
  } finally { await db.close(); }
});
