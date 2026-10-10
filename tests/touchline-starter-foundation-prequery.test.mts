import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { syncSportmonksStarterFoundation } = await import('../lib/football-data/starter-sync.ts');

test('starter foundation without account scope fails before provider or database work', async () => {
  const oldFetch = globalThis.fetch;
  const scope = process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
  const enabled = process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED;
  let fetches = 0, databaseCalls = 0;
  const admin = {
    from() { databaseCalls++; throw new Error('unexpected database work'); },
    rpc() { databaseCalls++; throw new Error('unexpected authority work'); },
  } as unknown as SupabaseClient;
  try {
    delete process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
    process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED = 'true';
    globalThis.fetch = async () => { fetches++; return new Response('{}', { status: 404 }); };
    await assert.rejects(syncSportmonksStarterFoundation(admin), /binding unavailable/);
    assert.equal(fetches, 0);
    assert.equal(databaseCalls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (scope === undefined) delete process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
    else process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE = scope;
    if (enabled === undefined) delete process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED;
    else process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED = enabled;
  }
});

test('real starter foundation must consult durable admission and emit zero HTTP during account cooldown', async () => {
  const oldFetch = globalThis.fetch;
  const keys = ['SPORTMONKS_API_TOKEN', 'SPORTMONKS_BASE_URL', 'TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE',
    'TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED', 'TOUCHLINE_SPORTMONKS_CENTRAL_URL', 'TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN'] as const;
  const saved = keys.map(key => process.env[key]);
  let fetches = 0, admissions = 0;
  const tables: string[] = [];
  const admin = {
    from(table: string) {
      tables.push(table);
      assert.equal(table, 'football_data_sync_runs', 'denied foundation must not write football entities');
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'synthetic-run' }, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
    rpc() {
      throw new Error('Content database must never control global quota');
    },
  } as unknown as SupabaseClient;
  try {
    process.env.SPORTMONKS_API_TOKEN = 'synthetic-token';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.invalid/v3/football';
    process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE = 'qa-foundation';
    process.env.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED = 'true';
    process.env.TOUCHLINE_SPORTMONKS_CENTRAL_URL = 'https://authority.invalid/api/internal/football-data/quota';
    process.env.TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN = 'q'.repeat(40);
    clearFootballDataCache();
    globalThis.fetch = async (input, init) => {
      if (String(input) !== process.env.TOUCHLINE_SPORTMONKS_CENTRAL_URL) {
        fetches++; throw new Error('No provider request permitted during cooldown');
      }
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${'q'.repeat(40)}`);
      const { operation, args } = JSON.parse(String(init?.body));
      assert.equal(operation, 'admit');
      assert.equal(args.p_account_scope, 'qa-foundation');
      assert.equal(args.p_endpoint, 'league');
      admissions++;
      return Response.json({ allowed: false });
    };
    const result = await syncSportmonksStarterFoundation(admin, { competitionId: '8', clubId: '19' });
    assert.equal(result.ok, false);
    assert.equal(fetches, 0, 'cooldown must deny before the first provider HTTP request');
    assert.equal(admissions, 1, 'factory must use real durable admission, not only an observer');
    assert.equal(result.recordsCreated, 0);
    assert.equal(result.recordsUpdated, 0);
    assert.ok(tables.every(table => table === 'football_data_sync_runs'));
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
    clearFootballDataCache();
  }
});
