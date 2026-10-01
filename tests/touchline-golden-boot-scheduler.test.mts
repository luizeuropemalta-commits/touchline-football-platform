import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_GOLDEN_BOOT_PGLITE_MODULE;
const { PGlite } = modulePath ? await import(modulePath) : { PGlite: null };
const install = readFileSync(new URL("../supabase/qa/touchline_golden_boot_scheduler.sql", import.meta.url), "utf8");

test("QA scheduler SQL installs paused and invokes only its private fixed target", { skip: !modulePath }, async t => {
  const db = new PGlite();
  try {
    // Real PostgreSQL runs the install/command; extension transports are fake.
    // No scheduler, network, provider, credentials or production data are used.
    await db.exec(`
      create schema cron; create schema vault; create schema net;
      create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text,active boolean);
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create table net.calls(url text,headers jsonb,body jsonb,timeout_ms integer);
      create function public.touchline_assert_qa_fixture_target(ref text) returns void language plpgsql as $$begin
        if ref <> 'xgxbwqxjssxxuihuwmgy' or current_setting('test.qa',true) is distinct from 'yes' then raise exception 'wrong target'; end if;
      end$$;
      create function public.try_begin_touchline_golden_boot_worker(uuid,uuid,uuid) returns void language sql as $$select$$;
      create function public.complete_touchline_golden_boot_worker(uuid,bigint,text,boolean,timestamptz) returns void language sql as $$select$$;
      create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$declare id bigint;begin
        insert into cron.job(jobname,schedule,command,active) values(job_name,schedule,command,true) returning jobid into id;return id;
      end$$;
      create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null)
      returns void language sql as $$update cron.job set schedule=coalesce($2,schedule),command=coalesce($3,command),active=coalesce($6,active) where jobid=$1$$;
      create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 5000)
      returns bigint language plpgsql as $$begin insert into net.calls values(url,headers,body,timeout_milliseconds);return 1;end$$;
      insert into cron.job(jobname,schedule,command,active) values('touchline-qa-live-sync','* * * * *','legacy untouched',false);
    `);
    async function rejectInstall(pattern: RegExp) {
      try { await assert.rejects(db.exec(install), pattern); } finally { await db.exec("rollback"); }
    }
    await t.test("wrong target fails before scheduling", async () => {
      await rejectInstall(/wrong target/);
      assert.equal((await db.query("select count(*)::int n from cron.job")).rows[0].n, 1);
    });
    await db.exec("set test.qa='yes'");
    await t.test("install and repeat retain one paused job without editing legacy", async () => {
      await db.exec(install); await db.exec(install);
      const jobs = (await db.query("select * from cron.job order by jobid")).rows;
      assert.equal(jobs.length, 2); assert.equal(jobs[0].command, "legacy untouched");
      assert.equal(jobs[0].active, false); assert.equal(jobs[1].active, false);
      assert.equal(jobs[1].schedule, "30 seconds");
      assert.equal((await db.query("select count(*)::int n from net.calls")).rows[0].n, 0);
    });
    await t.test("active existing job cannot be silently replaced", async () => {
      await db.exec("update cron.job set active=true where jobname='touchline-qa-golden-boot-refresh'");
      await rejectInstall(/controlled pause/);
      assert.equal((await db.query("select active from cron.job where jobname='touchline-qa-golden-boot-refresh'")).rows[0].active, true);
      await db.exec("update cron.job set active=false where jobname='touchline-qa-golden-boot-refresh'");
    });
    const command = (await db.query("select command from cron.job where jobname='touchline-qa-golden-boot-refresh'")).rows[0].command;
    await t.test("missing, short and duplicate secrets cannot enqueue a request", async () => {
      await assert.rejects(db.exec(command), /secret unavailable/);
      await db.exec("insert into vault.decrypted_secrets values('touchline_qa_golden_boot_refresh_secret','short')");
      await assert.rejects(db.exec(command), /secret unavailable/);
      await db.exec("update vault.decrypted_secrets set decrypted_secret=repeat('x',48)");
      await db.exec("insert into vault.decrypted_secrets select * from vault.decrypted_secrets");
      await assert.rejects(db.exec(command), /secret unavailable/);
      assert.equal((await db.query("select count(*)::int n from net.calls")).rows[0].n, 0);
      await db.exec("delete from vault.decrypted_secrets");
    });
    await t.test("execution uses fixed QA URL, dedicated secret and finite transport timeout", async () => {
      await db.exec("insert into vault.decrypted_secrets values('touchline_qa_golden_boot_refresh_secret',repeat('x',48))");
      await db.exec(command);
      const calls = (await db.query("select * from net.calls")).rows;
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/touchline-awards/golden-boot/refresh");
      assert.deepEqual(calls[0].body, {}); assert.equal(calls[0].timeout_ms, 50000);
      assert.equal(calls[0].headers.Authorization, "Bearer " + "x".repeat(48));
      assert.doesNotMatch(command, /xxxxxxxx/);
      await db.exec("set test.qa='no'");
      await assert.rejects(db.exec(command), /wrong target/);
      assert.equal((await db.query("select count(*)::int n from net.calls")).rows[0].n, 1);
    });
  } finally { await db.close(); }
});
