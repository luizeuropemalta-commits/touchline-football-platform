import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const runtime = process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME;
assert.ok(runtime, 'Native isolated PostgreSQL required; concurrency cannot be proved by a serial emulator.');
const { NativeQuotaDatabase } = await import(pathToFileURL(runtime).href);
const source = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('real separate backends serialize QA and production admission and retain ownership after reconnect', async () => {
  const operator = new NativeQuotaDatabase(), qa = new NativeQuotaDatabase(), production = new NativeQuotaDatabase();
  let reconnected: InstanceType<typeof NativeQuotaDatabase> | undefined;
  try {
    await operator.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await operator.exec(source(`migrations/${name}`));
    await operator.exec(source('qa/013_touchline_central_quota_ownership.sql'));
    await operator.exec(source('qa/014_touchline_central_entity_policy.sql'));
    await operator.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('concurrent',true); insert into touchline_quota_private.workers values('qa-live','qa','concurrent',true),('prod-live','production','concurrent',true); insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,expires_at) values('concurrent','Fixture','synthetic-concurrency-grant',clock_timestamp()+interval '1 minute');");
    const qaPid = (await qa.query('select pg_backend_pid() pid')).rows[0].pid;
    const prodPid = (await production.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.notEqual(qaPid, prodPid, 'must be different native backend processes');
    const operatorPid = (await operator.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.notEqual(qaPid, operatorPid); assert.notEqual(prodPid, operatorPid);
    await qa.exec('set role service_role'); await production.exec('set role service_role');
    await operator.exec("begin; select 1 from public.touchline_fixture_quota_scopes where account_scope='concurrent' for update;");
    const admitSql = 'select public.touchline_central_quota_admit($1,$2,$3,$4,$5,1,60000) v';
    const requests = [
      { db: qa, worker: 'qa-live', environment: 'qa', requestId: id(1) },
      { db: production, worker: 'prod-live', environment: 'production', requestId: id(2) },
    ];
    // Immediately attach rejection handlers while the operator holds the row.
    const pending = Promise.allSettled(requests.map(r => r.db.query(admitSql, [r.worker, r.environment, 'concurrent', r.requestId, 'latest'])));
    try {
      let bothBlocked = false;
      for (let n = 0; n < 100; n++) {
        await operator.query('select pg_stat_clear_snapshot()');
        const rows = (await operator.query("select pid,wait_event_type from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [[qaPid, prodPid]])).rows;
        if (rows.length === 2) { bothBlocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(bothBlocked, true, 'positive control: BOTH real sessions were waiting on lock before release');
    } finally { await operator.exec('commit;'); }
    const settled = await pending;
    const responses = settled.map(result => {
      assert.equal(result.status, 'fulfilled');
      return result.value.rows[0].v;
    });
    assert.equal(responses.filter(r => r.allowed).length, 1, 'exactly one environment can call provider');
    const winnerIndex = responses.findIndex(r => r.allowed), winner = requests[winnerIndex], loser = requests[1 - winnerIndex];
    assert.deepEqual(responses[1 - winnerIndex], { allowed: false });
    const token = responses[winnerIndex].token;
    const state = (await operator.query("select active_token from public.touchline_fixture_quota_scopes where account_scope='concurrent'")).rows[0];
    assert.equal(state.active_token, token);
    assert.equal((await operator.query("select count(*)::int n from public.touchline_fixture_quota_attempts where account_scope='concurrent'")).rows[0].n, 1);
    assert.equal((await operator.query("select count(*)::int n from touchline_quota_private.bootstrap_grants where account_scope='concurrent' and consumed_at is not null")).rows[0].n, 1);
    const receipt = { requestId: winner.requestId, attempt: 1, operation: 'fixture', observedAt: new Date().toISOString(), status: 200, remaining: 999, requestedEntity: 'Fixture', resetAt: new Date(Date.now() + 3600000).toISOString(), cooldownUntil: null };
    const completeSql = 'select public.touchline_central_quota_complete($1,$2,$3,$4,$5,1,$6,$7::jsonb) v';
    const completionArgs = [winner.worker, winner.environment, 'concurrent', winner.requestId, 'latest', token, JSON.stringify(receipt)];
    assert.deepEqual((await loser.db.query(completeSql, [loser.worker, loser.environment, ...completionArgs.slice(2)])).rows[0].v, { persisted: false });
    assert.deepEqual((await operator.query("select active_token from public.touchline_fixture_quota_scopes where account_scope='concurrent'")).rows[0], state, 'foreign completion preserves active lease');
    assert.equal((await operator.query('select completed_at from public.touchline_fixture_quota_attempts where request_id=$1', [winner.requestId])).rows[0].completed_at, null);
    assert.deepEqual((await winner.db.query(completeSql, completionArgs)).rows[0].v, { persisted: true });
    reconnected = new NativeQuotaDatabase();
    await reconnected.exec('set role service_role');
    assert.deepEqual((await reconnected.query(completeSql, completionArgs)).rows[0].v, { persisted: true }, 'new session sees durable identical receipt');
    assert.deepEqual((await reconnected.query(admitSql, [winner.worker, winner.environment, 'concurrent', winner.requestId, 'latest'])).rows[0].v, { allowed: false }, 'reconnect cannot replay provider admission');
    assert.deepEqual((await reconnected.query(completeSql, [winner.worker, winner.environment, ...completionArgs.slice(2, 6), JSON.stringify({ ...receipt, remaining: 998 })])).rows[0].v, { persisted: false }, 'reconnect cannot change persisted receipt');
    const persisted = (await operator.query('select owner_worker_id,owner_environment,observation from public.touchline_fixture_quota_attempts where request_id=$1', [winner.requestId])).rows[0];
    assert.deepEqual(persisted, { owner_worker_id: winner.worker, owner_environment: winner.environment, observation: receipt });
  } finally {
    await operator.exec('rollback;').catch(() => {});
    await Promise.all([operator.close(), qa.close(), production.close(), reconnected?.close()]);
  }
});
