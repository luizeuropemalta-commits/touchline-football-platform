import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import test from 'node:test';
import { createPushRehearsalStore } from '../lib/touchlineArena/push-rehearsal-store.ts';

const actor='11111111-1111-4111-8111-111111111111', installation='22222222-2222-4222-8222-222222222222';
const device='33333333-3333-4333-8333-333333333333', request='44444444-4444-4444-8444-444444444444', reservation='55555555-5555-4555-8555-555555555555';
const subscription={endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:createECDH('prime256v1').generateKeys().toString('base64url'),auth:Buffer.alloc(16,7).toString('base64url')}};
const row={id:device,user_id:actor,installation_id:installation,permission:'granted',push_subscription:subscription};

function harness() {
  const calls: {name:string;args:unknown}[]=[];
  let queryResult:{data:unknown;error:unknown}={data:structuredClone(row),error:null};
  let rpcResult: {data:unknown;error:unknown}|undefined;
  const builder = {
    select(columns:string){calls.push({name:'select',args:columns});return this;},
    eq(column:string,value:string){calls.push({name:'eq',args:[column,value]});return this;},
    async maybeSingle(){return queryResult;},
    abortSignal(signal:AbortSignal){calls.push({name:'device-signal',args:signal});return this;},
  };
  const client={
    from(name:string){calls.push({name:'table',args:name});return builder;},
    rpc(name:string,args:Record<string,unknown>){calls.push({name,args});return {abortSignal:async(signal:AbortSignal)=>{
      calls.push({name:'rpc-signal',args:signal});
      return rpcResult ?? {error:null,data:name.includes('reserve')?{status:'reserved',reservationId:reservation,actorId:args.p_actor,
        requestId:args.p_request,installationId:args.p_installation,deviceId:args.p_device,fingerprint:args.p_fingerprint,
        expiresAt:'2026-10-03T01:00:25+01:00'}:true};
    }};},
  };
  const store=createPushRehearsalStore(client as never);
  return {store,calls,setQuery:(value:typeof queryResult)=>{queryResult=value;},setRpc:(value:typeof rpcResult)=>{rpcResult=value;}};
}

async function initial(h:ReturnType<typeof harness>,signal=new AbortController().signal){
  const loaded=await h.store.loadOwnedDevice(actor,installation,signal);
  assert.equal(loaded?.deviceId,device);
  const {touchlinePushSubscriptionFingerprint}=await import('../lib/touchlineArena/push-subscription-fingerprint.ts');
  const fingerprint=touchlinePushSubscriptionFingerprint(loaded!.registration)!;
  return {actorId:actor,installationId:installation,deviceId:device,requestId:request,fingerprint,expiresAt:'2026-10-03T00:00:25.000Z'};
}

test('owned read scopes both keys; reserve carries exact snapshot and normalizes SQL timestamp',async()=>{
  const h=harness(),signal=new AbortController().signal;
  const input=await initial(h,signal);
  const result=await h.store.reserve(input,signal);
  assert.equal(result.status,'reserved');
  if(result.status==='reserved') assert.deepEqual(result,{status:'reserved',reservationId:reservation,...input});
  assert.ok(h.calls.some(c=>c.name==='eq'&&JSON.stringify(c.args)===JSON.stringify(['user_id',actor])));
  assert.ok(h.calls.some(c=>c.name==='eq'&&JSON.stringify(c.args)===JSON.stringify(['installation_id',installation])));
  const rpc=h.calls.find(c=>c.name==='touchline_reserve_push_rehearsal')!;
  assert.deepEqual((rpc.args as Record<string,unknown>).p_subscription,subscription);
  assert.ok(h.calls.filter(c=>c.name.endsWith('-signal')).every(c=>c.args===signal));
});

test('no initial matching device snapshot means no RPC',async()=>{
  const h=harness(),signal=new AbortController().signal;
  const input=await initial(h,signal);
  for(const changed of [{...input,actorId:request},{...input,deviceId:request},{...input,fingerprint:'sha256:wrong'}]) {
    assert.equal((await h.store.reserve(changed,signal)).status,'unavailable');
  }
  const other=harness();
  assert.equal((await other.store.reserve(input,signal)).status,'unavailable');
  assert.equal(h.calls.filter(c=>c.name==='touchline_reserve_push_rehearsal').length,0);
});

test('uncertain, mismatched or invalid timestamp receipts never authorize transport',async()=>{
  const h=harness(),signal=new AbortController().signal,input=await initial(h,signal);
  for(const response of [{data:null,error:{message:'secret'}},{data:null,error:null},{data:{status:'reserved'},error:null},
    {data:{status:'reserved',reservationId:reservation,...input,actorId:request},error:null},
    {data:{status:'reserved',reservationId:reservation,...input,expiresAt:'not-time'},error:null},
    {data:{status:'reserved',reservationId:reservation,...input,expiresAt:'2026-10-03T00:01:00Z'},error:null}]) {
    h.setRpc(response);assert.equal((await h.store.reserve(input,signal)).status,'unknown');
  }
  for(const status of ['duplicate','cooldown','unavailable'] as const){h.setRpc({error:null,data:{status}});assert.equal((await h.store.reserve(input,signal)).status,status);}
});

test('owner mismatch, invalid subscription and read errors cannot leave reusable cached authority',async()=>{
  const h=harness(),signal=new AbortController().signal,input=await initial(h,signal);
  for(const response of [{data:{...row,user_id:request},error:null},{data:{...row,push_subscription:{}},error:null},{data:null,error:null}]){
    h.setQuery(response);assert.equal(await h.store.loadOwnedDevice(actor,installation,signal),null);
    assert.equal((await h.store.reserve(input,signal)).status,'unavailable');
  }
  h.setQuery({data:null,error:{message:'secret'}});
  await assert.rejects(h.store.loadOwnedDevice(actor,installation,signal),/device-read-unconfirmed/);
});

test('finish only trusts boolean true, binds all identifiers and never retries',async()=>{
  const h=harness(),signal=new AbortController().signal;
  const input={reservationId:reservation,actorId:actor,requestId:request,outcome:'unknown' as const};
  assert.equal(await h.store.finish(input,signal),true);
  assert.deepEqual(h.calls.find(c=>c.name==='touchline_finish_push_rehearsal')?.args,{p_reservation:reservation,p_actor:actor,p_request:request,p_outcome:'unknown'});
  for(const value of [false,null,'true',{}]){h.setRpc({data:value,error:null});assert.equal(await h.store.finish(input,signal),false);}
  h.setRpc({data:true,error:{message:'secret'}});assert.equal(await h.store.finish(input,signal),false);
});

test('already aborted calls perform no database operation',async()=>{
  const h=harness(),controller=new AbortController();controller.abort();
  await assert.rejects(h.store.loadOwnedDevice(actor,installation,controller.signal));
  assert.equal(h.calls.length,0);
});
