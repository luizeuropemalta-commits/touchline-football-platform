import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createECDH } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';
import * as registration from '../lib/touchlineArena/push-device-contract.ts';
import * as fingerprint from '../lib/touchlineArena/push-subscription-fingerprint.ts';
import * as quiet from '../lib/touchlineArena/notification-quiet-hours.ts';
import * as notification from '../lib/touchlineArena/match-event-notification.ts';
import * as window from '../lib/touchlineArena/match-push-live-event-window.ts';

const js = ts.transpileModule(readFileSync(new URL('../lib/football-data/match-push-producer.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const fixture='11111111-1111-4111-8111-111111111111', device='22222222-2222-4222-8222-222222222222', user='33333333-3333-4333-8333-333333333333';
const instant=new Date('2026-10-02T01:00:00Z'), time=instant.toISOString(), hash='sha256:'+'a'.repeat(64);
const key=createECDH('prime256v1'); key.setPrivateKey(Buffer.alloc(32,1));
const subscription={endpoint:'https://push.example.test/synthetic',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
const baseline={providerId:'77',fixtureId:'8',typeId:'1',started:1000,countsFrom:0,sortOrder:1,minutes:20,seconds:0,ticking:true,hasTimer:true};
const current={...baseline,minutes:23};
type Row=Record<string,unknown>;
type Response={data:unknown;count?:number;error?:unknown};
function harness(options:{baselined?:boolean;hold?:string;rpcError?:boolean;badCount?:boolean;revisionDrift?:boolean;wrongSource?:boolean;legacyPoints?:boolean;suppressFirst?:boolean;firstStatus?:string}={}) {
  const event={provider:'sportmonks',providerId:'9',fixtureId:'8',periodId:'77',minute:22,status:'recorded'};
  const tables:Record<string,Row[]>={
    football_fixtures:[{id:fixture,provider:'sportmonks',provider_fixture_id:'8'}],
    touchline_fixture_alert_subscriptions:[{fixture_id:fixture,user_id:user,created_at:time}],
    notification_devices:[{id:device,user_id:user,installation_id:device,permission:'granted',push_subscription:subscription}],
    notification_preferences:[{user_id:user,channels:{push:true},settings:{goalsAndEvents:true},frequency:'realtime',explicit_consent_at:time,quiet_hours:{enabled:false,start:'22:00',end:'07:00',timezone:'UTC'}}],
    football_fantasy_fixture_feeds:[{provider:'sportmonks',provider_fixture_id:'8',fixture_payload:{provider:'sportmonks',providerId:'8',providerStateId:'2',periods:[current]},events_payload:[event],last_synced_at:time}],
    touchline_social_confirmed_event_observations:[{fixture_provider_id:'8',event_provider_id:'9',confirmation_state:'CONFIRMED',last_observed_at:time}],
  };
  const reads:{table:string;operations:unknown[][]}[]=[], writes:{name:string;args:{p_request:Row}}[]=[];
  const sourceCalls:unknown[][]=[]; let revisionCalls=0;
  const timers=new Map<number,()=>void>(); let elapsed=0;
  let release!:(value:Response)=>void, reject!:(reason:Error)=>void;
  const pending=new Promise<Response>((resolve,fail)=>{release=resolve;reject=fail;});
  const admin={from(table:string){
    assert.ok(table in tables); const operations:unknown[][]=[]; reads.push({table,operations});
    const q:Record<string,unknown>={};
    for(const method of ['select','eq','in','limit']) q[method]=(...args:unknown[])=>{operations.push([method,...args]);return q;};
    q.abortSignal=()=>options.hold===table?pending:Promise.resolve({data:tables[table],count:tables[table].length+(options.badCount?1:0),error:null});
    return q;
  },rpc(name:string,args:{p_request:Row}){
    assert.equal(name,'touchline_match_push_enrollment'); writes.push({name,args});
    return {abortSignal:()=>options.hold==='rpc'?pending:Promise.resolve(options.rpcError?{error:{message:'PRIVATE'},data:null}:{data:
      options.firstStatus&&args.p_request.deviceId===device?{status:options.firstStatus}:args.p_request.operation==='prepare'?{status:options.baselined?'baselined':'ready',generation:'1',baseline,current}:options.suppressFirst&&args.p_request.eventId==='9'?{status:'suppressed'}:{status:'stored-or-existing',id:device},error:null})};
  }};
  const source={ok:true,data:{sourceProvenance:'PERSISTED_VERIFIED_CONFIRMED_EVENT',fixtureId:'8',eventId:'9',home:{name:'Arsenal'},away:{name:'Chelsea'},
    score:{home:1,away:0},event:{kind:'goal',playerName:'Saka',minute:22,extraMinute:null},matchRating:8.2,touchlinePoints:options.legacyPoints?5:8.2,
    sourceChecksum:hash,sourceRevisionChecksum:hash,sourceRevisionManifest:{'fixture-provider:8':1},sourceSnapshotAt:time,contentType:'GOAL_CONFIRMED'},
    evidence:{canonicalFixtureId:options.wrongSource?device:fixture,fixtureProviderId:'8',eventProviderId:'9',clockRevision:1,
      eventSyncedAt:time,settlementSyncedAt:time,fixtureUpdatedAt:time,lastObservedAt:time}};
  const dependencies:Record<string,unknown>={'server-only':{},
    '../touchlineArena/social-confirmed-event-draft-server':{readTouchlineConfirmedEventPushSource:async(...args:unknown[])=>{sourceCalls.push(args);return {...source,data:{...source.data,eventId:args[1]},evidence:{...source.evidence,eventProviderId:args[1]}};}},
    '../touchlineArena/social-source-revision-server':{readTouchlineSocialSourceRevisionCheckpoint:async()=>{revisionCalls++;return {clockRevision:options.revisionDrift&&revisionCalls>1?2:1,checksum:hash,manifest:{}};}},
    '../touchlineArena/match-push-source-freshness':freshness,'../touchlineArena/push-device-contract':registration,
    '../touchlineArena/push-subscription-fingerprint':fingerprint,'../touchlineArena/notification-quiet-hours':quiet,
    '../touchlineArena/match-event-notification':notification,'../touchlineArena/match-push-live-event-window':window};
  const exports:{runMatchPushProducer?:(input:unknown)=>Promise<Row>}={};
  vm.runInNewContext(js,{exports,Buffer,AbortController,performance:{now:()=>elapsed},
    setTimeout(callback:()=>void,ms:number){assert.equal(ms,10000);timers.set(1,callback);return 1;},clearTimeout(id:number){timers.delete(id);},
    require(name:string){assert.ok(name in dependencies,name);return dependencies[name];}});
  const controller=new AbortController();
  return {tables,reads,writes,sourceCalls,timers,release,reject,controller,
    timeout(){elapsed=10000;const callback=timers.get(1);assert.ok(callback);callback();},
    run:(patch:Record<string,unknown>={})=>exports.runMatchPushProducer!({admin,fixtureProviderIds:['8'],enabled:true,signal:controller.signal,locale:'en-GB',now:()=>instant,
      policy:{maximumEventLagSeconds:120,maximumSourceAgeSeconds:60,sourceAgeMs:Object.fromEntries(freshness.MATCH_PUSH_SOURCE_TIMES.map(k=>[k,60000]))},...patch})};
}
async function drainUntil(predicate:()=>boolean){for(let i=0;i<50&&!predicate();i++)await Promise.resolve();assert.ok(predicate());}

test('disabled/invalid policy and pre-abort do not read or write',async()=>{
  for(const patch of [{enabled:undefined},{enabled:false},{policy:{}},{fixtureProviderIds:[fixture]}]){
    const h=harness();await h.run(patch);assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
  }
  const h=harness();h.controller.abort();assert.equal((await h.run()).status,'aborted');assert.equal(h.reads.length,0);
});
test('first encounter baselines only; valid ready path uses real window/formatter/policy',async()=>{
  const first=harness({baselined:true});const baselineResult=await first.run();assert.equal(baselineResult.baselined,1);assert.equal(first.writes.length,1);assert.equal(first.sourceCalls.length,0);
  const h=harness();const result=await h.run({fixtureProviderIds:['8','8']});
  assert.equal(result.status,'completed');assert.equal(result.storedOrExisting,1);assert.equal(h.writes.length,2);
  assert.deepEqual(h.sourceCalls,[['8','9']]);
  const request=h.writes[1].args.p_request;
  assert.equal(request.operation,'admit');assert.equal(request.generation,'1');assert.equal(request.fixtureId,fixture);assert.equal(request.eventId,'9');
  assert.equal(request.sourceChecksum,hash);assert.equal(request.sourceSnapshotAt,time);assert.equal(request.locale,'en-GB');
  assert.equal(request.subscriptionFingerprint,fingerprint.touchlinePushSubscriptionFingerprint({installationId:device,permission:'granted',subscription}));
  assert.equal(request.expiresAt,'2026-10-02T01:01:00.000Z');assert.ok(!JSON.stringify(request).includes('historyComplete'));
  assert.ok(h.reads.every(r=>r.operations.some(op=>op[0]==='select'&&(op[2] as Row)?.count==='exact')));
  assert.doesNotMatch(JSON.stringify(result),/Saka|endpoint|fixtureId|sourceChecksum/);assert.equal(h.timers.size,0);
});
test('source mismatch, old scoring and old minute never admit',async()=>{
  for(const options of [{wrongSource:true},{legacyPoints:true}]) {const h=harness(options);assert.equal((await h.run()).storedOrExisting,0);assert.equal(h.writes.length,1);}
  const h=harness();(h.tables.football_fantasy_fixture_feeds[0].events_payload as Row[])[0].minute=20;
  await h.run();assert.equal(h.writes.length,1);assert.equal(h.sourceCalls.length,0);
});
test('an excluded event does not prevent a later eligible event from being admitted',async()=>{
  const h=harness({suppressFirst:true});
  const events=h.tables.football_fantasy_fixture_feeds[0].events_payload as Row[];
  events.push({...events[0],providerId:'10'});
  h.tables.touchline_social_confirmed_event_observations.push({...h.tables.touchline_social_confirmed_event_observations[0],event_provider_id:'10'});
  const result=await h.run();
  assert.equal(result.status,'completed');
  assert.equal(result.suppressed,1);
  assert.equal(result.storedOrExisting,1);
  assert.deepEqual(h.writes.filter(w=>w.args.p_request.operation==='admit').map(w=>w.args.p_request.eventId),['9','10']);
});
test('one unavailable device pair does not starve the next authorized device',async()=>{
  const h=harness({firstStatus:'unavailable'});
  h.tables.notification_devices.push({...h.tables.notification_devices[0],id:'55555555-5555-4555-8555-555555555555'});
  const result=await h.run();
  assert.equal(result.storedOrExisting,1);
  assert.equal(h.writes.filter(w=>w.args.p_request.operation==='prepare').length,2);
});
test('a stale global source stops subsequent devices while stale pair baseline does not',async()=>{
  for(const firstStatus of ['stale-source','stale-baseline']) {
    const h=harness({firstStatus});
    h.tables.notification_devices.push({...h.tables.notification_devices[0],id:'55555555-5555-4555-8555-555555555555'});
    const result=await h.run();
    assert.equal(result.status,firstStatus==='stale-source'?'unavailable':'completed');
    assert.equal(result.storedOrExisting,firstStatus==='stale-source'?0:1);
    assert.equal(h.writes.filter(w=>w.args.p_request.operation==='prepare').length,firstStatus==='stale-source'?1:2);
  }
});
test('count/identity/revision/consent and work caps fail before admission',async()=>{
  for(const h of [harness({badCount:true}),harness({revisionDrift:true})]) {assert.equal((await h.run()).status,'unavailable');assert.equal(h.writes.length,0);}
  const duplicate=harness();duplicate.tables.football_fixtures.push({...duplicate.tables.football_fixtures[0]});await duplicate.run();assert.equal(duplicate.writes.length,0);
  const optout=harness();optout.tables.notification_preferences[0].channels={push:false};await optout.run();assert.equal(optout.writes.length,0);
  const capped=harness();assert.equal((await capped.run({fixtureProviderIds:Array.from({length:11},(_,i)=>String(i+1))})).status,'limit-exceeded');assert.equal(capped.reads.length,0);
});
test('unknown RPC is not retried and private errors are sanitized',async()=>{
  const h=harness({rpcError:true});const result=await h.run();assert.equal(result.status,'unconfirmed');assert.equal(h.writes.length,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('ignored abort/timeout cannot progress late reads or unknown writes',async()=>{
  const read=harness({hold:'football_fixtures'});const waiting=read.run();await drainUntil(()=>read.reads.length===1);read.timeout();
  assert.equal((await waiting).status,'timed-out');read.release({data:read.tables.football_fixtures,count:1});await Promise.resolve();await Promise.resolve();assert.equal(read.writes.length,0);
  const write=harness({hold:'rpc'});const writing=write.run();await drainUntil(()=>write.writes.length===1);write.controller.abort();
  assert.equal((await writing).status,'unconfirmed');write.release({data:{status:'ready',generation:'1',baseline,current}});
  await Promise.resolve();await Promise.resolve();assert.equal(write.writes.length,1);assert.equal(write.sourceCalls.length,0);
});
