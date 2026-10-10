import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { syncSportmonksStarterFoundation } = await import('../lib/football-data/starter-sync.ts');
const { createFixtureAuthorityServer } = await import('../lib/football-data/fixture-authority-server.ts');
const { clearFootballDataCache } = await import('../lib/football-data/cache.ts');
type Row = Record<string, unknown>;
type Mode = 'success' | 'extended-deny' | 'extended-lost' | 'player-write' | 'player-mapping' | 'competition-mapping' | 'club-mapping';
const authorityUrl = 'https://authority.invalid/api/internal/football-data/quota';
async function scenario(mode: Mode) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  const token = 'q'.repeat(40), events: string[] = [], writes: Array<{ table: string; row: Row }> = [], ended: Row[] = [];
  Object.assign(process.env, { SPORTMONKS_API_TOKEN: 'synthetic', SPORTMONKS_BASE_URL: 'https://provider.invalid/v3/football',
    TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: authorityUrl,
    TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: token, TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: 'foundation' });
  clearFootballDataCache();
  const handler = createFixtureAuthorityServer({ enabled: true, projectRef: 'a'.repeat(20), serviceKey: 'central'.repeat(8), accountScope: 'foundation',
    workers: [{ workerId: 'qa-foundation', environment: 'qa', token }] }, async (input, init) => {
    assert.equal(new URL(String(input)).origin, `https://${'a'.repeat(20)}.supabase.co`);
    const args = JSON.parse(String(init?.body)); assert.equal(args.p_worker_id, 'qa-foundation'); assert.equal(args.p_account_scope, 'foundation');
    const endpoint = args.p_endpoint;
    if (String(input).endsWith('touchline_central_quota_admit')) {
      events.push(`admit:${endpoint}`);
      return Response.json(mode === 'extended-deny' && endpoint === 'squadExtended' ? { allowed: false } : { allowed: true, token: randomUUID() });
    }
    assert.ok(String(input).endsWith('touchline_central_quota_complete')); events.push(`complete:${endpoint}`);
    assert.equal(args.p_observation.remaining, 1500);
    return Response.json({ persisted: !(mode === 'extended-lost' && endpoint === 'squadExtended') });
  });
  globalThis.fetch = async (input, init) => {
    if (String(input) === authorityUrl) return handler(new Request(String(input), init));
    const url = new URL(String(input)); assert.equal(url.origin, 'https://provider.invalid');
    let data: unknown, entity: string, endpoint: string;
    const player = { id: 200, name: 'Player', position_id: 27, detailed_position_id: 154, nationality_id: 1161 };
    if (url.pathname.endsWith('/leagues/8')) { data = { id: 8, name: 'Premier League' }; entity = 'League'; endpoint = 'league'; }
    else if (url.pathname.endsWith('/teams/19/extended')) { data = [player]; entity = 'Player'; endpoint = 'squadExtended'; }
    else if (url.pathname.endsWith('/squads/teams/19')) { data = [{ id: 300, player_id: 200, jersey_number: 7, player }]; entity = 'PlayerTeam'; endpoint = 'squad'; }
    else { assert.ok(url.pathname.endsWith('/teams/19')); data = { id: 19, name: 'Arsenal' }; entity = 'Team'; endpoint = 'team'; }
    events.push(`provider:${endpoint}`);
    return Response.json({ data, rate_limit: { requested_entity: entity, remaining: 1500, resets_in_seconds: 120 } });
  };
  const admin = {
    rpc() { throw Error('Content quota RPC forbidden'); },
    from(table: string) {
      let action = '', row: Row = {};
      const query = {
        insert(value: Row) { action = 'insert'; row = value; return query; },
        update(value: Row) { action = 'update'; row = value; return query; },
        upsert(value: Row) { action = 'upsert'; row = value; return query; },
        select() { return query; }, single() { return query; }, eq() { return query; },
        then(resolve: (value: unknown) => unknown) {
          if (action === 'update') { ended.push(row); events.push('run-end'); }
          if (action === 'upsert') {
            events.push(`write:${table}`); writes.push({ table, row });
            const endpoint = table === 'football_competitions' ? 'league' : table === 'football_clubs' ? 'team' : 'squadExtended';
            assert.ok(events.includes(`complete:${endpoint}`));
          }
          const fail = mode === 'player-write' && table === 'football_players'
            || mode.endsWith('-mapping') && table === 'football_provider_mappings' && mode === `${row.provider_entity_type}-mapping`;
          return Promise.resolve(resolve({ data: { id: `${table}-id`, name: row.name }, error: fail ? { message: 'synthetic-persistence-failure' } : null }));
        },
      }; return query;
    },
  } as unknown as Parameters<typeof syncSportmonksStarterFoundation>[0];
  try {
    const result = await syncSportmonksStarterFoundation(admin, { competitionId: '8', clubId: '19' });
    assert.equal(ended.length, 1); assert.equal(ended[0].status, result.status); assert.equal(events.at(-1), 'run-end');
    assert.equal(result.ok, mode === 'success'); assert.equal(result.status, mode === 'success' ? 'success' : 'partial');
    if (mode.startsWith('extended')) {
      assert.ok(writes.every(w => ['football_competitions', 'football_clubs'].includes(w.table))); assert.equal(result.playerCount, 0);
    } else {
      assert.deepEqual(events.filter(e => /^(admit|provider|complete):/.test(e)),
        ['league', 'team', 'squad', 'squadExtended'].flatMap(e => [`admit:${e}`, `provider:${e}`, `complete:${e}`]));
      const p = writes.find(w => w.table === 'football_players')!.row;
      assert.equal(p.provider_player_id, '200'); assert.equal(p.current_club_id, 'football_clubs-id');
      if (mode !== 'player-write') {
        const membership = writes.find(w => w.table === 'football_squad_members')!.row;
        assert.equal(membership.player_id, 'football_players-id'); assert.equal(membership.club_id, 'football_clubs-id');
        assert.equal(membership.competition_id, 'football_competitions-id'); assert.equal(membership.jersey_number, 7);
        const mapping = writes.find(w => w.table === 'football_provider_mappings' && w.row.provider_entity_type === 'player')!.row;
        assert.equal(mapping.provider_entity_id, '200'); assert.equal(mapping.touchline_entity_id, 'football_players-id');
      }
      assert.equal(result.playerCount, ['success', 'competition-mapping', 'club-mapping'].includes(mode) ? 1 : 0);
    }
    if (mode !== 'success') assert.ok(result.errors.length > 0);
  } finally {
    globalThis.fetch = originalFetch; clearFootballDataCache();
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, saved);
  }
}
for (const mode of ['success', 'extended-deny', 'extended-lost', 'player-write', 'player-mapping', 'competition-mapping', 'club-mapping'] as const)
  test(`real starter foundation central to canonical persistence: ${mode}`, () => scenario(mode));
