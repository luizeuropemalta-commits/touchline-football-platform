import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native SQL required, no skip');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
const sql = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
test('operator recovery case requires drain, preserves quota history and rolls back atomically', async () => {
  const db = new NativeQuotaDatabase();
  const call = async (drain = 'drain-evidence', reset = 'reset-evidence') =>
    (await db.query("select touchline_quota_private.record_recovery_case('recovery',$1,$2) id", [drain, reset])).rows[0].id;
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(sql(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql', '014_touchline_central_entity_policy.sql', '015_touchline_central_recovery_cases.sql']) await db.exec(sql(`qa/${name}`));
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown) values('recovery',true,true); insert into touchline_quota_private.workers values('qa-old','qa','recovery',true);");
    assert.equal(await call(), null, 'enabled scope refused');
    await db.exec("update public.touchline_fixture_quota_scopes set enabled=false where account_scope='recovery'");
    assert.equal(await call(), null, 'enabled worker refused');
    await db.exec("update touchline_quota_private.workers set enabled=false where account_scope='recovery'");
    await db.exec("insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment) values('recovery','11111111-1111-4111-8111-111111111111',1,'team','22222222-2222-4222-8222-222222222222',clock_timestamp()-interval '30 seconds','qa-old','qa'); update public.touchline_fixture_quota_scopes set active_token='22222222-2222-4222-8222-222222222222',active_until=clock_timestamp()+interval '1 minute' where account_scope='recovery';");
    assert.equal(await call(), null, 'live lease refused');
    await db.exec("update public.touchline_fixture_quota_scopes set active_until=clock_timestamp()-interval '10 seconds',cooldown_until=clock_timestamp()+interval '1 minute' where account_scope='recovery'");
    assert.equal(await call(), null, 'cooldown refused');
    await db.exec("update public.touchline_fixture_quota_scopes set cooldown_until=clock_timestamp()-interval '1 second' where account_scope='recovery'");
    // Different endpoints share one entity; keep only its newest owned receipt,
    // even when that receipt reports failure rather than an older good result.
    for (const [suffix, endpoint, seconds, owned, status] of [
      [3, 'player', 20, true, 200], [4, 'squadExtended', 10, true, 0],
      [5, 'coach', 15, true, 200], [6, 'playerSearch', 5, false, 200],
    ] as const) {
      await db.query(`insert into public.touchline_fixture_quota_attempts
        (account_scope,request_id,attempt,endpoint,token,admitted_at,completed_at,owner_worker_id,owner_environment,observation)
        values('recovery',$1,1,$2,gen_random_uuid(),clock_timestamp()-interval '40 seconds',
        clock_timestamp()-$3*interval '1 second',$4,$5,$6::jsonb)`,
      [`00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`, endpoint, seconds,
        owned ? 'qa-old' : null, owned ? 'qa' : null, JSON.stringify({ status })]);
    }
    const before = (await db.query("select row_to_json(s) scope from public.touchline_fixture_quota_scopes s where account_scope='recovery'")).rows[0];
    const attemptsBefore = (await db.query("select row_to_json(a) attempt from public.touchline_fixture_quota_attempts a where account_scope='recovery'")).rows;
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(call(), (error: { code?: string }) => error.code === '42501');
      await db.exec('reset role');
    }
    assert.equal(await call(' ', 'proof'), null);
    await db.exec('begin');
    assert.ok(await call());
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_cases')).rows[0].n, 0);
    const id = await call(); assert.ok(id);
    assert.equal(await call(), id, 'idempotent same evidence');
    assert.equal(await call('different-evidence'), null);
    const record = (await db.query('select * from touchline_quota_private.recovery_cases')).rows[0];
    assert.equal(record.operator_name, 'touchline_quota_test'); assert.equal(record.closed_at, null);
    assert.equal(record.scope_snapshot.blockedUnknown, true); assert.equal(record.scope_snapshot.leasePresent, true);
    assert.equal(record.attempt_snapshot.length, 3);
    assert.deepEqual(record.attempt_snapshot.map((a: { endpoint: string }) => a.endpoint).sort(), ['coach', 'squadExtended', 'team']);
    const pendingAttempt = record.attempt_snapshot.find((a: { endpoint: string }) => a.endpoint === 'team');
    assert.equal(pendingAttempt.completedAt, null);
    assert.equal(pendingAttempt.ownerWorkerId, 'qa-old'); assert.equal(pendingAttempt.matchesActiveLease, true);
    assert.equal(record.attempt_snapshot.find((a: { endpoint: string }) => a.endpoint === 'squadExtended').observation.status, 0);
    assert.deepEqual(record.worker_snapshot, [{ workerId: 'qa-old', environment: 'qa', enabled: false }]);
    assert.ok(!JSON.stringify(record).includes('22222222-2222-4222-8222-222222222222'), 'token never copied');
    assert.deepEqual((await db.query("select row_to_json(s) scope from public.touchline_fixture_quota_scopes s where account_scope='recovery'")).rows[0], before);
    assert.deepEqual((await db.query("select row_to_json(a) attempt from public.touchline_fixture_quota_attempts a where account_scope='recovery'")).rows, attemptsBefore);
    const firstOperator = new NativeQuotaDatabase(), secondOperator = new NativeQuotaDatabase();
    try {
      await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown) values('recovery-race',false,true)");
      const pids = [(await firstOperator.query('select pg_backend_pid() pid')).rows[0].pid,
        (await secondOperator.query('select pg_backend_pid() pid')).rows[0].pid];
      assert.notEqual(pids[0], pids[1]);
      await db.exec('begin; lock table touchline_quota_private.workers in share row exclusive mode');
      const simultaneous = Promise.allSettled([firstOperator, secondOperator].map(operator =>
        operator.query("select touchline_quota_private.record_recovery_case('recovery-race','drained','reset-observed') id")));
      try {
        let blocked = false;
        for (let n = 0; n < 100; n++) {
          await db.query('select pg_stat_clear_snapshot()');
          const waiting = (await db.query("select pid from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids])).rows;
          if (waiting.length === 2) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(blocked, true, 'both independent operators must contend before release');
      } finally { await db.exec('commit'); }
      const results = (await simultaneous).map(result => {
        assert.equal(result.status, 'fulfilled'); return result.value.rows[0].id;
      });
      assert.ok(results[0]); assert.equal(results[0], results[1], 'one durable case shared by both operators');
      assert.equal((await db.query("select count(*)::int n from touchline_quota_private.recovery_cases where account_scope='recovery-race'")).rows[0].n, 1);
      assert.deepEqual((await db.query("select enabled,blocked_unknown from public.touchline_fixture_quota_scopes where account_scope='recovery-race'")).rows[0], { enabled: false, blocked_unknown: true });
    } finally {
      await db.exec('rollback').catch(() => {});
      await Promise.all([firstOperator.close(), secondOperator.close()]);
    }
  } finally { await db.close(); }
});
