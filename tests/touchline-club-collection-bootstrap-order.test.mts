import * as coachRecovery from "../lib/touchlineFantasy/club-coach-browser-recovery.ts";
import { getClubCollectionBudgetCopy } from "../lib/touchlineFantasy/market-budget-i18n.ts";
import { createClubReleaseBrowserRecovery } from "../lib/touchlineFantasy/club-release-browser-recovery.ts";
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
import * as bootstrap from "../lib/touchlineFantasy/club-collection-bootstrap.ts";
import type { ClubCollectionReadResult } from "../lib/touchlineFantasy/club-collection-read-server.ts";
import type { useClubCollection } from "../components/touchline/fantasy/useClubCollection.ts";

type PendingRequest = {
  path: string; options: RequestInit;
  resolve: (value: {response:{ok:boolean;status:number};payload:{ok:boolean;state:acquisition.ClubAcquisitionState|null;accountId:string;seasonId:string;initialBudget?:unknown;releaseAvailable?:boolean;receipt?:unknown;replayed?:boolean;error?:string}}) => void;
  reject: (error: Error) => void;
};
type EffectSlot = {deps: unknown[]; cleanup?: void | (() => void)};

// Exercise the actual hook's request ordering without a DOM or remote account.
function fixture(development = false, initialRead?: ClubCollectionReadResult, owner = accountId, season = initial.seasonId) {
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
  const context={publish:(state:acquisition.ClubAcquisitionState|null)=>published.push(state),publishInitialBudget:(value:budget.ClubInitialBudget|null)=>budgets.push(value),publishVerificationStatus:()=>{}};
  const exports = {} as {useClubCollection:typeof useClubCollection};
  const source=ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/useClubCollection.ts",import.meta.url),"utf8"),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const storageData = new Map<string,string>();
  const sessionStorage = {getItem:(key:string)=>storageData.get(key)??null,setItem:(key:string,value:string)=>{storageData.set(key,value);},removeItem:(key:string)=>{storageData.delete(key);}};
  runInNewContext(source,{exports,window:{sessionStorage},AbortController,crypto:{randomUUID},process:{env:{NODE_ENV:development?"development":"test"}},console:{warn:(...args:unknown[])=>diagnostics.push(args)},require:(name:string)=>{
    if(name==="react")return react;
    if(name.includes("club-coach-browser-recovery"))return coachRecovery;
    if (name.includes("market-budget-i18n")) return { getClubCollectionBudgetCopy };
    if(name.includes("club-acquisition"))return acquisition;
    if(name.includes("club-command-authority"))return authority;
    if(name.includes("club-initial-budget"))return budget;
    if (name.includes("club-release-browser-recovery")) return {createClubReleaseBrowserRecovery:(context:authority.ClubCommandAuthority)=>createClubReleaseBrowserRecovery(context,{
      now:()=>1,open:async()=>({append:async()=>"inserted",list:async()=>[],remove:async()=>{},close:()=>{}}),
      read:async()=>{throw new Error("unexpected recovery read in empty journal fixture");},
    })};
    if(name.includes("club-release"))return release;
    if(name.includes("club-collection-bootstrap"))return bootstrap;
    if(name.includes("ClubCollectionContext"))return {useConfirmedClubCollection:()=>context};
    if(name.includes("club-collection-request")) {
      const requestClubCollection=(path:string,options:RequestInit)=>new Promise<Parameters<PendingRequest["resolve"]>[0]>((resolve,reject)=>requests.push({path,options,resolve,reject}));
      return {requestClubCollection,readClubCollection:(signal:AbortSignal)=>requestClubCollection("/api/touchline-fantasy/collection",{method:"GET",cache:"no-store",signal})};
    }
    throw new Error(name);
  }});
  return {unmount:()=>{for(const slot of slots){const cleanup=(slot as EffectSlot|undefined)?.cleanup;if(typeof cleanup==="function")cleanup();}},requests,published,budgets,diagnostics,render:(locale="pt-BR")=>{cursor=0;const hook=exports.useClubCollection(true,locale,{expectedAccountId:owner,expectedSeasonId:season},undefined,initialRead);while(effects.length)effects.shift()!();return hook;}};
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const accountId="30000000-0000-4000-8000-000000000001";
const initial:acquisition.ClubAcquisitionState={revision:0,seasonId:"30000000-0000-4000-8000-000000000003",plan:"standard",balanceEur:495_000_000,
  coach:{id:"coach",tier:"ruby-red",valueEur:5_000_000},players:[],receipts:[]};
const success=(request:PendingRequest,state:acquisition.ClubAcquisitionState,owner=accountId)=>request.resolve({response:{ok:true,status:200},payload:{ok:true,state,accountId:owner,seasonId:state.seasonId}});


test("SSR bootstrap ignores delayed pre-purchase GET and preserves one debit and pending command",async()=>{
 const h=fixture(false,{status:"confirmed",accountId,seasonId:initial.seasonId,state:initial,initialBudget:null,releaseAvailable:false});
 h.render();await tick();let hook=h.render();
 const signing=hook.purchase("30000000-0000-4000-8000-000000000010",{area:"starters",slot:0});
 assert.equal(h.requests.length,2);
 const body=JSON.parse(h.requests[1].options.body as string);
 assert.equal(body.expectedAccountId,accountId);assert.equal(body.expectedSeasonId,initial.seasonId);
 success(h.requests[0],initial);await tick();hook=h.render();
 assert.equal(hook.busy,true);assert.equal(hook.hasPending,true);
 assert.equal(await hook.purchase("30000000-0000-4000-8000-000000000011",{area:"starters",slot:1}),false);
 assert.equal(h.requests.length,2);
 const next=acquisition.acquireClubPlayer(initial,body,{marketOpen:true,allowedClubIds:null,offer:{playerId:body.playerId,clubId:"club",position:"GK",valueEur:10_000_000,published:true}}).state;
 success(h.requests[1],next);assert.equal(await signing,true);hook=h.render();
 assert.equal(hook.state?.balanceEur,485_000_000);assert.equal(hook.state?.revision,1);
 assert.equal(hook.hasPending,false);assert.equal(h.requests.filter(x=>x.options.method==="POST").length,1);
});
test("page authority key remount isolates account and season from old asynchronous GET",async()=>{
 const page=readFileSync(new URL("../app/clubowner/page.tsx",import.meta.url),"utf8");
 assert.ok(page.includes('key={`${user.id}:${snapshot?.config.seasonId ?? "unavailable"}`}'));
 const old=fixture(false,{status:"confirmed",accountId,seasonId:initial.seasonId,state:initial,initialBudget:null,releaseAvailable:false});
 old.render();old.unmount();
 const owner="30000000-0000-4000-8000-000000000099",season="30000000-0000-4000-8000-000000000098";
 const fresh={...initial,seasonId:season,balanceEur:495_000_000};
 const current=fixture(false,{status:"confirmed",accountId:owner,seasonId:season,state:fresh,initialBudget:null,releaseAvailable:false},owner,season);
 let hook=current.render();success(old.requests[0],{...initial,revision:99});await tick();
 hook=current.render();assert.equal(hook.state?.seasonId,season);assert.equal(hook.state?.revision,0);
 success(current.requests[0],{...initial,revision:100},accountId);await tick();hook=current.render();
 assert.equal(hook.ready,false);assert.equal(hook.state?.seasonId,season);
 assert.equal(await hook.purchase("player",{area:"starters",slot:0}),false);
 assert.equal(current.requests.length,1);
});
