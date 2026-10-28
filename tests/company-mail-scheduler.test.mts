import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('QA mail installer is idempotent, paused and refuses replacing an active job',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema cron;
 create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
 create function public.touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$ begin if $1<>'xgxbwqxjssxxuihuwmgy' then raise exception 'wrong target';end if;end $$;
 create function public.touchline_company_enqueue_mail_scans() returns integer language sql as $$ select 0 $$;
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$ declare id bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into id;return id;end $$;
 create function cron.alter_job(job_id bigint,schedule text,command text,active boolean) returns void language sql as $$ update cron.job j set schedule=$2,command=$3,active=$4 where j.jobid=$1 $$;`);
 const sql=await readFile(new URL('../supabase/qa/touchline_company_mail_scheduler.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const jobs=await db.query(`select * from cron.job`);assert.equal(jobs.rows.length,1);assert.equal(jobs.rows[0].active,false);assert.equal(jobs.rows[0].schedule,'*/15 * * * *');assert.match(String(jobs.rows[0].command),/vault.decrypted_secrets/);assert.match(String(jobs.rows[0].command),/x-touchline-job-secret/);assert.match(String(jobs.rows[0].command),/timeout_milliseconds:=300000/);
 await db.exec('update cron.job set active=true');await assert.rejects(db.exec(sql),/Pause active mail job/);await db.exec('rollback');assert.equal((await db.query('select active from cron.job')).rows[0].active,true);
 }finally{await db.close();}
});
