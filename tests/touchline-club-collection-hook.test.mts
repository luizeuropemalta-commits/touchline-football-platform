import * as coachLifecycle from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import * as coachRecovery from "../lib/touchlineFantasy/club-coach-browser-recovery.ts";
import { getClubCollectionBudgetCopy } from "../lib/touchlineFantasy/market-budget-i18n.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as authority from "../lib/touchlineFantasy/club-command-authority.ts";
import * as budget from "../lib/touchlineFantasy/club-initial-budget.ts";
import * as release from "../lib/touchlineFantasy/club-release.ts";
import { createClubReleaseBrowserRecovery } from "../lib/touchlineFantasy/club-release-browser-recovery.ts";
import type { ClubReleaseRecoveryReference } from "../lib/touchlineFantasy/club-release-recovery.ts";
import * as bootstrap from "../lib/touchlineFantasy/club-collection-bootstrap.ts";
import type { ClubCollectionReadResult } from "../lib/touchlineFantasy/club-collection-read-server.ts";
import type { useClubCollection } from "../components/touchline/fantasy/useClubCollection.ts";

type PendingRequest = {
  path: string; options: RequestInit;
  resolve: (value: {response:{ok:boolean;status:number};payload:{ok:boolean;state:acquisition.ClubAcquisitionState|null;accountId:string;seasonId:string;initialBudget?:unknown;releaseAvailable?:boolean;coachLifecycleAvailable?:boolean;result?:unknown;receipt?:unknown;replayed?:boolean;error?:string}}) => void;
  reject: (error: Error) => void;
};
type EffectSlot = {deps: unknown[]; cleanup?: void | (() => void)};

// Exercise the actual hook's request ordering without a DOM or remote account.
function fixture(development = false, initialRead?: ClubCollectionReadResult,
  durable = new Map<string, ClubReleaseRecoveryReference>(), journalFaults: { opensRemaining: number; constructionsRemaining?: number } = { opensRemaining: 0 }) {
  const diagnostics: unknown[][] = [];
  const slots: unknown[] = [], effects: (() => void)[] = [], requests: PendingRequest[] = [], published: (acquisition.ClubAcquisitionState | null)[] = [];
  let cursor = 0;
  const changed = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || a.some((v,i)=>v!==b[i]);
  const react = {
    useState(initial: unknown) { const i=cursor++; if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;
      return [slots[i], (value: unknown) => { slots[i]=typeof value==="function"?value(slots[i]):value; }]; },
    useRef(initial: unknown) { const i=cursor++; return slots[i]??(slots[i]={current:initial}); },
    useCallback(fn: unknown,deps: unknown[]) {const i=cursor++; const prior=slots[i] as {deps:unknown[];fn:unknown}|undefined;
      if(changed(prior?.deps,deps))slots[i]={deps,fn}; return (slots[i] as {fn:unknown}).fn;},
    useEffect(fn:()=>void|(()=>void),deps:unknown[]) {const i=cursor++;const prior=slots[i] as EffectSlot|undefined;
      if(changed(prior?.deps,deps)){ const next:EffectSlot={deps};slots[i]=next;effects.push(()=>{prior?.cleanup?.();next.cleanup=fn();}); }},
  };
  const budgets: (budget.ClubInitialBudget|null)[]=[];
  const statuses: string[]=[];
  const context={publish:(state:acquisition.ClubAcquisitionState|null)=>published.push(state),publishInitialBudget:(value:budget.ClubInitialBudget|null)=>budgets.push(value),publishVerificationStatus:(value:string)=>statuses.push(value)};
  const exports = {} as {useClubCollection:typeof useClubCollection};
  const source=ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/useClubCollection.ts",import.meta.url),"utf8"),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const coachStorageData = new Map<string,string>();
  const coachStorage = {getItem:(key:string)=>coachStorageData.get(key)??null,setItem:(key:string,value:string)=>{coachStorageData.set(key,value);},removeItem:(key:string)=>{coachStorageData.delete(key);}};
  runInNewContext(source,{exports,window:{sessionStorage:coachStorage},AbortController,crypto:{randomUUID},process:{env:{NODE_ENV:development?"development":"test"}},console:{warn:(...args:unknown[])=>diagnostics.push(args)},require:(name:string)=>{
    if(name==="react")return react;
    if(name.includes("club-coach-browser-recovery"))return {createClubCoachBrowserRecovery:(context:authority.ClubCommandAuthority,store:Storage)=>coachRecovery.createClubCoachBrowserRecovery(context,store,
      (async(path,options)=>{ const result=await new Promise<Parameters<PendingRequest["resolve"]>[0]>((resolve,reject)=>requests.push({path:String(path),options:options??{},resolve,reject}));
        return Response.json(result.payload,{status:result.response.status}); }) as typeof fetch)};
    if (name.includes("market-budget-i18n")) return { getClubCollectionBudgetCopy };
    if(name.includes("club-acquisition"))return acquisition;
    if(name.includes("club-command-authority"))return authority;
    if(name.includes("club-initial-budget"))return budget;
    if(name.includes("club-release-browser-recovery")) return {createClubReleaseBrowserRecovery:(context: authority.ClubCommandAuthority)=>{
      if((journalFaults.constructionsRemaining??0)>0){journalFaults.constructionsRemaining!--;throw new Error("construction unavailable");}
      return createClubReleaseBrowserRecovery(context,{
      now:()=>1,
      open:async()=>{if(journalFaults.opensRemaining>0){journalFaults.opensRemaining--;throw new Error("journal unavailable");}return ({
        append:async(ref:ClubReleaseRecoveryReference)=>{durable.set(ref.idempotencyKey,ref);return "inserted" as const;},
        list:async(scope:authority.ClubCommandAuthority)=>[...durable.values()].filter(ref=>authority.clubCommandMatchesAuthority(scope,ref.expectedAccountId,ref.expectedSeasonId)),
        remove:async(ref:ClubReleaseRecoveryReference)=>{durable.delete(ref.idempotencyKey);},close:()=>{},
      });},
      read:(reference:ClubReleaseRecoveryReference,signal:AbortSignal)=>new Promise((resolve,reject)=>requests.push({
        path:"/api/touchline-fantasy/collection/release/recovery",options:{method:"GET",signal,headers:{"X-Touchline-Release-Reference":JSON.stringify(reference)}},
        resolve:value=>value.response.ok?resolve(value.payload.result):reject(new Error("recovery unavailable")),reject,
      })),
    });}};
    if(name.includes("club-release"))return release;
    if(name.includes("club-collection-bootstrap"))return bootstrap;
    if(name.includes("ClubCollectionContext"))return {useConfirmedClubCollection:()=>context};
    if(name.includes("club-collection-request")) {
      const requestClubCollection=(path:string,options:RequestInit)=>new Promise<Parameters<PendingRequest["resolve"]>[0]>((resolve,reject)=>requests.push({path,options,resolve,reject}));
      return {requestClubCollection,readClubCollection:(signal:AbortSignal)=>requestClubCollection("/api/touchline-fantasy/collection",{method:"GET",cache:"no-store",signal})};
    }
    throw new Error(name);
  }});
  return {requests,published,budgets,statuses,diagnostics,durable,unmount:()=>{for(const slot of slots)(slot as EffectSlot|undefined)?.cleanup?.();},render:(locale="pt-BR")=>{cursor=0;const hook=exports.useClubCollection(true,locale,{expectedAccountId:accountId,expectedSeasonId:initial.seasonId},undefined,initialRead);while(effects.length)effects.shift()!();return hook;}};
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const accountId="30000000-0000-4000-8000-000000000001";
const initial:acquisition.ClubAcquisitionState={revision:0,seasonId:"30000000-0000-4000-8000-000000000003",plan:"standard",balanceEur:495_000_000,
  coach:{id:"coach",tier:"ruby-red",valueEur:5_000_000},players:[],receipts:[]};
const success=(request:PendingRequest,state:acquisition.ClubAcquisitionState,owner=accountId)=>request.resolve({response:{ok:true,status:200},payload:{ok:true,state,accountId:owner,seasonId:state.seasonId}});

test("verification status follows pending, stale failure and recovery without replacing last balance",async()=>{
  const h=fixture();h.render();assert.equal(h.statuses.at(-1),"pending");
  success(h.requests[0],initial);await tick();assert.equal(h.statuses.at(-1),"confirmed");
  h.render().revalidate();h.render();assert.equal(h.statuses.at(-1),"pending");
  h.requests[1].reject(new Error("offline"));await tick();assert.equal(h.statuses.at(-1),"unavailable");
  assert.equal(h.render().state?.balanceEur,initial.balanceEur);
  h.render().reload();h.render();success(h.requests[2],initial);await tick();assert.equal(h.statuses.at(-1),"confirmed");
  const operation=h.render().purchase("player",{area:"outside",slot:0});assert.equal(h.statuses.at(-1),"pending");
  h.requests[3].reject(new Error("unknown outcome"));await operation;assert.equal(h.statuses.at(-1),"unavailable");
  assert.equal(h.render().state?.balanceEur,initial.balanceEur);
});

test("SSR confirmed collection displays immediately; failed background verification revokes authority without erasing it", async()=>{
  const h=fixture(false,{status:"confirmed",accountId,seasonId:initial.seasonId,state:initial,initialBudget:null,releaseAvailable:false});
  let hook=h.render();assert.equal(hook.ready,false,"journal check precedes write authority");assert.deepEqual(hook.state,initial);assert.equal(h.requests.length,1);
  h.requests[0].reject(new Error("offline"));await tick();hook=h.render();
  assert.equal(hook.ready,false);assert.deepEqual(hook.state,initial);assert.equal(hook.releaseAvailable,false);
});

test("unavailable or cross-owner SSR bootstrap never becomes empty-club authority",()=>{
  for(const value of [{status:"unavailable",error:"CLUB_STORAGE_UNAVAILABLE",httpStatus:503},
    {status:"confirmed",accountId:"another",seasonId:initial.seasonId,state:initial,initialBudget:null,releaseAvailable:true}] as ClubCollectionReadResult[]) {
    const hook=fixture(false,value).render();assert.equal(hook.ready,false);assert.equal(hook.state,null);assert.equal(hook.canInitialize,false);
  }
});

test("SSR allowance requires verified empty state and a delayed read cannot overwrite a purchase",async()=>{
  const allowance=fixture(false,{status:"confirmed",accountId,seasonId:initial.seasonId,state:null,initialBudget:{plan:"vip",balanceEur:3_000_000_000},releaseAvailable:false});
  assert.equal(allowance.render().canInitialize,false);await tick();assert.equal(allowance.render().canInitialize,true);
  const h=fixture(false,{status:"confirmed",accountId,seasonId:initial.seasonId,state:initial,initialBudget:null,releaseAvailable:false});
  h.render();await tick();
  const operation=h.render().purchase("player",{area:"outside",slot:0});
  const next={...initial,revision:1,balanceEur:490_000_000};success(h.requests[1],next);await operation;
  success(h.requests[0],initial);await tick();assert.equal(h.render().state?.balanceEur,490_000_000);
});

test("known old club-cap rejection is not presented as a failed squad read and never changes money", async()=>{
  for(const locale of ["pt-BR","en-GB"]) {
    const h=fixture(true);h.render(locale);success(h.requests[0],initial);await tick();
    const operation=h.render(locale).purchase("player",{area:"outside",slot:0});
    h.requests[1].resolve({response:{ok:false,status:409},payload:{ok:false,error:"CLUB_TEAM_LIMIT",state:null,accountId,seasonId:initial.seasonId}});
    assert.equal(await operation,false);
    const hook=h.render(locale);
    assert.equal(hook.ready,true,"known refused command does not invalidate the already verified GET");
    assert.equal(hook.hasPending,false);assert.deepEqual(hook.state,initial);assert.equal(h.published.length,1);
    assert.match(hook.error!,locale==="pt-BR"?/contratação foi recusada/:/signing was rejected/);
    assert.doesNotMatch(hook.error!,/confirmar o elenco|confirm the squad/);
    assert.equal(h.requests.length,2,"no automatic repeat of the refused signing");
    assert.equal(h.diagnostics.length,1);
    assert.equal(h.diagnostics[0][0],"[ClubOwner] Squad operation response");
    const detail=h.diagnostics[0][1] as Record<string,unknown>;
    assert.deepEqual(Object.keys(detail).sort(),["code","elapsedMs","status"]);
    assert.equal(detail.code,"CLUB_TEAM_LIMIT");assert.equal(detail.status,409);
    assert.doesNotMatch(JSON.stringify(h.diagnostics),new RegExp(accountId));
    assert.doesNotMatch(JSON.stringify(h.diagnostics),/495000000|idempotencyKey/);
  }
});

test("background poll recovers a failed read without enabling writes early or retrying purchases",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();
  h.render().revalidate();h.render();h.requests[1].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));await tick();
  assert.equal(h.render().ready,false);
  h.render().revalidate();h.render();
  assert.equal(h.requests[2].options.method,"GET");
  h.render().revalidate();h.render();assert.equal(h.requests.length,3);
  assert.equal(await h.render().purchase("player",{area:"outside",slot:0}),false);
  assert.equal(h.requests.length,3);
  success(h.requests[2],initial);await tick();assert.equal(h.render().ready,true);
  const operation=h.render().purchase("player",{area:"outside",slot:0});
  h.requests[3].reject(new Error("unknown outcome"));await operation;
  h.render().revalidate();h.render();assert.equal(h.requests.length,4);
  assert.equal(h.render().hasPending,true);
});

test("Refresh squad recovers a failed GET at the same revision without repeating an operation or replaying the XI",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();
  h.render().revalidate();h.render();h.requests[1].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));await tick();
  let hook=h.render();assert.equal(hook.ready,false);assert.ok(hook.error);assert.deepEqual(hook.state,initial);
  hook.reload();h.render();assert.equal(h.requests[2].options.method,"GET");
  success(h.requests[2],initial);await tick();hook=h.render();
  assert.equal(hook.ready,true);assert.equal(hook.error,null);assert.deepEqual(hook.state,initial);
  assert.equal(h.published.length,1,"same revision must not republish/replay or clear the owner's XI");
  assert.equal(h.requests.filter(request=>request.options.method==="POST").length,0);
  assert.equal(h.requests.length,3);
});

const releaseOwned = acquisition.acquireClubPlayer(initial, {playerId:"30000000-0000-4000-8000-000000000010",area:"outside",slot:0,expectedRevision:0,idempotencyKey:"original_purchase"},
  {marketOpen:true,allowedClubIds:null,offer:{playerId:"30000000-0000-4000-8000-000000000010",clubId:"club",position:"GK",valueEur:45_000_000,published:true}}).state;
const releaseRead = (request: PendingRequest, available = true) => request.resolve({response:{ok:true,status:200},payload:{ok:true,state:releaseOwned,accountId,seasonId:initial.seasonId,releaseAvailable:available}});
const releaseSuccess = (request: PendingRequest) => {
  const command=JSON.parse(String(request.options.body));
  request.resolve({response:{ok:true,status:200},payload:{ok:true,state:{...releaseOwned,players:[],balanceEur:releaseOwned.balanceEur+40_500_000,revision:2},accountId,seasonId:initial.seasonId,
    receipt:{idempotency_key:command.idempotencyKey,player_id:command.playerId,paid_credits:45_000_000,fee_credits:4_500_000,refund_credits:40_500_000},replayed:true}});
};

test("release requires a confirmed server capability and the reviewed current contract revision",async()=>{
  const h=fixture();h.render();releaseRead(h.requests[0],false);await tick();let hook=h.render();
  assert.equal(await hook.release(releaseOwned.players[0].playerId,1),false);assert.equal(h.requests.length,1);
  hook.reload();h.render();releaseRead(h.requests[1]);await tick();hook=h.render();
  assert.equal(await hook.release(releaseOwned.players[0].playerId,0),false);
  assert.equal(await hook.release("unknown",1),false);assert.equal(h.requests.length,2);
  const pending=hook.release(releaseOwned.players[0].playerId,1);
  await tick();assert.equal(h.requests[2].path,"/api/touchline-fantasy/collection/release");
  releaseSuccess(h.requests[2]);assert.equal(await pending,true);
  assert.equal(h.render().state?.players.length,0);
  assert.equal(h.render().state?.balanceEur,releaseOwned.balanceEur+40_500_000);
  assert.deepEqual(h.render().state?.receipts,releaseOwned.receipts,"never erase purchase history");
});

test("ambiguous release keeps exact command and never optimistically refunds or allows another operation",async()=>{
  const h=fixture();h.render();releaseRead(h.requests[0]);await tick();let hook=h.render();
  const first=hook.release(releaseOwned.players[0].playerId,1);
  await tick();h.requests[1].reject(new Error("timeout after possible commit"));assert.equal(await first,false);
  hook=h.render();assert.equal(hook.hasPending,true);assert.deepEqual(hook.state,releaseOwned);
  assert.equal(await hook.release("another",1),false);
  assert.equal(await hook.purchase("player",{area:"outside",slot:1}),false);
  assert.equal(await hook.allocate({action:"formation",formationCode:"4-3-3"}),false);
  assert.equal(h.requests.length,2);
  const retry=hook.retryPending();await tick();assert.equal(h.requests[2].path,h.requests[1].path);assert.equal(h.requests[2].options.body,h.requests[1].options.body);
  releaseSuccess(h.requests[2]);assert.equal(await retry,true);hook=h.render();
  assert.equal(hook.hasPending,false);assert.equal(hook.state?.balanceEur,releaseOwned.balanceEur+40_500_000);
});

test("release success without a matching receipt remains unresolved even if a GET shows the player absent",async()=>{
  const h=fixture();h.render();releaseRead(h.requests[0]);await tick();let hook=h.render();
  const first=hook.release(releaseOwned.players[0].playerId,1);
  await tick();success(h.requests[1],{...releaseOwned,players:[],revision:2});assert.equal(await first,false);
  hook=h.render();assert.equal(hook.hasPending,true);assert.deepEqual(hook.state,releaseOwned);
  hook.reload();h.render();success(h.requests[2],{...releaseOwned,players:[],revision:2,balanceEur:releaseOwned.balanceEur+40_500_000});await tick();
  hook=h.render();assert.equal(hook.hasPending,true,"absence alone never proves this release operation");
  const retry=hook.retryPending();await tick();assert.equal(h.requests[3].options.body,h.requests[1].options.body);
  releaseSuccess(h.requests[3]);assert.equal(await retry,true);assert.equal(h.render().hasPending,false);
});

test("an older locale read cannot overwrite a confirmed purchase in the header or squad",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();h.render();
  let hook=h.render("en-GB");assert.equal(h.requests.length,2);
  const purchase=hook.purchase("player",{area:"outside",slot:0});
  const command=JSON.parse(String(h.requests[2].options.body));
  assert.equal(command.expectedAccountId,accountId);
  assert.equal(command.expectedSeasonId,initial.seasonId);
  const next=acquisition.acquireClubPlayer(initial,command,{marketOpen:true,allowedClubIds:null,
    offer:{playerId:"player",clubId:"club",position:"GK",valueEur:10_000_000,published:true}}).state;
  success(h.requests[2],next);assert.equal(await purchase,true);hook=h.render("en-GB");
  assert.equal(hook.state?.revision,1);assert.equal(hook.state?.balanceEur,485_000_000);
  success(h.requests[1],initial);await tick();hook=h.render("en-GB");
  assert.equal(hook.state?.revision,1);assert.equal(h.published.at(-1)?.revision,1);
  assert.equal(hook.state?.players.length,1);
});

test("unconfirmed purchase keeps the same command until explicit retry is confirmed",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();let hook=h.render();
  const first=hook.purchase("player",{area:"outside",slot:0});
  h.requests[1].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));assert.equal(await first,false);
  hook=h.render();assert.equal(hook.hasPending,true);assert.equal(hook.busy,false);
  assert.equal(hook.state?.balanceEur,initial.balanceEur);
  const retry=hook.retryPending();assert.equal(h.requests[2].options.body,h.requests[1].options.body);
  const command=JSON.parse(String(h.requests[2].options.body));
  const next=acquisition.acquireClubPlayer(initial,command,{marketOpen:true,allowedClubIds:null,
    offer:{playerId:"player",clubId:"club",position:"GK",valueEur:10_000_000,published:true}}).state;
  success(h.requests[2],next);assert.equal(await retry,true);hook=h.render();
  assert.equal(hook.hasPending,false);assert.equal(hook.state?.balanceEur,485_000_000);
});

test("ambiguous first formation retains its command and blocks purchases until exact retry confirms",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();let hook=h.render();
  const first=hook.allocate({action:"formation",formationCode:"4-3-3"});
  assert.equal(h.requests[1].path,"/api/touchline-fantasy/collection/allocation");
  h.requests[1].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));assert.equal(await first,false);
  hook=h.render();assert.equal(hook.hasPending,true);
  assert.equal(hook.state?.formationCode,undefined);
  assert.equal(await hook.purchase("player",{area:"starters",slot:0}),false);
  assert.equal(await hook.allocate({action:"formation",formationCode:"3-5-2"}),false);
  assert.equal(h.requests.length,2,"no new mutation while first result is uncertain");
  const retry=hook.retryPending();
  assert.equal(h.requests[2].options.body,h.requests[1].options.body);
  assert.equal(h.requests[2].path,h.requests[1].path);
  success(h.requests[2],{...initial,formationCode:"4-3-3",revision:1});
  assert.equal(await retry,true);hook=h.render();
  assert.equal(hook.hasPending,false);
  assert.equal(hook.state?.formationCode,"4-3-3");
  assert.equal(hook.state?.balanceEur,initial.balanceEur);
  assert.deepEqual(hook.state?.coach,initial.coach);
});

test("a different season cannot replace the current confirmed budget through a delayed read",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();h.render();
  h.render("en-GB");
  success(h.requests[1],{...initial,seasonId:"30000000-0000-4000-8000-000000000004"});await tick();
  const hook=h.render("en-GB");
  assert.equal(hook.state?.seasonId,initial.seasonId);
  assert.ok(hook.error);
  assert.equal(h.published.at(-1)?.seasonId,initial.seasonId);
  assert.equal(hook.ready,false);
});

test("a changed session blocks pending commands instead of rebinding them to the new account",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();let hook=h.render();
  const purchase=hook.purchase("player",{area:"outside",slot:0});
  h.requests[1].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));await purchase;h.render("en-GB");
  success(h.requests[2],initial,"30000000-0000-4000-8000-000000000009");await tick();hook=h.render("en-GB");
  assert.equal(hook.ready,false);assert.equal(hook.hasPending,true);
  assert.equal(await hook.retryPending(),false);assert.equal(h.requests.length,3);
});

test("the first collection read must match the server-rendered account and season",async()=>{
  for(const changed of ["account","season"]) {
    const h=fixture();h.render();
    const other="30000000-0000-4000-8000-000000000009";
    success(h.requests[0],changed==="season"?{...initial,seasonId:other}:initial,changed==="account"?other:accountId);
    await tick();const hook=h.render();
    assert.equal(hook.ready,false);assert.equal(hook.state,null);assert.equal(h.published.length,0);
    assert.equal(await hook.initialize("coach"),false);assert.equal(h.requests.length,1);
  }
});

test("a confirmed read clears a previous read warning, but a failed read cannot initialize the club",async()=>{
  const h=fixture();h.render();
  h.requests[0].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));await tick();
  let hook=h.render();
  assert.ok(hook.error);assert.equal(hook.ready,false);
  assert.equal(await hook.initialize("coach"),false);
  assert.equal(h.requests.length,1);
  h.render("en-GB");success(h.requests[1],initial);await tick();
  hook=h.render("en-GB");
  assert.equal(hook.error,null);assert.equal(hook.ready,true);
  assert.equal(hook.state?.balanceEur,initial.balanceEur);
  assert.equal(h.requests.length,2);
});

test("a failed revalidation locks commands while preserving the last confirmed balance",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();
  assert.equal(h.render().ready,true);
  h.render("en-GB");
  h.requests[1].reject(new Error("CLUB_REQUEST_UNCONFIRMED"));await tick();
  let hook=h.render("en-GB");
  assert.equal(hook.ready,false);
  assert.ok(hook.error);
  assert.equal(hook.state?.balanceEur,initial.balanceEur);
  assert.equal(h.published.at(-1)?.balanceEur,initial.balanceEur);
  assert.equal(await hook.initialize("coach"),false);
  assert.equal(await hook.purchase("player",{area:"outside",slot:0}),false);
  assert.equal(await hook.allocate({action:"formation",formationCode:"4-3-3"}),false);
  assert.equal(h.render("en-GB").hasPending,false);
  assert.equal(h.requests.length,2);
  hook.reload();h.render("en-GB");success(h.requests[2],initial);await tick();
  hook=h.render("en-GB");
  assert.equal(hook.ready,true);assert.equal(hook.error,null);
});

test("a missing collection after a successful read cannot leave commands enabled",async()=>{
  const h=fixture();h.render();success(h.requests[0],initial);await tick();h.render();
  h.render("en-GB");
  h.requests[1].resolve({response:{ok:true,status:200},payload:{ok:true,state:null,accountId,seasonId:initial.seasonId}});
  await tick();const hook=h.render("en-GB");
  assert.equal(hook.ready,false);assert.ok(hook.error);
  assert.equal(hook.state?.revision,initial.revision);
  assert.equal(await hook.initialize("coach"),false);assert.equal(h.requests.length,2);
});

test("an explicit empty read permits initialization, but a null write response does not confirm it",async()=>{
  const h=fixture();h.render();
  const empty={ok:true,state:null,accountId,seasonId:initial.seasonId,initialBudget:{plan:"standard",balanceEur:750_000_000}};
  h.requests[0].resolve({response:{ok:true,status:200},payload:empty});await tick();
  let hook=h.render();assert.equal(hook.ready,true);assert.equal(hook.state,null);
  const initializing=hook.initialize("coach");
  assert.equal(h.requests.length,2);
  h.requests[1].resolve({response:{ok:true,status:200},payload:empty});
  assert.equal(await initializing,false);
  hook=h.render();assert.equal(hook.state,null);assert.ok(hook.error);
});

test("a missing state field is not a confirmed empty club",async()=>{
  const h=fixture();h.render();
  h.requests[0].resolve({response:{ok:true,status:200},payload:{ok:true,state:undefined as unknown as acquisition.ClubAcquisitionState,accountId,seasonId:initial.seasonId}});
  await tick();const hook=h.render();
  assert.equal(hook.ready,false);assert.ok(hook.error);assert.equal(h.published.length,0);
  assert.equal(await hook.initialize("coach"),false);assert.equal(h.requests.length,1);
});

test("VIP initial allowance enables coach only after confirmation and is replaced by persisted debit",async()=>{
  const h=fixture();let hook=h.render();
  assert.equal(hook.canInitialize,false);
  assert.equal(await hook.initialize("coach"),false);
  const empty={ok:true,state:null,accountId,seasonId:initial.seasonId,initialBudget:{plan:"vip",balanceEur:3_000_000_000}};
  h.requests[0].resolve({response:{ok:true,status:200},payload:empty});await tick();hook=h.render();
  assert.equal(hook.canInitialize,true);assert.equal(h.budgets.at(-1)?.balanceEur,3_000_000_000);
  const saving=hook.initialize("coach");assert.equal(h.budgets.at(-1),null);
  assert.equal(await hook.initialize("other"),false);
  success(h.requests[1],{...initial,plan:"vip",balanceEur:2_995_000_000});
  assert.equal(await saving,true);hook=h.render();
  assert.equal(hook.canInitialize,false);assert.equal(hook.state?.balanceEur,2_995_000_000);
  assert.equal(h.budgets.at(-1),null);
  hook.reload();h.render();success(h.requests[2],{...initial,plan:"vip",balanceEur:2_995_000_000});await tick();
  assert.equal(h.render().state?.balanceEur,2_995_000_000);
});

test("unconfirmed initial budget never unlocks coach, even with a successful empty response",async()=>{
  for(const value of [undefined,null,{plan:"vip",balanceEur:1_000_000_000},{plan:"beta",balanceEur:50_000_000}]){
    const h=fixture();h.render();h.requests[0].resolve({response:{ok:true,status:200},payload:{ok:true,state:null,accountId,seasonId:initial.seasonId,initialBudget:value}});
    await tick();const hook=h.render();assert.equal(hook.ready,false);assert.equal(hook.canInitialize,false);
    assert.equal(await hook.initialize("coach"),false);assert.equal(h.requests.length,1);assert.equal(h.budgets.at(-1),null);
  }
});

test("ambiguous initialization clears allowance and rejects an older read until explicit reconciliation",async()=>{
  const h=fixture();h.render();const empty={ok:true,state:null,accountId,seasonId:initial.seasonId,initialBudget:{plan:"vip",balanceEur:3_000_000_000}};
  h.requests[0].resolve({response:{ok:true,status:200},payload:empty});await tick();
  const hook=h.render("en-GB");
  // Locale revalidation has synchronously invalidated initial budget authority.
  assert.equal(await hook.initialize("coach"),false);
  h.requests[1].resolve({response:{ok:true,status:200},payload:empty});await tick();
  const current=h.render("en-GB"), saving=current.initialize("coach");
  h.requests[2].reject(new Error("timeout"));assert.equal(await saving,false);
  assert.equal(await current.initialize("other"),false);
  const failed=h.render("en-GB");assert.equal(failed.canInitialize,false);assert.equal(failed.ready,false);
  assert.equal(h.budgets.at(-1),null);failed.reload();h.render("en-GB");
  success(h.requests[3],{...initial,plan:"vip",balanceEur:2_995_000_000});await tick();
  assert.equal(h.render("en-GB").state?.balanceEur,2_995_000_000);
});

test("locale change during initialization cannot publish the full budget or cancel its debit",async()=>{
  const h=fixture();h.render();h.requests[0].resolve({response:{ok:true,status:200},payload:{ok:true,state:null,accountId,seasonId:initial.seasonId,initialBudget:{plan:"vip",balanceEur:3_000_000_000}}});
  await tick();const saving=h.render().initialize("coach");h.render("en-GB");
  assert.equal(h.requests.length,2);assert.equal(h.budgets.at(-1),null);
  success(h.requests[1],{...initial,plan:"vip",balanceEur:2_995_000_000});assert.equal(await saving,true);
  assert.equal(h.render("en-GB").state?.balanceEur,2_995_000_000);assert.equal(h.budgets.at(-1),null);
});


test("release uncertainty survives a full hook remount until the original receipt is recovered",async()=>{
  const durable=new Map<string,ClubReleaseRecoveryReference>();
  const first=fixture(false,undefined,durable);first.render();releaseRead(first.requests[0]);await tick();
  const operation=first.render().release(releaseOwned.players[0].playerId,1);await tick();
  assert.equal(durable.size,1,"reference must commit before POST");
  const command=JSON.parse(String(first.requests[1].options.body));
  first.requests[1].reject(new Error("response lost after server committed"));
  assert.equal(await operation,false);assert.equal(first.render().hasPending,true);first.unmount();
  const remounted=fixture(false,undefined,durable);remounted.render();
  const current={...releaseOwned,players:[],revision:2,balanceEur:releaseOwned.balanceEur+40_500_000};
  success(remounted.requests[0],current);await tick();
  assert.equal(remounted.render().ready,false,"current snapshot alone cannot unlock a lost operation");
  assert.equal(remounted.requests[1].options.method,"GET");
  assert.equal(JSON.parse(String((remounted.requests[1].options.headers as Record<string,string>)["X-Touchline-Release-Reference"])).idempotencyKey,command.idempotencyKey);
  remounted.requests[1].resolve({response:{ok:true,status:200},payload:{ok:true,state:null,accountId,seasonId:initial.seasonId,result:{
    status:"committed",accountId,seasonId:initial.seasonId,command:{action:"release",playerId:command.playerId,expectedRevision:1,idempotencyKey:command.idempotencyKey},operationRevision:2,
    receipt:{idempotency_key:command.idempotencyKey,player_id:command.playerId,paid_credits:45_000_000,fee_credits:4_500_000,refund_credits:40_500_000,revision:2},snapshot:current,
  }}});await tick();
  assert.equal(remounted.render().hasPending,false);assert.equal(remounted.render().ready,true);
  assert.equal(remounted.render().state?.balanceEur,current.balanceEur);assert.equal(durable.size,0);
  assert.equal(remounted.requests.filter(request=>request.options.method==="POST").length,0);
});


test("valid receipt plus invalid or cross-season snapshot cannot erase durable release intent",async()=>{
  for(const state of [{...releaseOwned,revision:2,balanceEur:-1},{...releaseOwned,revision:2,seasonId:"30000000-0000-4000-8000-000000000099"}]) {
    const h=fixture();h.render();releaseRead(h.requests[0]);await tick();
    const operation=h.render().release(releaseOwned.players[0].playerId,1);await tick();
    const command=JSON.parse(String(h.requests[1].options.body));
    h.requests[1].resolve({response:{ok:true,status:200},payload:{ok:true,state,accountId,seasonId:initial.seasonId,
      receipt:{idempotency_key:command.idempotencyKey,player_id:command.playerId,paid_credits:45_000_000,fee_credits:4_500_000,refund_credits:40_500_000},replayed:false}});
    assert.equal(await operation,false);assert.equal(h.durable.size,1);assert.equal(h.render().hasPending,true);
    assert.deepEqual(h.render().state,releaseOwned);h.unmount();
  }
});
test("journal-open failure is visible and explicit squad refresh retries only reads",async()=>{
  const h=fixture(false,undefined,new Map(),{opensRemaining:1});h.render();releaseRead(h.requests[0]);await tick();
  let hook=h.render();assert.equal(hook.ready,false);assert.match(hook.error!,/operações pendentes/);
  assert.equal(await hook.release(releaseOwned.players[0].playerId,1),false);assert.equal(h.requests.length,1);
  hook.reload();h.render();releaseRead(h.requests[1]);await tick();hook=h.render();
  assert.equal(hook.ready,false);releaseRead(h.requests[2]);await tick();hook=h.render();
  assert.equal(hook.ready,true);assert.equal(hook.error,null);
  assert.equal(h.requests.filter(request=>request.options.method==="POST").length,0);h.unmount();
});


test("multiple references require a fresh current GET after read-only recovery in either read ordering",async()=>{
  for(const initialReadFirst of [true,false]) for(const finalReadSucceeds of [true,false]) {
    const playerId=releaseOwned.players[0].playerId;
    const refs=[1,3].map(expectedRevision=>({schemaVersion:1 as const,createdAt:1,expectedAccountId:accountId,expectedSeasonId:initial.seasonId,
      action:"release" as const,playerId,expectedRevision,idempotencyKey:`multi_release_${expectedRevision}`}));
    const durable=new Map(refs.map(ref=>[ref.idempotencyKey,ref]));const h=fixture(false,undefined,durable);
    h.render();if(initialReadFirst) success(h.requests[0],{...releaseOwned,revision:4});await tick();
    const reply=(index:number,result:unknown)=>h.requests[index].resolve({response:{ok:true,status:200},payload:{ok:true,state:null,accountId,seasonId:initial.seasonId,result}});
    reply(1,{status:"unavailable"});await tick();reply(2,{status:"unavailable"});await tick();
    if(!initialReadFirst) {success(h.requests[0],{...releaseOwned,revision:4});await tick();}
    let hook=h.render();assert.equal(hook.hasPending,true);assert.equal(hook.pendingRecoveryOnly,true);
    assert.equal(h.statuses.at(-1),"unavailable","a concurrent current GET cannot hide unresolved references");
    assert.equal(await hook.purchase(playerId,{area:"outside",slot:1}),false);
    await hook.retryPending();h.render();await tick();
    for(let i=0;i<2;i++) {
      const ref=refs[i],revision=ref.expectedRevision+1;
      reply(3+i,{status:"committed",accountId,seasonId:initial.seasonId,
        command:{action:ref.action,playerId,expectedRevision:ref.expectedRevision,idempotencyKey:ref.idempotencyKey},operationRevision:revision,
        receipt:{idempotency_key:ref.idempotencyKey,player_id:playerId,paid_credits:100,fee_credits:10,refund_credits:90,revision}});
      await tick();
    }
    hook=h.render();assert.equal(hook.hasPending,false);assert.equal(hook.pendingRecoveryOnly,false);assert.equal(durable.size,0);
    assert.equal(hook.ready,false,"historical receipts cannot grant current write readiness");
    assert.equal(h.statuses.at(-1),"pending");
    assert.equal(h.requests.length,6);assert.equal(h.requests[5].path,"/api/touchline-fantasy/collection");
    assert.equal(h.requests[5].options.method,"GET");
    // No market polling is invoked; even a closed market recovers its indicator.
    if(finalReadSucceeds) success(h.requests[5],{...releaseOwned,revision:4});
    else h.requests[5].reject(new Error("current read unavailable"));
    await tick();hook=h.render();assert.equal(hook.ready,finalReadSucceeds);
    assert.equal(h.statuses.at(-1),finalReadSucceeds?"confirmed":"unavailable");
    assert.equal(h.requests.filter(request=>request.options.method==="POST").length,0);h.unmount();
  }
});


test("release auth failure retains durable intent and never confirms verification",async()=>{
  for(const status of [401,403]) {
    const h=fixture();h.render();releaseRead(h.requests[0]);await tick();
    const operation=h.render().release(releaseOwned.players[0].playerId,1);await tick();
    h.requests[1].resolve({response:{ok:false,status},payload:{ok:false,state:null,accountId,seasonId:initial.seasonId,error:"AUTH_REQUIRED"}});
    assert.equal(await operation,false);assert.equal(h.render().hasPending,true);
    assert.equal(h.durable.size,1);assert.equal(h.statuses.at(-1),"unavailable");
    assert.deepEqual(h.render().state,releaseOwned);assert.equal(h.requests.length,2);h.unmount();
  }
});
test("journal failure uses the pending recovery message in all eight presentation languages",async()=>{
  const locales=["en-GB","pt-BR","es-ES","it-IT","fr-FR","ar-SA","tr-TR","de-DE"];
  const messages=new Set<string>();
  for(const locale of locales) {
    const h=fixture(false,undefined,new Map(),{opensRemaining:1});h.render(locale);releaseRead(h.requests[0]);await tick();
    const hook=h.render(locale);const expected=getClubCollectionBudgetCopy(locale,true).pendingRecoveryUnavailable;
    assert.equal(hook.error,expected);assert.ok(expected.trim());assert.equal(hook.ready,false);
    messages.add(expected);assert.equal(h.requests.filter(r=>r.options.method==="POST").length,0);h.unmount();
  }
  assert.equal(messages.size,8);
});


test("synchronous recovery construction failure is observed and cleanup fences its rejection",async()=>{
  for(const cancel of [false,true]) {
    const faults={opensRemaining:0,constructionsRemaining:1};
    const h=fixture(false,undefined,new Map(),faults);h.render();
    assert.equal(faults.constructionsRemaining,0,"construction is not deferred beyond the effect");
    const before=h.statuses.length;
    if(cancel) h.unmount();
    else releaseRead(h.requests[0]);
    await tick();
    if(cancel) assert.equal(h.statuses.length,before,"unmounted generation cannot publish failure");
    else {
      const hook=h.render();assert.equal(hook.ready,false);assert.match(hook.error!,/operações pendentes/);
      assert.equal(h.statuses.at(-1),"unavailable");
      assert.equal(await hook.release(releaseOwned.players[0].playerId,1),false);h.unmount();
    }
    assert.equal(h.requests.length,1);assert.equal(h.durable.size,0);
  }
});


test("coach release and vacancy hire use real lifecycle client with confirmed receipt then fresh read, without optimistic wallet",async()=>{
 const owned:acquisition.ClubAcquisitionState={...initial,revision:1,coach:{id:"307",tier:"sapphire-blue",valueEur:10_000_000},balanceEur:100_000_000};
 const h=fixture(false,{status:"confirmed",accountId,seasonId:owned.seasonId,state:owned,initialBudget:null,releaseAvailable:false,coachLifecycleAvailable:true});
 h.render();await tick();h.requests[0].resolve({response:{ok:true,status:200},payload:{ok:true,state:owned,accountId,seasonId:owned.seasonId,coachLifecycleAvailable:true}});await tick();
 let hook=h.render();assert.equal(hook.ready,true);assert.equal(hook.coachLifecycleAvailable,true);
 const pending=hook.changeCoach("release-coach","307",1);
 assert.equal(await hook.changeCoach("release-coach","307",1),false,"double confirmation is fenced");
 const request=h.requests.at(-1)!;assert.equal(request.path,"/api/touchline-fantasy/collection/coach");
 const releaseCommand=JSON.parse(String(request.options.body));
 const command=coachLifecycle.parseClubCoachLifecycleCommand(authority.parseClubCommandAuthority(releaseCommand)!.command)!;
 assert.equal(command.action,"release-coach");if(command.action!=="release-coach")assert.fail();
 const released=coachLifecycle.releaseClubCoach(owned,command,{marketOpen:true,roundLocked:false});
 assert.equal(h.render().state?.balanceEur,owned.balanceEur);
 request.resolve({response:{ok:true,status:200},payload:{ok:true,accountId,seasonId:owned.seasonId,...released,replayed:false}});
 assert.equal(await pending,true);hook=h.render();assert.equal(hook.state?.coach?.id,"307","receipt alone does not install a historical snapshot");
 h.requests.at(-1)!.resolve({response:{ok:true,status:200},payload:{ok:true,state:released.state,accountId,seasonId:owned.seasonId,coachLifecycleAvailable:true}});await tick();
 hook=h.render();assert.equal(hook.state?.coach,null);assert.equal(hook.canHireCoach,true);assert.equal(hook.state?.balanceEur,109_000_000);
 const hiring=hook.changeCoach("hire-coach","308",2);const hireRequest=h.requests.at(-1)!;
 const hire=coachLifecycle.parseClubCoachLifecycleCommand(authority.parseClubCommandAuthority(JSON.parse(String(hireRequest.options.body)))!.command)!;
 assert.equal(hire.action,"hire-coach");if(hire.action!=="hire-coach")assert.fail();
 const hired=coachLifecycle.hireClubCoach(released.state,hire,{marketOpen:true,roundLocked:false,offer:{id:"308",tier:"radiant-gold",valueEur:25_000_000,published:true}});
 hireRequest.resolve({response:{ok:true,status:200},payload:{ok:true,accountId,seasonId:owned.seasonId,...hired,replayed:false}});assert.equal(await hiring,true);
 h.render();h.requests.at(-1)!.resolve({response:{ok:true,status:200},payload:{ok:true,state:hired.state,accountId,seasonId:owned.seasonId,coachLifecycleAvailable:true}});await tick();
 hook=h.render();assert.equal(hook.state?.balanceEur,84_000_000);assert.equal(hook.state?.coach?.id,"308");assert.equal(hook.hasPending,false);
 h.unmount();
});
