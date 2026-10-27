import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const host = globalThis as typeof globalThis & { __liveTestAdmin?: unknown };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  if (specifier === 'next/cache') return { url: 'data:text/javascript,export function unstable_noStore(){};export function revalidateTag(){};export function unstable_cache(fn){return fn}', shortCircuit: true };
  if (specifier === '@/lib/supabase/admin') return { url: 'data:text/javascript,export function createAdminClient(){return globalThis.__liveTestAdmin}', shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { syncSportmonksLiveState } = await import('../lib/football-data/live-sync.ts');
const { createFixtureAuthorityServer } = await import('../lib/football-data/fixture-authority-server.ts');
const { clearFootballDataCache } = await import('../lib/football-data/cache.ts');
type Row = Record<string, unknown>;
const ref = 'xgxbwqxjssxxuihuwmgy', token = 'q'.repeat(40), authorityUrl = 'https://authority.invalid/api/internal/football-data/quota';
async function scenario(ack: boolean, scoring = false) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch, info = console.info, warn = console.warn;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, { VERCEL_ENV: 'preview', VERCEL_URL: 'qa-candidate.vercel.app', TOUCHLINE_DEPLOYMENT_MODE: 'qa-preview',
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: 'qa-preview', NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_URL: `https://${ref}.supabase.co`,
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-content',
    SPORTMONKS_API_TOKEN: 'synthetic-provider', TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: authorityUrl,
    TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: token, TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: 'live' });
  clearFootballDataCache(); console.info = () => {}; console.warn = () => {};
  const now = Date.now(), at = new Date(now).toISOString(), kickoff = new Date(now - 600000).toISOString();
  const events: string[] = [], snapshots: Row[] = [], finalizations: Row[] = [];
  let centralCompletions = 0;
  let rankingPublishes = 0;
  const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'];
  const playerId = (i: number) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  const fixture = { id: 'fixture-db', provider: 'sportmonks', provider_fixture_id: '19722203', competition_id: 'competition-db', season_id: 'season-db',
    starts_at: kickoff, status: scoring ? 'Full Time' : 'Live', home_score: 1, away_score: 0, home_club_id: 'home-db', away_club_id: 'away-db', source_updated_at: at,
    football_seasons: { name: '2026/2027' }, football_competitions: { name: 'Premier League' } };
  const tables: Record<string, Row[]> = {
    football_competitions: [{ id: 'competition-db', provider: 'sportmonks', provider_competition_id: '8' }],
    football_seasons: [{ id: 'season-db', provider: 'sportmonks', provider_season_id: '70001', competition_id: 'competition-db', is_current: true, name: '2026/2027' }],
    football_fixtures: [fixture], football_rounds: [],
    football_clubs: [{ id: 'home-db', provider: 'sportmonks', provider_team_id: '19', name: 'Arsenal' },
      { id: 'away-db', provider: 'sportmonks', provider_team_id: '20', name: 'Opponent' }],
    touchline_fantasy_configs: [{ season_id: 'season-db', competition_key: 'england', status: 'active' }],
    football_fantasy_fixture_feeds: [], football_postmatch_check_attempts: [], football_player_season_memberships: [], touchline_player_fixture_score_settlements: [],
    football_fixture_events: [], football_player_season_statistics: [], touchline_card_ranking_snapshots: [], touchline_card_ranking_active_snapshots: [],
  };
  if (scoring) Object.assign(tables, {
    football_players: positions.map((position, i) => ({ id: playerId(i), provider: 'sportmonks', provider_player_id: String(200 + i),
      current_club_id: 'home-db', name: `Player ${i}`, display_name: `Player ${i}`, position, detailed_position: position, provider_position: position })),
    football_squad_members: positions.map((_, i) => ({ id: `member-${i}`, provider: 'sportmonks', player_id: playerId(i), club_id: 'home-db',
      competition_id: 'competition-db', status: 'active', jersey_number: i + 1 })),
    touchline_card_publications: positions.map((_, i) => ({ player_id: playerId(i), current_membership_id: `member-${i}`, competition_id: 'competition-db',
      effective_season: '2026-27', publication_status: 'published', calculated_tier: 'ruby-red', calculated_nominal_price_gbp: 10,
      last_reviewed_at: at, internal_source: 'editorial' })),
    football_player_market_values: positions.map((_, i) => ({ player_id: playerId(i), market_value_eur: 2500000, verified_season: '2026-27',
      status: 'verified', confidence: 'verified', source: 'editorial' })), touchline_card_editorial_overrides: [],
  });
  const admin = {
    async rpc(name: string, args?: Row) {
      assert.ok(!name.includes('quota'), 'content quota forbidden'); events.push(name);
      if (name === 'touchline_try_begin_live_sync_run') return { data: { acquired: true, runId: 'run-db' }, error: null };
      if (name === 'touchline_claim_fixture_recovery') return { data: null, error: null };
      if (name === 'touchline_fantasy_pending_gameweeks') return { data: [], error: null };
      if (name === 'touchline_fantasy_sync_gameweeks') return { data: null, error: null };
      if (name === 'touchline_live_presentation_publish_current') {
        assert.equal(centralCompletions, 2, 'shared Live snapshot is published only after both provider receipts are completed');
        events.push('publish-live-presentation');
        return { data: {
          snapshotId: '10000000-0000-4000-8000-000000000001',
          contentDigest: 'a'.repeat(32),
          payload: {
            version: 1, scopeKey: 'touchline-england', windowStart: at,
            playerRankingSnapshotId: 'player-v4:season-1:digest', playerRankingFixtureIds: ['19722203'],
            coachRankingSnapshotId: 'coach-v2:season-1:digest', coachRankingFixtureIds: ['19722203'],
            liveScoreSnapshotDigest: 'b'.repeat(32),
            liveScorePayload: { fixtures: [{ provider: 'sportmonks', providerId: '19722203' }], fetchedAt: at, storedAt: Date.parse(at) },
            fixtures: [{ fixtureId: '19722203', startsAt: kickoff, status: 'FT' }],
          },
        }, error: null };
      }
      if (name === 'publish_touchline_card_ranking_snapshot') {
        assert.equal(args?.requested_league_key, 'touchline-england');
        rankingPublishes++; tables.touchline_card_ranking_active_snapshots = [{ league_key: args?.requested_league_key, snapshot_id: args?.requested_snapshot_id }];
        return { data: null, error: null };
      }
      assert.equal(name, 'touchline_reconcile_coach_fixture_points'); return { data: { reconciled: 0 }, error: null };
    },
    from(table: string) {
      let action = 'read', payload: Row | Row[] = {}, columns = '', single = false, conflict = '';
      const predicates: Array<(row: Row) => boolean> = [];
      const q = {
        select(value: string) { columns = value; return q; },
        update(value: Row) { action = 'update'; payload = value; return q; },
        upsert(value: Row | Row[], options?: { onConflict?: string }) { action = 'upsert'; payload = value; conflict = options?.onConflict ?? ''; return q; },
        eq(k: string, v: unknown) { predicates.push(row => k === 'football_competitions.provider_competition_id' ? v === '8' : row[k] === v); return q; },
        in(k: string, values: unknown[]) { predicates.push(row => values.includes(row[k])); return q; },
        gte() { return q; }, lte() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; }, not() { return q; },
        maybeSingle() { single = true; return q; },
        then(resolve: (value: unknown) => unknown) {
          if (action !== 'read') {
            if (table === 'football_data_sync_runs') { finalizations.push(payload as Row); events.push('run-end'); }
            else {
              assert.equal(centralCompletions, table === 'football_postmatch_check_attempts' ? 1 : 2, 'attempt metadata precedes fixture request; football facts require provider receipt'); events.push(`write:${table}`);
              if (table === 'football_live_snapshots') snapshots.push(payload as Row);
              else if (table === 'football_fantasy_fixture_feeds') tables[table] = [{ ...payload as Row, id: 'feed-db' }];
              else if (table === 'football_fixtures') { assert.equal((payload as Row).home_score, 4); if (ack) Object.assign(fixture, payload); }
              else {
                assert.ok(scoring && Object.hasOwn(tables, table), `Unexpected write ${table}`);
                assert.ok(conflict, `Missing conflict identity ${table}`);
                for (const row of Array.isArray(payload) ? payload : [payload]) {
                  const keys = conflict.split(',');
                  const index = tables[table].findIndex(old => keys.every(key => old[key] === row[key]));
                  const merged = { ...row, id: index >= 0 ? tables[table][index].id : `${table}-${tables[table].length}` };
                  if (index >= 0) tables[table][index] = merged; else tables[table].push(merged);
                }
              }
            }
            return Promise.resolve(resolve({ data: table === 'football_fixtures' && ack ? [{ provider_fixture_id: '19722203' }] : [], error: null }));
          }
          if (table === 'football_data_sync_runs') return Promise.resolve(resolve({ data: columns === 'completed_at' ? { completed_at: at } : null, error: null }));
          // Deliberate downstream DB failure: this test proves a PARTIAL run,
          // not player ranking availability or a complete scoring rehearsal.
          if (!scoring && table === 'football_seasons' && columns.includes('!inner')) return Promise.resolve(resolve({ data: null, error: { message: 'synthetic-ranking-unavailable' } }));
          assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
          const rows = tables[table].filter(row => predicates.every(p => p(row)));
          return Promise.resolve(resolve({ data: single ? rows[0] ?? null : structuredClone(rows), error: null, count: rows.length }));
        },
      }; return q;
    },
  } as unknown as Parameters<typeof syncSportmonksLiveState>[0];
  host.__liveTestAdmin = admin;
  const handler = createFixtureAuthorityServer({ enabled: true, projectRef: 'a'.repeat(20), serviceKey: 'central'.repeat(8), accountScope: 'live',
    workers: [{ workerId: 'qa-live', environment: 'qa', token }] }, async (input, init) => {
    assert.equal(new URL(String(input)).origin, `https://${'a'.repeat(20)}.supabase.co`);
    const args = JSON.parse(String(init?.body)); assert.equal(args.p_worker_id, 'qa-live'); assert.equal(args.p_account_scope, 'live');
    if (String(input).endsWith('touchline_central_quota_admit')) { events.push(`admit:${args.p_endpoint}`); return Response.json({ allowed: true, token: randomUUID() }); }
    assert.ok(String(input).endsWith('touchline_central_quota_complete')); centralCompletions++; events.push(`complete:${args.p_endpoint}`);
    return Response.json({ persisted: true });
  });
  globalThis.fetch = async (input, init) => {
    if (String(input) === authorityUrl) return handler(new Request(String(input), init));
    const url = new URL(String(input)); assert.equal(url.origin, 'https://api.sportmonks.com');
    const feed = url.pathname.endsWith('/fixtures/19722203');
    if (!feed) assert.ok(url.pathname.endsWith('/livescores/inplay'));
    events.push('provider');
    const raw = { id: 19722203, league_id: 8, season_id: 70001, starting_at_timestamp: Math.floor(Date.parse(kickoff) / 1000), state: { id: scoring ? 5 : 2, name: scoring ? 'Full Time' : 'Live' },
      participants: [{ id: 19, name: 'Arsenal', meta: { location: 'home' } }, { id: 20, name: 'Opponent', meta: { location: 'away' } }],
      scores: [{ description: 'CURRENT', participant_id: 19, score: { goals: 4, participant: 'home' } },
        { description: 'CURRENT', participant_id: 20, score: { goals: 0, participant: 'away' } }],
      lineups: scoring ? positions.map((position, i) => ({ id: 500 + i, player_id: 200 + i, team_id: 19, player_name: `Player ${i}`,
        type_id: 11, jersey_number: i + 1, formation_position: i + 1, position_name: position,
        details: [{ type_id: 119, type: { code: 'minutes-played' }, data: { value: 90 } },
          { type_id: 118, type: { code: 'rating' }, data: { value: 7.5 } }] })) : [],
      events: scoring ? [{ id: 9001, player_id: 209, participant_id: 19, minute: 20, type: { name: 'Goal' }, result: '1-0' }] : [], sidelined: [] };
    return Response.json({ data: feed ? raw : [raw], rate_limit: { requested_entity: 'Fixture', remaining: 1500, resets_in_seconds: 120 } });
  };
  try {
    const result = await syncSportmonksLiveState(admin, { forceFixtureId: '19722203' });
    assert.equal(result.status, scoring ? 'success' : 'partial', JSON.stringify(result)); assert.equal(result.ok, scoring);
    if (!scoring) assert.ok(result.errors.some(error => error.includes('current-season-unavailable')), JSON.stringify(result));
    assert.equal(result.fantasyFeedsStored, 1); assert.equal(result.updated, ack ? 1 : 0);
    assert.equal(centralCompletions, 2); assert.equal(finalizations.length, 1); assert.equal(events.at(-1), 'run-end');
    assert.equal(events[0], 'touchline_try_begin_live_sync_run');
    assert.equal(snapshots.length, 1);
    const snapshot = snapshots[0].payload as { fixtures: Array<{ homeScore: number }> };
    assert.equal(snapshot.fixtures[0].homeScore, ack ? 4 : 1);
    if (!ack) assert.ok(result.errors.includes('19722203:write-unconfirmed'));
    if (scoring) {
      assert.equal(events.filter((event) => event === 'publish-live-presentation').length, 1);
      assert.ok(events.indexOf('publish-live-presentation') > events.indexOf('touchline_reconcile_coach_fixture_points'));
      assert.equal(tables.football_fixture_events.length, 1);
      assert.equal(tables.football_fixture_events[0].provider_event_id, '9001');
      assert.equal(tables.touchline_player_fixture_score_settlements.length, 11);
      for (const row of tables.touchline_player_fixture_score_settlements) { assert.equal(row.touchline_points, 7.5); assert.equal(row.settlement_status, 'final'); }
      assert.equal(tables.football_player_season_statistics.length, 11); assert.equal(rankingPublishes, 1);
      const assertCanonicalPoints = () => {
        for (const row of tables.football_player_season_statistics) {
          const summary = row.summary_payload as Row;
          assert.equal(summary.totalRating, 7.5);
          assert.equal(summary.appearances, 1);
          assert.equal(summary.goals, row.provider_player_id === '209' ? 1 : 0);
          assert.equal(row.scoring_version, 'player_scoring_v4');
          assert.deepEqual(row.aggregated_fixture_ids, ['fixture-db']);
        }
        assert.equal(tables.touchline_card_ranking_snapshots.length, 1);
        // Legacy converted-score column stays zero: this ranking uses raw ratings.
        assert.equal(tables.touchline_card_ranking_snapshots[0].total_score_points, 0);
        const ranking = tables.touchline_card_ranking_snapshots[0].ranking_payload as { players: Row[] };
        assert.equal(ranking.players.length, 11);
        for (const player of ranking.players) assert.equal(player.totalRating, 7.5);
        assert.deepEqual(new Set(ranking.players.map(row => row.playerId)), new Set(positions.map((_, i) => playerId(i))));
      };
      assertCanonicalPoints();
      const second = await syncSportmonksLiveState(admin, { forceFixtureId: '19722203' });
      assert.equal(second.status, 'success', JSON.stringify(second));
      assert.equal(tables.football_fixture_events.length, 1); assert.equal(tables.touchline_player_fixture_score_settlements.length, 11);
      assert.equal(tables.football_player_season_statistics.length, 11); assert.equal(rankingPublishes, 1);
      assertCanonicalPoints();
      assert.equal(finalizations.length, 2); assert.equal(events.at(-1), 'run-end');
    }
  } finally {
    globalThis.fetch = originalFetch; console.info = info; console.warn = warn; delete host.__liveTestAdmin; clearFootballDataCache();
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, saved);
  }
}
for (const ack of [true, false]) test(`real Live entrypoint central/feed/state/snapshot with ack=${ack}; downstream ranking unavailable`, () => scenario(ack));
test('real Live final fixture produces V4 settlements and ranking; second reconciliation preserves keys (synthetic DB, not SQL idempotency)', () => scenario(true, true));
