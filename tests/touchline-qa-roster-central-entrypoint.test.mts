import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { syncQaTwentyClubRosters } = await import('../lib/football-data/qa-twenty-club-roster-sync.ts');
const { createFixtureAuthorityServer } = await import('../lib/football-data/fixture-authority-server.ts');
const { clearFootballDataCache } = await import('../lib/football-data/cache.ts');
const { TOUCHLINE_ENGLAND_CLUBS: clubs } = await import('../lib/touchlineArena/demo-data.ts');
const ref = 'xgxbwqxjssxxuihuwmgy', authorityRef = 'a'.repeat(20), scope = 'qa-roster';
const workerToken = 'q'.repeat(40), serviceKey = 'centralSecret'.repeat(4);
const authorityUrl = 'https://authority.invalid/api/internal/football-data/quota';
const env = {
  VERCEL_ENV: 'preview', VERCEL_URL: 'qa-candidate.vercel.app', TOUCHLINE_DEPLOYMENT_MODE: 'qa-preview',
  NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: 'qa-preview', NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_URL: `https://${ref}.supabase.co`, TOUCHLINE_QA_SUPABASE_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-content',
  SPORTMONKS_API_TOKEN: 'synthetic-provider', TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: scope,
  TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: authorityUrl,
  TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: workerToken,
};
type Member = { providerId: string; name: string; countryId: string | null; nationality: string | null;
  broadPosition: string | null; broadPositionId: string | null; detailedPosition: string | null;
  detailedPositionId: string | null; position: string | null; positionId: string | null; shirtNumber: number | null };
type Mode = 'success' | 'deny' | '429' | 'lost-complete' | 'production' | 'wrong-qa';

async function scenario(mode: Mode, failAt = 1) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  if (mode === 'production') process.env.VERCEL_ENV = 'production';
  if (mode === 'wrong-qa') process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF = 'b'.repeat(20);
  clearFootballDataCache();
  const events: string[] = [];
  let admissions = 0, providerCalls = 0, writes = 0, reads = 0;
  let persisted: Array<{ teamId: string; members: Member[] }> = [];
  const runId = randomUUID();
  const handler = createFixtureAuthorityServer({ enabled: true, projectRef: authorityRef, serviceKey, accountScope: scope,
    workers: [{ workerId: 'qa-roster', environment: 'qa', token: workerToken }] }, async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, `https://${authorityRef}.supabase.co`);
    assert.equal(new Headers(init?.headers).get('apikey'), serviceKey);
    const args = JSON.parse(String(init?.body));
    assert.equal(args.p_worker_id, 'qa-roster'); assert.equal(args.p_environment, 'qa');
    assert.equal(args.p_account_scope, scope);
    if (url.pathname.endsWith('touchline_central_quota_admit')) {
      admissions++; events.push('admit');
      return Response.json((mode === 'deny' && admissions === failAt) || (mode === '429' && admissions > failAt)
        ? { allowed: false } : { allowed: true, token: randomUUID() });
    }
    assert.ok(url.pathname.endsWith('touchline_central_quota_complete')); events.push('complete');
    assert.equal(args.p_observation.requestedEntity, args.p_endpoint === 'squadExtended' ? 'Player' : 'PlayerTeam');
    assert.equal(args.p_observation.remaining, mode === '429' && admissions === failAt ? 0 : 1500);
    assert.equal(args.p_observation.status, mode === '429' && admissions === failAt ? 429 : 200);
    assert.ok(Date.parse(args.p_observation.resetAt) > Date.parse(args.p_observation.observedAt));
    return Response.json({ persisted: !(mode === 'lost-complete' && admissions === failAt) });
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.href === authorityUrl) return handler(new Request(url, init));
    assert.equal(url.origin, 'https://api.sportmonks.com');
    providerCalls++; events.push('provider');
    const teamId = url.pathname.match(/\/squads\/teams\/(\d+)/)?.[1];
    const index = clubs.findIndex(club => club.teamId === teamId); assert.ok(index >= 0);
    const extended = url.pathname.endsWith('/extended');
    const data = Array.from({ length: 11 }, (_, i) => {
      const player = { id: 10000 + index * 100 + i, name: `Player ${index}-${i}` };
      return extended ? player : { id: 20000 + index * 100 + i, player_id: player.id, player };
    });
    // Even a 429 carrying a plausible data array must not become a roster.
    const failing = mode === '429' && admissions === failAt;
    return Response.json({ data, rate_limit: { requested_entity: extended ? 'Player' : 'PlayerTeam',
      remaining: failing ? 0 : 1500, resets_in_seconds: 120 } }, { status: failing ? 429 : 200 });
  };
  const admin = {
    async rpc(name: string, args: { p_project_ref: string; p_run_id: string; p_squads: typeof persisted }) {
      assert.equal(name, 'touchline_apply_qa_twenty_club_roster_atomic', 'content DB cannot serve quota RPCs');
      assert.equal(events.length, 120); assert.equal(admissions, 40); assert.equal(providerCalls, 40);
      assert.equal(args.p_project_ref, ref); assert.equal(args.p_run_id, runId);
      writes++; persisted = args.p_squads; events.push('atomic-write');
      return { data: { status: 'applied', run_id: runId, clubs: 20, provider_players: 220 }, error: null };
    },
    from(table: string) {
      reads++;
      const filters: Record<string, unknown> = {};
      const builder = {
        select() { return builder; }, eq(key: string, value: unknown) { filters[key] = value; return builder; },
        in(key: string, value: unknown) { filters[key] = value; return builder; },
        then(resolve: (value: unknown) => unknown) {
          let data: unknown[] = [];
          if (persisted.length && table === 'football_clubs') data = persisted.map(s => ({ id: s.teamId, provider_team_id: s.teamId }));
          else if (table === 'football_squad_members') data = (persisted.find(s => s.teamId === filters.club_id)?.members ?? [])
            .map(m => ({ player_id: m.providerId, jersey_number: m.shirtNumber, position: m.position, position_id: m.positionId,
              provider_position: m.broadPosition, provider_position_id: m.broadPositionId,
              detailed_position: m.detailedPosition, detailed_position_id: m.detailedPositionId }));
          else if (table === 'football_players') data = persisted.flatMap(s => s.members.filter(m => (filters.id as string[]).includes(m.providerId))
            .map(m => ({ id: m.providerId, provider_player_id: m.providerId, current_club_id: s.teamId, name: m.name, display_name: m.name,
              nationality: m.nationality, country_id: m.countryId, position: m.position, position_id: m.positionId,
              provider_position: m.broadPosition, provider_position_id: m.broadPositionId,
              detailed_position: m.detailedPosition, detailed_position_id: m.detailedPositionId })));
          return Promise.resolve(resolve({ data, error: null }));
        },
      }; return builder;
    },
  } as unknown as Parameters<typeof syncQaTwentyClubRosters>[0];
  try {
    if (mode === 'production' || mode === 'wrong-qa') {
      await assert.rejects(syncQaTwentyClubRosters(admin, runId), /dedicated functional QA Preview/);
      assert.deepEqual(events, []); assert.equal(reads, 0); assert.equal(writes, 0);
    } else if (mode === 'success') {
      const result = await syncQaTwentyClubRosters(admin, runId);
      assert.equal(result.status, 'applied'); assert.equal(result.providerPlayers, 220); assert.equal(writes, 1);
      assert.deepEqual(events.slice(0, 120), Array.from({ length: 40 }, () => ['admit', 'provider', 'complete']).flat());
      assert.equal((await syncQaTwentyClubRosters(admin, runId)).status, 'already-current'); assert.equal(writes, 1);
    } else {
      await assert.rejects(syncQaTwentyClubRosters(admin, runId), /Sportmonks squad/);
      assert.equal(writes, 0); assert.equal(reads, 0);
      assert.ok(admissions === failAt || (mode === '429' && admissions === failAt + 1));
      assert.equal(providerCalls, failAt - (mode === 'deny' ? 1 : 0));
    }
  } finally {
    globalThis.fetch = originalFetch; clearFootballDataCache();
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, saved);
  }
}
test('real roster entrypoint uses independent central authority and one atomic content write', () => scenario('success'));
for (const mode of ['production', 'wrong-qa'] as const) {
  test(`real roster refuses ${mode} before central or content access`, () => scenario(mode));
}
for (const mode of ['deny', '429', 'lost-complete'] as const) {
  test(`real roster ${mode} before first request never touches content`, () => scenario(mode));
  test(`real roster ${mode} on final enrichment never persists partial run`, () => scenario(mode, 40));
}
