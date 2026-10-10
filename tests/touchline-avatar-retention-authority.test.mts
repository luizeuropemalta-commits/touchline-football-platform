import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {buildQaAvatarInstallation,QA_PROJECT_REF} from "../scripts/build-qa-avatar-installation.mjs";

const sql=readFileSync(new URL("../supabase/migrations/20261008184109_touchline_qa_avatar_retention_authority.sql",import.meta.url),"utf8");
const runtime=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const {PGlite}=runtime?await import(pathToFileURL(runtime).href):{PGlite:null};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const digest="a".repeat(64);
const key=(actor:string,op:string)=>`${actor}/${op}/${digest}.webp`;

test("retention is QA-only exact-key classification, not deletion, enumeration or writer mutation",()=>{
  assert.match(sql,/auth\.uid\(\) is not null/);
  assert.match(sql,/interval '5 minutes'/);
  assert.doesNotMatch(sql,/\bdelete\s+from\b|storage\.|create role|alter function|create or replace function/i);
  assert.match(sql,/security definer set search_path=''/);
  assert.match(sql,/security invoker set search_path=''/);
});

test("real avatar chain and retention SQL admit only old terminal exact keys",{skip:!runtime},async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role qa_executor login nosuperuser createrole createdb bypassrls;
      create role anon; create role authenticated; create role service_role bypassrls;
      grant create on database postgres to qa_executor; grant create on schema public to qa_executor;
      set session authorization qa_executor;
      create schema auth; create table auth.users(id uuid primary key,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.users(id uuid primary key references auth.users(id),avatar_url text,full_name text);
      alter table public.users enable row level security;
      create table public.touchline_qa_fixture_runs(id uuid primary key);
      create table public.touchline_qa_owner_scenarios(run_id uuid,user_id uuid);
      create table public.touchline_user_arena_state(user_id uuid);
      create function public.touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
        if $1 is distinct from '${QA_PROJECT_REF}' then raise exception 'TARGET'; end if; end$$;
      create function public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function public.touchline_rollback_qa_owner_scenario(text,uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
      insert into auth.users values('${id(1)}',null),('${id(2)}',null);
      insert into public.users values('${id(1)}',null,'Synthetic'),('${id(2)}',null,'Other');`);
    await db.exec(buildQaAvatarInstallation({projectRef:QA_PROJECT_REF,executorRole:"qa_executor"}).sql.replace(/rollback;\n$/,"commit;\n"));
    // PGlite's RESET keeps its prior session override. Restore the original
    // disposable bootstrap identity explicitly; do not relax the hosted guard.
    await db.exec("set session authorization postgres");
    const prerequisites=(await db.query(`select current_database() database_name,
      current_user executor,session_user session_executor,
      to_regclass('touchline_avatar_private.operations')::text operations_table,
      to_regprocedure('public.touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text)')::text publish_rpc`)).rows[0];
    assert.deepEqual(prerequisites,{
      database_name:"postgres",executor:"postgres",session_executor:"postgres",
      operations_table:"touchline_avatar_private.operations",
      publish_rpc:"touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text)",
    },"disposable fixture must satisfy the unchanged QA migration prerequisites before any retention DDL");
    const helperSnapshot=async()=>createHash("sha256").update(JSON.stringify((await db.query(`select proname,prosrc,proowner::regrole::text owner,proacl::text acl
      from pg_proc where pronamespace='touchline_avatar_private'::regnamespace and proname<>'authorize_retention_candidate' order by proname`)).rows)).digest("hex");
    const before=await helperSnapshot();
    await db.exec(sql);
    assert.equal(await helperSnapshot(),before,"existing writer helpers, owners and ACLs remain unchanged");
    // Historical synthetic rows use real constraints. Profile updates cross the
    // unmodified writer trigger; no trigger is disabled and no clock is mocked.
    await db.exec(`insert into touchline_avatar_private.account_operations(actor_id,generation,fenced_through_generation) values('${id(1)}',8,7);
      insert into touchline_avatar_private.receipts(actor_id,operation_id,expected_revision,revision,digest,object_key,avatar_url) values
       ('${id(1)}','${id(11)}',0,1,'${digest}','${key(id(1),id(11))}','/api/account/avatar?version=${id(11)}'),
       ('${id(1)}','${id(12)}',1,2,'${digest}','${key(id(1),id(12))}','/api/account/avatar?version=${id(12)}');
      insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state,receipt_operation_id,terminal_at) values
       ('${id(1)}','${id(11)}',0,0,1,'committed','${id(11)}',clock_timestamp()-interval '10 minutes'),
       ('${id(1)}','${id(12)}',1,2,3,'committed','${id(12)}',clock_timestamp()-interval '9 minutes'),
       ('${id(1)}','${id(13)}',2,4,5,'fenced',null,clock_timestamp()-interval '6 minutes'),
       ('${id(1)}','${id(14)}',2,6,7,'fenced',null,clock_timestamp()-interval '4 minutes');
      set role touchline_avatar_writer;
      update public.users set avatar_revision=1,avatar_url='/api/account/avatar?version=${id(11)}' where id='${id(1)}';
      update public.users set avatar_revision=2,avatar_url='/api/account/avatar?version=${id(12)}' where id='${id(1)}';
      reset role;`);
    const authorize=async(op:number,actor=id(1),objectKey=key(actor,id(op)))=>(await db.query(
      "select public.touchline_authorize_qa_avatar_retention_candidate($1,$2,$3,$4,$5) r",
      [QA_PROJECT_REF,actor,id(op),digest,objectKey])).rows[0].r;
    await db.exec("set role service_role");
    assert.equal((await authorize(11)).kind,"superseded_committed");
    const fenced=await authorize(13); assert.equal(fenced.allowed,true); assert.equal(fenced.objectKey,key(id(1),id(13)));
    for(const op of [12,14,99]) assert.equal((await authorize(op)).allowed,false,"current/recent/unknown must deny");
    assert.equal((await authorize(11,id(2),key(id(1),id(11)))).allowed,false);
    await db.exec(`set request.jwt.claim.sub='${id(1)}'`);
    assert.equal((await authorize(11)).allowed,false,"even same-actor browser context is forbidden");
    await db.exec("reset request.jwt.claim.sub; reset role");
    for(const op of [11,12]) {
      await db.exec(`begin; delete from touchline_avatar_private.operations where actor_id='${id(1)}' and operation_id='${id(op)}'`);
      assert.equal((await authorize(11)).allowed,false,"legacy receipt without journal or missing current journal must deny");
      await db.exec("rollback");
    }
    await db.exec(`insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state)
      values('${id(1)}','${id(15)}',2,8,9,'pending');
      update touchline_avatar_private.account_operations set generation=9,active_operation_id='${id(15)}' where actor_id='${id(1)}';`);
    assert.equal((await authorize(15)).allowed,false);
    assert.equal((await authorize(11)).allowed,true,"a different valid pending upload does not revive old photos");
    await db.exec(`update auth.users set deleted_at=now() where id='${id(1)}'`);
    assert.equal((await authorize(11)).allowed,false);
    await db.exec(`update auth.users set deleted_at=null where id='${id(1)}';
      update touchline_avatar_private.account_operations set generation=10 where actor_id='${id(1)}'`);
    assert.equal((await authorize(11)).allowed,false,"inconsistent active generation denies");
    await db.exec(`update touchline_avatar_private.account_operations set generation=9 where actor_id='${id(1)}'`);
    assert.equal((await authorize(11)).allowed,true);
    for(const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(authorize(11),/permission denied/);
      await db.exec("reset role");
    }
    assert.equal(await helperSnapshot(),before);
    assert.deepEqual((await db.query("select avatar_revision::text revision,avatar_url from public.users where id=$1",[id(1)])).rows[0],
      {revision:"2",avatar_url:`/api/account/avatar?version=${id(12)}`});
  } finally {await db.close();}
});
