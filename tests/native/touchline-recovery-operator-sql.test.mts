import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createRecoveryOperatorPort } from '../../tools/quota-recovery/operator-port.mjs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('../fixtures/server-only.mts', import.meta.url).href, context);
  return next(specifier.startsWith('@/') ? new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const { createRecoveryMeasurement } = await import('../../lib/football-data/recovery-measurement-server.ts');
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native SQL required, no skip');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
// The actual declared operator dependency, not the scratch runtime's pg copy.
const { Client } = createRequire(new URL('../../tools/quota-recovery/package.json', import.meta.url))('pg');
const sql = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');

test('operator adapter commits on dedicated native clients and confirms visibility before one HTTP; uncertain commits never retry', async () => {
  const admin = new NativeQuotaDatabase(), observer = new NativeQuotaDatabase();
  const closes: Promise<void>[] = [];
  const past = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  try {
    await admin.ready; await observer.ready; // Runtime proves isolated Unix socket, owner, version, data directory.
    await admin.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await admin.exec(sql(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql', '014_touchline_central_entity_policy.sql', '015_touchline_central_recovery_cases.sql', '016_touchline_central_recovery_prepare.sql', '017_touchline_central_recovery_measurement.sql']) await admin.exec(sql(`qa/${name}`));
    const { host, port, database, user } = admin.client.connectionParameters;
    for (const mode of ['success', 'commit-rejected', 'commit-lost', 'complete-lost', 'wrong-role', 'wrong-scope'] as const) {
      const token = randomUUID(), original = randomUUID();
      await admin.query('insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown,active_token,active_until) values($1,false,true,$2,$3)', [mode, token, past(60)]);
      await admin.query("insert into touchline_quota_private.workers values($1,'qa',$1,false)", [mode]);
      await admin.query("insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment) values($1,$2,1,'team',$3,$4,$1,'qa')", [mode, original, token, past(120)]);
      const caseId = (await admin.query("select touchline_quota_private.record_recovery_case($1,'synthetic-drain','synthetic-reset') id", [mode])).rows[0].id;
      assert.equal((await admin.query('select touchline_quota_private.prepare_recovery_case($1,$2,$3) ok', [caseId, past(30), past(15)])).rows[0].ok, true);
      let http = 0, clients = 0, request = '', preCommitChecks = 0, commits = 0;
      const trace: string[] = [];
      const makeClient = () => {
        clients++;
        const client = new Client({ host, port, database, user, password: 'unused-local', ssl: false, connectionTimeoutMillis: 2000 });
        let action = '';
        return {
          connection: client.connection,
          connect: () => client.connect(), on: (...args: unknown[]) => client.on(...args),
          end: () => { const closing = client.end(); closes.push(closing); return closing; },
          async query(text: string, values?: unknown[]) {
            trace.push(text.split('\n')[0]);
            if (text.includes('admit_recovery_measurement(')) { action = 'admit'; request = String(values![2]); }
            if (text.includes('complete_recovery_measurement(')) action = 'complete';
            if (text === 'COMMIT') {
              if (action === 'admit') {
                assert.equal((await observer.query('select count(*)::int n from public.touchline_fixture_quota_attempts where account_scope=$1 and request_id=$2', [mode, request])).rows[0].n, 0, 'positive control: uncommitted admission invisible');
                preCommitChecks++;
                if (mode === 'commit-rejected') throw Error('synthetic commit rejection');
              }
              const result = await client.query(text, values); commits++;
              if ((mode === 'commit-lost' && action === 'admit') || (mode === 'complete-lost' && action === 'complete')) throw Error('synthetic connection lost AFTER commit');
              return result;
            }
            try { return await client.query(text, values); }
            catch (error) { trace.push(`SQL code ${(error as { code?: string }).code}`); throw error; }
          },
        };
      };
      const operator = createRecoveryOperatorPort({ accountScope: mode === 'wrong-scope' ? 'different' : mode,
        expectedRole: mode === 'wrong-role' ? 'other_operator' : user, database, timeoutMs: 2500 }, makeClient);
      const result = await createRecoveryMeasurement({ enabled: true, caseId, workerId: mode,
        relativePath: '/teams/19', apiToken: 'synthetic-provider-token' }, operator, async () => {
        http++;
        const committed = (await observer.query('select a.completed_at,a.token=s.active_token lease,s.enabled,s.blocked_unknown from public.touchline_fixture_quota_attempts a join public.touchline_fixture_quota_scopes s using(account_scope) where a.account_scope=$1 and a.request_id=$2', [mode, request])).rows[0];
        assert.deepEqual(committed, { completed_at: null, lease: true, enabled: false, blocked_unknown: true });
        assert.ok(clients >= 2, 'independent observer connected before HTTP');
        assert.ok(commits >= 1); assert.equal(preCommitChecks, 1);
        return Response.json({ rate_limit: { requested_entity: 'Team', remaining: 1500, resets_in_seconds: 3600 } });
      }).run();
      await Promise.all(closes.splice(0));
      assert.equal(result.state, mode === 'success' ? 'recorded' : 'unavailable', JSON.stringify({ mode, trace, http, clients, commits }));
      assert.equal(http, mode === 'success' || mode === 'complete-lost' ? 1 : 0);
      const rows = (await observer.query('select completed_at from public.touchline_fixture_quota_attempts where account_scope=$1 and request_id<>$2', [mode, original])).rows;
      assert.equal(rows.length, ['success', 'commit-lost', 'complete-lost'].includes(mode) ? 1 : 0);
      if (rows.length) assert.equal(rows[0].completed_at !== null, mode !== 'commit-lost');
      assert.equal((await observer.query('select enabled,blocked_unknown from public.touchline_fixture_quota_scopes where account_scope=$1', [mode])).rows[0].enabled, false);
      assert.ok(!JSON.stringify(result).includes('synthetic-provider-token'));
    }
  } finally { await Promise.allSettled(closes); await Promise.all([admin.close(), observer.close()]); }
});
