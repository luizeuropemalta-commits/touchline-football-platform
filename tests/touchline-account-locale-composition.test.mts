import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createAccountLocaleSelection } from '../lib/touchlineArena/account-locale-selection.ts';
import { TOUCHLINE_APPROVED_LOCALES } from '../lib/touchlineArena/i18n.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const nativeRuntime = process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME;
const owner = '11111111-1111-4111-8111-111111111111';
const routeSource = readFileSync(new URL('../app/api/notifications/preferences/route.ts', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');

// Real controller, route and SQL; this named-argument SDK bridge is NOT PostgREST.
// Sequential conflicts do not prove two-connection locking or browser lifecycle.
test('account locale controller composes with actual route and revision SQL without consent mutation', { skip: !modulePath && !nativeRuntime }, async t => {
  if (nativeRuntime) assert.equal(realpathSync(nativeRuntime), '/private/tmp/touchline-pg-native-sbvcel/native-quota-runtime.mjs');
  // Native adapter verifies an owner-only Unix socket and the exact disposable
  // database/data-directory identity, with no TCP or remote fallback.
  const runtime = await import(nativeRuntime ? pathToFileURL(nativeRuntime).href : modulePath!);
  const Database = nativeRuntime ? runtime.NativeQuotaDatabase : runtime.PGlite;
  assert.equal(typeof Database, 'function');
  const db = new Database();
  let completedScenarios = 0;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon;
      create table public.users(id uuid primary key);
      insert into public.users values('${owner}');
      create function public.touch_updated_at() returns trigger language plpgsql as
        $$begin new.updated_at=now(); return new; end$$;`);
    for (const name of ['017_touchline_notification_preferences.sql',
      '20261002183141_touchline_notification_game_locale.sql', '20261002200934_touchline_game_locale_revision.sql']) {
      await db.exec(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
    }
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const jsonCopy = (value: unknown) => JSON.parse(JSON.stringify(value));
    let writes = 0;
    let loseResponse = false;
    const sdk = {
      auth: { getUser: async () => ({ data: { user: { id: owner } } }) },
      from(table: string) {
        assert.equal(table, 'notification_preferences');
        const query = {
          select(columns: string) {
            assert.equal(columns, 'settings, channels, frequency, quiet_hours, explicit_consent_at, updated_at, game_locale, game_locale_revision::text');
            return query;
          },
          eq(key: string, value: string) { assert.equal(key, 'user_id'); assert.equal(value, owner); return query; },
          async maybeSingle() {
            const rows = (await db.query(`select settings,channels,frequency,quiet_hours,explicit_consent_at,
              updated_at,game_locale,game_locale_revision::text from public.notification_preferences where user_id=$1`, [owner])).rows;
            return { data: rows.length ? jsonCopy(rows[0]) : null, error: null };
          },
        };
        return query;
      },
      rpc(name: string, args: Record<string, unknown>) {
        assert.equal(name, 'touchline_set_game_locale');
        assert.deepEqual(Object.keys(args).sort(), ['p_expected_revision', 'p_locale']);
        assert.equal(typeof args.p_expected_revision, 'string');
        const query = {
          select(columns: string) { assert.equal(columns, 'game_locale,game_locale_revision::text,updated_at'); return query; },
          async maybeSingle() {
            writes++;
            const rows = (await db.query('select * from public.touchline_set_game_locale($1::text,$2::bigint)',
              [args.p_locale, args.p_expected_revision])).rows;
            return { data: rows.length ? jsonCopy(rows[0]) : null, error: null };
          },
        };
        return query;
      },
    };
    const route = runInNewContext(ts.transpileModule(`${routeSource}\n({GET,PUT})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      createClient: async () => sdk, hasTouchLineArenaAccess: () => true, URL,
      NextResponse: { json: (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
        ...init, headers: { ...init.headers, 'content-type': 'application/json' },
      }) },
    });
    const request = async (url: string, init: RequestInit) => {
      assert.equal(url, '/api/notifications/preferences');
      const headers = new Headers(init.headers);
      headers.set('origin', 'https://synthetic.test');
      const result = await route.PUT({ url: 'https://synthetic.test' + url,
        headers, json: async () => JSON.parse(init.body as string) });
      if (loseResponse) { loseResponse = false; throw new Error('synthetic lost response after commit'); }
      return result;
    };
    const read = async () => {
      const result = await route.GET();
      assert.equal(result.status, 200);
      return (await result.json()).data;
    };
    const effects: string[] = [];
    const control = (revision: string) => createAccountLocaleSelection({ mode: 'account', accountId: owner,
      initialRevision: revision, request, apply: locale => effects.push(locale) });

    await t.test('GET creates no preference; explicit first save preserves unconsented defaults', async () => {
      const before = await read();
      assert.equal(before.gameLocale, null); assert.equal(before.gameLocaleRevision, '0'); assert.equal(writes, 0);
      assert.equal((await db.query('select count(*)::int as count from public.notification_preferences')).rows[0].count, 0);
      const first = control(before.gameLocaleRevision);
      assert.equal(await first.select('pt-BR'), 'saved');
      const saved = await read();
      assert.equal(saved.gameLocale, 'pt-BR'); assert.equal(saved.gameLocaleRevision, '1');
      assert.equal(saved.explicitConsentAt, null);
      assert.deepEqual(saved.channels, { in_app: true, push: false, email: false });
      assert.deepEqual(effects, ['pt-BR']);
      completedScenarios++;
    });
    await t.test('two controls from the same read cannot overwrite a confirmed newer revision', async () => {
      const snapshot = await read();
      const winner = control(snapshot.gameLocaleRevision);
      const stale = control(snapshot.gameLocaleRevision);
      assert.equal(await winner.select('en-GB'), 'saved');
      assert.equal(await stale.select('pt-BR'), 'unconfirmed');
      const attempts = writes;
      assert.equal(await stale.select('pt-BR'), 'unconfirmed'); assert.equal(writes, attempts);
      const saved = await read();
      assert.equal(saved.gameLocale, 'en-GB'); assert.equal(saved.gameLocaleRevision, '2');
      assert.deepEqual(effects, ['pt-BR', 'en-GB']);
      completedScenarios++;
    });
    await t.test('lost reply never applies; fresh read allows a new revision-aware control', async () => {
      const first = control((await read()).gameLocaleRevision);
      loseResponse = true;
      assert.equal(await first.select('pt-BR'), 'unconfirmed');
      assert.deepEqual(effects, ['pt-BR', 'en-GB']);
      const fresh = await read();
      assert.equal(fresh.gameLocale, 'pt-BR'); assert.equal(fresh.gameLocaleRevision, '3');
      first.dispose();
      const replacement = control(fresh.gameLocaleRevision);
      assert.equal(await replacement.select('en-GB'), 'saved');
      const saved = await read();
      assert.equal(saved.gameLocaleRevision, '4'); assert.equal(saved.explicitConsentAt, null);
      assert.deepEqual(saved.channels, { in_app: true, push: false, email: false });
      completedScenarios++;
    });
    await t.test('large revisions survive SQL and JSON without conversion to a JS number', async () => {
      await db.query('update public.notification_preferences set game_locale_revision=$1 where user_id=$2', ['9007199254740993', owner]);
      const before = await read();
      assert.equal(before.gameLocaleRevision, '9007199254740993');
      assert.equal(await control(before.gameLocaleRevision).select('pt-BR'), 'saved');
      const saved = await read();
      assert.equal(saved.gameLocaleRevision, '9007199254740994'); assert.equal(saved.gameLocale, 'pt-BR');
      assert.equal(saved.explicitConsentAt, null);
      completedScenarios++;
    });
    await t.test('all eight canonical locales persist with explicit draft permission, preserving consent and the default gate', async () => {
      const locales = TOUCHLINE_APPROVED_LOCALES.map(item => item.code);
      assert.deepEqual(locales, ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE']);
      const before = await read();
      const beforeWrites = writes, beforeEffects = [...effects];
      const gated = control(before.gameLocaleRevision);
      for (const locale of locales.filter(value => value !== 'en-GB' && value !== 'pt-BR')) {
        assert.equal(await gated.select(locale), 'invalid');
      }
      assert.equal(writes, beforeWrites); assert.deepEqual(effects, beforeEffects);
      assert.equal((await read()).gameLocaleRevision, before.gameLocaleRevision);
      const preserved = async () => (await db.query(`select to_jsonb(p) - array['game_locale','game_locale_revision','updated_at'] as value
        from public.notification_preferences p where user_id=$1`, [owner])).rows;
      const originalPreferences = await preserved();
      const enabled = createAccountLocaleSelection({ mode: 'account', accountId: owner,
        initialRevision: before.gameLocaleRevision, draftLocalesEnabled: true,
        request, apply: locale => effects.push(locale) });
      let revision = BigInt(before.gameLocaleRevision);
      for (const locale of locales) {
        assert.equal(await enabled.select(locale), 'saved', locale);
        revision++;
        const saved = await read();
        assert.equal(saved.gameLocale, locale);
        assert.equal(saved.gameLocaleRevision, revision.toString());
        assert.equal(saved.explicitConsentAt, null);
        assert.deepEqual(await preserved(), originalPreferences);
      }
      assert.equal(writes - beforeWrites, 8);
      assert.deepEqual(effects.slice(beforeEffects.length), locales);
      completedScenarios++;
    });
    assert.equal(completedScenarios, 5, 'All route/controller/SQL scenarios must complete.');
  } finally { await db.close(); }
});
