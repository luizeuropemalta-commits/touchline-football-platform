import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const host = globalThis as typeof globalThis & { __goldenBootTestAdmin?: unknown };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  if (specifier === '@/lib/supabase/admin') return { url: 'data:text/javascript,export function createAdminClient(){return globalThis.__goldenBootTestAdmin}', shortCircuit: true };
  if (specifier === 'next/cache') return { url: 'data:text/javascript,export function unstable_noStore(){}', shortCircuit: true };
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { POST } = await import('../app/api/touchline-awards/golden-boot/refresh/route.ts');
const { NextRequest } = await import('next/server.js');
const { createFixtureAuthorityServer } = await import('../lib/football-data/fixture-authority-server.ts');
const { clearFootballDataCache } = await import('../lib/football-data/cache.ts');
type Row = Record<string, unknown>;
type Mode = 'success' | 'off' | 'unauthorized' | 'deny' | '429' | 'lost-complete' | 'lost-finish';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const comp = id(1), season = id(2), club = id(3), player = id(10), member = id(20);
const authorityUrl = 'https://authority.invalid/api/internal/football-data/quota', token = 'q'.repeat(40);
async function scenario(mode: Mode) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch, warn = console.warn;
  const events: string[] = [], logs: string[] = [], finishes: Row[] = [];
  let claimToken = '', blocked = false, providerCalls = 0, contentReads = 0, completions = 0;
  const secret = 'r'.repeat(40);
  Object.assign(process.env, { TOUCHLINE_GOLDEN_BOOT_REFRESH_ENABLED: mode === 'off' ? 'false' : 'true',
    TOUCHLINE_GOLDEN_BOOT_REFRESH_SECRET: secret, SPORTMONKS_API_TOKEN: 'synthetic-provider',
    SPORTMONKS_BASE_URL: 'https://provider.invalid/v3/football', TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true',
    TOUCHLINE_SPORTMONKS_CENTRAL_URL: authorityUrl, TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: token,
    TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: 'awards' });
  clearFootballDataCache(); console.warn = value => { logs.push(String(value)); };
  const at = new Date().toISOString();
  const tables: Record<string, Row[]> = {
    football_competitions: [{ id: comp, provider: 'sportmonks', provider_competition_id: '8' }],
    football_seasons: [{ id: season, provider: 'sportmonks', provider_season_id: '70001', competition_id: comp, is_current: true, name: '2026/2027' }],
    football_players: [{ id: player, provider: 'sportmonks', provider_player_id: '200', current_club_id: club }],
    football_clubs: [{ id: club, provider: 'sportmonks', provider_team_id: '300', competition_id: comp }],
    football_squad_members: [{ id: member, provider: 'sportmonks', player_id: player, club_id: club, competition_id: comp, status: 'active', jersey_number: 1 }],
    touchline_card_publications: [{ player_id: player, current_membership_id: member, competition_id: comp, effective_season: '2026-27',
      publication_status: 'published', calculated_tier: 'ruby-red', calculated_nominal_price_gbp: 10, last_reviewed_at: at, internal_source: 'editorial' }],
    football_player_market_values: [{ player_id: player, market_value_eur: 2500000, verified_season: '2026-27', status: 'verified', confidence: 'verified', source: 'editorial' }],
    touchline_card_editorial_overrides: [],
  };
  host.__goldenBootTestAdmin = {
    from(table: string) {
      assert.ok(Object.hasOwn(tables, table)); contentReads++;
      const predicates: Array<(row: Row) => boolean> = [];
      let selected: string[] = [], exact = false, limit = Infinity;
      const query = {
        select(columns: string, options?: { count?: string }) { selected = columns.split(','); exact = options?.count === 'exact'; return query; },
        eq(key: string, value: unknown) { predicates.push(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { predicates.push(row => values.includes(row[key])); return query; },
        limit(value: number) { limit = value; return query; },
        then(resolve: (value: unknown) => unknown) {
          const result = tables[table].filter(row => predicates.every(p => p(row)));
          return Promise.resolve(resolve({ data: result.slice(0, limit).map(row => Object.fromEntries(selected.map(k => [k, row[k]]))),
            error: null, count: exact ? result.length : null }));
        },
      }; return query;
    },
    async rpc(name: string, args: Row = {}) {
      assert.ok(!name.includes('quota'), 'content DB must not serve provider quota'); events.push(name);
      if (name === 'try_begin_touchline_golden_boot_worker') {
        claimToken = String(args.p_token);
        return { data: { acquired: true, token: claimToken, generation: '1', competitionId: comp, seasonId: season,
          observedAtMs: Date.now(), leaseUntilMs: Date.now() + 40000 }, error: null };
      }
      if (name === 'read_touchline_golden_boot_source_revision') return { data: '7', error: null };
      if (name === 'complete_touchline_golden_boot_worker') {
        assert.equal(args.p_token, claimToken); completions++;
        return { data: { completed: true, generation: '1', notBeforeMs: Date.now() + 60000 }, error: null };
      }
      assert.equal(name, 'finish_touchline_golden_boot_refresh'); assert.equal(args.p_token, claimToken);
      finishes.push(args);
      if (mode === 'lost-finish') throw Error('PRIVATE SQL secret');
      if (args.p_failure) return { data: { phase: 'unavailable', snapshot_id: null, stateRevision: '8' }, error: null };
      assert.deepEqual(events.slice(1, 7), ['stages', 'topscorers'].flatMap(e => [`admit:${e}`, `provider:${e}`, `complete:${e}`]));
      assert.deepEqual(args.p_leaders, [{ player_id: player, provider_player_id: '200', club_id: club,
        provider_team_id: '300', membership_id: member, goals: 3 }]);
      return { data: { phase: 'ready', snapshot_id: id(40), stateRevision: '8' }, error: null };
    },
  };
  const handler = createFixtureAuthorityServer({ enabled: true, projectRef: 'a'.repeat(20), serviceKey: 'central'.repeat(8), accountScope: 'awards',
    workers: [{ workerId: 'qa-awards', environment: 'qa', token }] }, async (input, init) => {
    assert.equal(new URL(String(input)).origin, `https://${'a'.repeat(20)}.supabase.co`);
    const args = JSON.parse(String(init?.body)); assert.equal(args.p_worker_id, 'qa-awards'); assert.equal(args.p_account_scope, 'awards');
    const endpoint = args.p_endpoint;
    if (String(input).endsWith('touchline_central_quota_admit')) {
      events.push(`admit:${endpoint}`);
      return Response.json(blocked || (mode === 'deny' && endpoint === 'topscorers') ? { allowed: false } : { allowed: true, token: randomUUID() });
    }
    assert.ok(String(input).endsWith('touchline_central_quota_complete')); events.push(`complete:${endpoint}`);
    if (mode === '429' && endpoint === 'topscorers') { assert.equal(args.p_observation.status, 429); blocked = true; }
    return Response.json({ persisted: !(mode === 'lost-complete' && endpoint === 'topscorers') });
  });
  globalThis.fetch = async (input, init) => {
    if (String(input) === authorityUrl) return handler(new Request(String(input), init));
    const url = new URL(String(input)); assert.equal(url.origin, 'https://provider.invalid'); providerCalls++;
    const stages = url.pathname.endsWith('/stages/seasons/70001');
    if (!stages) assert.ok(url.pathname.endsWith('/topscorers/seasons/70001'));
    const endpoint = stages ? 'stages' : 'topscorers'; events.push(`provider:${endpoint}`);
    const failing = mode === '429' && !stages;
    return Response.json({ data: stages ? [{ id: 90001, league_id: 8, season_id: 70001, type_id: 223 }]
      : [{ id: 100, player_id: 200, participant_id: 300, league_id: 8, season_id: 70001, stage_id: 90001, type_id: 208, total: 3 }],
      ...(!stages ? { pagination: { has_more: false, current_page: 1, per_page: 50, count: 1, next_page: null } } : {}),
      rate_limit: { requested_entity: stages ? 'Stage' : 'Topscorer', remaining: failing ? 0 : 1500, resets_in_seconds: 120 } },
    { status: failing ? 429 : 200 });
  };
  try {
    const response = await POST(new NextRequest('https://qa.invalid/api/touchline-awards/golden-boot/refresh', {
      method: 'POST', headers: { authorization: `Bearer ${mode === 'unauthorized' ? 'wrong' : secret}` },
    }));
    const body = await response.json();
    if (mode === 'off' || mode === 'unauthorized') {
      assert.equal(response.status, mode === 'off' ? 503 : 401); assert.equal(contentReads, 0);
      assert.deepEqual(events, []); assert.equal(providerCalls, 0);
    } else {
      assert.equal(response.status, mode === 'success' ? 200 : mode === 'lost-finish' ? 503 : 502, JSON.stringify({ events, finishes, logs }));
      assert.deepEqual(body, { ok: mode === 'success', status: mode === 'success' ? 'stored' : mode === 'lost-finish' ? 'unconfirmed' : 'unavailable' });
      assert.equal(completions, 1); assert.equal(providerCalls, mode === 'deny' ? 1 : 2);
      assert.ok(finishes.length > 0);
      if (mode === 'success' || mode === 'lost-finish') assert.equal(finishes[0].p_failure, null);
      else assert.ok(finishes.every(f => f.p_leaders === null && f.p_failure === 'PROVIDER_UNAVAILABLE'));
    }
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(JSON.stringify([body, logs]), /PRIVATE|synthetic-provider|centralcentral|qqqqqq/);
  } finally {
    globalThis.fetch = originalFetch; console.warn = warn; delete host.__goldenBootTestAdmin; clearFootballDataCache();
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, saved);
  }
}
for (const mode of ['success', 'off', 'unauthorized', 'deny', '429', 'lost-complete', 'lost-finish'] as const)
  test(`Golden Boot real route/producer/central/canonical reader: ${mode}`, () => scenario(mode));
