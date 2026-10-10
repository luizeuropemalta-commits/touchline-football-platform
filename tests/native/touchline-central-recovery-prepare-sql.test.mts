import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native SQL required; no skip');
const { NativeQuotaDatabase } = await import(pathToFileURL(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME).href);
const sql = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');

test('recovery preparation revalidates incident, quarantines without fabricating receipts and stays blocked', async () => {
  const db = new NativeQuotaDatabase();
  const instant = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  const drain = instant(30), reset = instant(15);
  const record = async (scope: string) => (await db.query(
    'select touchline_quota_private.record_recovery_case($1,$2,$3) id', [scope, 'synthetic-drain-proof', 'synthetic-reset-proof'])).rows[0].id;
  const prepare = async (id: string, drained = drain, resetAt = reset) => (await db.query(
    'select touchline_quota_private.prepare_recovery_case($1,$2,$3) prepared', [id, drained, resetAt])).rows[0].prepared;
  const seed = async (scope: string) => {
    const token = randomUUID(), pending = randomUUID();
    await db.query("insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown,active_token,active_until) values($1,false,true,$2,$3)", [scope, token, instant(60)]);
    await db.query("insert into touchline_quota_private.workers values($1,'qa',$2,false)", [scope, scope]);
    await db.query(`insert into public.touchline_fixture_quota_attempts
      (account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
      values($1,$2,1,'team',$3,$4,$1,'qa')`, [scope, pending, token, instant(120)]);
    for (const [endpoint, age] of [['fixture', 110], ['latest', 100]] as const) {
      await db.query(`insert into public.touchline_fixture_quota_attempts
        (account_scope,request_id,attempt,endpoint,token,admitted_at,completed_at,owner_worker_id,owner_environment,observation)
        values($1,$2,1,$3,$4,$5,$6,$1,'qa',$7::jsonb)`,
      [scope, randomUUID(), endpoint, randomUUID(), instant(130), instant(age), JSON.stringify({ status: 0 })]);
    }
    return { id: await record(scope), token, pending };
  };
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(sql(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql', '014_touchline_central_entity_policy.sql', '015_touchline_central_recovery_cases.sql', '016_touchline_central_recovery_prepare.sql']) await db.exec(sql(`qa/${name}`));
    await db.exec("set timezone='UTC'");
    const original = await seed('incident'); assert.ok(original.id);
    const utcDigest = (await db.query("select touchline_quota_private.recovery_state_digest('incident') digest")).rows[0].digest;
    await db.exec("set timezone='Europe/Malta'");
    assert.equal((await db.query("select touchline_quota_private.recovery_state_digest('incident') digest")).rows[0].digest, utcDigest, 'digest must not depend on operator timezone');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(prepare(original.id), (error: { code?: string }) => error.code === '42501');
      await db.exec('reset role');
    }
    assert.equal(await prepare(original.id, instant(140)), false, 'drain before lost call refused');
    assert.equal(await prepare(original.id, drain, instant(-10)), false, 'future reset refused');
    assert.equal(await prepare(original.id, instant(400), instant(350)), false, 'stale reset refused');
    assert.equal(await prepare(original.id, drain, instant(40)), false, 'reset before drain refused');
    assert.equal(await prepare(original.id, drain, instant(1)), false, 'reset grace period enforced');
    await db.query("update touchline_quota_private.workers set enabled=true where worker_id='incident'");
    assert.equal(await prepare(original.id), false, 'worker re-enabled after record refused');
    await db.query("update touchline_quota_private.workers set enabled=false where worker_id='incident'");
    const attemptsBefore = (await db.query("select row_to_json(a) a from public.touchline_fixture_quota_attempts a where account_scope='incident' order by request_id")).rows;
    const scopeBefore = (await db.query("select row_to_json(s) s from public.touchline_fixture_quota_scopes s where account_scope='incident'")).rows;
    await db.exec('begin'); assert.equal(await prepare(original.id), true); await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_preparations')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_quarantine')).rows[0].n, 0);
    assert.deepEqual((await db.query("select row_to_json(s) s from public.touchline_fixture_quota_scopes s where account_scope='incident'")).rows, scopeBefore);
    assert.equal(await prepare(original.id), true);
    assert.equal(await prepare(original.id), true, 'exact replay acknowledges preparation without new authorization');
    assert.equal(await prepare(original.id, drain, instant(12)), false, 'changed replay refused');
    assert.deepEqual((await db.query("select enabled,blocked_unknown,active_token,active_until from public.touchline_fixture_quota_scopes where account_scope='incident'")).rows[0],
      { enabled: false, blocked_unknown: true, active_token: null, active_until: null });
    assert.deepEqual((await db.query("select row_to_json(a) a from public.touchline_fixture_quota_attempts a where account_scope='incident' order by request_id")).rows, attemptsBefore, 'all lost and completed receipts preserved byte-for-byte as JSON');
    assert.deepEqual((await db.query('select request_id,attempt from touchline_quota_private.recovery_quarantine where case_id=$1', [original.id])).rows,
      [{ request_id: original.pending, attempt: 1 }]);
    assert.deepEqual((await db.query('select entity from touchline_quota_private.recovery_entities where case_id=$1 order by entity', [original.id])).rows,
      [{ entity: 'Fixture' }, { entity: 'Team' }]);
    assert.equal((await db.query('select expected_state_digest=touchline_quota_private.recovery_state_digest(account_scope) matches from touchline_quota_private.recovery_preparations where case_id=$1', [original.id])).rows[0].matches, true);
    await db.query("update public.touchline_fixture_quota_attempts set token=gen_random_uuid() where account_scope='incident' and completed_at is null");
    assert.equal(await prepare(original.id), false, 'even token-only drift invalidates acknowledgement');

    const changed = await seed('changed');
    await db.query("update public.touchline_fixture_quota_attempts set observation=$1::jsonb where account_scope='changed' and endpoint='latest'", [JSON.stringify({ status: 500 })]);
    assert.equal(await prepare(changed.id), false, 'snapshot drift refused');
    const orphan = await seed('orphan');
    await db.query("update public.touchline_fixture_quota_scopes set active_token=gen_random_uuid() where account_scope='orphan'");
    const orphanCase = await record('orphan'); assert.equal(orphanCase, orphan.id, 'record replay is NOT current certification');
    assert.equal(await prepare(orphan.id), false, 'orphan lease refused');
    const ownerless = await seed('ownerless');
    await db.query("update public.touchline_fixture_quota_attempts set owner_worker_id=null,owner_environment=null where account_scope='ownerless' and completed_at is null");
    assert.equal(await prepare(ownerless.id), false, 'ownerless pending attempt refused');
    await db.query("insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown) values('empty',false,true)");
    const empty = await record('empty'); assert.ok(empty);
    assert.equal(await prepare(empty), false, 'unexplained unknown cannot reconcile an empty entity set');
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.recovery_preparations')).rows[0].n, 1);
  } finally { await db.close(); }
});
