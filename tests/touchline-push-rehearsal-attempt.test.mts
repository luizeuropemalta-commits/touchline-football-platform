import assert from 'node:assert/strict';
import test from 'node:test';

const accountId='11111111-1111-4111-8111-111111111111';
const installationId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const accepted=()=>Response.json({ok:true,status:'provider_accepted'},{status:202});
async function harness(shared=new Map<string,string>()) {
  const {createPushRehearsalAttempt}=await import('../lib/touchlineArena/push-rehearsal-attempt.ts');
  let current=true,requests=0,storageFailure=false;
  let timeout:(()=>void)|undefined;
  let transport:typeof fetch=async()=>accepted();
  const controller=createPushRehearsalAttempt({accountId,installationId,
    isCurrent:()=>current,randomUUID:()=>requestId,
    storage:{getItem:(key:string)=>shared.get(key)??null,setItem:(key:string,value:string)=>{
      if(storageFailure)throw Error('storage unavailable');shared.set(key,value);
    }},
    scheduleTimeout:(callback:()=>void,ms:number)=>{assert.equal(ms,8000);timeout=callback;return()=>{timeout=undefined;};},
    request:async(input:RequestInfo|URL,init?:RequestInit)=>{
      requests++;assert.equal(input,'/api/notifications/rehearsal');
      assert.equal(init?.method,'POST');assert.equal(init?.credentials,'same-origin');
      assert.equal(new Headers(init?.headers).get('x-touchline-expected-account'),accountId);
      assert.deepEqual(JSON.parse(String(init?.body)),{installationId,requestId,explicitTestConsent:true});
      assert.equal(shared.size,1,'attempt persisted before HTTP');
      assert.equal(init?.signal?.aborted,false);
      return transport(input,init);
    },
  });
  return {controller,shared,requests:()=>requests,changeAccount:()=>{current=false;},
    failStorage:()=>{storageFailure=true;},transport:(value:typeof fetch)=>{transport=value;},
    timeout:()=>{assert.ok(timeout);timeout();},timerActive:()=>Boolean(timeout)};
}

test('diagnostic construction and invalid consent produce no storage or network effects',async()=>{
  const h=await harness();assert.equal(h.shared.size,0);assert.equal(h.requests(),0);
  for(const value of [false,undefined,null,'true',1])assert.equal(await h.controller.send(value),'invalid');
  assert.equal(h.shared.size,0);assert.equal(h.requests(),0);
});
test('one explicit attempt persists identity and reports provider acceptance, never device delivery',async()=>{
  const h=await harness();assert.equal(await h.controller.send(true),'provider_accepted');
  assert.equal(h.requests(),1);assert.equal(h.timerActive(),false);
  assert.equal(await h.controller.send(true),'blocked');
  const remount=await harness(h.shared);assert.equal(await remount.controller.send(true),'blocked');assert.equal(remount.requests(),0);
});
test('storage failure and stale account never send',async()=>{
  const storage=await harness();storage.failStorage();assert.equal(await storage.controller.send(true),'unconfirmed');assert.equal(storage.requests(),0);
  const stale=await harness();stale.changeAccount();assert.equal(await stale.controller.send(true),'unconfirmed');assert.equal(stale.requests(),0);assert.equal(stale.shared.size,0);
});
test('lost, malformed and rejected acknowledgements remain consumed after remount',async()=>{
  for(const response of [()=>Promise.reject(Error('lost response')),()=>Promise.resolve(Response.json({ok:true,status:'delivered'},{status:202})),
    ()=>Promise.resolve(Response.json({ok:true,status:'provider_accepted'},{status:200})),()=>Promise.resolve(Response.json({ok:false,status:'cooldown'},{status:429}))]){
    const h=await harness();h.transport(response);
    assert.equal(await h.controller.send(true),'unconfirmed');assert.equal(h.requests(),1);
    const remount=await harness(h.shared);assert.equal(await remount.controller.send(true),'blocked');assert.equal(remount.requests(),0);
  }
});
test('busy clicks, disposal and late ignored abort never accept or retry',async()=>{
  const h=await harness();let release!:(r:Response)=>void;let signal:AbortSignal|undefined;
  h.transport(async(_input,init)=>{signal=init?.signal??undefined;return new Promise(resolve=>{release=resolve;});});
  const pending=h.controller.send(true);assert.equal(await h.controller.send(true),'busy');
  h.controller.dispose();assert.equal(await pending,'unconfirmed');assert.equal(signal?.aborted,true);
  release(accepted());await Promise.resolve();assert.equal(h.requests(),1);assert.equal(await h.controller.send(true),'unconfirmed');assert.equal(h.timerActive(),false);
});
test('deadline spans JSON and late receipts after account switch cannot be accepted',async()=>{
  for(const mode of ['timeout','account'] as const){
    const h=await harness();let release!:(value:unknown)=>void;let entered!:()=>void;
    const reading=new Promise<void>(resolve=>{entered=resolve;});
    h.transport(async()=>({status:202,json:()=>new Promise(resolve=>{release=resolve;entered();})}) as Response);
    const pending=h.controller.send(true);await reading;
    if(mode==='timeout')h.timeout();else h.changeAccount();
    release({ok:true,status:'provider_accepted'});
    assert.equal(await pending,'unconfirmed');assert.equal(h.requests(),1);assert.equal(h.timerActive(),false);
  }
});

test('invalidation at final receipt settlement cannot escape as accepted',async()=>{
  const {createPushRehearsalAttempt}=await import('../lib/touchlineArena/push-rehearsal-attempt.ts');
  for(const mode of ['dispose','account','marker'] as const){
    let current=true,reads=0,marker:string|null=null,requests=0;
    const controller=createPushRehearsalAttempt({accountId,installationId,
      isCurrent:()=>current,randomUUID:()=>requestId,
      storage:{setItem:(_key,value)=>{marker=value;},getItem:()=>{
        if(++reads===3)queueMicrotask(()=>{
          if(mode==='dispose')controller.dispose();
          else if(mode==='account')current=false;
          else marker='changed';
        });
        return marker;
      }},
      request:async()=>{requests++;return accepted();},
    });
    assert.equal(await controller.send(true),'unconfirmed',mode);
    assert.equal(requests,1);
    assert.notEqual(marker,null);
  }
});
