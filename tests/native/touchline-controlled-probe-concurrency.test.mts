import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Never use the hosted QA database or PGlite for this concurrency proof.
const runtime = process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME;
assert.ok(runtime, 'Isolated native PostgreSQL runtime required; no fallback or skip.');
const { NativeQuotaDatabase } = await import(pathToFileURL(runtime).href);
const source = (path: string) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
const past = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
type Incident = { id: string; scope: string };
type Reply = { allowed: boolean; token?: string };

test('controlled probes serialize authorization and admission across independent native sessions', { timeout: 30000 }, async t => {
  const admin = new NativeQuotaDatabase(), first = new NativeQuotaDatabase(), second = new NativeQuotaDatabase();
  let observer: InstanceType<typeof NativeQuotaDatabase> | undefined;
  const abortConnections = () => {
    for (const db of [admin, first, second, observer]) {
      db?.client?.connection?.stream?.destroy();
    }
  };
  t.signal.addEventListener('abort', abortConnections, { once: true });
  let clusterIdentity: string | undefined;
  const verifySession = async (db: InstanceType<typeof NativeQuotaDatabase>) => {
    await db.ready;
    const isolation = await db.verifyIsolation();
    assert.equal(isolation.transport, 'unix');
    assert.equal(isolation.listenAddresses, '');
    assert.ok(isolation.dataDirectory.startsWith('/'));
    assert.ok(db.client.connectionParameters.host.startsWith('/'), 'private Unix socket required');
    const row = (await db.query("select inet_server_addr() is null local_socket,current_database() db,current_user role,current_setting('data_directory') directory,current_setting('listen_addresses') listening,current_setting('server_version_num') version")).rows[0];
    assert.equal(row.local_socket, true); assert.equal(row.listening, '');
    assert.match(row.db, /^touchline_(?:release_)?test(?:_[a-z0-9]+)?$/);
    assert.equal(row.role, 'postgres', 'preimage owner is postgres; never weaken the installer for a test');
    assert.ok(Number(row.version) >= 170000 && Number(row.version) < 180000);
    assert.equal(row.db, isolation.database); assert.equal(row.role, isolation.user);
    assert.equal(row.directory, isolation.dataDirectory);
    assert.equal(Number(row.version), Number(isolation.serverVersionNum));
    const identity = JSON.stringify([row.db, row.directory, row.role, row.version, db.client.connectionParameters.host, db.client.connectionParameters.port]);
    clusterIdentity ??= identity;
    assert.equal(identity, clusterIdentity, 'all sessions must use the same isolated cluster and database');
  };
  // Bound cleanup independently: node:test timeout does not cancel SQL waits.
  const bounded = async (operation: Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Native test cleanup deadline')), 1000);
      })]);
    } finally { clearTimeout(timer); }
  };
  const cleanup = async (db: InstanceType<typeof NativeQuotaDatabase>) => {
    try { await bounded(db.exec('rollback')); }
    catch { db.client?.connection?.stream?.destroy(); }
    try { await bounded(db.close()); }
    catch { db.client?.connection?.stream?.destroy(); }
  };
  const scalar = async (sql: string, args: unknown[] = []) => (await admin.query(sql, args)).rows[0].v;
  const authorizeSql = 'select touchline_quota_private.authorize_controlled_probe_entity($1,$2,$3) v';
  const admitSql = 'select touchline_quota_private.admit_recovery_measurement($1,$2,$3,$4,20000) v';
  const seed = async (scope: string): Promise<Incident> => {
    const token = randomUUID();
    await admin.query('insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown,active_token,active_until) values($1,false,true,$2,$3)', [scope, token, past(7200)]);
    await admin.query("insert into touchline_quota_private.workers values($1,'qa',$1,false)", [scope]);
    for (const [index, endpoint] of ['team', 'latest'].entries()) {
      await admin.query(`insert into public.touchline_fixture_quota_attempts
        (account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
        values($1,$2,1,$3,$4,$5,$1,'qa')`, [scope, randomUUID(), endpoint, index ? randomUUID() : token, past(7260)]);
    }
    const id = await scalar("select touchline_quota_private.record_controlled_probe_case($1,'synthetic-drain','synthetic-support','synthetic-authorization') v", [scope]);
    assert.equal(typeof id, 'string');
    assert.equal(await scalar('select touchline_quota_private.prepare_controlled_probe_case($1,$2,$3::text[]) v', [id, past(10), ['Fixture', 'Team']]), true);
    return { id, scope };
  };
  const complete = async (c: Incident, request: string, endpoint: string, token: string, observedAt: string | null) => scalar(
    'select touchline_quota_private.complete_recovery_measurement($1,$2,$3,$4,$5,$6::jsonb) v',
    [c.id, c.scope, request, endpoint, token, JSON.stringify({ requestId: request, attempt: 1,
      operation: endpoint === 'team' ? 'team' : 'fixture', status: 200, observedAt,
      requestedEntity: endpoint === 'team' ? 'Team' : 'Fixture', remaining: 1999,
      resetAt: new Date(Date.now() + 3600000).toISOString(), cooldownUntil: null })]);
  try {
    // The adapter must verify its private socket/data directory. These extra
    // assertions run BEFORE DDL and refuse remote or previously populated DBs.
    for (const db of [admin, first, second]) {
      await verifySession(db);
    }
    assert.equal(await scalar("select to_regnamespace('touchline_quota_private') v"), null, 'fresh disposable database required');
    const pids = await Promise.all([first, second].map(async db => (await db.query('select pg_backend_pid() v')).rows[0].v));
    assert.notEqual(pids[0], pids[1]);
    const adminPid = await scalar('select pg_backend_pid() v');
    assert.ok(!pids.includes(adminPid));
    await admin.exec('create role anon;create role authenticated;create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql','20261003233637_touchline_sportmonks_prequery_authority.sql','20261008120529_touchline_squad_quota_prequery_authority.sql','20261009110825_touchline_squad_quota_reserve_admission.sql']) await admin.exec(source(`migrations/${name}`));
    for (const name of ['013_touchline_central_quota_ownership.sql','014_touchline_central_entity_policy.sql','015_touchline_central_recovery_cases.sql','016_touchline_central_recovery_prepare.sql','017_touchline_central_recovery_measurement.sql','018_touchline_central_recovery_key_order.sql']) await admin.exec(source(`qa/${name}`));

    // Keep a nonempty owned history as a positive control for rollback counts.
    // These are synthetic records in the already attested disposable database.
    await admin.query("insert into public.touchline_fixture_quota_scopes(account_scope,enabled,blocked_unknown) values('rollback_control',false,true)");
    await admin.query("insert into touchline_quota_private.workers values('rollback_control','qa','rollback_control',false)");
    await admin.query(`insert into public.touchline_fixture_quota_attempts
      (account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
      values('rollback_control',$1,1,'latest',$2,$3,'rollback_control','qa')`, [randomUUID(), randomUUID(), past(7200)]);
    const catalogSnapshot = async () => {
      const functions = (await admin.query(`select p.oid::regprocedure::text signature,
        p.prosrc body,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,
        p.prosecdef,p.proconfig,p.proacl,
        coalesce(p.proacl,acldefault('f',p.proowner)) effective_acl
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='touchline_quota_private' order by p.oid::regprocedure::text collate "C"`)).rows;
      const tables = (await admin.query(`select n.nspname schema,c.relname name,
        c.relkind,pg_get_userbyid(c.relowner) owner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
        c.reloptions,format('%I.%I',n.nspname,c.relname) qualified_name
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where c.relkind in ('r','p') and (n.nspname='touchline_quota_private'
          or (n.nspname='public' and c.relname in ('touchline_fixture_quota_scopes','touchline_fixture_quota_attempts')))
        order by n.nspname collate "C",c.relname collate "C"`)).rows;
      const columns = (await admin.query(`select n.nspname schema,c.relname relation,a.attnum,
        a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,
        a.attisdropped,a.attacl,pg_get_expr(d.adbin,d.adrelid) default_expression
        from pg_attribute a join pg_class c on c.oid=a.attrelid
        join pg_namespace n on n.oid=c.relnamespace
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attnum>0 and c.relkind in ('r','p') and (n.nspname='touchline_quota_private'
          or (n.nspname='public' and c.relname in ('touchline_fixture_quota_scopes','touchline_fixture_quota_attempts')))
        order by n.nspname collate "C",c.relname collate "C",a.attnum`)).rows;
      const constraints = (await admin.query(`select n.nspname schema,c.relname relation,
        k.conname,k.contype,k.condeferrable,k.condeferred,k.convalidated,pg_get_constraintdef(k.oid,true) definition
        from pg_constraint k join pg_class c on c.oid=k.conrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='touchline_quota_private'
          or (n.nspname='public' and c.relname in ('touchline_fixture_quota_scopes','touchline_fixture_quota_attempts'))
        order by n.nspname collate "C",c.relname collate "C",k.conname collate "C"`)).rows;
      const counts = [];
      for (const table of tables) {
        // Identifier comes only from the fixed-schema catalog query, quoted by PostgreSQL.
        counts.push({ relation: table.qualified_name,
          count: (await admin.query(`select count(*)::text n from ${table.qualified_name}`)).rows[0].n });
      }
      return { functions, tables, columns, constraints, counts };
    };
    const candidate = source('qa/20261024084850_touchline_controlled_quota_recovery_probe.sql');
    assert.match(candidate, /^(?:--[^\n]*\n)*begin;\n/, 'candidate must retain its explicit opening transaction');
    const terminalCommit = /\ncommit;\s*$/i.exec(candidate);
    assert.ok(terminalCommit, 'candidate must retain exactly one terminal COMMIT delimiter');
    const prefix = candidate.slice(0, terminalCommit.index);
    assert.equal((candidate.match(/^commit;\s*$/gim) ?? []).length, 1, 'no earlier standalone COMMIT may bypass rollback proof');
    const beforeInstall = await catalogSnapshot();
    // Preserve every byte of the real installer; insert only at the validated
    // terminal delimiter. An exact sentinel proves failure happened at the END,
    // not at a preimage guard or an unrelated SQL error.
    const faultedCandidate = `${prefix}\ndo $rollback_probe$ begin
      raise exception using errcode='P0001',message='TL_NATIVE_INSTALL_ROLLBACK_SENTINEL';
      end $rollback_probe$;${candidate.slice(terminalCommit.index)}`;
    try {
      await assert.rejects(admin.exec(faultedCandidate), (error: unknown) => {
        assert.ok(error && typeof error === 'object');
        assert.equal((error as { code?: unknown }).code, 'P0001');
        assert.equal((error as { message?: unknown }).message, 'TL_NATIVE_INSTALL_ROLLBACK_SENTINEL');
        return true;
      });
    } finally {
      try { await bounded(admin.exec('rollback')); }
      catch (error) { admin.client?.connection?.stream?.destroy(); throw error; }
    }
    assert.deepEqual(await catalogSnapshot(), beforeInstall,
      'failed exact installer must restore private function bodies/owners/ACL/config, tables, columns, constraints and counts');
    await admin.exec(candidate); // Apply the actual unmodified file before races.

    const race = async (sql: string, args: [unknown[], unknown[]]) => {
      await admin.exec('begin; lock table touchline_quota_private.workers in share row exclusive mode');
      const pending = Promise.allSettled([first, second].map((db, index) => db.query(sql, args[index])));
      try {
        let bothWaiting = false;
        for (let count = 0; count < 100; count++) {
          await admin.query('select pg_stat_clear_snapshot()');
          const waiting = (await admin.query("select pid from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids])).rows;
          if (waiting.length === 2) { bothWaiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(bothWaiting, true, 'positive control: both independent sessions must actually contend');
      } finally { await admin.exec('commit'); }
      return (await pending).map(result => {
        assert.equal(result.status, 'fulfilled');
        return result.value.rows[0].v;
      });
    };

    const c = await seed('probe_race');
    const entities = ['Team', 'Fixture'];
    const approvals = await race(authorizeSql, [[c.id, entities[0], 'review-a'], [c.id, entities[1], 'review-b']]);
    assert.equal(approvals.filter(value => value === true).length, 1, 'only one unmeasured entity can be authorized');
    assert.equal(approvals.filter(value => value === false).length, 1);
    assert.equal(await scalar('select count(*)::int v from touchline_quota_private.controlled_probe_authorizations where case_id=$1', [c.id]), 1);
    assert.equal(await scalar('select count(*)::int v from touchline_quota_private.recovery_measurements where case_id=$1', [c.id]), 0, 'approval alone makes no request');
    const chosen = approvals.findIndex(value => value === true), entity = entities[chosen];
    const endpoint = entity === 'Team' ? 'team' : 'latest', otherEndpoint = endpoint === 'team' ? 'latest' : 'team';
    const requests = [randomUUID(), randomUUID()];
    const replies = await race(admitSql, [[c.id, c.scope, requests[0], endpoint], [c.id, c.scope, requests[1], endpoint]]) as Reply[];
    assert.equal(replies.filter(value => value.allowed).length, 1, 'one durable lease only');
    const winner = replies.findIndex(value => value.allowed);
    assert.deepEqual(replies[1 - winner], { allowed: false });
    const token = replies[winner].token; assert.equal(typeof token, 'string');
    assert.equal(await scalar('select count(*)::int v from touchline_quota_private.recovery_measurements where case_id=$1', [c.id]), 1);

    observer = new NativeQuotaDatabase();
    await verifySession(observer);
    const observerPid = (await observer.query('select pg_backend_pid() v')).rows[0].v;
    assert.equal(new Set([adminPid, ...pids, observerPid]).size, 4);
    assert.equal((await observer.query('select active_token v from public.touchline_fixture_quota_scopes where account_scope=$1', [c.scope])).rows[0].v, token, 'fresh connection sees committed lease');
    assert.deepEqual((await observer.query(admitSql, [c.id, c.scope, randomUUID(), otherEndpoint])).rows[0].v, { allowed: false });

    // A persisted unknown observation is NOT permission to authorize more HTTP.
    assert.deepEqual(await complete(c, requests[winner], endpoint, token, null), { persisted: true });
    assert.equal((await observer.query(authorizeSql, [c.id, entities[1 - chosen], 'review-invalid-receipt'])).rows[0].v, false);
    assert.equal(await scalar('select touchline_quota_private.finalize_recovery_case($1) v', [c.id]), false);
    assert.deepEqual((await observer.query('select enabled,blocked_unknown from public.touchline_fixture_quota_scopes where account_scope=$1', [c.scope])).rows[0], { enabled: false, blocked_unknown: true });

    const good = await seed('probe_committed_review');
    await first.exec('begin');
    assert.equal((await first.query(authorizeSql, [good.id, 'Team', 'initial-review'])).rows[0].v, true);
    assert.equal((await observer.query('select count(*)::int v from touchline_quota_private.controlled_probe_authorizations where case_id=$1', [good.id])).rows[0].v, 0, 'uncommitted approval is invisible');
    await first.exec('commit');
    assert.equal((await observer.query('select count(*)::int v from touchline_quota_private.controlled_probe_authorizations where case_id=$1', [good.id])).rows[0].v, 1);
    const request = randomUUID(), grant = await scalar(admitSql, [good.id, good.scope, request, 'team']) as Reply;
    assert.equal(grant.allowed, true); assert.equal(typeof grant.token, 'string');
    assert.deepEqual(await complete(good, request, 'team', grant.token, new Date().toISOString()), { persisted: true });
    assert.deepEqual((await observer.query(admitSql, [good.id, good.scope, randomUUID(), 'latest'])).rows[0].v, { allowed: false }, 'successful receipt does not automatically approve next entity');
    assert.equal((await observer.query(authorizeSql, [good.id, 'Fixture', 'review-of-committed-team-receipt'])).rows[0].v, true);
    assert.equal(await scalar('select count(*)::int v from touchline_quota_private.recovery_measurements where case_id=$1', [good.id]), 1, 'next approval still makes no HTTP request');
    assert.equal(await scalar('select count(*)::int v from public.touchline_fixture_quota_attempts where account_scope=$1 and completed_at is null', [good.scope]), 2, 'original unknown history preserved');
  } finally {
    try {
      await Promise.allSettled([admin, first, second, ...(observer ? [observer] : [])].map(cleanup));
    } finally { t.signal.removeEventListener('abort', abortConnections); }
  }
});
