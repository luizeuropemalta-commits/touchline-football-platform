import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";

// In-memory SQL only. The business function, audit table, event ordering and
// entitlement schema below are loaded from real versioned migrations.
// No remote env or credentials. This is not a multi-connection locking proof.
const modulePath=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
type Row=Record<string,unknown>;
type Db={exec(sql:string):Promise<unknown>;query<T extends Row=Row>(sql:string,args?:unknown[]):Promise<{rows:T[]}>;close():Promise<void>};
const sql=(name:string)=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8");
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor=id(1),target=id(2),command=id(3);
const grantSql="select public.touchline_fantasy_grant_vip_access($1,$2,$3,$4,$5) as result";
const args=[actor,"owner@example.com","member@example.com","Owner approved complimentary access",command];
function actualTable(source:string,name:string) {
  const start=source.indexOf(`create table if not exists public.${name} (`);
  const end=source.indexOf("\n);",start); assert.ok(start>=0 && end>start); return source.slice(start,end+3);
}

test("VIP owner grant executes atomically with immutable receipt and Stripe guard",{skip:!modulePath},async t=>{
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
    const seed=async()=>db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
      ('${actor}','owner@example.com',now(),'{"touchline_arena_access_v1":true}'),('${target}','member@example.com',now(),'{}');
      insert into public.users(id) values('${actor}'),('${target}');`);
    async function scenario(name:string,body:()=>Promise<void>){await t.test(name,async()=>{await db.exec("begin");try{await seed();await body();}finally{await db.exec("rollback");}});}
    async function reject(call:()=>Promise<unknown>,pattern:RegExp){await db.exec("savepoint rejected");await assert.rejects(call,pattern);await db.exec("rollback to savepoint rejected");}
    const apply=async(values=args)=>(await db.query<{result:Row}>(grantSql,values)).rows[0].result;
    await scenario("confirmed account gets perpetual VIP once; exact retry returns original receipt",async()=>{
      const first=await apply();assert.equal(first.ok,true);assert.equal(first.replay,false);
      assert.equal((first.grant as Row).accessReady,true);
      const access=(await db.query("select raw_app_meta_data from auth.users where id=$1",[target])).rows[0].raw_app_meta_data as Row;
      assert.equal(hasTouchLineArenaAccess({app_metadata:access}),true,"same access predicate used by protected application routes");
      const before=(await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e")).rows;
      const row=before[0].row as Row;assert.equal(row.plan_key,"vip");assert.equal(row.source,"owner_vip_grant");assert.equal(row.status,"active");assert.equal(row.current_period_end,null);
      const replay=await apply();assert.equal(replay.replay,true);assert.deepEqual(replay.grant,first.grant);
      assert.deepEqual((await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e")).rows,before);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_vip_grants")).rows[0].n,1);
      await reject(()=>apply([...args.slice(0,3),"Different reason",command]),/VIP_IDEMPOTENCY_CONFLICT/);
      const audit=(await db.query("select * from public.touchline_fantasy_vip_grants")).rows[0];
      assert.equal(audit.actor_id,actor);assert.equal(audit.target_user_id,target);assert.equal(audit.before_entitlement,null);
      assert.equal(audit.access_previously_granted,false);assert.equal(audit.profile_created,false);
      await reject(()=>db.query("update public.touchline_fantasy_vip_grants set reason='changed'"),/VIP_AUDIT_IMMUTABLE/);
      await reject(()=>db.query("delete from public.touchline_fantasy_vip_grants"),/VIP_AUDIT_IMMUTABLE/);
    });
    await scenario("newly registered target receives a minimal profile and access atomically without overwriting other flags",async()=>{
      await db.query("delete from public.users where id=$1",[target]);
      await db.query(`update auth.users set raw_app_meta_data='{"provider":"email","other_flag":{"enabled":true}}',
        raw_user_meta_data='{"touchline_arena_access_v1":false,"name":"Editable name is not authority"}' where id=$1`,[target]);
      const actorBefore=(await db.query("select to_jsonb(a) as row from auth.users a where id=$1",[actor])).rows;
      await apply();
      const account=(await db.query("select raw_app_meta_data,raw_user_meta_data from auth.users where id=$1",[target])).rows[0];
      assert.deepEqual(account.raw_app_meta_data,{provider:"email",other_flag:{enabled:true},touchline_arena_access_v1:true});
      assert.deepEqual(account.raw_user_meta_data,{touchline_arena_access_v1:false,name:"Editable name is not authority"});
      assert.equal((await db.query("select full_name from public.users where id=$1",[target])).rows[0].full_name,"TouchLine ClubOwner");
      assert.deepEqual((await db.query("select to_jsonb(a) as row from auth.users a where id=$1",[actor])).rows,actorBefore);
      assert.equal((await db.query("select profile_created from public.touchline_fantasy_vip_grants")).rows[0].profile_created,true);
    });
    await scenario("existing display name and privileged owner boundary remain unchanged",async()=>{
      await db.query("update public.users set full_name='Existing display name' where id=$1",[target]);
      await db.query("update auth.users set raw_app_meta_data='{\"touchline_arena_access_v1\":true,\"other\":42}' where id=$1",[target]);
      await apply();
      assert.equal((await db.query("select full_name from public.users where id=$1",[target])).rows[0].full_name,"Existing display name");
      assert.equal((await db.query("select access_previously_granted from public.touchline_fantasy_vip_grants")).rows[0].access_previously_granted,true);
      await reject(()=>apply([actor,args[1],args[1],args[3],id(4)]),/VIP_OWNER_EXCLUDED/);
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'other-owner@example.com',now())",[id(8)]);
      await db.query("insert into public.touchline_platform_owner_accounts(user_id,normalized_email) values($1,'other-owner@example.com')",[id(8)]);
      await reject(()=>apply([actor,args[1],"other-owner@example.com",args[3],id(5)]),/VIP_OWNER_EXCLUDED/);
      assert.equal((await db.query("select count(*)::int as n from public.users where id=$1",[id(8)])).rows[0].n,0);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_entitlements where user_id<>$1",[target])).rows[0].n,0);
    });
    await scenario("paid subscription cannot become VIP before future renewal cancellation is confirmed",async()=>{
      await db.query(`insert into public.touchline_fantasy_entitlements
        (user_id,entitlement_key,status,source,plan_key,provider_customer_reference,provider_subscription_reference)
        values ($1,'fantasy_access','active','stripe_test','standard','cus_existing','sub_existing')`,[target]);
      const before=(await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e where user_id=$1",[target])).rows;
      const accountBefore=(await db.query("select to_jsonb(a) as row from auth.users a where id=$1",[target])).rows;
      await reject(()=>apply(),/VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED/);
      assert.deepEqual((await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e where user_id=$1",[target])).rows,before);
      assert.deepEqual((await db.query("select to_jsonb(a) as row from auth.users a where id=$1",[target])).rows,accountBefore);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_vip_grants")).rows[0].n,0);
    });
    await scenario("mutable metadata cannot authorize an actor or invent a target; unconfirmed/ambiguous email fails closed",async()=>{
      await db.query("update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{\"touchline_arena_access_v1\":true}' where id=$1",[actor]);
      await reject(()=>apply(),/VIP_FORBIDDEN/);
      await db.query("update auth.users set raw_app_meta_data='{\"touchline_arena_access_v1\":true}' where id=$1",[actor]);
      await reject(()=>apply([actor,args[1],"missing@example.com",args[3],command]),/VIP_TARGET_NOT_REGISTERED/);
      await db.query("update auth.users set email_confirmed_at=null where id=$1",[target]);
      await reject(()=>apply(),/VIP_TARGET_EMAIL_UNVERIFIED/);
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'MEMBER@example.com',now())",[id(8)]);
      await reject(()=>apply(),/VIP_TARGET_AMBIGUOUS/);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_entitlements")).rows[0].n,0);
    });
    await scenario("failed final audit insert rolls back entitlement, with successful same-command recovery",async()=>{
      await db.query("delete from public.users where id=$1",[target]);
      const accountBefore=(await db.query("select to_jsonb(a) as row from auth.users a where id=$1",[target])).rows;
      await db.exec("create function public.fail_vip_audit() returns trigger language plpgsql as $$begin raise exception 'injected failure';end;$$;create trigger fail_vip before insert on public.touchline_fantasy_vip_grants for each row execute function public.fail_vip_audit();");
      await reject(()=>apply(),/injected failure/);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_entitlements")).rows[0].n,0);
      assert.equal((await db.query("select count(*)::int as n from public.users where id=$1",[target])).rows[0].n,0);
      assert.deepEqual((await db.query("select to_jsonb(a) as row from auth.users a where id=$1",[target])).rows,accountBefore,"access flag also rolls back with a failed receipt");
      await db.exec("drop trigger fail_vip on public.touchline_fantasy_vip_grants");assert.equal((await apply()).ok,true);
    });
    await scenario("signed subscription events preserve VIP, but still process non-VIP entitlements",async()=>{
      await apply();const before=(await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e where user_id=$1",[target])).rows;
      const event="select public.touchline_fantasy_apply_test_subscription_event($1,now(),'customer.subscription.deleted',false,$2,'cus_test','sub_test','canceled',null,null) as result";
      const protectedResult=(await db.query<{result:Row}>(event,["event_vip_canceled",target])).rows[0].result;
      assert.equal(protectedResult.complimentaryVipPreserved,true);
      assert.deepEqual((await db.query("select to_jsonb(e) as row from public.touchline_fantasy_entitlements e where user_id=$1",[target])).rows,before);
      assert.equal((await db.query<{result:Row}>(event,["event_vip_canceled",target])).rows[0].result.duplicate,true);
      await db.query(event,["event_normal_canceled",actor]);
      assert.equal((await db.query("select status from public.touchline_fantasy_entitlements where user_id=$1",[actor])).rows[0].status,"canceled");
    });
    await scenario("RPC and private receipts are inaccessible to public callers",async()=>{
      const result=(await db.query(`select
        has_function_privilege('anon','public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid)','EXECUTE') as anon,
        has_function_privilege('authenticated','public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid)','EXECUTE') as customer,
        has_function_privilege('service_role','public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid)','EXECUTE') as service,
        has_table_privilege('service_role','public.touchline_fantasy_vip_grants','INSERT') as direct_insert,
        has_table_privilege('authenticated','public.touchline_fantasy_vip_grants','SELECT') as receipt_read,
        (select relrowsecurity from pg_class where oid='public.touchline_fantasy_vip_grants'::regclass) as rls`)).rows[0];
      assert.deepEqual(result,{anon:false,customer:false,service:true,direct_insert:false,receipt_read:false,rls:true});
    });
  } finally {await db.close();}
});
