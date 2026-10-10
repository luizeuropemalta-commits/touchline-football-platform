import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import type { RecoveryOperatorPort } from '../../lib/football-data/recovery-measurement-server.ts';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('../fixtures/server-only.mts', import.meta.url).href, context);
  return next(specifier.startsWith('@/') ? new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const { createRecoveryMeasurement } = await import('../../lib/football-data/recovery-measurement-server.ts');
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native SQL required; no skip');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
const source = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');

test('one-shot executor sees committed native lease before synthetic HTTP and persists real recovery receipts', async () => {
  const operatorDb = new NativeQuotaDatabase(), observerDb = new NativeQuotaDatabase();
  const past = (n: number) => new Date(Date.now() - n * 1000).toISOString();
  try {
    assert.notEqual((await operatorDb.query('select pg_backend_pid() pid')).rows[0].pid, (await observerDb.query('select pg_backend_pid() pid')).rows[0].pid);
    await operatorDb.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await operatorDb.exec(source(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql', '014_touchline_central_entity_policy.sql', '015_touchline_central_recovery_cases.sql', '016_touchline_central_recovery_prepare.sql', '017_touchline_central_recovery_measurement.sql']) await operatorDb.exec(source(`qa/${name}`));
    for (const mode of ['success', 'throttle', 'lost-admit', 'lost-complete', 'oversized'] as const) {
      const pending = randomUUID(), token = randomUUID();
      await operatorDb.query('insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown,active_token,active_until) values($1,false,true,$2,$3)', [mode, token, past(60)]);
      await operatorDb.query("insert into touchline_quota_private.workers values($1,'qa',$1,false)", [mode]);
      await operatorDb.query(`insert into public.touchline_fixture_quota_attempts
        (account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
        values($1,$2,1,'team',$3,$4,$1,'qa')`, [mode, pending, token, past(120)]);
      const caseId = (await operatorDb.query("select touchline_quota_private.record_recovery_case($1,'synthetic-drain','synthetic-reset') id", [mode])).rows[0].id;
      assert.equal((await operatorDb.query('select touchline_quota_private.prepare_recovery_case($1,$2,$3) ok', [caseId, past(30), past(15)])).rows[0].ok, true);
      const events: string[] = []; let http = 0, admittedRequest = '';
      const port: RecoveryOperatorPort = {
        async admit(args) {
          events.push('admit'); assert.equal(args.caseId, caseId); assert.equal(args.workerId, mode); assert.equal(args.endpoint, 'team');
          // Native query autocommit finishes BEFORE this promise resolves.
          const answer = (await operatorDb.query('select touchline_quota_private.admit_recovery_measurement($1,$2,$3,$4,$5) v',
            [caseId, mode, args.requestId, args.endpoint, args.budgetMs])).rows[0].v;
          if (answer.allowed) admittedRequest = args.requestId;
          if (mode === 'lost-admit') throw Error('synthetic transport lost after COMMIT');
          return answer;
        },
        async complete(args) {
          events.push('complete'); assert.equal(args.caseId, caseId); assert.equal(args.workerId, mode);
          if (mode === 'lost-complete') throw Error('synthetic unavailable completion transport');
          return (await operatorDb.query('select touchline_quota_private.complete_recovery_measurement($1,$2,$3,$4,$5,$6::jsonb) v',
            [caseId, mode, args.requestId, args.endpoint, args.token, JSON.stringify(args.observation)])).rows[0].v;
        },
      };
      const config = { enabled: true as const, caseId, workerId: mode, apiToken: 'synthetic-provider-token', relativePath: '/teams/19' };
      const fetchImpl: typeof fetch = async (input, init) => {
        events.push('http'); http++;
        const url = new URL(String(input)); assert.equal(url.origin, 'https://api.sportmonks.com'); assert.equal(init?.redirect, 'error');
        const committed = (await observerDb.query(`select a.request_id,a.owner_worker_id,a.completed_at,s.active_token=a.token same_lease,
          s.enabled,s.blocked_unknown from public.touchline_fixture_quota_attempts a
          join public.touchline_fixture_quota_scopes s using(account_scope) where a.account_scope=$1 and a.request_id=$2`, [mode, admittedRequest])).rows;
        assert.equal(committed.length, 1, 'another backend must see committed permission BEFORE HTTP');
        assert.deepEqual(committed[0], { request_id: admittedRequest, owner_worker_id: mode, completed_at: null, same_lease: true, enabled: false, blocked_unknown: true });
        if (mode === 'oversized') return new Response('x'.repeat(128 * 1024 + 1));
        return Response.json({ data: { private: 'not-for-output' }, rate_limit: { requested_entity: 'Team', remaining: mode === 'throttle' ? 0 : 1500, resets_in_seconds: 3600 } }, { status: mode === 'throttle' ? 429 : 200 });
      };
      const measurement = createRecoveryMeasurement(config, port, fetchImpl), result = await measurement.run();
      const lost = mode === 'lost-admit' || mode === 'lost-complete';
      assert.equal(result.state, lost ? 'unavailable' : 'recorded');
      assert.equal(http, mode === 'lost-admit' ? 0 : 1);
      assert.equal((await measurement.run()).state, 'already-used');
      const second = await createRecoveryMeasurement(config, port, fetchImpl).run();
      assert.equal(second.state, mode === 'lost-admit' ? 'unavailable' : 'denied');
      assert.equal(http, mode === 'lost-admit' ? 0 : 1, 'new object cannot bypass durable case/entity uniqueness');
      const row = (await observerDb.query('select completed_at,observation from public.touchline_fixture_quota_attempts where account_scope=$1 and request_id=$2', [mode, admittedRequest])).rows[0];
      if (lost) assert.equal(row.completed_at, null);
      else { assert.ok(row.completed_at); assert.equal(row.observation.status, mode === 'throttle' ? 429 : mode === 'oversized' ? 0 : 200); }
      const resolved = (await operatorDb.query('select touchline_quota_private.finalize_recovery_case($1) v', [caseId])).rows[0].v;
      assert.equal(resolved, mode === 'success' || mode === 'throttle');
      const state = (await observerDb.query('select enabled,blocked_unknown,cooldown_until from public.touchline_fixture_quota_scopes where account_scope=$1', [mode])).rows[0];
      assert.equal(state.enabled, false); assert.equal(state.blocked_unknown, !resolved);
      if (mode === 'throttle') assert.ok(Date.parse(state.cooldown_until) > Date.now());
      assert.deepEqual(events, mode === 'lost-admit' ? ['admit', 'admit'] : ['admit', 'http', 'complete', 'admit']);
      assert.ok(!JSON.stringify(result).includes(config.apiToken)); assert.ok(!JSON.stringify(result).includes('not-for-output'));
    }
  } finally { await Promise.all([operatorDb.close(), observerDb.close()]); }
});
