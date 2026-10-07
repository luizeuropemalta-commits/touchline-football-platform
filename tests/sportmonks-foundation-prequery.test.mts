import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { SportmonksFootballProvider } = await import('../lib/football-data/providers/sportmonks.ts');
type Guard = import('../lib/football-data/providers/sportmonks.ts').SportmonksFixtureGuard;

async function synthetic(body: () => Promise<void>, fetcher: typeof fetch) {
  const oldFetch = globalThis.fetch;
  const token = process.env.SPORTMONKS_API_TOKEN, base = process.env.SPORTMONKS_BASE_URL;
  clearFootballDataCache();
  process.env.SPORTMONKS_API_TOKEN = 'synthetic-token';
  process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.invalid/v3/football';
  globalThis.fetch = fetcher;
  try { await body(); } finally {
    globalThis.fetch = oldFetch;
    if (token === undefined) delete process.env.SPORTMONKS_API_TOKEN; else process.env.SPORTMONKS_API_TOKEN = token;
    if (base === undefined) delete process.env.SPORTMONKS_BASE_URL; else process.env.SPORTMONKS_BASE_URL = base;
    clearFootballDataCache();
  }
}

test('explicit guarded foundation team and squad calls cannot bypass cooldown', async () => {
  let fetches = 0;
  const guard: Guard = { accountScope: 'qa-foundation', createPort: () => ({
    beforeAttempt: () => ({ allowed: false }), afterAttempt: () => ({ persisted: true }),
  }) };
  await synthetic(async () => {
    const provider = new SportmonksFootballProvider({ fixtureGuard: guard });
    assert.equal((await provider.getTeamById('19')).ok, false);
    assert.equal((await provider.getSquad('19')).ok, false);
    assert.equal(fetches, 0, 'unmapped families must fail closed, never escape an explicit guard');
  }, async () => { fetches++; return new Response('{}', { status: 404 }); });
});

test('callers without a guard retain existing team and squad HTTP behavior', async () => {
  const paths: string[] = [];
  await synthetic(async () => {
    const provider = new SportmonksFootballProvider();
    assert.equal((await provider.getTeamById('19')).ok, true);
    assert.equal((await provider.getSquad('19')).ok, true);
    assert.deepEqual(paths, ['/v3/football/teams/19', '/v3/football/squads/teams/19', '/v3/football/squads/teams/19/extended']);
  }, async input => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    return new Response(JSON.stringify({ data: path === '/v3/football/teams/19' ? { id: 19, name: 'Synthetic Club' } : [] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  });
});

test('explicit guard rejects unknown team endpoint before reusing a warm unguarded cache', async () => {
  let fetches = 0, ports = 0;
  const guard: Guard = { accountScope: 'qa-foundation', createPort: () => {
    ports++;
    return { beforeAttempt: () => ({ allowed: false }), afterAttempt: () => ({ persisted: true }) };
  } };
  await synthetic(async () => {
    const legacy = new SportmonksFootballProvider();
    const first = await legacy.getTeamById('19');
    assert.equal(first.ok, true);
    assert.equal(fetches, 1);
    const warm = await legacy.getTeamById('19');
    assert.equal(warm.ok, true);
    assert.equal(fetches, 1, 'control proves the real cache was populated and reused');

    const guarded = await new SportmonksFootballProvider({ fixtureGuard: guard }).getTeamById('19');
    assert.equal(guarded.ok, false, 'a cached successful team must not bypass the unknown-endpoint guard');
    assert.equal(fetches, 1, 'guarded attempt emits zero additional HTTP');
    assert.equal(ports, 0, 'unknown endpoint must not invent an authority tuple');
    assert.equal(Object.hasOwn(guarded, 'data'), false, 'no team payload may escape from the warm cache');

    assert.equal((await legacy.getTeamById('19')).ok, true);
    assert.equal(fetches, 1, 'denial neither consumes nor destroys the legacy cached success');
  }, async () => {
    fetches++;
    return new Response(JSON.stringify({ data: { id: 19, name: 'Synthetic Cached Club' } }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  });
});

test('guarded squad requests wait for completion of the first admission before starting the extended request', async () => {
  const events: string[] = [];
  const authorities: string[][] = [];
  let release!: () => void;
  const firstResponse = new Promise<void>(resolve => { release = resolve; });
  let active = false, admissions = 0, fetches = 0;
  const guard: Guard = { accountScope: 'qa-foundation', createPort: context => {
    authorities.push([context.endpoint, context.entity]);
    return {
    beforeAttempt: () => {
      events.push('admit'); admissions++;
      assert.equal(active, false, 'single active quota token must not be raced');
      active = true;
      return { allowed: true, token: 'synthetic-token' };
    },
    afterAttempt: () => { events.push('complete'); active = false; return { persisted: true }; },
    };
  } };
  // Entity literals are from the official Sportmonks Postman response examples;
  // this synthetic test proves port sequencing, not SQL deployment/activation.
  await synthetic(async () => {
    const pending = new SportmonksFootballProvider({ fixtureGuard: guard }).getSquad('19');
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(admissions, 1);
      assert.equal(fetches, 1, 'extended HTTP must wait while the first body is pending');
    } finally { release(); await pending; }
    assert.deepEqual(events, ['admit', 'fetch', 'complete', 'admit', 'fetch', 'complete']);
    assert.deepEqual(authorities, [['squad', 'PlayerTeam'], ['squadExtended', 'Player']]);
    assert.equal(active, false);
  }, async () => {
    fetches++; events.push('fetch');
    if (fetches === 1) await firstResponse;
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
});

test('denied base squad never starts extended admission or HTTP', async () => {
  const endpoints: string[] = [];
  let fetches = 0;
  const guard: Guard = { accountScope: 'qa-foundation', createPort: context => {
    endpoints.push(context.endpoint);
    return { beforeAttempt: () => ({ allowed: false }), afterAttempt: () => ({ persisted: true }) };
  } };
  await synthetic(async () => {
    assert.equal((await new SportmonksFootballProvider({ fixtureGuard: guard }).getSquad('19')).ok, false);
    assert.deepEqual(endpoints, ['squad']);
    assert.equal(fetches, 0);
  }, async () => { fetches++; return new Response('{}'); });
});
