import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native SQL required; no skip');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
const sql = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
type Incident = { id: string; scope: string; pending: string[] };
test('operator recovery measures once, reconciles safely, preserves failures and serializes contenders', async () => {
  const db = new NativeQuotaDatabase();
  const past = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  const seed = async (scope: string, endpoints = ['team']): Promise<Incident> => {
    const pending = endpoints.map(() => randomUUID()), tokens = endpoints.map(() => randomUUID());
    await db.query('insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown,active_token,active_until) values($1,false,true,$2,$3)', [scope, tokens[0], past(60)]);
    await db.query("insert into touchline_quota_private.workers values($1,'qa',$1,false)", [scope]);
    for (let i = 0; i < endpoints.length; i++) await db.query(`insert into public.touchline_fixture_quota_attempts
      (account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
      values($1,$2,1,$3,$4,$5,$1,'qa')`, [scope, pending[i], endpoints[i], tokens[i], past(120)]);
    const id = (await db.query("select touchline_quota_private.record_recovery_case($1,'synthetic-drain','synthetic-reset') id", [scope])).rows[0].id;
    assert.ok(id);
    assert.equal((await db.query('select touchline_quota_private.prepare_recovery_case($1,$2,$3) ok', [id, past(30), past(15)])).rows[0].ok, true);
    return { id, scope, pending };
  };
  const admitSql = 'select touchline_quota_private.admit_recovery_measurement($1,$2,$3,$4,$5) v';
  const admit = async (c: Incident, request: string, endpoint = 'team', budget = 20000) =>
    (await db.query(admitSql, [c.id, c.scope, request, endpoint, budget])).rows[0].v;
  const completeSql = 'select touchline_quota_private.complete_recovery_measurement($1,$2,$3,$4,$5,$6::jsonb) v';
  const complete = async (c: Incident, request: string, token: string, observation: object, endpoint = 'team', worker = c.scope) =>
    (await db.query(completeSql, [c.id, worker, request, endpoint, token, JSON.stringify(observation)])).rows[0].v;
  const finish = async (c: Incident) => (await db.query('select touchline_quota_private.finalize_recovery_case($1) v', [c.id])).rows[0].v;
  const abort = async (c: Incident) => (await db.query('select touchline_quota_private.abort_recovery_case($1) v', [c.id])).rows[0].v;
  const receipt = (request: string, entity = 'Team', status = 200, remaining: number | null = 1500) => {
    const resetAt = new Date(Date.now() + 3600000).toISOString();
    return { requestId: request, attempt: 1, operation: entity === 'Fixture' ? 'fixture' : 'team',
      observedAt: new Date().toISOString(), status, remaining, requestedEntity: entity, resetAt,
      cooldownUntil: status === 429 || remaining === 0 ? resetAt : null };
  };
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(sql(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql', '014_touchline_central_entity_policy.sql', '015_touchline_central_recovery_cases.sql', '016_touchline_central_recovery_prepare.sql', '017_touchline_central_recovery_measurement.sql']) await db.exec(sql(`qa/${name}`));
    const happy = await seed('happy', ['team', 'latest']), request = randomUUID();
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      for (const action of [() => admit(happy, request), () => complete(happy, request, randomUUID(), receipt(request)), () => finish(happy), () => abort(happy)]) {
        await assert.rejects(action(), (error: { code?: string }) => error.code === '42501');
      }
      await db.exec('reset role');
    }
    assert.equal(await finish(happy), false, 'no measurements cannot reconcile');
    assert.deepEqual(await admit(happy, randomUUID(), 'coach'), { allowed: false }, 'unaffected entity refused');
    assert.deepEqual(await admit(happy, randomUUID(), 'team', 20001), { allowed: false }, 'bounded request deadline');
    await db.exec('begin'); assert.equal((await admit(happy, request)).allowed, true); await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_measurements')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts where request_id=$1', [request])).rows[0].n, 0);
    const allowed = await admit(happy, request); assert.equal(allowed.allowed, true);
    assert.deepEqual(await admit(happy, request), { allowed: false }, 'admission replay is not HTTP permission');
    assert.deepEqual(await admit(happy, randomUUID(), 'latest'), { allowed: false }, 'one global lease across entities');
    assert.equal(await abort(happy), false, 'cannot abort live lease');
    const good = receipt(request);
    assert.deepEqual(await complete(happy, request, allowed.token, good, 'team', 'another-worker'), { persisted: false });
    assert.deepEqual(await complete({ ...happy, id: randomUUID() }, request, allowed.token, good), { persisted: false });
    assert.deepEqual(await complete(happy, request, randomUUID(), good), { persisted: false });
    assert.deepEqual(await complete(happy, request, allowed.token, good, 'latest'), { persisted: false });
    assert.deepEqual(await complete(happy, request, allowed.token, { ...good, extra: true }), { persisted: false });
    assert.deepEqual(await complete(happy, request, allowed.token, good), { persisted: true });
    assert.deepEqual(await complete(happy, request, allowed.token, good), { persisted: true });
    assert.deepEqual(await complete(happy, request, allowed.token, { ...good, remaining: 1499 }), { persisted: false });
    assert.equal(await finish(happy), false, 'second entity still missing');
    assert.deepEqual(await admit(happy, randomUUID()), { allowed: false }, 'one durable measurement per entity');
    const fixtureRequest = randomUUID(), fixtureLease = await admit(happy, fixtureRequest, 'latest');
    assert.equal(fixtureLease.allowed, true);
    assert.deepEqual(await complete(happy, fixtureRequest, fixtureLease.token, receipt(fixtureRequest, 'Fixture'), 'latest'), { persisted: true });
    assert.equal(await finish(happy), true); assert.equal(await finish(happy), true);
    assert.deepEqual((await db.query('select enabled,blocked_unknown,active_token from public.touchline_fixture_quota_scopes where account_scope=$1', [happy.scope])).rows[0], { enabled: false, blocked_unknown: false, active_token: null });
    assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts where account_scope=$1 and completed_at is null', [happy.scope])).rows[0].n, 2, 'lost receipts were NOT invented');
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_quarantine where case_id=$1', [happy.id])).rows[0].n, 2);
    assert.deepEqual(await complete(happy, request, allowed.token, good), { persisted: true }, 'durable identical completion after close');
    assert.deepEqual(await admit(happy, randomUUID()), { allowed: false });
    const normalRequest = randomUUID(), normalArgs = [happy.scope, 'qa', happy.scope, normalRequest, 'team'];
    assert.deepEqual((await db.query('select public.touchline_central_quota_admit($1,$2,$3,$4,$5,1,20000) v', normalArgs)).rows[0].v, { allowed: false }, 'normal activation is still separate');
    await db.query('update touchline_quota_private.workers set enabled=true where account_scope=$1', [happy.scope]);
    await db.query('update public.touchline_fixture_quota_scopes set enabled=true where account_scope=$1', [happy.scope]);
    await db.exec('set role service_role');
    const normal = (await db.query('select public.touchline_central_quota_admit($1,$2,$3,$4,$5,1,20000) v', normalArgs)).rows[0].v;
    assert.equal(normal.allowed, true, 'valid recovered receipt restores ordinary policy after explicit activation');
    assert.deepEqual((await db.query('select public.touchline_central_quota_complete($1,$2,$3,$4,$5,1,$6,$7::jsonb) v', [...normalArgs, normal.token, JSON.stringify(receipt(normalRequest))])).rows[0].v, { persisted: true });
    await db.exec('reset role');

    for (const mode of ['transport', 'wrong-entity', 'late', 'http-error', 'missing-reset'] as const) {
      const c = await seed(mode), id = randomUUID(), lease = await admit(c, id, 'team', mode === 'late' ? 1 : 20000);
      assert.equal(lease.allowed, true);
      if (mode === 'late') await new Promise(resolve => setTimeout(resolve, 20));
      const observation = { ...receipt(id, 'Team', mode === 'transport' ? 0 : mode === 'http-error' ? 503 : 200, mode === 'transport' ? null : 1500),
        ...(mode === 'wrong-entity' ? { requestedEntity: 'Fixture' } : {}), ...(mode === 'missing-reset' ? { resetAt: null } : {}) };
      assert.deepEqual(await complete(c, id, lease.token, observation), { persisted: true }, 'failure still recorded');
      assert.equal(await finish(c), false); assert.deepEqual(await admit(c, randomUUID()), { allowed: false });
      assert.equal((await db.query('select blocked_unknown from public.touchline_fixture_quota_scopes where account_scope=$1', [c.scope])).rows[0].blocked_unknown, true);
      assert.equal(await abort(c), true); assert.equal(await abort(c), true); assert.equal(await finish(c), false);
    }
    for (const [scope, status, remaining] of [['throttled', 429, 0], ['reserve', 200, 500]] as const) {
      const c = await seed(scope), id = randomUUID(), lease = await admit(c, id), observation = receipt(id, 'Team', status, remaining);
      assert.deepEqual(await complete(c, id, lease.token, observation), { persisted: true });
      assert.equal(await finish(c), true, 'known exhaustion can be reconciled without permission to call');
      const state = (await db.query('select enabled,blocked_unknown,cooldown_until from public.touchline_fixture_quota_scopes where account_scope=$1', [scope])).rows[0];
      assert.equal(state.enabled, false); assert.equal(state.blocked_unknown, false);
      if (status === 429) assert.equal(new Date(state.cooldown_until).toISOString(), observation.cooldownUntil);
      await db.query('update touchline_quota_private.workers set enabled=true where account_scope=$1', [scope]);
      await db.query('update public.touchline_fixture_quota_scopes set enabled=true where account_scope=$1', [scope]);
      await db.exec('set role service_role');
      assert.deepEqual((await db.query('select public.touchline_central_quota_admit($1,$2,$1,$3,$4,1,20000) v', [scope, 'qa', randomUUID(), 'team'])).rows[0].v, { allowed: false }, '429/reserve remains restrictive after explicit activation');
      await db.exec('reset role');
    }
    const drift = await seed('drift'), driftId = randomUUID(), driftLease = await admit(drift, driftId);
    assert.deepEqual(await complete(drift, driftId, driftLease.token, receipt(driftId)), { persisted: true });
    await db.query('update public.touchline_fixture_quota_attempts set token=gen_random_uuid() where account_scope=$1 and completed_at is null', [drift.scope]);
    assert.equal(await finish(drift), false, 'history drift invalidates finalization');

    const superseded = await seed('superseded'), supersededId = randomUUID(), supersededLease = await admit(superseded, supersededId);
    assert.deepEqual(await complete(superseded, supersededId, supersededLease.token, receipt(supersededId)), { persisted: true });
    await db.query(`insert into public.touchline_fixture_quota_attempts
      (account_scope,request_id,attempt,endpoint,token,admitted_at,completed_at,owner_worker_id,owner_environment,observation)
      values($1,$2,1,'team',$3,clock_timestamp(),clock_timestamp()+interval '1 second',$1,'qa',$4::jsonb)`,
    [superseded.scope, randomUUID(), randomUUID(), JSON.stringify({ status: 0 })]);
    // Fault injection: even an operator refreshing the drift digest must NOT
    // make the older recovery receipt authoritative again.
    await db.query('update touchline_quota_private.recovery_preparations set expected_state_digest=touchline_quota_private.recovery_state_digest(account_scope) where case_id=$1', [superseded.id]);
    assert.equal(await finish(superseded), false, 'independent last-receipt gate refuses superseded evidence');

    const failedInsert = await seed('insert-failure'), failedRequest = randomUUID();
    await db.exec(`create function touchline_quota_private.reject_measurement_test() returns trigger language plpgsql as $$
      begin if new.account_scope='insert-failure' then raise exception 'synthetic insertion failure'; end if; return new; end $$;
      create trigger recovery_insertion_test before insert on touchline_quota_private.recovery_measurements
      for each row execute function touchline_quota_private.reject_measurement_test();`);
    await assert.rejects(admit(failedInsert, failedRequest), (error: { code?: string }) => error.code === 'P0001');
    assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts where request_id=$1', [failedRequest])).rows[0].n, 0, 'attempt insert rolled back after later failure');
    assert.equal((await db.query('select active_token from public.touchline_fixture_quota_scopes where account_scope=$1', [failedInsert.scope])).rows[0].active_token, null);
    assert.equal((await db.query('select touchline_quota_private.recovery_matches_expected($1) ok', [failedInsert.id])).rows[0].ok, true);
    await db.exec('drop trigger recovery_insertion_test on touchline_quota_private.recovery_measurements; drop function touchline_quota_private.reject_measurement_test()');

    const race = await seed('race'), first = new NativeQuotaDatabase(), second = new NativeQuotaDatabase();
    try {
      const pids = [(await first.query('select pg_backend_pid() pid')).rows[0].pid, (await second.query('select pg_backend_pid() pid')).rows[0].pid];
      assert.notEqual(pids[0], pids[1]);
      await db.exec('begin; lock table touchline_quota_private.workers in share row exclusive mode');
      const requests = [randomUUID(), randomUUID()];
      const pending = Promise.allSettled([first, second].map((connection, i) => connection.query(admitSql, [race.id, race.scope, requests[i], 'team', 20000])));
      try {
        let blocked = false;
        for (let n = 0; n < 100; n++) {
          await db.query('select pg_stat_clear_snapshot()');
          if ((await db.query("select pid from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids])).rows.length === 2) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(blocked, true, 'both operators contend before admission');
      } finally { await db.exec('commit'); }
      const answers = (await pending).map(result => { assert.equal(result.status, 'fulfilled'); return result.value.rows[0].v; });
      assert.equal(answers.filter(a => a.allowed).length, 1);
      assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_measurements where case_id=$1', [race.id])).rows[0].n, 1);
      const winner = answers.findIndex(a => a.allowed);
      assert.deepEqual(answers[1 - winner], { allowed: false }, 'loser receives no token or permission');
      assert.deepEqual(await complete(race, requests[winner], answers[winner].token, receipt(requests[winner])), { persisted: true });
      assert.equal(await finish(race), true);
    } finally { await db.exec('rollback').catch(() => {}); await Promise.all([first.close(), second.close()]); }

    const lost = await seed('lost-measurement'), lostId = randomUUID(), lostLease = await admit(lost, lostId, 'team', 1);
    assert.equal(lostLease.allowed, true);
    assert.equal(await abort(lost), false, 'expiry without drain grace is insufficient');
    await new Promise(resolve => setTimeout(resolve, 5200));
    assert.equal(await abort(lost), true);
    const lostState = (await db.query('select active_token,enabled,blocked_unknown from public.touchline_fixture_quota_scopes where account_scope=$1', [lost.scope])).rows[0];
    assert.deepEqual(lostState, { active_token: lostLease.token, enabled: false, blocked_unknown: true }, 'abort preserves lost lease and unknown');
    assert.equal((await db.query('select completed_at from public.touchline_fixture_quota_attempts where request_id=$1', [lostId])).rows[0].completed_at, null);
    const nextCase = (await db.query("select touchline_quota_private.record_recovery_case($1,'new-drain-evidence','new-reset-evidence') id", [lost.scope])).rows[0].id;
    assert.ok(nextCase); assert.notEqual(nextCase, lost.id);
    assert.equal((await db.query('select touchline_quota_private.prepare_recovery_case($1,$2,$3) ok', [nextCase, past(30), past(15)])).rows[0].ok, false, 'new case cannot reuse drain/reset that precede lost measurement');
  } finally { await db.close(); }
});
