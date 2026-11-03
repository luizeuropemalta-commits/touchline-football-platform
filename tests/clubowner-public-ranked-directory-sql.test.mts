import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",hidden="33333333-3333-4333-8333-333333333333";
test("ranked directory input is service-only, opt-in, independently gated and bounded",async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
   create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,is_anonymous boolean default false,banned_until timestamptz);
   create table public.touchline_fantasy_entitlements(user_id uuid,entitlement_key text,status text,plan_key text,current_period_start timestamptz,current_period_end timestamptz,provider_customer_reference text,metadata jsonb,primary key(user_id,entitlement_key));
   alter table public.touchline_fantasy_entitlements enable row level security;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   alter default privileges grant all on tables to anon,authenticated,service_role;
   alter default privileges grant all on functions to anon,authenticated,service_role;
   insert into auth.users(id,email,raw_app_meta_data) values('${a}','PRIVATE_A','{"touchline_arena_access_v1":true}'),('${b}','PRIVATE_B','{"touchline_arena_access_v1":true}'),('${hidden}','PRIVATE_H','{}');`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261027201704_touchline_clubowner_public_discovery.sql",import.meta.url),"utf8"));
  const profileBefore=(await db.query("select oid,proacl::text from pg_proc where oid='touchline_people_private.profile(uuid)'::regprocedure")).rows;
  await db.exec(readFileSync(new URL("../supabase/migrations/20261101065616_touchline_people_ranked_directory.sql",import.meta.url),"utf8"));
  assert.deepEqual((await db.query("select oid,proacl::text from pg_proc where oid='touchline_people_private.profile(uuid)'::regprocedure")).rows,profileBefore);
  const role=async(r:string)=>db.exec(`reset role;set role ${r}`);
  const read=async(viewer:string|null=null)=>(await db.query<{result:Array<Record<string,unknown>>}>("select public.touchline_people_directory_candidates($1) result",[viewer])).rows[0].result;
  await t.test("applying migration creates no profiles or grants to customers and does not enable gate",async()=>{
   for(const r of ["anon","authenticated"]){await role(r);await assert.rejects(read(a),/permission denied/);await assert.rejects(db.exec("select touchline_people_private.directory_candidates(null)"),/permission denied/);}
   await role("service_role");await assert.rejects(read(),/PEOPLE_UNAVAILABLE/);await assert.rejects(db.exec("select * from touchline_people_private.profiles"),/permission denied/);
   await db.exec("update touchline_people_private.configuration set enabled=true");assert.deepEqual(await read(),[]);
  });
  await t.test("only explicit published profiles plus known follower state, no auth emails",async()=>{
   await db.exec(`reset role;insert into touchline_people_private.profiles(account_id,display_name,published) values('${a}','Same Public',true),('${b}','Same Public',true),('${hidden}','Secret Hidden',false);`);
   await role("service_role");const rows=await read(a);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.viewer).sort(),["member","self"]);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_|Secret Hidden|email/);assert.ok(rows.every(r=>r.accountId!==r.publicId));
   const target=rows.find(r=>r.accountId===b)!.publicId;
   await db.exec(`reset role;insert into touchline_people_private.follows(actor_id,target_id) values('${a}','${target}')`);
   await role("service_role");const followed=(await read(a)).find(r=>r.accountId===b)!;assert.equal(followed.followerCount,1);assert.equal(followed.following,true);
   assert.ok((await read()).every(r=>r.viewer==="guest"&&!r.following));
   await assert.rejects(read(hidden),/PEOPLE_FORBIDDEN/);
  });
  await t.test("confirmed current plans project consistently through directory/profile/follow, with neutral missing or invalid access",async()=>{
   await db.exec(`reset role;insert into public.touchline_fantasy_entitlements values('${b}','fantasy_access','active','vip',null,null,'SECRET_BILLING','{"secret":"PRIVATE_METADATA"}'),('${hidden}','fantasy_access','active','vip',null,null,'SECRET_HIDDEN','{}');`);
   await role("service_role");const target=(await read()).find(r=>r.accountId===b)!.publicId as string;
   const set=async(expression:string)=>db.exec(`reset role;update public.touchline_fantasy_entitlements set ${expression} where user_id='${b}'`);
   for(const plan of ["beta","standard","master","vip"]){
    await set(`plan_key='${plan}',status='active',current_period_start=now()-interval '1 day',current_period_end=now()+interval '1 day'`);
    await role("service_role");assert.equal((await read()).find(r=>r.accountId===b)!.planKey,plan);
    await role("anon");const profile=(await db.query<{result:Record<string,unknown>}>("select public.touchline_people_profile($1) result",[target])).rows[0].result;
    assert.equal(profile.planKey,plan);assert.doesNotMatch(JSON.stringify(profile),/accountId|SECRET_|PRIVATE_|period|status|billing|metadata/);
    await role("authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    const follow=(await db.query<{result:Record<string,unknown>}>("select public.touchline_people_set_follow($1,true) result",[target])).rows[0].result;assert.equal(follow.planKey,plan);
   }
   for(const expression of ["status='past_due'","status='expired'","status='canceled'","status='inactive'","status='active',plan_key='pro'","plan_key=null","plan_key='vip',current_period_start=now()+interval '1 day'","current_period_start=null,current_period_end=now()"]){
    await set(expression);await role("service_role");assert.equal((await read()).find(r=>r.accountId===b)!.planKey,null);
    await role("anon");assert.equal((await db.query<{result:Record<string,unknown>}>("select public.touchline_people_profile($1) result",[target])).rows[0].result.planKey,null);
   }
   await role("service_role");assert.equal((await read()).find(r=>r.accountId===a)!.planKey,null);
   for(const r of ["anon","authenticated","service_role"]){await role(r);await assert.rejects(db.query("select touchline_people_private.current_public_plan($1)",[target]),/permission denied/);await assert.rejects(db.exec("select * from public.touchline_fantasy_entitlements"),/permission denied/);}
   await db.exec(`reset role;update public.touchline_fantasy_entitlements set plan_key='vip',status='active',current_period_start=null,current_period_end=null where user_id='${b}';update touchline_people_private.profiles set published=false where account_id='${b}'`);
   await role("anon");assert.equal((await db.query<{result:unknown}>("select public.touchline_people_profile($1) result",[target])).rows[0].result,null);
   await role("service_role");assert.equal((await read()).some(r=>r.accountId===b),false);
   await db.exec(`reset role;update touchline_people_private.profiles set published=true where account_id='${b}'`);
  });
  await t.test("revoked/anonymous/banned viewer fails closed; profile unpublication disappears immediately",async()=>{
   for(const change of ["raw_app_meta_data='{}'","raw_app_meta_data='{\"touchline_arena_access_v1\":true}',is_anonymous=true","is_anonymous=false,banned_until=now()+interval '1 day'"]){await db.exec(`reset role;update auth.users set ${change} where id='${a}'`);await role("service_role");await assert.rejects(read(a),/PEOPLE_FORBIDDEN/);}
   await db.exec(`reset role;update touchline_people_private.profiles set published=false where account_id='${b}'`);await role("service_role");assert.equal((await read()).length,1);
  });
  await t.test("capacity overflow rejects instead of silently truncating rankings or scanning hidden rows",async()=>{
   await db.exec(`reset role;insert into auth.users(id) select gen_random_uuid() from generate_series(1,10000);insert into touchline_people_private.profiles(account_id,display_name,published) select id,'Bounded Public',true from auth.users where email is null;`);
   await role("service_role");await assert.rejects(read(),/PEOPLE_DIRECTORY_CAPACITY/);
   await db.exec("update touchline_people_private.configuration set enabled=false");await assert.rejects(read(),/PEOPLE_UNAVAILABLE/);
  });
  await db.exec("reset role");const state=await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where oid='touchline_people_private.profiles'::regclass");assert.equal(state.rows[0].relrowsecurity,true);
 }finally{await db.close();}
});
