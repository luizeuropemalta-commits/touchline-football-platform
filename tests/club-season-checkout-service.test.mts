import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeClubSeasonCheckoutCustomer, beginClubSeasonCheckout, handleClubSeasonCheckout, parseClubSeasonCheckoutInput,
 type ClubSeasonStoredOrder, type ClubSeasonOrderStore } from '../lib/stripe/club-season-checkout-service.ts';
const now=Date.parse('2026-10-29T12:00:00Z');
const owner='11111111-1111-4111-8111-111111111111';
const order:ClubSeasonStoredOrder={id:'22222222-2222-4222-8222-222222222222',userId:owner,
 seasonId:'33333333-3333-4333-8333-333333333333',plan:'standard',state:'pending',sessionId:null,amountMinor:4990,
 createdAt:'2026-10-29T12:00:00Z',firstAttemptAt:'2026-10-29T12:00:00Z',checkoutExpiresAt:'2026-10-29T13:00:00Z',
 seasonStartsAt:'2026-08-01T00:00:00Z',seasonEndsAt:'2027-06-01T23:59:59.999Z'};
const checkout={sessionId:'cs_test_one',url:'https://checkout.stripe.com/c/pay/cs_test_one'};
function harness() {
 let persisted=structuredClone(order);
 const calls:string[]=[];
 const store:ClubSeasonOrderStore={
  async prepare(ownerId,plan) {calls.push('prepare');assert.equal(ownerId,owner);assert.equal(plan,'standard');return structuredClone(persisted);},
  async attach(ownerId,id,sessionId) {calls.push('attach');assert.equal(ownerId,owner);assert.equal(id,order.id);
   persisted={...persisted,sessionId};return structuredClone(persisted);}
 };
 return {calls,store,async createCheckout(o:ClubSeasonStoredOrder) {calls.push('provider');assert.equal(o.id,persisted.id);return checkout;}};
}
test('client selects supported plan with quote assertion, never authoritative price or identity',()=>{
 assert.deepEqual(parseClubSeasonCheckoutInput({plan:'standard',expectedAmountMinor:4990}),{plan:'standard',expectedAmountMinor:4990});
 for(const invalid of [null,[],{},'standard',{plan:'beta'},{plan:'pro'},{plan:'__proto__'},
  {plan:'standard',amount:1},{plan:'standard',userId:owner},{plan:'standard',seasonId:order.seasonId},
  {plan:'vip',previousPaidPlan:'master'}]) assert.equal(parseClubSeasonCheckoutInput(invalid),null);
});
test('persists before provider and attaches before returning checkout; retry reuses order and session',async()=>{
 const h=harness();const deps={store:h.store,createCheckout:async()=>{h.calls.push('provider');return checkout;}};
 const first=await beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},deps,now);
 assert.deepEqual(h.calls,['prepare','provider','attach']);
 assert.deepEqual(first,{orderId:order.id,sessionId:checkout.sessionId,url:checkout.url,testMode:true});
 const again=await beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},deps,now+31*60_000);
 assert.deepEqual(first,again);assert.deepEqual(h.calls,['prepare','provider','attach','prepare','provider','attach']);
});
test('unknown provider result leaves same pending order recoverable; no premature attachment',async()=>{
 const h=harness();let first=true;
 const deps={store:h.store,async createCheckout() {h.calls.push('provider');if(first){first=false;throw new Error('timeout');}return checkout;}};
 await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},deps,now),/timeout/);
 assert.deepEqual(h.calls,['prepare','provider']);
 assert.equal((await beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},deps,now+60_000)).orderId,order.id);
});
test('persistence failures do not expose a payment URL',async()=>{
 const h=harness();h.store.attach=async()=>{throw new Error('db unavailable');};
 await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},
  {store:h.store,createCheckout:async()=>checkout},now),/db unavailable/);
});
test('a stale or forged displayed amount never reaches Stripe and cannot change server price',async()=>{
 for(const expectedAmountMinor of [1,4000,8990]) {
  const h=harness();let providerCalls=0;
  await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor},
   {store:h.store,createCheckout:async()=>{providerCalls++;return checkout;}},now),/SEASON_QUOTE_CHANGED/);
  assert.equal(providerCalls,0);assert.deepEqual(h.calls,['prepare']);
 }
 for(const expectedAmountMinor of [null,'4990',0,-1,1.5,Number.MAX_SAFE_INTEGER+1])
  assert.equal(parseClubSeasonCheckoutInput({plan:'standard',expectedAmountMinor}),null);
 assert.equal(parseClubSeasonCheckoutInput({plan:'standard',expectedAmountMinor:4990,seasonId:order.seasonId}),null);
});
test('wrong owner, wrong plan, review and expired windows stop before provider',async()=>{
 for(const patch of [{userId:'44444444-4444-4444-8444-444444444444'},{plan:'vip' as const},
  {state:'review' as const},{checkoutExpiresAt:'2026-10-29T11:59:59Z'}]) {
  let providerCalls=0;
  const store:ClubSeasonOrderStore={prepare:async()=>({...order,...patch}),attach:async()=>order};
  await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},
   {store,createCheckout:async()=>{providerCalls++;return checkout;}},now));
  assert.equal(providerCalls,0);
 }
});
test('rejects live, swapped session and credential-bearing/foreign redirects',async()=>{
 for(const patch of [{sessionId:'cs_live_one'},{url:'https://evil.test/c/pay'},
  {url:'https://secret@checkout.stripe.com/c/pay'},{url:'invalid'}]) {
  const h=harness();await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},
   {store:h.store,createCheckout:async()=>({...checkout,...patch})},now),/SEASON_CHECKOUT_UNAVAILABLE/);
  assert.deepEqual(h.calls,['prepare']);
 }
 const h=harness();h.store.prepare=async()=>({...order,sessionId:'cs_test_previous'});
 await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},
  {store:h.store,createCheckout:async()=>checkout},now),/SEASON_CHECKOUT_UNAVAILABLE/);
});
test('attachment readback must match full identity, price and session',async()=>{
 for(const patch of [{userId:'other'},{seasonId:'other'},{plan:'vip' as const},{amountMinor:1},
  {sessionId:'cs_test_other'},{state:'review' as const},{previousPaidPlan:'master' as const}]) {
  const h=harness();h.store.attach=async()=>({...order,sessionId:checkout.sessionId,...patch});
  await assert.rejects(beginClubSeasonCheckout({ownerId:owner,plan:'standard',expectedAmountMinor:4990},
   {store:h.store,createCheckout:async()=>checkout},now),/SEASON_ORDER_CONTEXT_CHANGED/);
 }
});

const origin='https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app';
function request(body:unknown={plan:'standard',expectedAmountMinor:4990},headers:Record<string,string>={}) {
 return new Request(origin+'/api/touchline-fantasy/season-checkout',{method:'POST',
  headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
}
function routeDeps() {
 const calls:string[]=[];
 return {calls,configured:()=>true,async authenticate(){calls.push('auth');return owner;},
  async begin(userId:string,plan:string,expectedAmountMinor:number){calls.push('begin');assert.equal(userId,owner);assert.equal(plan,'standard');assert.equal(expectedAmountMinor,4990);
   return {orderId:order.id,sessionId:checkout.sessionId,url:checkout.url,testMode:true as const};}};
}
test('only a verified provisioned customer can start a season checkout',async()=>{
 const user={id:owner,email:'customer@example.test',email_confirmed_at:'2026-10-01T12:00:00Z',
  app_metadata:{touchline_arena_access_v1:true}};
 const owners=['admin@example.test'];
 assert.equal(authorizeClubSeasonCheckoutCustomer(null,owners),null);
 assert.equal(authorizeClubSeasonCheckoutCustomer(user,owners),owner);
 const d=routeDeps();
 const result=await handleClubSeasonCheckout(request(),{...d,
  authenticate:async()=>authorizeClubSeasonCheckoutCustomer(user,owners)});
 assert.equal(result.status,200);assert.deepEqual(d.calls,['begin']);
});
test('admin, unconfirmed and unprovisioned identities cannot create orders or payment sessions',async()=>{
 const user={id:owner,email:'customer@example.test',email_confirmed_at:'2026-10-01T12:00:00Z',
  app_metadata:{touchline_arena_access_v1:true}};
 for(const patch of [{id:''},{is_anonymous:true},{email:undefined},{email_confirmed_at:undefined},
  {app_metadata:{}},{app_metadata:{touchline_arena_access_v1:'true'}},
  {app_metadata:{},user_metadata:{touchline_arena_access_v1:true}},{email:' ADMIN@EXAMPLE.TEST '}]) {
  const d=routeDeps();
  const result=await handleClubSeasonCheckout(request(),{...d,
   authenticate:async()=>authorizeClubSeasonCheckoutCustomer({...user,...patch},['admin@example.test'])});
  assert.equal(result.status,403);assert.deepEqual(d.calls,[]);
  assert.deepEqual(await result.json(),{ok:false,error:'SEASON_CUSTOMER_ACCESS_REQUIRED'});
 }
 const d=routeDeps();
 assert.equal((await handleClubSeasonCheckout(request(),{...d,
  authenticate:async()=>authorizeClubSeasonCheckoutCustomer(user,[])})).status,403);
 assert.deepEqual(d.calls,[]);
});
test('request boundary verifies origin, gate and authenticated account before checkout',async()=>{
 const d=routeDeps();assert.equal((await handleClubSeasonCheckout(request({}, {origin:'https://evil.test'}),d)).status,403);
 assert.deepEqual(d.calls,[]);
 assert.equal((await handleClubSeasonCheckout(request(),{...d,configured:()=>false})).status,503);
 assert.deepEqual(d.calls,[]);
 assert.equal((await handleClubSeasonCheckout(request(),{...d,authenticate:async()=>null})).status,401);
 assert.deepEqual(d.calls,[]);
 const result=await handleClubSeasonCheckout(request(),d);
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await result.json(),{ok:true,orderId:order.id,sessionId:checkout.sessionId,url:checkout.url,testMode:true});
 assert.deepEqual(d.calls,['auth','begin']);
});
test('request body is bounded and rejects extra financial/account fields',async()=>{
 for(const req of [request({plan:'vip',amount:1}),request({plan:'standard',userId:'other'}),
  request({plan:'standard',ignored:'x'.repeat(500)}),request({plan:'standard'},{'content-type':'text/plain'}),
  request({plan:'standard'},{'content-length':'1000000'})]) {
  const d=routeDeps();assert.equal((await handleClubSeasonCheckout(req,d)).status,400);
  assert.deepEqual(d.calls,['auth']);
 }
});
test('provider/storage details and secrets never reach public error responses',async()=>{
 const d=routeDeps();const res=await handleClubSeasonCheckout(request(),{...d,begin:async()=>{throw new Error('sk_test_sensitive SQL detail');}});
 assert.equal(res.status,503);assert.deepEqual(await res.json(),{ok:false,error:'SEASON_CHECKOUT_UNAVAILABLE'});
 const conflict=await handleClubSeasonCheckout(request(),{...d,begin:async()=>{throw new Error('SEASON_ORDER_IN_PROGRESS');}});
 assert.equal(conflict.status,409);
});
