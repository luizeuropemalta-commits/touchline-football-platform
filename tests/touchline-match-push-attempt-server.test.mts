import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const js=ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-attempt-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const claim={id:'11111111-1111-4111-8111-111111111111',leaseToken:'22222222-2222-4222-8222-222222222222'};
const attemptId='33333333-3333-4333-8333-333333333333';

test('attempt RPC adapter uses one SDK POST and discriminated completion, never retries',async()=>{
  for(const mode of ['true','false','invalid','error','lost','aborted','disabled','bad-id','unconfigured']) {
    for(const operation of ['reserve','reserved','unreserved','illegal-unreserved']) {
      const controller=new AbortController();
      if(mode==='aborted')controller.abort();
      const calls:Array<{url:string;method:unknown;body:unknown;signal:unknown}>=[];
      let factoryCalls=0;
      const admin=createClient('https://synthetic.example.test','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
        calls.push({url:String(url),method:init?.method,body:JSON.parse(String(init?.body)),signal:init?.signal});
        if(mode==='lost')throw new Error('synthetic connection lost');
        return new Response(mode==='invalid'?'null':mode==='error'?'{}':mode==='false'?'false':'true',{status:mode==='error'?520:200,headers:{'content-type':'application/json'}});
      }}});
      const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
      vm.runInNewContext(js,{exports,require:(name:string)=>{
        if(name==='server-only')return {};
        if(name==='@/lib/supabase/admin')return {createAdminClient:()=>{factoryCalls++;return mode==='unconfigured'?null:admin;}};
        throw new Error('unexpected import '+name);
      },Error});
      const supplied={...claim,id:mode==='bad-id'?'bad':claim.id};
      const options={enabled:mode!=='disabled',signal:controller.signal};
      const blocked=['aborted','disabled','bad-id'].includes(mode)||operation==='illegal-unreserved';
      let value:unknown,error:unknown;
      try {
        value=operation==='reserve'?await exports.reserveMatchPushAttempt(supplied,attemptId,options)
          :await exports.finishMatchPushAttempt(supplied,operation==='reserved'||operation==='illegal-unreserved'?'provider_accepted':'cancelled',operation==='reserved'?{kind:'reserved',attemptId}:{kind:'unreserved'},options);
      } catch(caught){error=caught;}
      assert.equal(calls.length,blocked||mode==='unconfigured'?0:1,`${mode}/${operation}`);
      if(blocked)assert.equal(factoryCalls,0);
      if(operation==='reserve') {
        if(blocked||['unconfigured','invalid','error','lost'].includes(mode))assert.match(String(error),/PUSH_RESERVATION_UNCONFIRMED/);
        else {assert.equal(error,undefined);assert.equal(value,mode==='true');}
      } else {assert.equal(error,undefined);assert.equal(value,!blocked&&mode==='true');}
      if(calls.length) {
        const expectedName=operation==='reserve'?'touchline_reserve_match_push_attempt':operation==='reserved'?'touchline_finish_match_push_attempt':'touchline_finish_match_push';
        assert.equal(calls[0].url,'https://synthetic.example.test/rest/v1/rpc/'+expectedName);
        assert.equal(calls[0].method,'POST');
        assert.equal(calls[0].signal,controller.signal);
        assert.deepEqual(calls[0].body,{p_id:claim.id,p_lease_token:claim.leaseToken,
          ...(operation==='unreserved'?{}:{p_attempt_id:attemptId}),...(operation==='reserve'?{}:{p_state:operation==='reserved'?'provider_accepted':'cancelled'})});
      }
    }
  }
});

test('attempt adapter rejects invalid ownership and late or contradictory success receipts',async()=>{
  for(const mode of ['bad-token','bad-nonce','unknown-reference','invalid-state','late-abort','data-and-error','failed','uncertain']) {
    for(const operation of ['reserve','finish']) {
      const controller=new AbortController();
      const calls:Array<{name:string;args:unknown}>=[];
      let factoryCalls=0;
      const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
      vm.runInNewContext(js,{exports,require:(name:string)=>{
        if(name==='server-only')return {};
        if(name==='@/lib/supabase/admin')return {createAdminClient:()=>{factoryCalls++;return {rpc:(rpcName:string,args:unknown)=>{
          calls.push({name:rpcName,args});return {abortSignal:async()=>{
            if(mode==='late-abort')controller.abort();
            return {data:true,error:mode==='data-and-error'?{message:'private diagnostic'}:null};
          }};
        }};}};
        throw new Error('unexpected import '+name);
      },Error});
      const supplied={...claim,leaseToken:mode==='bad-token'?'invalid':claim.leaseToken};
      const suppliedNonce=mode==='bad-nonce'?'invalid':attemptId;
      const reference=mode==='unknown-reference'?{kind:'unknown'}:{kind:'reserved',attemptId:suppliedNonce};
      const state=mode==='invalid-state'?'delivered':mode==='failed'||mode==='uncertain'?mode:'provider_accepted';
      const blocked=['bad-token','bad-nonce'].includes(mode)||(operation==='finish'&&['unknown-reference','invalid-state'].includes(mode));
      let value:unknown,error:unknown;
      try {value=operation==='reserve'?await exports.reserveMatchPushAttempt(supplied,suppliedNonce,{enabled:true,signal:controller.signal})
        :await exports.finishMatchPushAttempt(supplied,state,reference,{enabled:true,signal:controller.signal});}
      catch(caught){error=caught;}
      assert.equal(calls.length,blocked?0:1,`${mode}/${operation}`);
      assert.equal(factoryCalls,blocked?0:1);
      const refused=blocked||mode==='late-abort'||mode==='data-and-error';
      if(operation==='reserve'&&refused)assert.equal(String(error),'Error: PUSH_RESERVATION_UNCONFIRMED');
      else {assert.equal(error,undefined);assert.equal(value,!refused);}
      if(operation==='finish'&&calls.length)assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{
        name:'touchline_finish_match_push_attempt',args:{p_id:claim.id,p_lease_token:claim.leaseToken,p_attempt_id:attemptId,p_state:state},
      });
    }
  }
});
