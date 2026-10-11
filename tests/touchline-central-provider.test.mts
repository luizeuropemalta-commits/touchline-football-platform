import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { clearFootballDataCache, footballDataCacheSnapshot } from '../lib/football-data/cache.ts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { createCentralFootballDataProvider: create } = await import('../lib/football-data/central-provider-server.ts');
const { createFixtureAuthorityServer } = await import('../lib/football-data/fixture-authority-server.ts');
const { SportmonksFootballProvider } = await import('../lib/football-data/providers/sportmonks.ts');
const id = '12345678-1234-4234-8234-123456789abc';
const worker = { enabled: true as const, authorityUrl: 'https://authority.invalid/api/internal/football-data/quota',
  workerToken: 'q'.repeat(40), accountScope: 'shared' };
const centralKey = 'central-secret'.repeat(4);
const sportmonksKey = 'synthetic-sportmonks-key';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

async function scenario(run: (h: ReturnType<typeof harness>) => Promise<void>, options: Parameters<typeof harness>[0] = {}) {
  const savedFetch = globalThis.fetch;
  const token = process.env.SPORTMONKS_API_TOKEN, base = process.env.SPORTMONKS_BASE_URL;
  clearFootballDataCache();
  process.env.SPORTMONKS_API_TOKEN = sportmonksKey;
  process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.invalid/v3/football';
  const h = harness(options);
  globalThis.fetch = h.providerFetch;
  try { await run(h); } finally {
    globalThis.fetch = savedFetch;
    if (token === undefined) delete process.env.SPORTMONKS_API_TOKEN; else process.env.SPORTMONKS_API_TOKEN = token;
    if (base === undefined) delete process.env.SPORTMONKS_BASE_URL; else process.env.SPORTMONKS_BASE_URL = base;
    clearFootballDataCache();
  }
}

function harness(options: { denied?: boolean; persisted?: boolean; throttle?: boolean; unavailable?: boolean; redirectStatus?: 302 | 307 } = {}) {
  const events: string[] = [];
  const redirectModes: Array<RequestRedirect | undefined> = [];
  let cooling = false, dbCalls = 0, providerCalls = 0;
  const server = createFixtureAuthorityServer({ enabled: true, projectRef: 'a'.repeat(20), serviceKey: centralKey,
    accountScope: 'shared', workers: [{ workerId: 'qa-live', environment: 'qa', token: worker.workerToken }] }, async (url, init) => {
    dbCalls++;
    assert.equal(new URL(String(url)).hostname, `${'a'.repeat(20)}.supabase.co`);
    const headers = new Headers(init!.headers);
    assert.equal(headers.get('apikey'), centralKey);
    assert.equal(headers.get('authorization'), `Bearer ${centralKey}`);
    assert.ok(!String(init!.body).includes(worker.workerToken)); assert.ok(!String(init!.body).includes(sportmonksKey));
    const body = JSON.parse(String(init!.body));
    assert.equal(body.p_worker_id, 'qa-live'); assert.equal(body.p_environment, 'qa'); assert.equal(body.p_account_scope, 'shared');
    if (String(url).endsWith('/touchline_central_quota_admit')) {
      events.push('admit'); return json(options.denied || cooling ? { allowed: false } : { allowed: true, token: id });
    }
    assert.ok(String(url).endsWith('/touchline_central_quota_complete'));
    events.push('complete');
    assert.equal(body.p_token, id);
    if (options.redirectStatus) {
      assert.equal(body.p_observation.status, 0);
      assert.equal(body.p_observation.requestedEntity, null);
      assert.equal(body.p_observation.remaining, null);
      assert.equal(body.p_observation.resetAt, null);
    } else assert.equal(body.p_observation.requestedEntity, 'Team');
    cooling = body.p_observation.status === 429 || body.p_observation.status === 0;
    return json({ persisted: options.persisted !== false });
  });
  const authorityFetch: typeof fetch = async (url, init) => {
    assert.equal(String(url), worker.authorityUrl);
    assert.equal(new Headers(init!.headers).get('authorization'), `Bearer ${worker.workerToken}`);
    assert.ok(!String(init!.body).includes(centralKey)); assert.ok(!String(init!.body).includes(sportmonksKey));
    if (options.unavailable) throw Error('synthetic network unavailable');
    return server(new Request(String(url), init));
  };
  const providerFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://sportmonks.invalid');
    assert.equal(url.searchParams.get('api_token'), sportmonksKey);
    assert.ok(!url.href.includes(worker.workerToken)); assert.ok(!url.href.includes(centralKey));
    assert.ok(!JSON.stringify(init?.headers).includes(worker.workerToken));
    providerCalls++; events.push('provider');
    if (options.redirectStatus) {
      redirectModes.push(init?.redirect);
      // Synthetic Fetch redirect semantics: a blocked redirect rejects without
      // exposing status/body, so the receipt must remain unknown, not 302/307.
      const redirect = Response.redirect('https://sportmonks.invalid/v3/football/players/200', options.redirectStatus);
      assert.equal(init?.redirect, 'error', `Redirect ${redirect.status} must not follow its Location`);
      throw new TypeError('fetch failed: redirect rejected');
    }
    return json({ data: { id: 19, name: 'Synthetic team' }, rate_limit: {
      requested_entity: 'Team', remaining: options.throttle ? 0 : 1900, resets_in_seconds: 120,
    } }, options.throttle ? 429 : 200);
  };
  return { events, redirectModes, authorityFetch, providerFetch, counts: () => ({ dbCalls, providerCalls }) };
}

for (const redirectStatus of [302, 307] as const) test(`central provider blocks ${redirectStatus} redirect before a second entity request`, async () => {
  await scenario(async h => {
    const provider = create(worker, h.authorityFetch);
    const response = await provider.getTeamById('19');
    assert.equal(response.ok, false); assert.equal(Object.hasOwn(response, 'data'), false);
    assert.deepEqual(h.redirectModes, ['error'], 'transport option must be checked outside the caught fetch failure');
    assert.deepEqual(h.events.slice(0, 3), ['admit', 'provider', 'complete']);
    assert.equal(h.events.filter(event => event === 'complete').length, 1);
    assert.ok(h.events.slice(3).every(event => event === 'admit'));
    assert.equal(h.counts().providerCalls, 1);
    assert.equal(footballDataCacheSnapshot().size, 0);
    assert.equal((await provider.getTeamById('20')).ok, false);
    assert.equal(h.counts().providerCalls, 1, 'unknown receipt denies later requests without fallback');
  }, { redirectStatus });
});

test('central worker default OFF cannot use provider HTTP or authority', async () => {
  await scenario(async h => {
    assert.equal((await create({}, h.authorityFetch).getTeamById('19')).ok, false);
    assert.equal((await create({}, h.authorityFetch).getLiveScores()).ok, false);
    assert.equal((await create({}, h.authorityFetch).searchPlayers({ query: 'player' })).ok, false);
    assert.deepEqual(h.counts(), { dbCalls: 0, providerCalls: 0 });
  });
});
test('actual provider and full central graph admit, fetch and complete in order with isolated credentials', async () => {
  await scenario(async h => {
    const provider = create(worker, h.authorityFetch);
    const response = await provider.getTeamById('19');
    assert.equal(response.ok, true);
    assert.deepEqual(h.events, ['admit', 'provider', 'complete']);
    assert.equal((await provider.getTeamById('19')).ok, true);
    assert.deepEqual(h.counts(), { dbCalls: 2, providerCalls: 1 }, 'validated cache does not spend quota again');
    const snapshot = JSON.stringify(footballDataCacheSnapshot());
    for (const secret of [worker.workerToken, sportmonksKey, centralKey]) assert.ok(!snapshot.includes(secret));
  });
});
test('denied or unavailable authority never falls back to content DB or Sportmonks', async () => {
  for (const options of [{ denied: true }, { unavailable: true }]) await scenario(async h => {
    assert.equal((await create(worker, h.authorityFetch).getTeamById('19')).ok, false);
    assert.equal(h.counts().providerCalls, 0);
    assert.equal(h.counts().dbCalls, 'denied' in options ? 1 : 0);
  }, options);
});
test('refused completion does not return successful provider data or populate cache', async () => {
  await scenario(async h => {
    const response = await create(worker, h.authorityFetch).getTeamById('19');
    assert.equal(response.ok, false); assert.equal(Object.hasOwn(response, 'data'), false);
    assert.deepEqual(h.events, ['admit', 'provider', 'complete']);
    assert.equal(footballDataCacheSnapshot().size, 0);
  }, { persisted: false });
});
test('429 receipt persists before further admission and blocks new provider instances', async () => {
  await scenario(async h => {
    assert.equal((await create(worker, h.authorityFetch).getTeamById('19')).ok, false);
    assert.deepEqual(h.events.slice(0, 3), ['admit', 'provider', 'complete']);
    assert.equal((await create(worker, h.authorityFetch).getTeamById('20')).ok, false);
    assert.equal(h.counts().providerCalls, 1);
  }, { throttle: true });
});
test('a warm legacy protected cache cannot bypass the new central binding', async () => {
  await scenario(async h => {
    const legacy = new SportmonksFootballProvider({ fixtureGuard: { accountScope: 'shared', createPort: () => ({
      beforeAttempt: () => ({ allowed: true, token: id }), afterAttempt: () => ({ persisted: true }),
    }) } });
    assert.equal((await legacy.getTeamById('19')).ok, true);
    assert.equal((await legacy.getTeamById('19')).ok, true);
    assert.equal(h.counts().providerCalls, 1, 'positive cache control');
    assert.equal((await create(worker, h.authorityFetch).getTeamById('19')).ok, false);
    assert.equal(h.counts().providerCalls, 1); assert.equal(h.counts().dbCalls, 1);
  }, { denied: true });
});
test('changed authority URL, worker token or account scope cannot inherit a cached success', async () => {
  await scenario(async h => {
    assert.equal((await create(worker, h.authorityFetch).getTeamById('19')).ok, true);
    let calls = 0;
    const denied: typeof fetch = async () => { calls++; return json({ allowed: false }); };
    for (const delta of [{ authorityUrl: 'https://different.invalid/api/internal/football-data/quota' },
      { workerToken: 'z'.repeat(40) }, { accountScope: 'other' }]) {
      assert.equal((await create({ ...worker, ...delta }, denied).getTeamById('19')).ok, false);
    }
    assert.equal(calls, 3); assert.equal(h.counts().providerCalls, 1);
  });
});

test('malformed cache namespaces fail closed before any HTTP or cached result', async () => {
  await scenario(async h => {
    for (const cacheNamespace of ['', 'secret-token', 'a'.repeat(63), 'A'.repeat(64), 'a'.repeat(65)]) {
      const provider = new SportmonksFootballProvider({ fixtureGuard: { accountScope: 'shared', cacheNamespace,
        createPort: () => { assert.fail('invalid binding must never create an admission port'); },
      } });
      assert.equal((await provider.getTeamById('19')).ok, false);
    }
    assert.deepEqual(h.counts(), { dbCalls: 0, providerCalls: 0 });
  });
});

test('worker construction captures configuration independently of later caller mutation', async () => {
  await scenario(async h => {
    const mutable = { ...worker };
    const provider = create(mutable, h.authorityFetch);
    mutable.accountScope = 'changed'; mutable.workerToken = 'z'.repeat(40);
    mutable.authorityUrl = 'https://different.invalid/api/internal/football-data/quota';
    assert.equal((await provider.getTeamById('19')).ok, true);
    assert.deepEqual(h.events, ['admit', 'provider', 'complete']);
  });
});

test('unresponsive authority is bounded and canceled without a Sportmonks call or retry', async () => {
  await scenario(async h => {
    let calls = 0; let observed: AbortSignal | null | undefined;
    const provider = create(worker, async (_url, init) => {
      calls++; observed = init!.signal;
      return new Promise<Response>(() => {});
    });
    const response = await provider.getTeamById('19');
    assert.equal(response.ok, false); assert.equal(observed?.aborted, true); assert.equal(calls, 1);
    assert.deepEqual(h.counts(), { dbCalls: 0, providerCalls: 0 });
    assert.equal(footballDataCacheSnapshot().size, 0);
  });
});
