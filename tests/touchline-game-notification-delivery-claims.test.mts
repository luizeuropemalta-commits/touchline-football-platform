import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const modulePath=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const root=new URL("../",import.meta.url);
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("real SQL reminder claim/reserve/finish revalidates and never reuses consumed nonce",{skip:!modulePath},async()=>{
 const {PGlite}=await import(modulePath!);const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);create table public.users(id uuid primary key references auth.users(id) on delete cascade);
   create table football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
   create table football_fixtures(id uuid primary key,round_id uuid,starts_at timestamptz,status text,finalized_at timestamptz,competition_id uuid,season_id uuid);
   create table touchline_fantasy_configs(competition_id uuid,season_id uuid,status text);
   create table touchline_fantasy_gameweeks(id uuid primary key default gen_random_uuid(),competition_id uuid,season_id uuid,round_id uuid unique,gameweek_number integer,state text,market_opens_at timestamptz,locks_at timestamptz,first_fixture_at timestamptz,last_fixture_at timestamptz);
   create table touchline_fantasy_user_gameweeks(id uuid primary key,user_id uuid,gameweek_id uuid,state text,formation_code text,selected_coach_id text);
   create table touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid,player_id uuid,slot_id text,slot_index integer);
   create table touchline_formation_geometry_versions(id uuid primary key,formation_code text,status text,geometry jsonb,validation_report jsonb);
   create function touchline_fantasy_fixture_is_live(text) returns boolean language sql immutable as $$select $1='LIVE'$$;
   create function touchline_fantasy_fixture_is_final(text) returns boolean language sql immutable as $$select $1='FT'$$;
   grant usage on schema public to anon,authenticated,service_role;`);
  await db.exec("create table notification_preferences(user_id uuid primary key,channels jsonb,settings jsonb,frequency text,explicit_consent_at timestamptz,quiet_hours jsonb);create table notification_devices(id uuid primary key,user_id uuid,installation_id uuid,permission text,push_subscription jsonb)");
  const registry=await readFile(new URL("supabase/qa/028_touchline_qa_formation_geometry_registry.sql",root),"utf8");
  const x=registry.indexOf("create or replace function public.touchline_formation_geometry_payload_is_valid(");const y=registry.indexOf("$$;",x);assert.ok(x>=0&&y>x);await db.exec(registry.slice(x,y+3));
  for(const f of ["20261002031429_touchline_fantasy_shared_market_window_projection.sql","20261002032250_touchline_fantasy_lineup_reminder_read.sql","20261002033308_touchline_game_notification_ledger.sql","20261002035727_touchline_game_notification_delivery_claims.sql"])await db.exec(await readFile(new URL(`supabase/migrations/${f}`,root),"utf8"));
  await db.exec(`insert into auth.users values('${id(1)}');insert into public.users values('${id(1)}');
   insert into touchline_fantasy_configs values('${id(10)}','${id(11)}','active');
   insert into football_rounds values('${id(12)}','${id(10)}','${id(11)}','Round 1');
   insert into football_fixtures values('${id(13)}','${id(12)}',date_trunc('second',clock_timestamp())+interval '1 hour','NS',null,'${id(10)}','${id(11)}');
   insert into touchline_fantasy_gameweeks values('${id(14)}','${id(10)}','${id(11)}','${id(12)}',1,'MARKET_OPEN',clock_timestamp()-interval '6 days',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour');
   insert into notification_preferences values('${id(1)}','{"push":true}','{"lineupReminders":true}','realtime',clock_timestamp()-interval '2 days','{"enabled":false}');
   insert into notification_devices values('${id(30)}','${id(1)}','${id(31)}','granted','{"endpoint":"https://push.invalid/synthetic","keys":{"auth":"synthetic","p256dh":"synthetic"}}');`);
  const geometry={schemaVersion:1,formationCode:"4-3-3",slots:Array.from({length:11},(_,i)=>({id:`S${i}`,x:50,y:50,role:i===0?"goalkeeper":i<5?"defender":i<8?"midfielder":"forward",priority:i+1,allowedPositions:["ST"]}))};
  await db.query("insert into touchline_formation_geometry_versions values($1,'4-3-3','published',$2,$3)",[id(15),JSON.stringify(geometry),JSON.stringify({publishable:true,formationCode:"4-3-3",slotCount:11})]);
  // Seed already-admitted synthetic bookkeeping. Actual admission has a separate
  // real-SQL suite; this suite always uses the actual readiness RPC for claims.
  await db.exec(`insert into touchline_game_notification_enrollments select '${id(1)}','${id(30)}','${id(14)}',1,false,clock_timestamp()-interval '1 day',f.starts_at,7200,false,d.push_subscription,p.explicit_consent_at from football_fixtures f cross join notification_devices d cross join notification_preferences p;
   insert into touchline_game_notification_identities values('${id(40)}','${id(1)}','${id(14)}','missing_xi',clock_timestamp()-interval '1 minute');
   insert into touchline_game_notification_deliveries(id,identity_id,device_id,generation,subscription,created_at,expires_at,payload)
   select '${id(50)}','${id(40)}','${id(30)}',1,d.push_subscription,clock_timestamp()-interval '1 minute',f.starts_at,'{}'::jsonb from notification_devices d cross join football_fixtures f;`);
  const claim=async()=> (await db.query("select touchline_game_notification_claim($1,30) r",[id(50)])).rows[0].r;
  const reserve=async(token:string,nonce=id(60))=>(await db.query("select touchline_game_notification_reserve($1,$2,$3) r",[id(50),token,nonce])).rows[0].r;
  const finish=async(token:string,nonce:string|null,state:string)=>(await db.query("select touchline_game_notification_finish($1,$2,$3,$4) r",[id(50),token,nonce,state])).rows[0].r;
  // Mirror the worker's one-item discovery without skipping orphans in the test.
  // Actual claim SQL must terminalize the first item so a later invocation can
  // discover the second. Both deliveries are unexpired and initially unleased.
  await db.exec(`begin;
   with deleted as (delete from touchline_fantasy_gameweeks where id='${id(14)}' returning *)
   insert into touchline_fantasy_gameweeks select '${id(24)}',competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at from deleted;
   insert into touchline_game_notification_enrollments select user_id,device_id,'${id(24)}',generation,needs_baseline,baseline_at,deadline,lead_seconds,suppressed,subscription,consent_at from touchline_game_notification_enrollments where gameweek_id='${id(14)}';
   insert into touchline_game_notification_identities values('${id(42)}','${id(1)}','${id(24)}','missing_xi',clock_timestamp()-interval '30 seconds');
   insert into touchline_game_notification_deliveries(id,identity_id,device_id,generation,subscription,created_at,expires_at,payload)
   select '${id(52)}','${id(42)}',device_id,generation,subscription,created_at+interval '1 second',expires_at,payload from touchline_game_notification_deliveries where id='${id(50)}';`);
  assert.equal((await db.query("select touchline_fantasy_read_lineup_reminder($1,$2) r",[id(1),id(24)])).rows[0].r.read.marketEditable,true,"replacement identity retains the same genuinely open round");
  const discover=async()=>(await db.query(`select id from touchline_game_notification_deliveries
   where state='queued' and attempt_id is null and expires_at>clock_timestamp()
   and (lease_expires_at is null or lease_expires_at<=clock_timestamp()) order by created_at,id limit 1`)).rows[0]?.id;
  assert.equal(await discover(),id(50));
  assert.equal(await claim(),null);
  assert.deepEqual((await db.query("select state,attempt_id,lease_token,lease_expires_at,payload from touchline_game_notification_deliveries where id=$1",[id(50)])).rows[0],
   {state:"cancelled",attempt_id:null,lease_token:null,lease_expires_at:null,payload:null},"missing round must not starve the queue until expiry");
  assert.equal(await discover(),id(52));
  const next=(await db.query("select touchline_game_notification_claim($1,30) r",[id(52)])).rows[0].r;
  assert.equal(next?.id,id(52),"next invocation claims valid second delivery");
  assert.equal(await claim(),null,"orphan cancellation is idempotent");
  assert.equal((await db.query("select count(*) n from touchline_game_notification_identities")).rows[0].n,2,"retain identity/dedupe history");
  await db.exec("rollback");
  await db.exec(`begin;delete from public.users where id='${id(1)}'`);
  assert.equal(await claim(),null);
  assert.equal((await db.query("select state from touchline_game_notification_deliveries where id=$1",[id(50)])).rows[0].state,"cancelled","missing public profile also terminalizes unattempted orphan");
  await db.exec("rollback");
  for(const parent of ["public.users","public.touchline_fantasy_gameweeks"]){
   await db.exec("begin");const owned=await claim();assert.ok(owned);assert.equal(await reserve(owned.leaseToken),true);
   const beforeRow=(await db.query("select to_jsonb(d) r from touchline_game_notification_deliveries d where id=$1",[id(50)])).rows[0].r;
   await db.query(`delete from ${parent} where id=$1`,[parent==="public.users"?id(1):id(14)]);
   assert.equal(await claim(),null);
   assert.deepEqual((await db.query("select to_jsonb(d) r from touchline_game_notification_deliveries d where id=$1",[id(50)])).rows[0].r,beforeRow,"missing parent never erases reserved/uncertain attempt");
   await db.exec("rollback");
  }
  await db.exec("begin");const unreserved=await claim();assert.ok(unreserved);
  assert.equal(unreserved.leaseUntil,unreserved.leaseExpiresAt,"generic dispatcher lease contract");
  assert.equal(await finish(unreserved.leaseToken,null,"provider_accepted"),false);
  assert.equal(await finish(id(99),null,"cancelled"),false);
  assert.equal(await finish(unreserved.leaseToken,null,"cancelled"),true,"policy refusal before reserve must release owned claim");
  assert.equal(await claim(),null);await db.exec("rollback");
  await db.exec("begin");const expiredClaim=await claim();assert.ok(expiredClaim);
  // Simulate elapsed lease without changing immutable notification expiry.
  await db.exec("update touchline_game_notification_deliveries set lease_expires_at=clock_timestamp()-interval '1 second'");
  const replacement=await claim();assert.ok(replacement);
  assert.notEqual(replacement.leaseToken,expiredClaim.leaseToken);
  assert.equal(await reserve(expiredClaim.leaseToken),false,"previous lease cannot consume new claim");
  assert.equal(await finish(expiredClaim.leaseToken,null,"cancelled"),false,"previous lease cannot cancel new claim");
  assert.equal(await reserve(replacement.leaseToken),true);
  assert.equal(await finish(replacement.leaseToken,null,"cancelled"),false,"unreserved receipt cannot erase consumed attempt");
  assert.equal(await finish(replacement.leaseToken,id(60),"provider_accepted"),true);
  await db.exec("rollback");
  await db.exec("begin");const c=await claim();assert.ok(c);assert.equal(c.kind,"missing_xi");assert.equal(c.userId,id(1));assert.ok(Date.parse(c.leaseExpiresAt)<=Date.parse(c.expiresAt));
  assert.equal(await claim(),null);assert.equal(await reserve(id(99)),false);assert.equal(await reserve(c.leaseToken),true);assert.equal(await reserve(c.leaseToken),false);
  assert.equal(await claim(),null,"reserved response loss must never reclaim");
  assert.equal(await finish(c.leaseToken,id(99),"provider_accepted"),false);
  assert.equal(await finish(c.leaseToken,id(60),"uncertain"),true);assert.equal(await finish(c.leaseToken,id(60),"provider_accepted"),false);
  await assert.rejects(db.exec("update touchline_game_notification_deliveries set attempt_id=null,attempt_started_at=null"),/IMMUTABLE/);await db.exec("rollback");
  for(const change of [
   "update football_fixtures set status='LIVE'",
   "delete from football_fixtures",
   "update football_fixtures set starts_at=starts_at+interval '1 second'",
   "update touchline_formation_geometry_versions set status='superseded'",
   "update notification_preferences set settings='{\"lineupReminders\":false}'",
   "update notification_devices set permission='denied'",
   "update touchline_game_notification_enrollments set generation=2",
  ]) {await db.exec("begin");await db.exec(change);assert.equal(await claim(),null,change);await db.exec("rollback");}
  await db.exec("begin");const before=await claim();await db.exec("update notification_preferences set channels='{\"push\":false}';update notification_preferences set channels='{\"push\":true}'");assert.equal(await reserve(before.leaseToken),false);await db.exec("rollback");
  await db.exec(`begin;insert into touchline_fantasy_user_gameweeks values('${id(20)}','${id(1)}','${id(14)}','DRAFT','4-3-3','307')`);
  for(let i=0;i<11;i++)await db.query("insert into touchline_fantasy_user_gameweek_selections values($1,$2,$3,$4)",[id(20),id(100+i),`S${i}`,i+1]);
  assert.equal(await claim(),null,"kind changed to complete_unconfirmed");await db.exec("rollback");
  await db.exec("begin");const consumed=await claim();assert.equal(await reserve(consumed.leaseToken),true);
  // Expiry simulation uses a new synthetic expired row, not mutation of immutable expiry.
  await db.exec(`insert into touchline_game_notification_identities values('${id(41)}','${id(1)}','${id(14)}','complete_unconfirmed',clock_timestamp()-interval '2 hours');
   insert into touchline_game_notification_deliveries(id,identity_id,device_id,generation,subscription,created_at,expires_at,attempt_id,attempt_started_at)
   values('${id(51)}','${id(41)}','${id(30)}',1,'{}',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','${id(61)}',clock_timestamp()-interval '90 minutes')`);
  assert.equal((await db.query("select touchline_game_notification_expire(10) n")).rows[0].n,1);
  assert.equal((await db.query("select state from touchline_game_notification_deliveries where id=$1",[id(51)])).rows[0].state,"uncertain");
  assert.equal((await db.query("select count(*) n from touchline_game_notification_identities")).rows[0].n,2);await db.exec("rollback");
  for(const role of ["anon","authenticated"]){await db.exec(`set role ${role}`);await assert.rejects(claim(),/permission denied/);await db.exec("reset role");}
  await db.exec("set role service_role");assert.ok(await claim());await db.exec("reset role");
 }finally{await db.close();}
});
