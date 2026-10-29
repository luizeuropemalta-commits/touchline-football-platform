import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect';
import { CLUB_SEASON_TEST_CATALOGUE, CLUB_SEASON_TEST_ACCOUNT, type ClubSeasonPaidPlan } from '../lib/stripe/club-season-test-catalogue.ts';
const u='11111111-1111-4111-8111-111111111111',u2='22222222-2222-4222-8222-222222222222',s='33333333-3333-4333-8333-333333333333',s2='44444444-4444-4444-8444-444444444444';
type Order={id:string,user_id:string,season_id:string,plan:ClubSeasonPaidPlan,previous_paid_plan:ClubSeasonPaidPlan|null,amount_minor:number};
function evidence(o:Order) {
 const p=CLUB_SEASON_TEST_CATALOGUE[o.plan];
 return {accountId:CLUB_SEASON_TEST_ACCOUNT,id:'cs_test_'+o.id.replaceAll('-',''),livemode:false,mode:'payment',status:'complete',payment_status:'paid',currency:'eur',amount_total:o.amount_minor,amount_subtotal:o.amount_minor,
 total_details:{amount_tax:0,amount_discount:0,amount_shipping:0},client_reference_id:o.user_id,
 metadata:{touchlineOrderId:o.id,touchlineSeasonId:o.season_id,touchlinePlan:o.plan,...(o.previous_paid_plan?{touchlinePreviousPaidPlan:o.previous_paid_plan}:{})},
 lines:{has_more:false,data:[{quantity:1,price:{id:o.previous_paid_plan?'price_inline':p.priceId,product:p.productId,active:!o.previous_paid_plan,livemode:false,currency:'eur',unit_amount:o.amount_minor,recurring:null}}]}};
}
test('season test fulfillment preserves collection and contracts in one idempotent transaction',async t=>{
 const db=new PGlite({extensions:{pageinspect}});
 try {
 await db.exec(`create extension pageinspect;create role anon;create role authenticated;create role service_role bypassrls;
 create table users(id uuid primary key);insert into users values('${u}'),('${u2}');
 create table football_seasons(id uuid primary key,starts_at date,ends_at date);insert into football_seasons values('${s}',current_date-30,current_date+90),('${s2}',current_date-20,current_date+100);
 create table touchline_fantasy_configs(season_id uuid,competition_key text,status text);insert into touchline_fantasy_configs values('${s}','england','active');
 create table touchline_fantasy_entitlements(user_id uuid,entitlement_key text,status text check(status in('active','inactive','past_due','canceled','expired')),source text check(source in('stripe_test','beta_free','owner_guest_grant','owner_vip_grant','qa_grant')),plan_key text,provider_customer_reference text,provider_subscription_reference text,current_period_start timestamptz,current_period_end timestamptz,last_provider_event_created_at timestamptz,metadata jsonb not null default '{}',updated_at timestamptz default now(),primary key(user_id,entitlement_key));
 create table touchline_club_collections(user_id uuid,season_id uuid,revision bigint,state jsonb,updated_at timestamptz default now(),primary key(user_id,season_id),check((state->>'revision')::bigint=revision),check((state->>'balanceEur')::numeric>=0));
 create table touchline_fantasy_subscription_events(provider_event_id text primary key,event_type text,livemode boolean,user_id uuid,provider_subscription_reference text,entitlement_status text,processed_at timestamptz default now());
 create table touchline_fantasy_audit_events(user_id uuid,event_type text,metadata jsonb);
 create table touchline_coach_contracts(user_id uuid,status text);
 create table touchline_fantasy_gameweeks(id uuid,season_id uuid);
 create table touchline_fantasy_user_gameweeks(id uuid,user_id uuid,gameweek_id uuid);
 create table touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid);
 grant select on touchline_coach_contracts,touchline_fantasy_gameweeks,touchline_fantasy_user_gameweeks,touchline_fantasy_user_gameweek_selections to service_role;
 create table touchline_card_contracts(id text primary key,user_id uuid,season_id uuid,status text,value bigint);insert into touchline_card_contracts values('contract-preserved','${u}','${s}','active',40000000);
 grant select on touchline_card_contracts to service_role;grant select,update on users to service_role;grant select on football_seasons,touchline_fantasy_configs to service_role;
 grant select,insert,update on touchline_fantasy_entitlements,touchline_club_collections to service_role;
 insert into touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key) values('${u}','fantasy_access','active','beta_free','beta');
 insert into touchline_club_collections values('${u}','${s}',3,'{"seasonId":"${s}","revision":3,"plan":"beta","balanceEur":55000000,"coach":{"id":"coach","valueEur":5000000},"players":[{"playerId":"preserved"}],"receipts":[{"key":"preserved"}],"formationCode":"4-3-3"}',now());`);
 // Reproduce hosted Supabase creation-time ACLs. The earlier selective GRANTs
 // alone do not remove DELETE/TRUNCATE or receipt UPDATE inherited this way.
 await db.exec('alter default privileges in schema public grant all on tables to service_role');
 for(const name of ['20260825182600_touchline_fantasy_subscription_event_ordering.sql','20261028220000_club_season_test_orders.sql','20261029000100_club_season_test_fulfillment.sql']) {
  if(name==='20261029000100_club_season_test_fulfillment.sql') {
   // Exercise forward repair of the earlier orders definition too. The orders
   // test separately proves that a fresh installation already uses the safe mutex.
   await db.exec(`do $$begin execute replace(replace(pg_get_functiondef('public.touchline_club_prepare_season_test_order(uuid,text)'::regprocedure),
    'perform 1 from public.users where id=p_user_id for no key update;',
    'perform 1 from public.users where id=p_user_id for update;'),
    'perform pg_advisory_xact_lock(pg_catalog.hashtextextended(''touchline-fantasy-subscription:''||p_user_id::text,0));',''); end$$;`);
  }
  await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 }
 await t.test('forward ACL repair removes hosted defaults without weakening other boundaries',async()=>{
  for(const table of ['touchline_club_season_test_orders','touchline_club_season_test_events']) {
   assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('service_role',$1,'DELETE,TRUNCATE') allowed",[table])).rows[0].allowed,true,'positive control: hosted defaults must expose excess privileges');
  }
  assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('service_role','touchline_club_season_test_events','UPDATE') allowed")).rows[0].allowed,true);
  await db.exec(await readFile(new URL('../supabase/migrations/20261029055452_club_season_test_table_privileges.sql',import.meta.url),'utf8'));
  for(const [table,expected] of [
   ['touchline_club_season_test_orders',['INSERT','SELECT','UPDATE']],
   ['touchline_club_season_test_events',['INSERT','SELECT']],
  ] as const) {
   const acl=(await db.query<{privilege_type:string,is_grantable:boolean}>(`select a.privilege_type,a.is_grantable from pg_class c
    cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid=a.grantee
    where c.oid=$1::regclass and r.rolname='service_role' order by a.privilege_type`,[table])).rows;
   assert.deepEqual(acl,expected.map(privilege_type=>({privilege_type,is_grantable:false})));
   for(const role of ['anon','authenticated']) {
    assert.equal((await db.query<{allowed:boolean}>('select has_table_privilege($1,$2,$3) allowed',[role,table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'])).rows[0].allowed,false);
   }
   assert.equal((await db.query<{n:number}>(`select count(*)::int n from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=$1::regclass and a.grantee=0`,[table])).rows[0].n,0,'PUBLIC remains revoked');
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('postgres',$1,$2) allowed",[table,privilege])).rows[0].allowed,true,'database owner remains privileged');
   }
   assert.equal((await db.query<{enabled:boolean}>('select relrowsecurity enabled from pg_class where oid=$1::regclass',[table])).rows[0].enabled,true);
  }
  // Repair is scoped to these existing tables, not global default ACL settings.
  await db.exec('create table local_unrelated_acl_probe(id int)');
  assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('service_role','local_unrelated_acl_probe','DELETE') allowed")).rows[0].allowed,true);
  await db.exec('drop table local_unrelated_acl_probe');
 });
 await db.exec('set role service_role');
 const prepare=async(plan:string,owner=u)=>(await db.query<{o:Order}>('select to_jsonb(touchline_club_prepare_season_test_order($1::uuid,$2)) o',[owner,plan])).rows[0].o;
 const fulfill=(o:Order,event:string,e= evidence(o))=>db.query<{r:Record<string,unknown>}>('select touchline_club_fulfill_season_test_order($1::uuid,$2,$3::jsonb) r',[o.id,event,JSON.stringify(e)]);
 const collection=async()=>(await db.query<{state:Record<string,unknown>}>('select state from touchline_club_collections where user_id=$1::uuid',[u])).rows[0].state;
 const quote=async(owner=u)=>(await db.query<{q:Record<string,unknown>}>('select touchline_club_quote_season_test_plans($1::uuid) q',[owner])).rows[0].q;
 let standard:Order,master:Order;
 await t.test('actual owner locks preserve serialization without blocking FK key-share',async()=>{
  // Runtime tuple flags prove lock strength; PGlite has one connection, so this
  // is not claimed as a two-connection deadlock/concurrency simulation.
  const flags=async()=>{
   await db.exec('reset role');
   return (await db.query<{raw_flags:string[]}>(`select (heap_tuple_infomask_flags(h.t_infomask,h.t_infomask2)).*
    from public.users u cross join lateral heap_page_items(get_raw_page('public.users',
     split_part(trim(both '()' from u.ctid::text),',',1)::bigint)) h
    where u.id=$1::uuid and h.lp=split_part(trim(both '()' from u.ctid::text),',',2)::int`,[u2])).rows[0].raw_flags;
  };
  // Positive control: the old stronger mutex is observable by this test.
  await db.exec('begin');
  try {await db.query('select id from public.users where id=$1::uuid for update',[u2]);
   assert.ok((await flags()).includes('HEAP_KEYS_UPDATED'));
  }finally{await db.exec('rollback');}
  for(const operation of ['prepare','quote','fulfill','review','expire']) {
   await db.exec('begin');
   try {
    if(operation==='quote') await quote(u2);
    else {
     const order=await prepare('standard',u2);
     if(operation==='fulfill') await fulfill(order,'evt_lock_fulfill');
     if(operation==='review') await db.query('select touchline_club_review_season_test_order($1::uuid,$2,$3,$4)',[order.id,'evt_lock_review','charge.refunded',evidence(order).id]);
     if(operation==='expire') await db.query('select touchline_club_expire_season_test_order($1::uuid,$2,$3)',[order.id,'evt_lock_expire',evidence(order).id]);
    }
    const actual=await flags();
    assert.ok(actual.includes('HEAP_XMAX_EXCL_LOCK'),operation+' must serialize the same owner');
    assert.ok(!actual.includes('HEAP_KEYS_UPDATED'),operation+' must allow collection FK KEY SHARE');
   }finally{await db.exec('rollback');}
  }
  // Cross-function lock-order regression: a legacy operation may already hold
  // ownership while awaiting users. Never hold users while awaiting subscription.
  for(const signature of [
   'touchline_club_prepare_season_test_order(uuid,text)',
   'touchline_club_quote_season_test_plans(uuid)',
   'touchline_club_fulfill_season_test_order(uuid,text,jsonb)',
   'touchline_club_review_season_test_order(uuid,text,text,text)',
   'touchline_club_expire_season_test_order(uuid,text,text)',
  ]) {
   const definition=(await db.query<{definition:string}>('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
   const subscription=definition.indexOf("'touchline-fantasy-subscription:'");
   const row=definition.indexOf('perform 1 from public.users');
   assert.ok(subscription>=0 && subscription<row,signature+' must acquire subscription before owner row');
  }
 });
 await t.test('quote reads authoritative prices without creating orders',async()=>{
 assert.deepEqual(await quote(),{standard:{amountMinor:4990},master:{amountMinor:8990},vip:{amountMinor:16990}});
 assert.equal((await db.query('select count(*)::int n from touchline_club_season_test_orders')).rows[0].n,0);
 });
 await t.test('initial payment preserves spent credits, coach, players and contracts',async()=>{
  standard=await prepare('standard');const before=await collection();const result=(await fulfill(standard,'evt_first')).rows[0].r;
  const after=await collection();assert.equal(after.balanceEur,705000000);assert.equal(after.revision,4);assert.equal(after.plan,'standard');
  for(const key of ['players','receipts','coach','formationCode']) assert.deepEqual(after[key],before[key]);
  assert.equal(result.creditsAdded,650000000);
  assert.equal((await db.query('select plan_key from touchline_fantasy_entitlements where user_id=$1::uuid',[u])).rows[0].plan_key,'standard');
  await db.exec('reset role');assert.equal((await db.query('select value from touchline_card_contracts')).rows[0].value,40000000);await db.exec('set role service_role');
 });
 await t.test('service cannot rewrite or erase paid evidence or delete its order',async()=>{
  const beforeEvents=(await db.query('select * from touchline_club_season_test_events order by event_id')).rows;
  const beforeOrders=(await db.query('select * from touchline_club_season_test_orders order by id')).rows;
  assert.ok(beforeEvents.length>0 && beforeOrders.length>0,'exercise real committed payment rows');
  for(const statement of [
   "update touchline_club_season_test_events set receipt='{}'::jsonb",
   'delete from touchline_club_season_test_events',
   'delete from touchline_club_season_test_orders',
   'truncate touchline_club_season_test_events',
   'truncate touchline_club_season_test_events,touchline_club_season_test_orders',
  ]) await assert.rejects(db.exec(statement),{code:'42501'});
  assert.deepEqual((await db.query('select * from touchline_club_season_test_events order by event_id')).rows,beforeEvents);
  assert.deepEqual((await db.query('select * from touchline_club_season_test_orders order by id')).rows,beforeOrders);
 });
 await t.test('same event and different event replay never add credits again',async()=>{
  const before=await collection();assert.equal((await fulfill(standard!,'evt_first')).rows[0].r.replay,true);
  assert.equal((await fulfill(standard!,'evt_duplicate_delivery')).rows[0].r.replay,true);assert.deepEqual(await collection(),before);
 });
 await t.test('upgrade charges EUR40 and adds only TC allocation difference',async()=>{
  assert.deepEqual(await quote(),{master:{amountMinor:4000},vip:{amountMinor:12000}});
  master=await prepare('master');assert.deepEqual(await quote(),{master:{amountMinor:4000}});assert.equal(master.amount_minor,4000);assert.equal(master.previous_paid_plan,'standard');
  await fulfill(master,'evt_upgrade');assert.equal((await collection()).balanceEur,1455000000);assert.equal((await collection()).revision,5);
 });
 await t.test('late paid-order replay cannot regress a completed transaction',async()=>{
  const result=await db.query<{r:{replay:boolean}}>('select touchline_club_review_season_test_order($1::uuid,$2,$3,$4) r',[master!.id,'evt_late_replay','season.payment_late',evidence(master!).id]);
  assert.equal(result.rows[0].r.replay,true);
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[master!.id])).rows[0].state,'paid');
 });
 await t.test('historical monthly event cannot replace seasonal access',async()=>{
 const before=(await db.query('select * from touchline_fantasy_entitlements where user_id=$1::uuid',[u])).rows[0];
 const event=await db.query<{r:{seasonalPlanPreserved:boolean}}>(`select touchline_fantasy_apply_test_subscription_event('evt_legacy_cancel',clock_timestamp(),'customer.subscription.deleted',false,$1::uuid,'cus_old','sub_old','canceled',now(),now()+interval '1 day') r`,[u]);
 assert.equal(event.rows[0].r.seasonalPlanPreserved,true);
 assert.deepEqual((await db.query('select * from touchline_fantasy_entitlements where user_id=$1::uuid',[u])).rows[0],before);
 });
 await t.test('tampered evidence and reused event IDs cannot mutate another order',async()=>{
  const other=await prepare('standard',u2);const e=evidence(other);
  for(const patch of [{amount_total:1},{livemode:true},{client_reference_id:u},{currency:'gbp'},{metadata:{...e.metadata,touchlineSeasonId:s2}},{lines:{has_more:false,data:[]}}]) {
   await assert.rejects(fulfill(other,'evt_bad',{...e,...patch} as typeof e),/SEASON_PAYMENT_UNCONFIRMED/);
  }
  await assert.rejects(fulfill(other,'evt_first'),/SEASON_EVENT_CONFLICT/);
  await fulfill(other,'evt_other');assert.equal((await db.query('select count(*)::integer n from touchline_club_collections where user_id=$1::uuid',[u2])).rows[0].n,0);
 });
 await t.test('failure after collection update rolls back wallet, event and order',async()=>{
  const vip=await prepare('vip');const before=await collection();
  await db.exec(`reset role;create function test_fail() returns trigger language plpgsql as $$begin if new.plan_key='vip' then raise exception 'INJECTED_FAILURE'; end if; return new;end$$;create trigger fail before update on touchline_fantasy_entitlements for each row execute function test_fail();set role service_role;`);
  await assert.rejects(fulfill(vip,'evt_rollback'),/INJECTED_FAILURE/);assert.deepEqual(await collection(),before);
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[vip.id])).rows[0].state,'pending');
  assert.equal((await db.query("select count(*)::int n from touchline_club_season_test_events where event_id='evt_rollback'")).rows[0].n,0);
  await db.exec('reset role;drop trigger fail on touchline_fantasy_entitlements;set role service_role');
 });
 await t.test('expired provider session unlocks pending order but cannot cancel paid order',async()=>{
  const vip=await prepare('vip');const sid=evidence(vip).id;
  await db.query('select touchline_club_expire_season_test_order($1::uuid,$2,$3)',[vip.id,'evt_expire',sid]);
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[vip.id])).rows[0].state,'expired');
  await db.query('select touchline_club_expire_season_test_order($1::uuid,$2,$3)',[standard!.id,'evt_stale_expiry',evidence(standard!).id]);
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[standard!.id])).rows[0].state,'paid');
 });
 await t.test('refund of ancestor payment suspends dependent upgrade without altering assets',async()=>{
  const pending=await prepare('vip');
  const before=await collection();await db.query('select touchline_club_review_season_test_order($1::uuid,$2,$3,$4)',[standard!.id,'evt_refund','charge.refunded',evidence(standard!).id]);
  assert.equal((await db.query('select status from touchline_fantasy_entitlements where user_id=$1::uuid',[u])).rows[0].status,'past_due');
  assert.deepEqual(await collection(),before);assert.deepEqual(await quote(),{});
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[pending.id])).rows[0].state,'pending');
  await assert.rejects(prepare('vip'),/SEASON_PAYMENT_REQUIRES_REVIEW/);
  assert.equal((await fulfill(standard!,'evt_late_complete')).rows[0].r.reviewRequired,true);
 });
 await t.test('late dispute from old season never suspends a new season entitlement',async()=>{
  await db.exec(`update touchline_fantasy_entitlements set status='active',metadata=jsonb_build_object('seasonTestSeasonId','${s2}','seasonTestOrderIds',jsonb_build_array('${master!.id}')) where user_id='${u}'`);
  await db.query('select touchline_club_review_season_test_order($1::uuid,$2,$3,$4)',[master!.id,'evt_old_dispute','charge.dispute.created',evidence(master!).id]);
  assert.equal((await db.query('select status from touchline_fantasy_entitlements where user_id=$1::uuid',[u])).rows[0].status,'active');
 });
 await t.test('pending checkout cannot resume after access revocation',async()=>{
  const pending=await prepare('master',u2);
  await db.query("update touchline_fantasy_entitlements set status='past_due' where user_id=$1::uuid",[u2]);
  await assert.rejects(prepare('master',u2),/SEASON_PREVIOUS_ACCESS_MISMATCH/);assert.deepEqual(await quote(u2),{});
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[pending.id])).rows[0].state,'pending');
  await db.query("update touchline_fantasy_entitlements set status='active' where user_id=$1::uuid",[u2]);
 });
 await t.test('stale paid history refuses activation atomically',async()=>{
  const pending=await prepare('master',u2);
  await db.exec(`update touchline_club_season_test_orders set state='refunded' where user_id='${u2}' and state='paid'`);
  await assert.rejects(fulfill(pending,'evt_history_changed'),/SEASON_PAID_HISTORY_CHANGED/);
  assert.equal((await db.query('select plan_key from touchline_fantasy_entitlements where user_id=$1::uuid',[u2])).rows[0].plan_key,'standard');
 });
 await t.test('late confirmed payment is recorded for review without minting or suspending',async()=>{
  const pending=await prepare('master',u2);const before=(await db.query('select * from touchline_fantasy_entitlements where user_id=$1::uuid',[u2])).rows[0];
  const result=await db.query<{r:{reviewRequired:boolean}}>('select touchline_club_review_season_test_order($1::uuid,$2,$3,$4) r',[pending.id,'evt_late_payment','season.payment_late',evidence(pending).id]);
  assert.equal(result.rows[0].r.reviewRequired,true);
  assert.deepEqual((await db.query('select * from touchline_fantasy_entitlements where user_id=$1::uuid',[u2])).rows[0],before);
  assert.equal((await db.query('select state from touchline_club_season_test_orders where id=$1::uuid',[pending.id])).rows[0].state,'review');
 });
 await t.test('new purchase rejects higher complimentary access before charging',async()=>{
  const guest='55555555-5555-4555-8555-555555555555';
  await db.exec(`reset role;insert into users values('${guest}');insert into touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key) values('${guest}','fantasy_access','active','owner_vip_grant','vip');set role service_role`);
  await assert.rejects(prepare('master',guest),/SEASON_PLAN_ALREADY_AVAILABLE/);
  assert.equal((await db.query('select count(*)::int n from touchline_club_season_test_orders where user_id=$1::uuid',[guest])).rows[0].n,0);
 });
 await t.test('legacy cards without collection block charge instead of forcing a destructive reset',async()=>{
 const legacy='66666666-6666-4666-8666-666666666666';
 await db.exec(`reset role;insert into users values('${legacy}');insert into touchline_card_contracts values('legacy-contract','${legacy}','${s}','active',1000000);set role service_role`);
 await assert.rejects(prepare('standard',legacy),/SEASON_LEGACY_COLLECTION_REQUIRES_REVIEW/);
 assert.deepEqual(await quote(legacy),{});
 });
 await t.test('public/customer callers cannot fulfill or mutate private ledger',async()=>{
  await db.exec('reset role;set role authenticated');
  await assert.rejects(fulfill(master!,'evt_unauthorized'),/permission denied/);
  await assert.rejects(db.exec('select * from touchline_club_season_test_events'),/permission denied/);
 });
 }finally{await db.close();}
});
