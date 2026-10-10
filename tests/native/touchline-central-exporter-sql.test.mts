import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'server-only' ? new URL('../fixtures/server-only.mts', import.meta.url).href : specifier, context);
} });
const { createFixtureAuthorityServer } = await import('../../lib/football-data/fixture-authority-server.ts');
const { readSportmonksTeamRoster } = await import('../../scripts/export-sportmonks-twenty-club-rosters-readonly.mjs');
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native SQL required, no skip');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
const sql = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');

test('exporter pages persist real SQL receipts and 429 blocks the next roster', async () => {
  const db = new NativeQuotaDatabase();
  const workerToken = 'q'.repeat(40), centralKey = 'central'.repeat(8), scope = 'exporter';
  const authority = 'https://authority.invalid/api/internal/football-data/quota';
  const config = { apiBaseUrl: 'https://api.sportmonks.com/v3/football', token: 'synthetic-provider',
    central: { enabled: true, url: authority, workerToken, accountScope: scope } };
  const events: string[] = [], results: unknown[] = [];
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(sql(`migrations/${name}`));
    await db.exec(sql('qa/013_touchline_central_quota_ownership.sql')); await db.exec(sql('qa/014_touchline_central_entity_policy.sql'));
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('exporter',true); insert into touchline_quota_private.workers values('qa-export','qa','exporter',true); insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,expires_at) values('exporter','PlayerTeam','synthetic-exporter',clock_timestamp()+interval '1 minute');");
    const gateway = createFixtureAuthorityServer({ enabled: true, projectRef: 'a'.repeat(20), serviceKey: centralKey,
      accountScope: scope, workers: [{ workerId: 'qa-export', environment: 'qa', token: workerToken }] }, async (url, init) => {
      const target = new URL(String(url)), headers = new Headers(init?.headers), args = JSON.parse(String(init?.body));
      assert.equal(target.origin, `https://${'a'.repeat(20)}.supabase.co`);
      assert.equal(headers.get('apikey'), centralKey); assert.equal(headers.get('authorization'), `Bearer ${centralKey}`);
      assert.equal(args.p_worker_id, 'qa-export'); assert.equal(args.p_environment, 'qa');
      assert.equal(args.p_account_scope, scope); assert.equal(args.p_endpoint, 'squad'); assert.equal(args.p_attempt, 1);
      assert.ok(!String(init?.body).includes(workerToken));
      const admission = target.pathname === '/rest/v1/rpc/touchline_central_quota_admit';
      assert.ok(admission || target.pathname === '/rest/v1/rpc/touchline_central_quota_complete');
      const values = [args.p_worker_id, args.p_environment, scope, args.p_request_id, args.p_endpoint, args.p_attempt];
      if (admission) values.push(args.p_budget_ms); else values.push(args.p_token, JSON.stringify(args.p_observation));
      const query = admission ? 'select public.touchline_central_quota_admit($1,$2,$3,$4,$5,$6,$7) v'
        : 'select public.touchline_central_quota_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb) v';
      const result = (await db.query(query, values)).rows[0].v;
      events.push(admission ? 'admit' : 'complete'); results.push(result);
      return Response.json(result);
    });
    await db.exec('set role service_role');
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.href === authority) {
        assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${workerToken}`);
        return gateway(new Request(url, init));
      }
      assert.equal(url.origin, 'https://api.sportmonks.com');
      assert.equal(url.searchParams.get('api_token'), config.token);
      assert.equal(url.searchParams.get('include'), 'player;position;detailedPosition');
      assert.equal(url.searchParams.get('per_page'), '50'); assert.equal(init?.redirect, 'error');
      assert.ok(!url.href.includes(workerToken)); assert.ok(!url.href.includes(centralKey));
      const page = Number(url.searchParams.get('page'));
      const throttled = url.pathname === '/v3/football/squads/teams/20';
      assert.ok(throttled || url.pathname === '/v3/football/squads/teams/19');
      events.push(`provider:${throttled ? 20 : 19}:${page}`);
      return Response.json({ data: [{ player: { id: 100 + page, name: `Synthetic ${page}` } }],
        pagination: { current_page: page, has_more: page === 1 },
        rate_limit: { requested_entity: 'PlayerTeam', remaining: throttled ? 0 : 1500 - page, resets_in_seconds: 120 } }, { status: throttled ? 429 : 200 });
    };
    // Stop pagination explicitly on the second synthetic page.
    const pagedFetch: typeof fetch = async (input, init) => {
      const response = await fetchImpl(input, init);
      if (String(input).includes('/squads/teams/19') && new URL(String(input)).searchParams.get('page') === '2') {
        const body = await response.json(); body.pagination.has_more = false; return Response.json(body);
      }
      return response;
    };
    const read = (id: string) => readSportmonksTeamRoster({ scope: { providerTeamId: id, clubName: 'Synthetic', manualValueScope: true }, config, fetchImpl: pagedFetch });
    const first = await read('19');
    assert.equal(first.state, 'ready'); assert.deepEqual(first.members.map((v: { providerPlayerId: string }) => v.providerPlayerId), ['101', '102']);
    assert.deepEqual(events, ['admit', 'provider:19:1', 'complete', 'admit', 'provider:19:2', 'complete']);
    assert.equal((await read('20')).state, 'partial');
    const before = events.length;
    assert.equal((await read('21')).state, 'partial');
    assert.deepEqual(events.slice(before), ['admit']); assert.deepEqual(results.at(-1), { allowed: false });
    await db.exec('reset role');
    const attempts = (await db.query("select owner_worker_id,owner_environment,observation->>'status' status,observation->>'requestedEntity' entity from public.touchline_fixture_quota_attempts where account_scope='exporter' order by admitted_at")).rows;
    assert.deepEqual(attempts, [200,200,429].map(status => ({ owner_worker_id: 'qa-export', owner_environment: 'qa', status: String(status), entity: 'PlayerTeam' })));
    assert.deepEqual((await db.query("select active_token,blocked_unknown,cooldown_until>clock_timestamp() cooling from public.touchline_fixture_quota_scopes where account_scope='exporter'")).rows[0], { active_token: null, blocked_unknown: false, cooling: true });
  } finally { await db.close(); }
});
