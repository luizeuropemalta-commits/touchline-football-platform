import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {buildQaAvatarInstallation,QA_PROJECT_REF} from "../scripts/build-qa-avatar-installation.mjs";
const read=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8");
const sql=read("20261008190028_touchline_qa_avatar_retention_discovery");
const runtime=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const {runAvatarRetentionDiscoveryPage}=await import("../lib/touchlineArena/club-owner-avatar-retention-discovery-worker.ts");
const {runAvatarRetentionBatch}=await import("../lib/touchlineArena/club-owner-avatar-retention-worker.ts");
const {PGlite}=runtime?await import(pathToFileURL(runtime).href):{PGlite:null};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("discovery is bounded recurring metadata, no Storage mutation or existing helper changes",()=>{
  assert.match(sql,/p_limit>5/); assert.match(sql,/'limit',25/);
  assert.match(sql,/chosen order by actor_id,operation_id/);
  assert.doesNotMatch(sql,/\bdelete\s+from\b|storage\.|create or replace function|alter function|cron\./i);
});
test("real-chain discovery: batch bounds, durable pages, lease recovery, recurring empty scans and ACL",{skip:!runtime},async()=>{
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
   create function public.touchline_rollback_qa_owner_scenario(text,uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;`);
  await db.exec(buildQaAvatarInstallation({projectRef:QA_PROJECT_REF,executorRole:"qa_executor"}).sql.replace(/rollback;\n$/,"commit;\n"));
  await db.exec("set session authorization postgres");
  await db.exec(read("20261008184109_touchline_qa_avatar_retention_authority"));
  await db.exec(read("20261008185454_touchline_qa_avatar_retention_journal"));
  await db.exec(sql.replace(/commit;\s*$/,"rollback;"));
  assert.equal((await db.query("select to_regclass('touchline_avatar_private.retention_discovery_scans') r")).rows[0].r,null);
  await db.exec(sql);
  const names={touchline_claim_qa_avatar_retention_discovery:["p_project_ref","p_attempt","p_limit"],
    touchline_ack_qa_avatar_retention_discovery:["p_project_ref","p_actor","p_operation","p_attempt","p_expected_offset","p_next_offset","p_complete"]};
  const args=(await db.query("select proname,proargnames from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[])",[Object.keys(names)])).rows;
  assert.equal(args.length,2);
  for(const row of args) assert.deepEqual(row.proargnames,names[row.proname as keyof typeof names]);
  for(let n=1;n<=8;n++) await db.exec(`insert into auth.users values('${id(n)}',null);
   insert into public.users(id) values('${id(n)}');
   insert into touchline_avatar_private.account_operations(actor_id,generation,fenced_through_generation) values('${id(n)}',2,1);
   insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state,terminal_at)
   values('${id(n)}','${id(100+n)}',0,0,1,'fenced',clock_timestamp()-interval '${n===8?4:6} minutes');`);
  await db.exec(`update auth.users set deleted_at=clock_timestamp() where id='${id(7)}'`);
  const digest="a".repeat(64);
  await db.exec(`insert into auth.users values('${id(9)}',null);
   insert into public.users(id) values('${id(9)}');
   insert into touchline_avatar_private.account_operations(actor_id,generation,fenced_through_generation) values('${id(9)}',2,-1);
   insert into touchline_avatar_private.receipts(actor_id,operation_id,expected_revision,revision,digest,object_key,avatar_url)
   values('${id(9)}','${id(109)}',0,1,'${digest}','${id(9)}/${id(109)}/${digest}.webp','/api/account/avatar?version=${id(109)}');
   insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state,receipt_operation_id,terminal_at)
   values('${id(9)}','${id(109)}',0,0,1,'committed','${id(109)}',clock_timestamp()-interval '10 minutes');
   set role touchline_avatar_writer;
   update public.users set avatar_revision=1,avatar_url='/api/account/avatar?version=${id(109)}' where id='${id(9)}'; reset role;`);
  const rpc=async(name:string,values:unknown[])=>(await db.query(`select public.${name}(${values.map((_,i)=>`$${i+1}`).join(",")}) r`,values)).rows[0].r;
  const claim=(attempt:number,limit=5)=>rpc("touchline_claim_qa_avatar_retention_discovery",[QA_PROJECT_REF,id(attempt),limit]);
  const ack=(n:number,attempt:number,offset:number,next:number,complete:boolean)=>rpc("touchline_ack_qa_avatar_retention_discovery",[QA_PROJECT_REF,id(n),id(100+n),id(attempt),offset,next,complete]);
  await db.exec("set role service_role");
  assert.equal((await claim(200,6)).allowed,false);
  const first=await claim(201); assert.equal(first.scans.length,5);
  assert.deepEqual(first.scans.map((s:{actorId:string})=>s.actorId),[1,2,3,4,5].map(id));
  assert.equal(first.scans[0].prefix,`${id(1)}/${id(101)}/`);
  assert.equal(first.scans[0].offset,0); assert.equal(first.scans[0].limit,25);
  assert.equal((await claim(201)).allowed,false,"replayed ID cannot recover a grant");
  const second=await claim(202); assert.deepEqual(second.scans.map((s:{actorId:string})=>s.actorId),[id(6)]);
  assert.equal((await ack(1,201,0,50,false)).acknowledged,false,"cannot skip a page");
  assert.equal((await ack(1,201,0,25,false)).acknowledged,true);
  assert.equal((await ack(1,201,0,25,false)).acknowledged,false,"ack replay has no lease");
  const page2=await claim(203); assert.equal(page2.scans.length,1); assert.equal(page2.scans[0].offset,25);
  assert.equal((await ack(1,201,25,0,true)).acknowledged,false,"old claim cannot finish a new lease");
  assert.equal((await ack(1,203,25,0,true)).acknowledged,true);
  assert.equal((await claim(204)).scans.length,0,"complete traversal reschedules, not immediate loop");
  assert.equal((await claim(204)).allowed,false,"empty batch ID also single use");
  // Fixture-only advance of discovery timestamps; real terminal and grace checks unchanged.
  await db.exec(`reset role; update touchline_avatar_private.retention_discovery_scans
   set next_check_at=clock_timestamp()-interval '1 second' where actor_id='${id(1)}'; set role service_role;`);
  const again=await claim(205); assert.equal(again.scans[0].offset,0,"completed/empty traversal always recurs from zero");
  assert.equal((await ack(1,205,0,0,true)).acknowledged,true,"empty page still schedules future traversal");
  await db.exec(`reset role; update touchline_avatar_private.retention_discovery_scans
   set lease_until=clock_timestamp()-interval '1 second' where actor_id='${id(2)}'; set role service_role;`);
  assert.equal((await ack(2,201,0,0,true)).acknowledged,false,"expired ack denied");
  const recovered=await claim(206); assert.equal(recovered.scans[0].actorId,id(2)); assert.equal(recovered.scans[0].offset,0);
  assert.equal((await ack(2,201,0,0,true)).acknowledged,false,"stale ack cannot alter recovered cursor");
  await db.exec(`set request.jwt.claim.sub='${id(1)}'`);
  assert.equal((await claim(207)).allowed,false); assert.equal((await ack(2,206,0,0,true)).acknowledged,false);
  await db.exec("reset request.jwt.claim.sub; reset role");
  for(const role of ["anon","authenticated"]) {
   await db.exec(`set role ${role}`);
   await assert.rejects(claim(208),/permission denied/); await assert.rejects(ack(2,206,0,0,true),/permission denied/);
   await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await assert.rejects(db.query("select * from touchline_avatar_private.retention_discovery_scans"),/permission denied/);
  await db.exec(`reset role; update touchline_avatar_private.retention_discovery_scans
    set next_check_at=clock_timestamp()-interval '1 second' where actor_id='${id(1)}'; set role service_role;`);
  const signatures:Record<string,string[]>={...names,
   touchline_register_qa_avatar_retention_candidate:["p_project_ref","p_actor","p_operation","p_digest","p_object_key"],
   touchline_list_due_qa_avatar_retention_candidates:["p_project_ref","p_limit"],
   touchline_begin_qa_avatar_retention_attempt:["p_project_ref","p_candidate","p_attempt"],
   touchline_record_qa_avatar_retention_attempt:["p_project_ref","p_attempt","p_outcome"],
  };
  const config={supabaseOrigin:`https://${QA_PROJECT_REF}.supabase.co`,assertEnvironment(){},
   rpc:async(name:string,args:Record<string,unknown>)=>{assert.ok(name in signatures);return {data:await rpc(name,signatures[name].map(n=>args[n])),error:null};},
  };
  const discovery=await runAvatarRetentionDiscoveryPage({...config,
   listPage:async(prefix,offset,limit)=>{assert.equal(prefix,`${id(1)}/${id(101)}/`);assert.equal(offset,0);assert.equal(limit,25);
    return [{id:id(900),name:`${digest}.webp`}];},
  },new AbortController().signal);
  assert.deepEqual(discovery,{status:"processed",listed:1,registered:1,denied:0,skipped:0,acknowledged:true});
  let deleted=0;
  const cleanup=await runAvatarRetentionBatch({...config,serviceRoleKey:"test-secret",fetchImpl:async(_url,init)=>{
   deleted++;assert.deepEqual(JSON.parse(String(init?.body)),{prefixes:[`${id(1)}/${id(101)}/${digest}.webp`]});return Response.json([]);
  }},new AbortController().signal);
  assert.deepEqual(cleanup,{status:"processed",inspected:1,accepted:1,denied:0,unknown:0});assert.equal(deleted,1);
  await db.exec("reset role");
  const persisted=(await db.query("select outcome from touchline_avatar_private.retention_attempts")).rows;
  assert.deepEqual(persisted,[{outcome:"accepted"}]);
  assert.equal((await db.query("select avatar_revision::text r from public.users where id=$1",[id(9)])).rows[0].r,"1","current image unchanged");
 } finally {await db.close();}
});
