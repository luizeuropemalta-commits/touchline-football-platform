import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Disposable in-memory SQL, no connection string or provider access.
const source = (path: string) => readFileSync(new URL(`../supabase/${path}`, import.meta.url), 'utf8');
const patch = 'qa/20261024084850_touchline_controlled_quota_recovery_probe.sql';
const past = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

test('controlled recovery preserves unknown history and requires reviewed single measurements', async (t) => {
  const db = new PGlite();
  const scalar = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows[0]?.v;
  const record = (scope: string) => scalar("select touchline_quota_private.record_controlled_probe_case($1,'all-known-consumers-drained','Sportmonks-113532','owner-approved-recovery') v", [scope]);
  const seed = async (scope: string, endpoints = ['team', 'latest'], age = 7200) => {
    const token = randomUUID();
    await db.query('insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown,active_token,active_until) values($1,false,true,$2,$3)', [scope, token, past(age)]);
    await db.query("insert into touchline_quota_private.workers values($1,'qa',$1,false)", [scope]);
    for (const [i, endpoint] of endpoints.entries()) await db.query(`insert into public.touchline_fixture_quota_attempts
      (account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
      values($1,$2,1,$3,$4,$5,$1,'qa')`, [scope, randomUUID(), endpoint, i ? randomUUID() : token, past(age + 60)]);
    return { scope, id: await record(scope), drain: past(10) };
  };
  type Incident = Awaited<ReturnType<typeof seed>>;
  const prepare = (c: Incident, entities = ['Fixture', 'Team'], drain = c.drain) => scalar(
    'select touchline_quota_private.prepare_controlled_probe_case($1,$2,$3::text[]) v', [c.id, drain, entities]);
  const authorize = (c: Incident, entity: string, ref = 'operator-reviewed-previous-receipt') => scalar(
    'select touchline_quota_private.authorize_controlled_probe_entity($1,$2,$3) v', [c.id, entity, ref]);
  const admit = async (c: Incident, endpoint: string) => {
    const request = randomUUID();
    const answer = await scalar('select touchline_quota_private.admit_recovery_measurement($1,$2,$3,$4,20000) v', [c.id, c.scope, request, endpoint]) as { allowed: boolean; token?: string };
    return { request, ...answer };
  };
  const finish = (c: Incident) => scalar('select touchline_quota_private.finalize_recovery_case($1) v', [c.id]);
  const complete = (c: Incident, a: Awaited<ReturnType<typeof admit>>, endpoint: string, entity: string, status = 200, overrides: Record<string, unknown> = {}) => {
    const reset = new Date(Date.now() + 3600000).toISOString();
    return scalar('select touchline_quota_private.complete_recovery_measurement($1,$2,$3,$4,$5,$6::jsonb) v',
      [c.id, c.scope, a.request, endpoint, a.token, JSON.stringify({ requestId: a.request, attempt: 1,
        operation: entity === 'Fixture' ? 'fixture' : 'team', observedAt: new Date().toISOString(), status,
        remaining: status === 200 ? 1999 : status === 429 ? 0 : null,
        requestedEntity: status === 0 ? null : entity, resetAt: status === 0 ? null : reset,
        cooldownUntil: status === 429 ? reset : null, ...overrides })]);
  };
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql','20261003233637_touchline_sportmonks_prequery_authority.sql','20261008120529_touchline_squad_quota_prequery_authority.sql','20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(source(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql','014_touchline_central_entity_policy.sql','015_touchline_central_recovery_cases.sql','016_touchline_central_recovery_prepare.sql','017_touchline_central_recovery_measurement.sql','018_touchline_central_recovery_key_order.sql']) await db.exec(source(`qa/${name}`));
    await t.test('drifted completion preimage aborts patch without schema changes', async () => {
      await db.exec("begin; create or replace function touchline_quota_private.touchline_fixture_quota_complete(p_account_scope text,p_request_id uuid,p_endpoint text,p_attempt integer,p_token uuid,p_observation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin return '{}'::jsonb; end $$;");
      await assert.rejects(db.exec(source(patch)), /TL_CONTROLLED_PROBE_PREIMAGE_MISMATCH/);
      await db.exec('rollback');
      assert.equal(await scalar("select count(*)::int v from information_schema.columns where table_schema='touchline_quota_private' and table_name='recovery_cases' and column_name='recovery_mode'"), 0);
    });
    await db.exec(source(patch));
    await t.test('no alternate unguarded legacy entrypoint is installed', async () => {
      assert.equal(await scalar("select to_regprocedure('touchline_quota_private.admit_recovery_measurement_v1(uuid,text,uuid,text,integer)') v"), null);
      assert.equal(await scalar("select to_regprocedure('touchline_quota_private.prepare_observed_reset_case_v1(uuid,timestamptz,timestamptz)') v"), null);
    });
    const c = await seed('controlled');
    await t.test('support reference is not represented as observed reset', async () => {
      assert.ok(c.id);
      assert.equal(await record(c.scope), c.id);
      assert.deepEqual((await db.query('select recovery_mode,reset_evidence_ref,support_evidence_ref from touchline_quota_private.recovery_cases where id=$1', [c.id])).rows[0],
        { recovery_mode: 'controlled_probe', reset_evidence_ref: null, support_evidence_ref: 'Sportmonks-113532' });
      assert.equal(await scalar('select touchline_quota_private.prepare_recovery_case($1,$2,$3) v', [c.id, c.drain, past(6)]), false);
    });
    await t.test('exact entity plan, drain, enabled worker and history drift are enforced', async () => {
      assert.equal(await prepare(c, ['Team']), false);
      assert.equal(await prepare(c, ['Team', 'Fixture']), false);
      assert.equal(await prepare(c, ['Fixture', 'Team', 'Team']), false);
      assert.equal(await prepare(c, [], past(1)), false);
      assert.equal(await prepare(c, undefined, past(400)), false);
      await db.query('update touchline_quota_private.workers set enabled=true where worker_id=$1', [c.scope]);
      assert.equal(await prepare(c), false);
      await db.query('update touchline_quota_private.workers set enabled=false where worker_id=$1', [c.scope]);
      const recent = await seed('recent', ['team'], 60);
      assert.equal(await prepare(recent, ['Team']), false);
    });
    await t.test('enabled scopes and scopes shared with non-QA workers cannot use controlled mode', async () => {
      const shared = await seed('shared_with_production');
      await db.query("insert into touchline_quota_private.workers values('other_consumer','production',$1,false)", [shared.scope]);
      assert.equal(await record(shared.scope), null);
      assert.equal(await prepare(shared), false);
      const enabled = await seed('enabled_scope');
      await db.query('update public.touchline_fixture_quota_scopes set enabled=true where account_scope=$1', [enabled.scope]);
      assert.equal(await record(enabled.scope), null);
      assert.equal(await prepare(enabled), false);
    });
    const before = (await db.query('select to_jsonb(a) v from public.touchline_fixture_quota_attempts a where account_scope=$1 order by request_id', [c.scope])).rows;
    await t.test('preparation preserves unknown receipts and remains disabled', async () => {
      await db.exec('begin'); assert.equal(await prepare(c), true); await db.exec('rollback');
      assert.equal(await scalar('select count(*)::int v from touchline_quota_private.recovery_preparations'), 0);
      assert.equal(await prepare(c), true);
      assert.equal(await prepare(c), true);
      assert.equal(await scalar('select reset_observed_at is null v from touchline_quota_private.recovery_preparations where case_id=$1', [c.id]), true);
      assert.deepEqual((await db.query('select to_jsonb(a) v from public.touchline_fixture_quota_attempts a where account_scope=$1 order by request_id', [c.scope])).rows, before);
      assert.deepEqual((await db.query('select enabled,blocked_unknown,active_token from public.touchline_fixture_quota_scopes where account_scope=$1', [c.scope])).rows[0], { enabled: false, blocked_unknown: true, active_token: null });
    });
    await t.test('one authorization, one request, then explicit receipt review before next entity', async () => {
      assert.equal((await admit(c, 'team')).allowed, false);
      assert.equal(await authorize(c, 'Team'), true);
      assert.equal(await authorize(c, 'Fixture'), false);
      assert.equal((await admit(c, 'latest')).allowed, false);
      const first = await admit(c, 'team'); assert.equal(first.allowed, true);
      assert.equal((await admit(c, 'team')).allowed, false);
      assert.equal(await finish(c), false);
      assert.deepEqual(await complete(c, first, 'team', 'Team'), { persisted: true });
      assert.equal(await finish(c), false);
      assert.equal((await admit(c, 'latest')).allowed, false);
      assert.equal(await authorize(c, 'Fixture'), true);
      const second = await admit(c, 'latest'); assert.equal(second.allowed, true);
      assert.deepEqual(await complete(c, second, 'latest', 'Fixture'), { persisted: true });
      assert.equal(await finish(c), true);
      assert.deepEqual((await db.query('select enabled,blocked_unknown from public.touchline_fixture_quota_scopes where account_scope=$1', [c.scope])).rows[0], { enabled: false, blocked_unknown: false });
      assert.equal(await scalar('select count(*)::int v from public.touchline_fixture_quota_attempts where account_scope=$1 and completed_at is null', [c.scope]), 2);
    });
    await t.test('unknown and exhausted measurements do not authorize another entity', async () => {
      for (const status of [0, 429]) {
        const failed = await seed(`failed_${status}`);
        assert.equal(await prepare(failed), true);
        assert.equal(await authorize(failed, 'Team'), true);
        const a = await admit(failed, 'team'); assert.equal(a.allowed, true);
        assert.deepEqual(await complete(failed, a, 'team', 'Team', status), { persisted: true });
        assert.equal(await authorize(failed, 'Fixture'), false);
        assert.equal(await finish(failed), false);
      }
    });
    await t.test('invalid observed times persist as uncertainty but never permit a next request', async () => {
      for (const [index, observedAt] of [null, past(3600), new Date(Date.now() + 3600000).toISOString()].entries()) {
        const failed = await seed(`invalid_time_${index}`);
        assert.equal(await prepare(failed), true);
        assert.equal(await authorize(failed, 'Team'), true);
        const a = await admit(failed, 'team'); assert.equal(a.allowed, true);
        assert.deepEqual(await complete(failed, a, 'team', 'Team', 200, { observedAt }), { persisted: true });
        assert.equal(await authorize(failed, 'Fixture'), false);
        assert.equal((await admit(failed, 'latest')).allowed, false);
        assert.equal(await finish(failed), false);
      }
    });
    await t.test('expired approval or preparation does not permit an HTTP admission', async () => {
      const stale = await seed('expired');
      assert.equal(await prepare(stale), true);
      assert.equal(await authorize(stale, 'Team'), true);
      await db.query("update touchline_quota_private.controlled_probe_authorizations set authorized_at=clock_timestamp()-interval '6 minutes' where case_id=$1", [stale.id]);
      assert.equal((await admit(stale, 'team')).allowed, false);
      await db.query("update touchline_quota_private.recovery_preparations set prepared_at=clock_timestamp()-interval '6 minutes' where case_id=$1", [stale.id]);
      assert.equal(await authorize(stale, 'Fixture'), false);
      assert.equal(await finish(stale), false);
    });
    await t.test('changed durable receipt invalidates the expected digest before another request', async () => {
      const drift = await seed('receipt_drift');
      assert.equal(await prepare(drift), true);
      assert.equal(await authorize(drift, 'Team'), true);
      const a = await admit(drift, 'team'); assert.equal(a.allowed, true);
      assert.deepEqual(await complete(drift, a, 'team', 'Team'), { persisted: true });
      await db.query("update public.touchline_fixture_quota_attempts set observation=jsonb_set(observation,'{remaining}','1998') where account_scope=$1 and request_id=$2", [drift.scope, a.request]);
      assert.equal(await authorize(drift, 'Fixture'), false);
      assert.equal((await admit(drift, 'latest')).allowed, false);
      assert.equal(await finish(drift), false);
    });
    await t.test('observed-reset legacy flow remains compatible and mode-exclusive', async () => {
      const old = await seed('legacy', ['team']);
      await db.query('delete from touchline_quota_private.recovery_cases where id=$1', [old.id]);
      old.id = await scalar("select touchline_quota_private.record_recovery_case($1,'synthetic-drain','synthetic-observed-reset') v", [old.scope]);
      assert.ok(old.id);
      assert.equal(await prepare(old, ['Team']), false);
      assert.equal(await scalar('select touchline_quota_private.prepare_recovery_case($1,$2,$3) v', [old.id, old.drain, past(6)]), true);
      const a = await admit(old, 'team'); assert.equal(a.allowed, true);
      assert.deepEqual(await complete(old, a, 'team', 'Team'), { persisted: true });
      assert.equal(await finish(old), true);
    });
    await t.test('private methods remain unavailable to application roles', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(record('controlled'), /permission denied/);
        await assert.rejects(prepare(c), /permission denied/);
        await assert.rejects(authorize(c, 'Team'), /permission denied/);
        await db.exec('reset role');
      }
    });
  } finally { await db.close(); }
});
