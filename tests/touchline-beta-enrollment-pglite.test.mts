import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";

// Actual versioned SQL, in memory only. Not a remote or multi-connection proof.
const modulePath=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
type Row=Record<string,unknown>;
type Db={exec(sql:string):Promise<unknown>;query<T extends Row=Row>(sql:string,args?:unknown[]):Promise<{rows:T[]}>;close():Promise<void>};
const sql=(name:string)=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8");
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const member=id(1),other=id(2),owner=id(3);
const receipt={ok:true,planKey:"beta",status:"active",budgetEur:50000000,allowedClubTeamIds:["22","117","116","52"]};
function actualTable(source:string,name:string) {
  const start=source.indexOf(`create table if not exists public.${name} (`);
  const end=source.indexOf("\n);",start);assert.ok(start>=0 && end>start);return source.slice(start,end+3);
}

test("Beta self-enrollment executes actual SQL without billing, downgrades or duplicate access",{skip:!modulePath},async t=>{
  const {PGlite}=await import(modulePath!);const db:Db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',updated_at timestamptz default now());
      create table public.users(id uuid primary key,full_name text not null default '');create table public.touchline_fantasy_gameweeks(id uuid primary key);`);
    await db.exec(actualTable(await sql("027_touchline_tc_wallet_integrity"),"touchline_platform_owner_accounts"));
    const base=await sql("20260825165821_touchline_fantasy_gameweek_v1");
    for(const table of ["touchline_fantasy_entitlements","touchline_fantasy_subscription_events","touchline_fantasy_audit_events"]) await db.exec(actualTable(base,table));
    await db.exec(await sql("20260825182600_touchline_fantasy_subscription_event_ordering"));
    const plan=await sql("20261011010000_touchline_fantasy_market_plan_policy");
    await db.exec(plan.slice(0,plan.indexOf("do $migration$"))+"\ncommit;");
    await db.exec(await sql("20261011011000_touchline_fantasy_owner_vip_access"));
    await db.exec(await sql("20261011012000_touchline_fantasy_beta_enrollment"));
    async function seed(){await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
      ('${member}','member@example.com',now(),'{"touchline_arena_access_v1":true,"preserved":42}'),
      ('${other}','other@example.com',now(),'{"touchline_arena_access_v1":true}'),
      ('${owner}','owner@example.com',now(),'{"touchline_arena_access_v1":true}');
      insert into public.users(id,full_name) values('${member}','Existing name'),('${other}','Other'),('${owner}','Owner');
      insert into public.touchline_platform_owner_accounts(user_id,normalized_email) values('${owner}','owner@example.com');`);}
    async function scenario(name:string,body:()=>Promise<void>){await t.test(name,async()=>{await db.exec("begin");try{await seed();await body();}finally{await db.exec("rollback");}});}
    async function reject(call:()=>Promise<unknown>,pattern:RegExp){await db.exec("savepoint rejected");await assert.rejects(call,pattern);await db.exec("rollback to savepoint rejected");}
    const apply=async(userId=member,email="member@example.com")=>(await db.query<{result:Row}>("select public.touchline_fantasy_enroll_beta($1,$2) as result",[userId,email])).rows[0].result;
    const snapshot=async()=> (await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e order by user_id")).rows;
    await scenario("new account enrolls itself once with a 50M TC game budget/four clubs; exact replay is read-only",async()=>{
      const authBefore=(await db.query("select to_jsonb(a) as row from auth.users a order by id")).rows;
      assert.deepEqual(await apply(),receipt);const first=await snapshot();const entitlement=first[0].row as Row;
      assert.equal(entitlement.user_id,member);assert.equal(entitlement.source,"beta_free");assert.equal(entitlement.current_period_end,null);
      assert.equal(entitlement.provider_customer_reference,null);assert.equal(entitlement.provider_subscription_reference,null);
      assert.deepEqual(resolveTouchlineFantasyMarketAccess(entitlement.plan_key),{planKey:"beta",budgetEur:50000000,allowedClubTeamIds:receipt.allowedClubTeamIds});
      assert.deepEqual(await apply(),receipt);assert.deepEqual(await snapshot(),first);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_beta_enrollments")).rows[0].n,1);
      assert.deepEqual((await db.query("select to_jsonb(a) as row from auth.users a order by id")).rows,authBefore);
      assert.equal((await db.query("select full_name from public.users where id=$1",[member])).rows[0].full_name,"Existing name");
      const audit=(await db.query("select * from public.touchline_fantasy_beta_enrollments")).rows[0];
      assert.equal(audit.created_entitlement,true);assert.equal(audit.before_entitlement,null);assert.deepEqual(audit.receipt,receipt);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_subscription_events")).rows[0].n,0);
      await reject(()=>db.query("update public.touchline_fantasy_beta_enrollments set created_entitlement=false"),/BETA_AUDIT_IMMUTABLE/);
      await reject(()=>db.query("delete from public.touchline_fantasy_beta_enrollments"),/BETA_AUDIT_IMMUTABLE/);
    });
    await scenario("every existing non-Beta contract is preserved, including legacy and inactive plans",async()=>{
      for(const plan of [null,"standard","pro","master","vip"]) for(const status of ["active","expired"]) {
        await db.query("insert into public.touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key,metadata) values($1,'fantasy_access',$2,'qa_grant',$3,'{\"keep\":true}') on conflict(user_id,entitlement_key) do update set plan_key=excluded.plan_key,status=excluded.status",[member,status,plan]);
        const before=await snapshot();await reject(()=>apply(),status==="active" ? /BETA_ACTIVE_PLAN_PRESERVED/ : /BETA_EXISTING_PLAN_REQUIRES_REVIEW/);
        assert.deepEqual(await snapshot(),before);
      }
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_beta_enrollments")).rows[0].n,0);
    });
    await scenario("existing active Beta is preserved; canceled or out-of-window Beta is not reactivated",async()=>{
      await db.query("insert into public.touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key,metadata) values($1,'fantasy_access','active','qa_grant','beta','{\"prior\":true}')",[member]);
      const before=await snapshot();assert.deepEqual(await apply(),receipt);assert.deepEqual(await snapshot(),before);
      assert.equal((await db.query("select created_entitlement from public.touchline_fantasy_beta_enrollments")).rows[0].created_entitlement,false);
      for(const set of ["status='canceled'","status='active',current_period_end=now()-interval '1 day'","current_period_end=null,current_period_start=now()+interval '1 day'"]) {
        await db.exec(`update public.touchline_fantasy_entitlements set ${set}`);const blocked=await snapshot();
        await reject(()=>apply(),/BETA_EXISTING_PLAN_REQUIRES_REVIEW/);assert.deepEqual(await snapshot(),blocked);
      }
    });
    await scenario("a previous Beta receipt cannot downgrade a later VIP grant or recreate missing entitlement",async()=>{
      await apply();await db.query("select public.touchline_fantasy_grant_vip_access($1,'owner@example.com','member@example.com','Owner complimentary VIP',$2)",[owner,id(9)]);
      const vip=await snapshot();await reject(()=>apply(),/BETA_ACTIVE_PLAN_PRESERVED/);assert.deepEqual(await snapshot(),vip);
      await db.query("delete from public.touchline_fantasy_entitlements where user_id=$1",[member]);
      await reject(()=>apply(),/BETA_EXISTING_PLAN_REQUIRES_REVIEW/);assert.equal((await snapshot()).length,0);
    });
    await scenario("canonical confirmed auth, server-owned access and owner exclusion are mandatory",async()=>{
      await reject(()=>apply(member,"other@example.com"),/BETA_FORBIDDEN/);
      await reject(()=>apply(owner,"owner@example.com"),/BETA_OWNER_EXCLUDED/);
      await db.query("update auth.users set email_confirmed_at=null where id=$1",[member]);await reject(()=>apply(),/BETA_FORBIDDEN/);
      await db.query("update auth.users set email_confirmed_at=now(),raw_app_meta_data='{}',raw_user_meta_data='{\"touchline_arena_access_v1\":true}' where id=$1",[member]);
      await reject(()=>apply(),/BETA_FORBIDDEN/);assert.equal((await snapshot()).length,0);
    });
    await scenario("failed audit insert rolls back a new entitlement and minimal profile, then retry succeeds",async()=>{
      await db.query("delete from public.users where id=$1",[member]);
      await db.exec("create function public.fail_beta_audit() returns trigger language plpgsql as $$begin raise exception 'injected beta failure';end;$$;create trigger fail_beta before insert on public.touchline_fantasy_beta_enrollments for each row execute function public.fail_beta_audit();");
      await reject(()=>apply(),/injected beta failure/);assert.equal((await snapshot()).length,0);
      assert.equal((await db.query("select count(*)::int as n from public.users where id=$1",[member])).rows[0].n,0);
      await db.exec("drop trigger fail_beta on public.touchline_fantasy_beta_enrollments");assert.deepEqual(await apply(),receipt);
      assert.equal((await db.query("select profile_created from public.touchline_fantasy_beta_enrollments")).rows[0].profile_created,true);
    });
    await scenario("late signed legacy events retain Beta and VIP while preserving normal event handling",async()=>{
      await apply();const beta=await snapshot();
      const event="select public.touchline_fantasy_apply_test_subscription_event($1,now(),'customer.subscription.deleted',false,$2,'cus_test','sub_test','canceled',null,null) as result";
      assert.equal((await db.query<{result:Row}>(event,["beta_late_cancel",member])).rows[0].result.complimentaryBetaPreserved,true);
      assert.deepEqual(await snapshot(),beta);assert.equal((await db.query<{result:Row}>(event,["beta_late_cancel",member])).rows[0].result.duplicate,true);
      await db.query("select public.touchline_fantasy_grant_vip_access($1,'owner@example.com','other@example.com','Free VIP',$2)",[owner,id(9)]);
      assert.equal((await db.query<{result:Row}>(event,["vip_late_cancel",other])).rows[0].result.complimentaryVipPreserved,true);
      await db.query(event,["ordinary_cancel",owner]);assert.equal((await db.query("select status from public.touchline_fantasy_entitlements where user_id=$1",[owner])).rows[0].status,"canceled");
    });
    await scenario("only service role may call enrollment and receipts remain private and insert-protected",async()=>{
      const rights=(await db.query(`select
        has_function_privilege('anon','public.touchline_fantasy_enroll_beta(uuid,text)','EXECUTE') as anon,
        has_function_privilege('authenticated','public.touchline_fantasy_enroll_beta(uuid,text)','EXECUTE') as customer,
        has_function_privilege('service_role','public.touchline_fantasy_enroll_beta(uuid,text)','EXECUTE') as service,
        has_table_privilege('service_role','public.touchline_fantasy_beta_enrollments','INSERT') as direct_insert,
        has_table_privilege('authenticated','public.touchline_fantasy_beta_enrollments','SELECT') as receipt_read,
        (select relrowsecurity from pg_class where oid='public.touchline_fantasy_beta_enrollments'::regclass) as rls`)).rows[0];
      assert.deepEqual(rights,{anon:false,customer:false,service:true,direct_insert:false,receipt_read:false,rls:true});
    });
  } finally {await db.close();}
});
