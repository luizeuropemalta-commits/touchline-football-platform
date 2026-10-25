import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

const runtime = process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME;
assert.ok(runtime, "Isolated native PostgreSQL runtime required; no remote or PGlite fallback.");
const { NativeQuotaDatabase } = await import(pathToFileURL(runtime).href);
const fixture = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000011";

test("fixture preference CAS rejects competing stale intentions across dedicated native sessions", { timeout: 30_000 }, async t => {
  const admin = new NativeQuotaDatabase(), first = new NativeQuotaDatabase(), second = new NativeQuotaDatabase();
  const connections = [admin,first,second];
  const destroy = () => { for (const db of connections) db.client?.connection?.stream?.destroy(); };
  t.signal.addEventListener("abort", destroy, { once:true });
  const bounded = async (promise: Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([promise,new Promise((_,reject) => { timer=setTimeout(() => reject(Error("Cleanup timeout")),1000); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    let identity: string | undefined;
    const pids: number[] = [];
    for (const db of connections) {
      await db.ready;
      const attestation = await db.verifyIsolation();
      const row = (await db.query(`select inet_server_addr() is null local_socket,current_database() db,current_user role,
        current_setting('data_directory') directory,current_setting('listen_addresses') listening,
        current_setting('server_version_num') version,current_setting('fsync') fsync,pg_backend_pid() pid`)).rows[0];
      assert.equal(attestation.transport,"unix"); assert.equal(attestation.listenAddresses,"");
      assert.equal(row.local_socket,true); assert.equal(row.listening,""); assert.equal(row.role,"postgres");
      assert.equal(row.fsync,"on"); assert.match(row.db,/^touchline_(?:release_)?test(?:_[a-z0-9]+)?$/);
      assert.equal(row.db,attestation.database); assert.equal(row.directory,attestation.dataDirectory);
      assert.equal(row.role,attestation.user); assert.equal(Number(row.version),Number(attestation.serverVersionNum));
      assert.ok(Number(row.version)>=170000 && Number(row.version)<180000);
      assert.ok(db.client.connectionParameters.host.startsWith("/"));
      const value = JSON.stringify([row.db,row.directory,row.role,row.version,db.client.connectionParameters.host,db.client.connectionParameters.port]);
      identity ??= value; assert.equal(value,identity); pids.push(row.pid);
      await db.exec("set statement_timeout='5s'; set lock_timeout='4s'");
    }
    assert.equal(new Set(pids).size,3,"observer and writers are independent sessions");
    assert.equal((await admin.query("select to_regnamespace('auth') existing")).rows[0].existing,null,"fresh disposable database only, before DDL");
    assert.equal((await admin.query("select to_regclass('public.football_fixtures') existing")).rows[0].existing,null);
    await admin.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key); create table public.football_fixtures(id uuid primary key);
      grant usage on schema public to anon,authenticated,service_role;
      insert into auth.users values('${owner}'); insert into public.football_fixtures values('${fixture}');`);
    await admin.exec(readFileSync(new URL("../../supabase/migrations/20260924155921_touchline_fixture_alert_subscriptions.sql",import.meta.url),"utf8"));
    const revisionSql = readFileSync(new URL("../../supabase/migrations/20261024123038_touchline_fixture_alert_revision.sql",import.meta.url),"utf8");
    const catalogue = async () => (await admin.query(`select oid::text,proname,pg_get_functiondef(oid) definition,proacl::text acl
      from pg_proc where pronamespace='public'::regnamespace and proname in
      ('touchline_fixture_alert_status','touchline_set_fixture_alert_subscription') order by oid`)).rows;
    const beforeCatalogue = await catalogue();
    await admin.exec("create table migration_history_test(version text primary key check(version <> 'reject'))");
    await admin.exec("begin");
    await admin.exec(revisionSql);
    await assert.rejects(admin.exec("insert into migration_history_test values('reject')"), /check constraint/);
    await admin.exec("rollback");
    assert.equal((await admin.query("select to_regclass('public.touchline_fixture_alert_revisions') value")).rows[0].value,null);
    assert.deepEqual(await catalogue(),beforeCatalogue);
    assert.equal((await admin.query("select count(*)::int n from migration_history_test")).rows[0].n,0);
    await admin.exec(`begin;${revisionSql}commit;`);
    const write = (db: InstanceType<typeof NativeQuotaDatabase>, active: boolean, revision: string) => db.query(
      "select public.touchline_set_fixture_alert_subscription($1,$2,$3,$4::bigint) value",[fixture,owner,active,revision]);
    const observe = async () => (await admin.query("select public.touchline_fixture_alert_status($1,$2) value",[fixture,owner])).rows[0].value;
    for (const [active, revision, next] of [[true,"0","1"],[false,"1","2"]] as const) {
      await first.exec("begin; set local role service_role");
      assert.deepEqual((await write(first,active,revision)).rows[0].value,{subscribed:active,revision:next});
      assert.deepEqual(await observe(),{subscribed:!active,revision},"observer sees only committed state");
      await second.exec("set role service_role");
      const competing = write(second,!active,revision);
      // Attach rejection immediately; a failed assertion must not leak a rejection.
      const outcome = competing.then((result: { rows: { value: unknown }[] }) => ({ result }), (error: unknown) => ({ error }));
      let blocked = false;
      for (let i=0;i<40;i++) {
        const wait = (await admin.query("select $1::int=any(pg_blocking_pids($2::int)) blocked",[pids[1],pids[2]])).rows[0];
        if (wait.blocked) { blocked=true; break; }
        await new Promise(resolve => setTimeout(resolve,25));
      }
      assert.equal(blocked,true,"actual concurrent transaction waits on the first writer");
      await first.exec("commit");
      const completed = await outcome;
      assert.ok("result" in completed, "competing command must finish without transport failure");
      assert.deepEqual(completed.result.rows[0].value,{conflict:true});
      assert.deepEqual(await observe(),{subscribed:active,revision:next});
    }
    assert.deepEqual((await write(second,true,"0")).rows[0].value,{conflict:true},"old mounting cannot resurrect removed interest");
    assert.deepEqual(await observe(),{subscribed:false,revision:"2"});
  } finally {
    await Promise.allSettled(connections.map(async db => {
      try { await bounded(db.exec("rollback")); } catch { db.client?.connection?.stream?.destroy(); }
      try { await bounded(db.close()); } catch { db.client?.connection?.stream?.destroy(); }
    }));
    t.signal.removeEventListener("abort",destroy);
  }
});
