import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';
const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { createFootballDataProvider, getFootballDataProvider } = await import('../lib/football-data/provider-factory.ts');
const { createGuardedFixtureProvider } = await import('../lib/football-data/fixture-provider-server.ts');
const keys = ['TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED', 'TOUCHLINE_SPORTMONKS_CENTRAL_URL', 'TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN', 'TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE', 'SPORTMONKS_API_TOKEN', 'SPORTMONKS_BASE_URL'];
const token = 'q'.repeat(40), scope = 'shared', authority = 'https://authority.invalid/api/internal/football-data/quota';
async function scenario(run: (events: string[]) => Promise<void>) {
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]])), originalFetch = globalThis.fetch;
  const events: string[] = [];
  Object.assign(process.env, { TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: authority,
    TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: token, TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: scope,
    SPORTMONKS_API_TOKEN: 'synthetic-provider-key', SPORTMONKS_BASE_URL: 'https://sportmonks.invalid/v3/football' });
  clearFootballDataCache();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.href === authority) {
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`);
      const { operation, args } = JSON.parse(String(init?.body));
      assert.equal(args.p_account_scope, scope); events.push(operation);
      return Response.json(operation === 'admit' ? { allowed: true, token: '12345678-1234-4234-8234-123456789abc' } : { persisted: true });
    }
    assert.equal(url.origin, 'https://sportmonks.invalid'); events.push('provider');
    return Response.json({ data: { id: 19, name: 'Synthetic club' }, rate_limit: { requested_entity: 'Team', remaining: 1500, resets_in_seconds: 120 } });
  };
  try { await run(events); } finally {
    globalThis.fetch = originalFetch; clearFootballDataCache();
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
// If runtime touches this old content-client quota transport, fail immediately.
const forbiddenAdmin = new Proxy({}, { get() { throw Error('Content database must not control global quota'); } }) as Parameters<typeof createGuardedFixtureProvider>[0];

test('general and five-job factories use the SAME central transport, not content DB', async () => scenario(async events => {
  assert.equal((await createFootballDataProvider().getTeamById('19')).ok, true);
  assert.deepEqual(events, ['admit', 'provider', 'complete']);
  clearFootballDataCache(); events.length = 0;
  assert.equal((await createGuardedFixtureProvider(forbiddenAdmin, scope).getTeamById('19')).ok, true);
  assert.deepEqual(events, ['admit', 'provider', 'complete']);
}));
test('OFF/missing enable never reads cached or uncached provider, even with valid token', async () => scenario(async events => {
  assert.equal((await getFootballDataProvider().getTeamById('19')).ok, true);
  events.length = 0;
  for (const flag of [undefined, '', 'false']) {
    if (flag === undefined) delete process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED;
    else process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED = flag;
    assert.equal((await getFootballDataProvider().getTeamById('19')).ok, false);
    assert.equal((await createGuardedFixtureProvider(forbiddenAdmin).getTeamById('20')).ok, false);
  }
  assert.deepEqual(events, []);
}));
test('invalid flags/bindings and mismatched requested scope fail before HTTP', async () => scenario(async events => {
  for (const flag of ['1', 'TRUE', 'yes']) {
    process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED = flag;
    assert.throws(() => getFootballDataProvider(), /binding unavailable/);
  }
  process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED = 'true';
  assert.throws(() => createGuardedFixtureProvider(forbiddenAdmin, 'different'), /binding unavailable/);
  for (const key of keys.slice(1, 4)) {
    const original = process.env[key]; delete process.env[key];
    assert.throws(() => createFootballDataProvider(), /unavailable/); process.env[key] = original;
  }
  assert.deepEqual(events, []);
}));
test('failed central endpoint never falls back to provider or content DB', async () => scenario(async events => {
  globalThis.fetch = async () => { events.push('central-failed'); throw Error('Synthetic central outage'); };
  const result = await createGuardedFixtureProvider(forbiddenAdmin).getTeamById('19');
  assert.equal(result.ok, false); assert.deepEqual(events, ['central-failed']);
}));
