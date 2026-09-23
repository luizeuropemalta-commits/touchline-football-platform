import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const url = new URL('../supabase/operations/touchline-production-live-scheduler.sql', import.meta.url);

test('pause uses the extension API when postgres can read but cannot lock cron.job', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`
      create role extension_owner; create role managed_postgres;
      create schema cron; create schema test_control;
      create function test_control.control_system() returns table(system_identifier text)
        language sql as $$select '7666007964130682852'::text$$;
      create table public.football_seasons(id uuid primary key);
      insert into public.football_seasons values ('1e83121b-b778-459b-b9a0-7cf1eaff5729');
      create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,
        database text default current_database(),username text default 'managed_postgres',active boolean default true);
      insert into cron.job(jobid,jobname,schedule,command) values (1,'touchline-qa-live-sync','* * * * *','select qa_live_sync()');
      alter table cron.job owner to extension_owner;
      grant usage on schema cron to extension_owner;
      grant usage on schema cron,test_control,public to managed_postgres;
      grant select on cron.job,public.football_seasons to managed_postgres;
      create function cron.alter_job(job_id bigint,active boolean) returns void
        language sql security definer set search_path='' as
        $$update cron.job set active=$2 where jobid=$1$$;
      alter function cron.alter_job(bigint,boolean) owner to extension_owner;
      revoke all on function cron.alter_job(bigint,boolean) from public;
      grant execute on function cron.alter_job(bigint,boolean) to managed_postgres;
      set session authorization managed_postgres;
    `);
    // Reproduce the managed extension privilege boundary before exercising the
    // actual operator script; no table grant or role escalation is a remedy.
    await assert.rejects(db.exec('begin; lock table cron.job in share row exclusive mode; commit;'), /permission denied/);
    await db.exec('rollback');
    assert.equal((await db.query('select current_user,session_user')).rows[0].current_user,'managed_postgres');
    await db.query("select set_config('touchline.operator.action','pause-qa',false)");
    // PGlite's bootstrap postgres cannot lose SUPERUSER. Substitute only the
    // expected role name to exercise identical checks under a real limited role.
    const sql=readFileSync(url,'utf8').replaceAll('pg_catalog.pg_control_system()','test_control.control_system()').replaceAll("'postgres'","'managed_postgres'");
    try { await db.exec(sql); }
    catch (error) { await db.exec('rollback'); throw error; }
    assert.deepEqual((await db.query('select jobname,active from cron.job')).rows,[{jobname:'touchline-qa-live-sync',active:false}]);
    assert.equal((await db.query("select has_table_privilege('managed_postgres','cron.job','UPDATE') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});

test('operator scheduler lifecycle is explicit, transactional and fail closed', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    // Only extension/control-plane collaborators are substitutes. Execute the
    // actual operator PL/pgSQL, transaction, locks, validation and state changes.
    await db.exec(`
      create schema test_control; create table test_control.identity(value text);
      insert into test_control.identity values ('7666007964130682852');
      create function test_control.control_system() returns table(system_identifier text)
        language sql as $$select value from test_control.identity$$;
      create schema cron; create schema vault; create schema net;
      create role limited_operator; grant usage on schema cron to limited_operator;
      create table net.requests(url text,headers jsonb,body jsonb);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
        returns bigint language plpgsql as $$begin
        insert into net.requests values (url,headers,body); return 1; end$$;
      create table cron.job(jobid bigserial primary key,jobname text,schedule text,command text,
        database text default current_database(),username text default current_user,active boolean default true);
      create table cron.job_run_details(jobid bigint,status text);
      create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare i bigint; begin
        insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid into i; return i; end$$;
      create function cron.alter_job(job_id bigint,schedule text default null,command text default null,
        database text default null,username text default null,active boolean default null) returns void language plpgsql as
        $$begin
        if current_setting('test.fail_alter',true)='yes' then raise exception 'SIMULATED_ALTER_FAILURE'; end if;
        update cron.job set active=coalesce($6,cron.job.active) where jobid=$1; end$$;
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values ('touchline_production_live_sync_secret',repeat('x',40));
      create table football_seasons(id uuid primary key);
      insert into football_seasons values ('1e83121b-b778-459b-b9a0-7cf1eaff5729');
      create table football_data_sync_runs(provider text,sync_type text,status text);
      insert into cron.job(jobname,schedule,command) values ('touchline-qa-live-sync','* * * * *','select qa_live_sync()');
      create table untouched_customer_data(id int); insert into untouched_customer_data values (42);
    `);
    const sql = process.env.TOUCHLINE_SCHEDULER_BASELINE ? 'select 1;' : readFileSync(url, 'utf8').replaceAll('pg_catalog.pg_control_system()', 'test_control.control_system()');
    const run = async (action: string) => {
      await db.query(`select set_config('touchline.operator.action',$1,false)`, [action]);
      try { await db.exec(process.env.TOUCHLINE_SCHEDULER_BASELINE ? 'select 1;' : sql); }
      catch (error) { await db.exec('rollback'); throw error; }
    };
    const jobs = async () => (await db.query('select jobname,active from cron.job order by jobname')).rows;
    await assert.rejects(run(''), /TL_SCHEDULER_ACTION_REQUIRED/);
    await db.exec('set role limited_operator');
    await assert.rejects(run('pause-qa'), /TL_SCHEDULER_OPERATOR_REQUIRED/);
    await db.exec('reset role');
    await assert.rejects(run('prepare'), /TL_SCHEDULER_QA_ACTIVE/);
    assert.deepEqual(await jobs(), [{jobname:'touchline-qa-live-sync',active:true}]);
    await run('pause-qa');
    await db.exec(`insert into football_data_sync_runs values ('sportmonks','live_scores','running')`);
    await assert.rejects(run('prepare'), /TL_SCHEDULER_WRITER_ACTIVE/);
    await db.exec('delete from football_data_sync_runs');
    await db.exec(`set test.fail_alter='yes'`);
    await assert.rejects(run('prepare'), /SIMULATED_ALTER_FAILURE/);
    assert.deepEqual(await jobs(), [{jobname:'touchline-qa-live-sync',active:false}], 'failed disable rolls back newly scheduled active job');
    await db.exec(`set test.fail_alter='no'`);
    await run('prepare'); await run('prepare');
    assert.deepEqual(await jobs(), [{jobname:'touchline-production-live-sync',active:false},{jobname:'touchline-qa-live-sync',active:false}]);
    await db.exec(`update test_control.identity set value='wrong'`);
    await assert.rejects(run('activate'), /TL_SCHEDULER_TARGET_MISMATCH/);
    await db.exec(`update test_control.identity set value='7666007964130682852';
      insert into cron.job_run_details select jobid,'running' from cron.job where jobname='touchline-qa-live-sync'`);
    await assert.rejects(run('activate'), /TL_SCHEDULER_WRITER_ACTIVE/);
    await db.exec('delete from cron.job_run_details');
    await db.exec(`insert into vault.decrypted_secrets values ('touchline_production_live_sync_secret',repeat('y',40))`);
    await assert.rejects(run('activate'), /TL_SCHEDULER_SECRET_INVALID/);
    await db.exec(`delete from vault.decrypted_secrets where decrypted_secret=repeat('y',40)`);
    await db.exec(`update vault.decrypted_secrets set decrypted_secret=''`);
    await assert.rejects(run('activate'), /TL_SCHEDULER_SECRET_INVALID/);
    await db.exec(`update vault.decrypted_secrets set decrypted_secret=repeat('x',40);
      insert into cron.job(jobname,schedule,command) values ('unexpected-writer','* * * * *','select live-sync')`);
    await assert.rejects(run('activate'), /TL_SCHEDULER_JOB_INVENTORY/);
    await db.exec(`delete from cron.job where jobname='unexpected-writer'`);
    await run('activate');
    assert.equal((await jobs())[0].active, true);
    await assert.rejects(run('prepare'), /TL_SCHEDULER_PRODUCTION_ACTIVE/);
    // Emergency disable must work even with an in-flight writer/invalid secret.
    await db.exec(`insert into football_data_sync_runs values ('sportmonks','live_scores','running'); delete from vault.decrypted_secrets`);
    await run('disable-production');
    assert.equal((await jobs())[0].active, false);
    assert.deepEqual((await db.query('select * from untouched_customer_data')).rows,[{id:42}]);
    const command = (await db.query(`select command from cron.job where jobname='touchline-production-live-sync'`)).rows[0].command;
    assert.match(command, /https:\/\/touchline\.com\.br\/api\/football-data\/live-sync/);
    assert.doesNotMatch(command, /xxxxxxxx|touchline_qa_live_sync_secret/);
    await assert.rejects(db.exec(command), /TL_PRODUCTION_SYNC_SECRET_INVALID/);
    assert.equal((await db.query('select * from net.requests')).rows.length,0);
    await db.exec(`insert into vault.decrypted_secrets values ('touchline_production_live_sync_secret',repeat('x',40))`);
    await db.exec(command);
    const request = (await db.query('select url,body from net.requests')).rows;
    assert.deepEqual(request,[{url:'https://touchline.com.br/api/football-data/live-sync',body:{}}]);
    await db.exec(`delete from football_data_sync_runs; update cron.job set command='drift' where jobname='touchline-production-live-sync'`);
    await assert.rejects(run('activate'), /TL_SCHEDULER_PRODUCTION_DRIFT/);
    await db.exec(`insert into cron.job(jobname,schedule,command) select jobname,schedule,command from cron.job where jobname='touchline-qa-live-sync'`);
    await assert.rejects(run('pause-qa'), /TL_SCHEDULER_JOB_INVENTORY/);
  } finally { await db.close(); }
});
