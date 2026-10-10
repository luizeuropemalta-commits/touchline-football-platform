import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {buildQaAvatarInstallation,QA_PROJECT_REF} from "../scripts/build-qa-avatar-installation.mjs";
import {runAvatarRetentionBatch} from "../lib/touchlineArena/club-owner-avatar-retention-worker.ts";
const read=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8");
const sql=read("20261008185454_touchline_qa_avatar_retention_journal");
const authority=read("20261008184109_touchline_qa_avatar_retention_authority");
const runtime=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const {PGlite}=runtime?await import(pathToFileURL(runtime).href):{PGlite:null};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const digest="a".repeat(64), actor=id(1),op=id(11),key=`${actor}/${op}/${digest}.webp`;
test("journal does not delete Storage, mutate writer helpers, schedule work or claim final cleanup",()=>{
  assert.doesNotMatch(sql,/\bdelete\s+from\b|storage\.|create or replace function|alter function|cron\./i);
  assert.match(sql,/p_limit>25/);
  assert.match(sql,/reconciliationRequired/);
  assert.match(sql,/authorize_retention_candidate\(p_project_ref,v_candidate.actor_id/);
});
test("real-chain durable journal: exact identity, retry denial, recurring accepted/404, stale leases and ACL",{skip:!runtime},async()=>{
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
      insert into auth.users values('${actor}',null);
      insert into public.users values('${actor}',null,'Synthetic');`);
    await db.exec(buildQaAvatarInstallation({projectRef:QA_PROJECT_REF,executorRole:"qa_executor"}).sql.replace(/rollback;\n$/,"commit;\n"));
    await db.exec("set session authorization postgres");
    await db.exec(authority);
    // Prove installation is transactional without weakening its guards.
    await db.exec(sql.replace(/commit;\s*$/,"rollback;"));
    assert.equal((await db.query("select to_regclass('touchline_avatar_private.retention_candidates') r")).rows[0].r,null);
    await db.exec(sql);
    const expectedArgs:Record<string,string[]>={
      touchline_register_qa_avatar_retention_candidate:["p_project_ref","p_actor","p_operation","p_digest","p_object_key"],
      touchline_begin_qa_avatar_retention_attempt:["p_project_ref","p_candidate","p_attempt"],
      touchline_record_qa_avatar_retention_attempt:["p_project_ref","p_attempt","p_outcome"],
      touchline_list_due_qa_avatar_retention_candidates:["p_project_ref","p_limit"],
    };
    const rpcArgs=(await db.query("select proname,proargnames from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[])",[Object.keys(expectedArgs)])).rows;
    assert.equal(rpcArgs.length,4);
    for(const row of rpcArgs) assert.deepEqual(row.proargnames,expectedArgs[row.proname],"PostgREST RPC named argument contract");
    await db.exec(`insert into touchline_avatar_private.account_operations(actor_id,generation,fenced_through_generation) values('${actor}',2,1);
      insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state,terminal_at)
      values('${actor}','${op}',0,0,1,'fenced',clock_timestamp()-interval '6 minutes');`);
    const rpc=async(name:string,args:unknown[])=>(await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) r`,args)).rows[0].r;
    const register=()=>rpc("touchline_register_qa_avatar_retention_candidate",[QA_PROJECT_REF,actor,op,digest,key]);
    const list=(limit=25)=>rpc("touchline_list_due_qa_avatar_retention_candidates",[QA_PROJECT_REF,limit]);
    const begin=(candidate:string,attempt:string)=>rpc("touchline_begin_qa_avatar_retention_attempt",[QA_PROJECT_REF,candidate,attempt]);
    const record=(attempt:string,outcome:string)=>rpc("touchline_record_qa_avatar_retention_attempt",[QA_PROJECT_REF,attempt,outcome]);
    await db.exec("set role service_role");
    const registration=await register(); assert.equal(registration.allowed,true);
    assert.deepEqual(await register(),registration,"idempotent registration");
    const candidate=registration.candidateId;
    assert.equal((await list()).candidates.length,1);
    assert.equal((await list(26)).candidates.length,0);
    const first=await begin(candidate,id(21));
    assert.equal(first.allowed,true);
    for(const [field,value] of Object.entries({actorId:actor,operationId:op,digest,objectKey:key})) assert.equal(first[field],value);
    assert.ok(Date.parse(first.expiresAt)>Date.parse(first.checkedAt));
    assert.equal((await begin(candidate,id(21))).allowed,false,"same ID must not issue another DELETE grant");
    assert.equal((await begin(candidate,id(22))).allowed,false,"lease excludes concurrent attempt");
    assert.equal((await list()).candidates.length,0);
    assert.equal((await record(id(21),"accepted")).reconciliationRequired,true);
    assert.equal((await record(id(21),"accepted")).recorded,true);
    assert.equal((await record(id(21),"not_found")).recorded,false,"conflicting result cannot overwrite history");
    assert.equal((await list()).candidates.length,0,"HTTP 200 schedules another check, not immediate loop");
    // Fixture-only time travel on this new journal; existing authority clocks,
    // real operation constraints and writer functions are not changed.
    await db.exec(`reset role; update touchline_avatar_private.retention_candidates set next_check_at=clock_timestamp()-interval '1 second'; set role service_role;`);
    assert.equal((await list()).candidates.length,1,"accepted is never a final clean state");
    assert.equal((await begin(candidate,id(22))).allowed,true);
    assert.equal((await record(id(22),"not_found")).reconciliationRequired,true);
    await db.exec(`reset role; update touchline_avatar_private.retention_candidates set next_check_at=clock_timestamp()-interval '1 second'; set role service_role;`);
    assert.equal((await begin(candidate,id(23))).allowed,true);
    await db.exec(`reset role; update touchline_avatar_private.retention_candidates set lease_until=clock_timestamp()-interval '1 second'; set role service_role;`);
    assert.equal((await begin(candidate,id(24))).allowed,true,"crashed worker lease is recoverable");
    assert.equal((await record(id(23),"unknown")).recorded,true);
    assert.equal((await begin(candidate,id(25))).allowed,false,"late result cannot unlock newer lease");
    assert.equal((await record(id(24),"error")).recorded,true);
    await db.exec(`reset role; update touchline_avatar_private.retention_candidates set next_check_at=clock_timestamp()-interval '1 second';
      update auth.users set deleted_at=clock_timestamp() where id='${actor}'; set role service_role;`);
    assert.equal((await begin(candidate,id(25))).allowed,false,"authority is freshly rechecked, not cached from registration");
    await db.exec(`reset role; update auth.users set deleted_at=null where id='${actor}'; set role service_role;
      set request.jwt.claim.sub='${actor}';`);
    assert.equal((await register()).allowed,false);
    assert.equal((await list()).candidates.length,0);
    assert.equal((await begin(candidate,id(25))).allowed,false);
    assert.equal((await record(id(24),"error")).recorded,false);
    await db.exec("reset request.jwt.claim.sub; reset role");
    for(const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      for(const action of [register,list,()=>begin(candidate,id(25)),()=>record(id(24),"error")]) await assert.rejects(action(),/permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await assert.rejects(db.query("select * from touchline_avatar_private.retention_candidates"),/permission denied/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int n from touchline_avatar_private.retention_candidates")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from touchline_avatar_private.retention_attempts")).rows[0].n,4);
    assert.equal((await db.query("select avatar_revision::text r from public.users where id=$1",[actor])).rows[0].r,"0");
    // Real SQL journal + production worker/transport, HTTP boundary only faked.
    await db.exec(`update touchline_avatar_private.retention_candidates set next_check_at=clock_timestamp()-interval '1 second'; set role service_role;`);
    const signatures:Record<string,string[]>={
      touchline_list_due_qa_avatar_retention_candidates:["p_project_ref","p_limit"],
      touchline_begin_qa_avatar_retention_attempt:["p_project_ref","p_candidate","p_attempt"],
      touchline_record_qa_avatar_retention_attempt:["p_project_ref","p_attempt","p_outcome"],
    };
    let deletes=0;
    const processed=await runAvatarRetentionBatch({supabaseOrigin:`https://${QA_PROJECT_REF}.supabase.co`,serviceRoleKey:"test-secret",assertEnvironment(){},
      rpc:async(name,args)=>{assert.ok(name in signatures);return {data:await rpc(name,signatures[name].map(n=>args[n])),error:null};},
      fetchImpl:async(_url,init)=>{deletes++;assert.deepEqual(JSON.parse(String(init?.body)),{prefixes:[key]});return Response.json([]);},
    },new AbortController().signal);
    assert.deepEqual(processed,{status:"processed",inspected:1,accepted:1,denied:0,unknown:0});assert.equal(deletes,1);
    assert.equal((await list()).candidates.length,0,"real worker acknowledgement schedules reconciliation");
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int n from touchline_avatar_private.retention_attempts")).rows[0].n,5);
  } finally {await db.close();}
});
