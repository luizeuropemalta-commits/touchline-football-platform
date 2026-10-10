import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { clearFootballDataCache } from '../../lib/football-data/cache.ts';
const root = new URL('../../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { createFootballDataProvider } = await import('../../lib/football-data/provider-factory.ts');
const { createGuardedFixtureProvider } = await import('../../lib/football-data/fixture-provider-server.ts');
const { createFixtureAuthorityServer } = await import('../../lib/football-data/fixture-authority-server.ts');
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Real native SQL runtime required, no skip.');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
const sql = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
const keys = ['TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED', 'TOUCHLINE_SPORTMONKS_CENTRAL_URL', 'TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN', 'TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE', 'SPORTMONKS_API_TOKEN', 'SPORTMONKS_BASE_URL'];

test('runtime factories plus authenticated central graph persist 429 in real SQL and block another factory', async () => {
  const db = new NativeQuotaDatabase(), savedFetch = globalThis.fetch;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const workerToken = 'q'.repeat(40), centralKey = 'central'.repeat(8), scope = 'runtime';
  const authority = 'https://authority.invalid/api/internal/football-data/quota';
  let providerCalls = 0, rpcCalls = 0, authorityCalls = 0;
  const receipts: { admission: boolean; result: unknown }[] = [];
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(sql(`migrations/${name}`));
    await db.exec(sql('qa/013_touchline_central_quota_ownership.sql')); await db.exec(sql('qa/014_touchline_central_entity_policy.sql'));
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('runtime',true); insert into touchline_quota_private.workers values('qa-live','qa','runtime',true); insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,expires_at) values('runtime','Team','synthetic-end-to-end',clock_timestamp()+interval '1 minute');");
    const gateway = createFixtureAuthorityServer({ enabled: true, projectRef: 'a'.repeat(20), serviceKey: centralKey, accountScope: scope,
      workers: [{ workerId: 'qa-live', environment: 'qa', token: workerToken }] }, async (url, init) => {
      rpcCalls++;
      const target = new URL(String(url)), headers = new Headers(init?.headers);
      assert.equal(target.origin, `https://${'a'.repeat(20)}.supabase.co`);
      assert.equal(headers.get('apikey'), centralKey);
      assert.equal(headers.get('authorization'), `Bearer ${centralKey}`);
      const args = JSON.parse(String(init?.body));
      assert.equal(args.p_worker_id, 'qa-live'); assert.equal(args.p_environment, 'qa'); assert.equal(args.p_account_scope, scope);
      assert.ok(!String(init?.body).includes(workerToken));
      const values = [args.p_worker_id, args.p_environment, args.p_account_scope, args.p_request_id, args.p_endpoint, args.p_attempt];
      const admission = target.pathname === '/rest/v1/rpc/touchline_central_quota_admit';
      assert.ok(admission || target.pathname === '/rest/v1/rpc/touchline_central_quota_complete');
      if (admission) values.push(args.p_budget_ms); else values.push(args.p_token, JSON.stringify(args.p_observation));
      const query = admission ? 'select public.touchline_central_quota_admit($1,$2,$3,$4,$5,$6,$7) v'
        : 'select public.touchline_central_quota_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb) v';
      // The SQL connection acts as the actual central service role, not owner.
      const result = (await db.query(query, values)).rows[0].v;
      receipts.push({ admission, result });
      return Response.json(result);
    });
    Object.assign(process.env, { TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: authority,
      TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: workerToken, TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: scope,
      SPORTMONKS_API_TOKEN: 'synthetic-provider-key', SPORTMONKS_BASE_URL: 'https://sportmonks.invalid/v3/football' });
    await db.exec('set role service_role');
    clearFootballDataCache();
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.href === authority) {
        authorityCalls++;
        assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${workerToken}`);
        return gateway(new Request(url, init));
      }
      assert.equal(url.origin, 'https://sportmonks.invalid');
      assert.equal(url.pathname, '/v3/football/teams/19');
      assert.equal(url.searchParams.get('api_token'), 'synthetic-provider-key');
      assert.ok(!url.href.includes(workerToken)); assert.ok(!url.href.includes(centralKey));
      providerCalls++;
      return Response.json({ data: [], rate_limit: { requested_entity: 'Team', remaining: 0, resets_in_seconds: 120 } }, { status: 429 });
    };
    assert.equal((await createFootballDataProvider().getTeamById('19')).ok, false);
    assert.equal(providerCalls, 1, '429 is not retried without another central admission');
    clearFootballDataCache();
    const admin = new Proxy({}, { get() { throw Error('Content DB quota bypass'); } }) as Parameters<typeof createGuardedFixtureProvider>[0];
    const beforeSecond = { authorityCalls, rpcCalls, receipts: receipts.length };
    assert.equal((await createGuardedFixtureProvider(admin, scope).getTeamById('20')).ok, false);
    assert.equal(authorityCalls - beforeSecond.authorityCalls, 1, 'second factory must consult authority');
    assert.equal(rpcCalls - beforeSecond.rpcCalls, 1, 'second factory must reach central SQL');
    assert.equal(receipts.length - beforeSecond.receipts, 1);
    assert.equal(receipts.at(-1)?.admission, true);
    assert.equal((receipts.at(-1)?.result as { allowed: boolean }).allowed, false);
    assert.equal(providerCalls, 1, 'separate job factory sees persisted central cooldown');
    assert.ok(authorityCalls >= 3); assert.equal(rpcCalls, authorityCalls);
    await db.exec('reset role');
    const state = (await db.query("select cooldown_until>clock_timestamp() cooling,active_token,blocked_unknown from public.touchline_fixture_quota_scopes where account_scope='runtime'")).rows[0];
    assert.deepEqual(state, { cooling: true, active_token: null, blocked_unknown: false });
    const attempts = (await db.query("select owner_worker_id,owner_environment,observation->>'status' status,observation->>'remaining' remaining from public.touchline_fixture_quota_attempts where account_scope='runtime'")).rows;
    assert.deepEqual(attempts, [{ owner_worker_id: 'qa-live', owner_environment: 'qa', status: '429', remaining: '0' }]);
  } finally {
    globalThis.fetch = savedFetch; clearFootballDataCache();
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    await db.close();
  }
});
