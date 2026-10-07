import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/notifications/preferences/route.ts', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
async function read(data: unknown, options: { anonymous?: boolean; ineligible?: boolean; unavailable?: boolean; authThrows?: boolean; error?: boolean; throws?: boolean } = {}) {
  const calls: unknown[] = [];
  const query = {
    select(columns: string) { calls.push(['select', columns]); return query; },
    eq(key: string, value: string) { calls.push(['eq', key, value]); return query; },
    async maybeSingle() {
      if (options.throws) throw new Error('PRIVATE_DATABASE_DETAIL');
      return { data, error: options.error ? { message: 'PRIVATE_DATABASE_DETAIL' } : null };
    },
  };
  const api = runInNewContext(ts.transpileModule(`${source}\n({GET})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    createClient: async () => options.unavailable ? null : ({
      auth: { getUser: async () => {
        if (options.authThrows) throw new Error('PRIVATE_AUTH_DETAIL');
        return { data: { user: options.anonymous ? null : { id: 'owner' } } };
      } },
      from(table: string) { calls.push(['from', table]); return query; },
    }),
    hasTouchLineArenaAccess: (user: unknown) => Boolean(user) && !options.ineligible,
    NextResponse: { json: (body: unknown, init: { status?: number; headers?: unknown } = {}) => ({ body, ...init, status: init.status ?? 200 }) },
  });
  return { response: await api.GET(), calls };
}
function privateResponse(response: { headers?: Record<string, string> }) {
  assert.equal(response.headers?.['Cache-Control'], 'private, no-store');
  assert.equal(response.headers?.['CDN-Cache-Control'], 'no-store');
  assert.equal(response.headers?.['Vercel-CDN-Cache-Control'], 'no-store');
}
test('GET returns exact saved account language without writes or inferred defaults', async () => {
  for (const locale of ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE']) {
    const { response, calls } = await read({ game_locale: locale, game_locale_revision: '0', channels: { push: false }, explicit_consent_at: null });
    assert.equal(response.status, 200); assert.equal(response.body.data.gameLocale, locale);
    assert.equal(response.body.data.accountId, 'owner');
    assert.equal(response.body.data.gameLocaleRevision, '0');
    assert.equal(response.body.data.channels.push, false); assert.equal(response.body.data.explicitConsentAt, null);
    privateResponse(response);
    assert.deepEqual(calls, [['from', 'notification_preferences'],
      ['select', 'settings, channels, frequency, quiet_hours, explicit_consent_at, updated_at, game_locale, game_locale_revision::text'], ['eq', 'user_id', 'owner']]);
  }
  for (const data of [null, ...[null, 'en', 'PT-br', 'constructor', ' en-GB', 42].map(game_locale => ({ game_locale, game_locale_revision: '0' }))]) {
    const { response } = await read(data);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.gameLocale, null);
    assert.equal(response.body.data.gameLocaleRevision, '0'); privateResponse(response);
  }
});

test('GET returns canonical exact bigint revision strings including values above 2^53 and the maximum', async () => {
  for (const revision of ['0', '1', '9007199254740993', '9223372036854775806', '9223372036854775807']) {
    const { response } = await read({ game_locale: 'pt-BR', game_locale_revision: revision });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.gameLocale, 'pt-BR');
    assert.equal(response.body.data.gameLocaleRevision, revision);
    privateResponse(response);
  }
});

test('GET fails closed on existing rows with missing, inherited, numeric or malformed revisions', async () => {
  const malformed = [{}, { game_locale: 'pt-BR' },
    Object.assign(Object.create({ game_locale_revision: '1' }), { game_locale: 'pt-BR' }),
    ...[undefined, null, 0, 1, 9007199254740992, false, '', '-1', '+1', '00', '01', '1.0', '1e3',
      ' 0', '0 ', '9223372036854775808', {}, []].map(game_locale_revision => ({ game_locale: 'pt-BR', game_locale_revision }))];
  for (const data of malformed) {
    const { response } = await read(data);
    assert.equal(response.status, 503, JSON.stringify(data));
    assert.equal(response.body.ok, false);
    privateResponse(response);
  }
});
test('GET rejects anonymous access before table reads and sanitizes failed reads', async () => {
  const anonymous = await read(null, { anonymous: true });
  assert.equal(anonymous.response.status, 401); assert.deepEqual(anonymous.calls, []); privateResponse(anonymous.response);
  for (const options of [{ error: true }, { throws: true }]) {
    const { response } = await read(null, options);
    assert.equal(response.status, 503); privateResponse(response);
    assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_DATABASE_DETAIL/);
  }
});

test('GET never accesses preferences when eligibility or authentication is unavailable', async () => {
  for (const [options, status] of [[{ ineligible: true }, 401], [{ unavailable: true }, 401], [{ authThrows: true }, 503]] as const) {
    const { response, calls } = await read(null, options);
    assert.equal(response.status, status); assert.deepEqual(calls, []); privateResponse(response);
    assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_AUTH_DETAIL/);
  }
});
