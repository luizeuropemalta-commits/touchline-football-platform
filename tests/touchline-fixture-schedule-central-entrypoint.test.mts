import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { syncSportmonksFixtureSchedule } = await import('../lib/football-data/fixture-schedule-sync.ts');
const { createFixtureAuthorityServer } = await import('../lib/football-data/fixture-authority-server.ts');
const { clearFootballDataCache } = await import('../lib/football-data/cache.ts');
type Mode = 'success' | 'deny' | '429' | 'lost-complete' | 'write-failure';
type Row = Record<string, unknown>;
const centralUrl = 'https://authority.invalid/api/internal/football-data/quota', scope = 'schedule';
const token = 'q'.repeat(40), serviceKey = 'central-key'.repeat(5), centralRef = 'a'.repeat(20);
const instant = '2026-10-10T12:30:00.000Z';

async function scenario(mode: Mode) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  Object.assign(process.env, { SPORTMONKS_API_TOKEN: 'synthetic', SPORTMONKS_BASE_URL: 'https://provider.invalid/v3/football',
    TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: centralUrl,
    TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: token, TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: scope,
    TZ: 'America/Sao_Paulo' });
  clearFootballDataCache();
  const events: string[] = [], fixtureWrites: Row[][] = [], completions: Row[] = [];
  const rows = new Map<string, Row[]>();
  let providerCalls = 0, denied429 = false, centralCompletions = 0;
  const handler = createFixtureAuthorityServer({ enabled: true, projectRef: centralRef, serviceKey, accountScope: scope,
    workers: [{ workerId: 'qa-schedule', environment: 'qa', token }] }, async (input, init) => {
    assert.equal(new URL(String(input)).origin, `https://${centralRef}.supabase.co`);
    assert.equal(new Headers(init?.headers).get('apikey'), serviceKey);
    const args = JSON.parse(String(init?.body));
    assert.equal(args.p_worker_id, 'qa-schedule'); assert.equal(args.p_account_scope, scope); assert.equal(args.p_environment, 'qa');
    const endpoint = args.p_endpoint;
    if (String(input).endsWith('touchline_central_quota_admit')) {
      events.push(`admit:${endpoint}`);
      return Response.json((mode === 'deny' && endpoint === 'between') || denied429
        ? { allowed: false } : { allowed: true, token: randomUUID() });
    }
    assert.ok(String(input).endsWith('touchline_central_quota_complete'));
    events.push(`complete:${endpoint}`); centralCompletions++;
    assert.equal(args.p_observation.requestedEntity, endpoint === 'league' ? 'League' : endpoint === 'season' ? 'Season' : 'Fixture');
    if (mode === '429' && endpoint === 'between') {
      assert.equal(args.p_observation.status, 429); assert.equal(args.p_observation.remaining, 0); denied429 = true;
    }
    return Response.json({ persisted: !(mode === 'lost-complete' && endpoint === 'between') });
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.href === centralUrl) return handler(new Request(url, init));
    assert.equal(url.origin, 'https://provider.invalid'); providerCalls++;
    let data: unknown, entity: string, endpoint: string;
    if (url.pathname.endsWith('/leagues/8')) { data = { id: 8, name: 'Premier League' }; entity = 'League'; endpoint = 'league'; }
    else if (url.pathname.endsWith('/seasons/28083')) { data = { id: 28083, league_id: 8, name: '2026/27' }; entity = 'Season'; endpoint = 'season'; }
    else {
      assert.match(url.pathname, /\/fixtures\/between\/2026-10-10\/2026-10-10$/);
      assert.equal(url.searchParams.get('timezone'), 'Europe/London');
      assert.equal(url.searchParams.get('filters'), 'fixtureLeagues:8');
      entity = 'Fixture'; endpoint = 'between';
      const base = { league_id: 8, season_id: 28083, round_id: 339001, round: { id: 339001, name: '1' },
        state: { name: 'Not Started' }, participants: [{ id: 19, name: 'Arsenal', meta: { location: 'home' } },
          { id: 20, name: 'Opponent', meta: { location: 'away' } }] };
      data = [
        { ...base, id: 19722203, starting_at_timestamp: Date.parse(instant) / 1000, starting_at: '2026-10-10 03:00:00' },
        { ...base, id: 19722204, starting_at: '2026-10-10 13:30:00' },
        { ...base, id: 19722205, starting_at: '2026-10-10T12:30:00Z' },
      ];
    }
    events.push(`provider:${endpoint}`);
    const failing = mode === '429' && endpoint === 'between';
    return Response.json({ data, pagination: { has_more: false }, rate_limit: { requested_entity: entity,
      remaining: failing ? 0 : 1500, resets_in_seconds: 120 } }, { status: failing ? 429 : 200 });
  };
  const admin = {
    async rpc(name: string) {
      assert.equal(name, 'touchline_reconcile_coach_fixture_points', 'content database cannot handle quota');
      assert.equal(fixtureWrites.length, 1); assert.notEqual(mode, 'write-failure');
      events.push('coach'); return { data: { reconciled: 0 }, error: null };
    },
    from(table: string) {
      let action = 'read', payload: unknown, single = false;
      const builder = {
        insert(value: unknown) { action = 'insert'; payload = value; return builder; },
        update(value: unknown) { action = 'update'; payload = value; return builder; },
        upsert(value: unknown, options: { onConflict: string }) {
          assert.equal(centralCompletions, 3, 'all central completions precede football persistence');
          action = 'upsert'; payload = value;
          if (table === 'football_fixtures') assert.equal(options.onConflict, 'provider,provider_fixture_id');
          return builder;
        },
        select() { return builder; }, eq() { return builder; }, in() { return builder; },
        single() { single = true; return builder; },
        then(resolve: (value: unknown) => unknown) {
          let data: unknown = rows.get(table) ?? [], error: unknown = null;
          if (action === 'insert') { assert.equal(table, 'football_data_sync_runs'); data = { id: 'run-1' }; events.push('run-start'); }
          if (action === 'update') { assert.equal(table, 'football_data_sync_runs'); completions.push(payload as Row); events.push('run-end'); }
          if (action === 'upsert') {
            const values = (Array.isArray(payload) ? payload : [payload]) as Row[];
            rows.set(table, values.map((row, i) => ({ ...row, id: `${table}-${i}` })));
            data = single ? rows.get(table)![0] : rows.get(table);
            events.push(`write:${table}`);
            if (table === 'football_fixtures') {
              fixtureWrites.push(values);
              if (mode === 'write-failure') error = { message: 'synthetic-write-failure' };
            }
          }
          return Promise.resolve(resolve({ data, error }));
        },
      }; return builder;
    },
  } as unknown as Parameters<typeof syncSportmonksFixtureSchedule>[0];
  try {
    const result = await syncSportmonksFixtureSchedule(admin, { competitionId: '8', fromDate: '2026-10-10', throughDate: '2026-10-10' });
    assert.equal(completions.length, 1); assert.equal(events.at(-1), 'run-end');
    if (mode === 'success' || mode === 'write-failure') {
      assert.equal(providerCalls, 3); assert.equal(fixtureWrites.length, 1);
      assert.equal(fixtureWrites[0].length, 3);
      for (const row of fixtureWrites[0]) {
        assert.equal(row.starts_at, instant); assert.equal(row.home_club_id, 'football_clubs-0');
        assert.equal(row.away_club_id, 'football_clubs-1'); assert.equal(row.season_id, 'football_seasons-0');
      }
      assert.deepEqual(events.slice(1, 10), ['league', 'between', 'season'].flatMap(e => [`admit:${e}`, `provider:${e}`, `complete:${e}`]));
      assert.equal(result.ok, mode === 'success'); assert.equal(result.status, mode === 'success' ? 'success' : 'error');
      assert.equal(events.includes('coach'), mode === 'success');
      assert.equal(result.fixturesStored, mode === 'success' ? 3 : 0);
    } else {
      assert.equal(result.ok, false); assert.equal(result.status, 'error'); assert.equal(fixtureWrites.length, 0);
      assert.equal(events.some(event => event.startsWith('write:')), false);
      assert.equal(providerCalls, mode === 'deny' ? 1 : 2);
    }
    assert.equal(completions[0].status, result.status);
  } finally {
    globalThis.fetch = originalFetch; clearFootballDataCache();
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, saved);
  }
}
for (const mode of ['success', 'deny', '429', 'lost-complete', 'write-failure'] as const) {
  test(`real schedule central/provider/store entrypoint: ${mode}`, () => scenario(mode));
}
