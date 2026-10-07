import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { syncSportmonksStarterFoundation } = await import('../lib/football-data/starter-sync.ts');

test('starter foundation without account scope fails before provider or database work', async () => {
  const oldFetch = globalThis.fetch;
  const scope = process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
  let fetches = 0, databaseCalls = 0;
  const admin = {
    from() { databaseCalls++; throw new Error('unexpected database work'); },
    rpc() { databaseCalls++; throw new Error('unexpected authority work'); },
  } as unknown as SupabaseClient;
  try {
    delete process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
    globalThis.fetch = async () => { fetches++; return new Response('{}', { status: 404 }); };
    await assert.rejects(syncSportmonksStarterFoundation(admin), /account binding unavailable/);
    assert.equal(fetches, 0);
    assert.equal(databaseCalls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (scope === undefined) delete process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
    else process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE = scope;
  }
});

test('real starter foundation must consult durable admission and emit zero HTTP during account cooldown', async () => {
  const oldFetch = globalThis.fetch;
  const keys = ['SPORTMONKS_API_TOKEN', 'SPORTMONKS_BASE_URL', 'TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE'] as const;
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
    rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, 'touchline_fixture_quota_admit');
      assert.equal(args.p_account_scope, 'qa-foundation');
      assert.equal(args.p_endpoint, 'league', 'existing proven league tuple only');
      admissions++;
      return { abortSignal: async () => ({ data: { allowed: false }, error: null }) };
    },
  } as unknown as SupabaseClient;
  try {
    process.env.SPORTMONKS_API_TOKEN = 'synthetic-token';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.invalid/v3/football';
    process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE = 'qa-foundation';
    clearFootballDataCache();
    globalThis.fetch = async () => { fetches++; return new Response('{}', { status: 404 }); };
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
