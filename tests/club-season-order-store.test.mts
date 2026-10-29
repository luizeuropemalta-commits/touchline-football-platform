import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('database mapper rejects corrupted payment snapshots and RPC adapter keeps owner scope',()=>{
 const source=new URL('../lib/stripe/club-season-order-store.server.ts',import.meta.url).href;
 const script=`
  import assert from 'node:assert/strict';
  const {mapClubSeasonStoredOrder,createClubSeasonOrderStore}=await import(${JSON.stringify(source)});
  const row={id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',
   season_id:'33333333-3333-4333-8333-333333333333',plan:'master',previous_paid_plan:'standard',state:'pending',
   session_id:null,amount_minor:4000,currency:'eur',provider_account:'acct_1Tl6XQH0T0OdBC6s',
   created_at:'2026-10-29T12:00:00Z',first_attempt_at:'2026-10-29T12:00:00Z',checkout_expires_at:'2026-10-29T13:00:00Z',
   season_starts_at:'2026-08-01T00:00:00Z',season_ends_at:'2027-06-01T23:59:59.999Z'};
  const mapped=mapClubSeasonStoredOrder(row);
  assert.equal(mapped.previousPaidPlan,'standard');assert.equal(mapped.amountMinor,4000);assert.equal(mapped.sessionId,null);
  for(const patch of [{id:'bad'},{user_id:'bad'},{season_id:'bad'},{plan:'pro'},{previous_paid_plan:'beta'},
   {plan:'standard'},{amount_minor:8990},{amount_minor:'4000'},{provider_account:'acct_other'},{currency:'gbp'},
   {state:'invented'},{session_id:'cs_live_bad'},{first_attempt_at:'invalid'},
   {first_attempt_at:'2026-10-29T12:01:00Z'},{checkout_expires_at:'2026-10-29T12:15:00Z'},
   {season_ends_at:'2026-10-29T12:30:00Z'}]) assert.throws(()=>mapClubSeasonStoredOrder({...row,...patch}),/SEASON_STORAGE_UNAVAILABLE/);
  for(const v of [null,[],{},'data']) assert.throws(()=>mapClubSeasonStoredOrder(v),/SEASON_STORAGE_UNAVAILABLE/);
  const calls=[];
  const store=createClubSeasonOrderStore({rpc:async(name,args)=>{calls.push({name,args});
   return {data:name.includes('attach')?{...row,session_id:'cs_test_bound'}:row,error:null};}});
  await store.prepare(row.user_id,'master');await store.attach(row.user_id,row.id,'cs_test_bound');
  assert.deepEqual(calls,[{name:'touchline_club_prepare_season_test_order',args:{p_user_id:row.user_id,p_plan:'master'}},
   {name:'touchline_club_attach_season_test_session',args:{p_user_id:row.user_id,p_order_id:row.id,p_session_id:'cs_test_bound'}}]);
  const bad=createClubSeasonOrderStore({rpc:async()=>({data:null,error:{message:'SECRET db details'}})});
  await assert.rejects(bad.prepare(row.user_id,'master'),/^Error: SEASON_STORAGE_UNAVAILABLE$/);
 `;
 const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-strip-types','--input-type=module','-e',script],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30_000,env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'},
 });
 assert.equal(result.status,0,result.stderr||String(result.error||'child failed'));
});
