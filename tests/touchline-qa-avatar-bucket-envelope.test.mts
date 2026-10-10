import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {buildQaAvatarBucketEnvelope,QA,VERSION,NAME,PREDECESSOR_VERSION,PREDECESSOR_SHA256} from "../scripts/build-qa-avatar-bucket-envelope.mjs";
import {buildQaAvatarHistoryEnvelope} from "../scripts/build-qa-avatar-history-envelope.mjs";
const runtime=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const {PGlite}=runtime?await import(pathToFileURL(runtime).href):{PGlite:null};

test("bucket envelope pins source, target and exact original history version; default rollback",()=>{
  const a=buildQaAvatarBucketEnvelope({projectRef:QA});
  const b=buildQaAvatarBucketEnvelope({projectRef:QA,commit:true});
  assert.equal(b.sql,a.sql.replace(/rollback;\n$/,"commit;\n"));
  assert.equal(a.metadata.version,"20261008085216");
  const source=readFileSync(new URL(`../supabase/migrations/${VERSION}_${NAME}.sql`,import.meta.url),"utf8");
  assert.equal(a.payload,source.replace(/^begin;\n/m,"").slice(0,-"commit;\n".length));
  assert.throws(()=>buildQaAvatarBucketEnvelope({projectRef:"production"}),/Exact QA/);
  assert.throws(()=>buildQaAvatarBucketEnvelope({projectRef:QA,readSource:()=>source+"\n"}),/source drift/);
});

test("bucket DDL and history are atomic; preexisting resources, missing predecessor and retries reject",{skip:!runtime},async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id bigint,bucket_id text); alter table storage.objects enable row level security;
      create schema cron; create table cron.job(active boolean);
      create table public.football_data_sync_runs(status text,started_at timestamptz);
      create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
    const rehearsal=buildQaAvatarBucketEnvelope({projectRef:QA});
    const success=buildQaAvatarBucketEnvelope({projectRef:QA,commit:true});
    async function unchanged() {
      assert.deepEqual((await db.query(`select (select count(*)::int from storage.buckets) buckets,
        (select count(*)::int from pg_policies where schemaname='storage') policies,
        (select count(*)::int from supabase_migrations.schema_migrations where version='${VERSION}') history`)).rows[0],
        {buckets:0,policies:0,history:0});
    }
    await assert.rejects(db.exec(rehearsal.sql),/PREDECESSOR_DRIFT/); await db.exec("rollback"); await unchanged();
    const predecessor=buildQaAvatarHistoryEnvelope({projectRef:QA,version:PREDECESSOR_VERSION});
    assert.equal(predecessor.metadata.payloadSha256,PREDECESSOR_SHA256);
    await db.query("insert into supabase_migrations.schema_migrations values($1,$2,$3)",[PREDECESSOR_VERSION,predecessor.metadata.name,[predecessor.payload]]);
    await db.exec("insert into cron.job values(true)");
    await assert.rejects(db.exec(rehearsal.sql),/SCHEDULER_ACTIVE/); await db.exec("rollback"); await unchanged();
    await db.exec("update cron.job set active=false");
    await db.exec("insert into public.football_data_sync_runs values('running',now())");
    await assert.rejects(db.exec(rehearsal.sql),/LIVE_RUN_ACTIVE/); await db.exec("rollback"); await unchanged();
    await db.exec("update public.football_data_sync_runs set status='completed'");
    await db.exec("create policy touchline_avatar_service_read on storage.objects for select to service_role using(true)");
    await assert.rejects(db.exec(rehearsal.sql),/EXISTING_RESOURCE/); await db.exec("rollback");
    assert.equal((await db.query("select qual from pg_policies where policyname='touchline_avatar_service_read'")).rows[0].qual,"true");
    await db.exec("drop policy touchline_avatar_service_read on storage.objects");
    await db.exec("insert into storage.buckets values('touchline-club-owner-avatars','touchline-club-owner-avatars',true,1,array['image/png'])");
    await assert.rejects(db.exec(rehearsal.sql),/EXISTING_RESOURCE/); await db.exec("rollback");
    assert.equal((await db.query("select public from storage.buckets")).rows[0].public,true);
    await db.exec("delete from storage.buckets");
    await db.exec(rehearsal.sql); await unchanged();
    await db.exec(`create function supabase_migrations.fail_bucket_history() returns trigger language plpgsql as $$begin
      raise exception 'DELIBERATE_BUCKET_HISTORY_FAILURE'; end$$;
      create trigger fail_history before insert on supabase_migrations.schema_migrations for each row execute function supabase_migrations.fail_bucket_history();`);
    await assert.rejects(db.exec(success.sql),/DELIBERATE_BUCKET_HISTORY_FAILURE/); await db.exec("rollback"); await unchanged();
    await db.exec("drop trigger fail_history on supabase_migrations.schema_migrations");
    await db.exec(success.sql);
    assert.deepEqual((await db.query("select public,file_size_limit::text bytes,allowed_mime_types from storage.buckets")).rows,
      [{public:false,bytes:"5242880",allowed_mime_types:["image/webp"]}]);
    assert.deepEqual((await db.query("select roles,cmd from pg_policies where schemaname='storage' order by cmd")).rows,
      [{roles:["service_role"],cmd:"INSERT"},{roles:["service_role"],cmd:"SELECT"}]);
    assert.deepEqual((await db.query("select statements from supabase_migrations.schema_migrations where version=$1",[VERSION])).rows[0].statements,[success.payload]);
    await assert.rejects(db.exec(success.sql),/ALREADY_APPLIED_RECONCILE/); await db.exec("rollback");
    assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations")).rows[0].n,2);
  } finally {await db.close();}
});
