import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as intentApi from "../lib/touchlineFantasy/collection-market-intent.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { clubPrimaryPositionIndex } from "../lib/touchlineFantasy/club-primary-position-index.ts";
import type { ClubAcquisitionState,ClubOwnedPlayer } from "../lib/touchlineFantasy/club-acquisition.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";
const geometry=formations["4-3-3"];
const state:ClubAcquisitionState={revision:9,seasonId:"fixture",formationCode:"4-3-3",plan:"vip",balanceEur:100_000_000,coach:{id:"coach",tier:"radiant-gold",valueEur:1_000_000},players:[],receipts:[]};
test("legacy contracts keep missing detail while original-market helpers use canonical index",()=>{
  const legacy:ClubAcquisitionState={...state,players:[{playerId:"legacy",area:"starters",slot:0,position:"GK",clubId:"fixture",valueEur:1_000_000}]};
  const before=structuredClone(legacy);
  const details=clubPrimaryPositionIndex([{id:"legacy",primaryPositionDetail:"Goalkeeper"},{id:"incoming",primaryPositionDetail:"Right Wing"}]);
  const destination={area:"reserves" as const,slot:6};
  const intent=intentApi.createCollectionMarketIntent(legacy,geometry,"account",destination,details);assert.ok(intent);
  assert.ok(intentApi.collectionMarketIntentCurrent(intent,legacy,geometry,"account",details));
  assert.ok(intentApi.collectionMarketPlayerFits(intent,legacy,geometry,"incoming",details.incoming,details));
  for(const invalid of [undefined,{}, {legacy:null,incoming:"Right Wing"}, {legacy:"Centre Back",incoming:"Right Wing"},
    clubPrimaryPositionIndex([{id:"legacy",primaryPositionDetail:"Goalkeeper"},{id:"legacy",primaryPositionDetail:"Goalkeeper"},{id:"incoming",primaryPositionDetail:"Right Wing"}])]) {
    assert.equal(intentApi.createCollectionMarketIntent(legacy,geometry,"account",destination,invalid),null);
    assert.equal(intentApi.collectionMarketIntentCurrent(intent,legacy,geometry,"account",invalid),false);
    assert.equal(intentApi.collectionMarketPlayerFits(intent,legacy,geometry,"incoming","Right Wing",invalid),false);
  }
  for(const incoming of [null,"Left Wing",undefined])assert.equal(intentApi.collectionMarketPlayerFits(intent,legacy,geometry,"incoming","Right Wing",{legacy:"Goalkeeper",...(incoming===undefined?{}:{incoming})}),false);
  const conflicting={...legacy,players:[{...legacy.players[0],primaryDetail:"Centre Back"}]};
  assert.equal(intentApi.createCollectionMarketIntent(conflicting,geometry,"account",destination,details),null);
  assert.equal(intentApi.collectionMarketIntentCurrent(intent,conflicting,geometry,"account",details),false);
  assert.equal(intentApi.collectionMarketPlayerFits(intent,conflicting,geometry,"incoming","Right Wing",details),false);
  assert.deepEqual(legacy,before,"compatibility preview must not backfill old contracts");
});
for(const area of ["starters","reserves","outside"] as const)test(`original market intent preserves explicit ${area} destination and revision`,()=>{
  const destination={area,slot:0},before=structuredClone(state);
  const intent=intentApi.createCollectionMarketIntent(state,geometry,"account",destination);assert.ok(intent);
  assert.equal(intent.area,area);assert.equal(intent.slot,0);assert.equal(intent.revision,9);
  assert.equal(intent.position,collectionSlotPlan(geometry)![area][0]);
  assert.ok(intentApi.collectionMarketIntentCurrent(intent,state,geometry,"account"));
  for(const altered of [{...state,revision:10},{...state,seasonId:"other"},{...state,formationCode:"4-4-2"}])assert.equal(intentApi.collectionMarketIntentCurrent(intent,altered,geometry,"account"),false);
  assert.equal(intentApi.collectionMarketIntentCurrent(intent,state,geometry,"other-account"),false);
  assert.deepEqual(state,before);
});
test("original market refuses occupied destinations and incompatible primary detail",()=>{
  const intent=intentApi.createCollectionMarketIntent(state,geometry,"account",{area:"reserves",slot:6})!;
  assert.equal(intentApi.collectionMarketPlayerFits(intent,state,geometry,"incoming","Left Wing"),false);
  assert.equal(intentApi.collectionMarketPlayerFits(intent,state,geometry,"incoming","Right Wing"),true);
  const owned:ClubOwnedPlayer={playerId:"incoming",area:"reserves",slot:6,position:"RW",primaryDetail:"Right Wing",clubId:"fixture",valueEur:1_000_000};
  const occupied={...state,players:[owned]};assert.equal(intentApi.createCollectionMarketIntent(occupied,geometry,"account",intent),null);
  assert.equal(intentApi.collectionMarketPlayerFits(intent,occupied,geometry,"incoming","Right Wing"),false);
});
test("original market late result cannot close cancelled or replaced destination",()=>{
  const intent=intentApi.createCollectionMarketIntent(state,geometry,"account",{area:"reserves",slot:6})!;
  const confirmed={...state,revision:10,players:[{playerId:"incoming",area:"reserves" as const,slot:6,position:"RW" as const,primaryDetail:"Right Wing",clubId:"fixture",valueEur:1_000_000}]};
  assert.ok(intentApi.collectionMarketPurchaseConfirmed(intent,intent,confirmed,"incoming","account"));
  assert.equal(intentApi.collectionMarketPurchaseConfirmed(intent,null,confirmed,"incoming","account"),false);
  assert.equal(intentApi.collectionMarketPurchaseConfirmed(intent,{...intent,slot:7},confirmed,"incoming","account"),false);
  assert.equal(intentApi.collectionMarketPurchaseConfirmed(intent,intent,confirmed,"incoming","other"),false);
  assert.equal(intentApi.collectionMarketPurchaseConfirmed(intent,intent,state,"incoming","account"),false);
});
const source=readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx",import.meta.url),"utf8");
test("all empty-area click handlers open original selector, never parallel picker",()=>{
  assert.doesNotMatch(source,/<ClubOwnerCollectionPicker/);
  assert.match(source,/<CompactClubSelector mode=\{browsingCoaches/);
  assert.match(source,/const openTacticalSelector[\s\S]*?chooseCollectionPlace\(\{area:"starters",slot\}\)/);
  const helper=source.slice(source.indexOf("const chooseCollectionPlace ="),source.indexOf("const guidedChoice ="));
  for(const area of ["starters","reserves","outside"] as const){
    const captured:unknown[]=[];
    const context={...intentApi,editable:true,saving:false,collectionSlotsEditable:true,geometry,primaryDetails:{},snapshot:{userId:"account"},collection:{state},canUseCollectionDestination:()=>true,visualIntentEpoch:{current:0},collectionMarketIntentRef:{current:null},
      setSquadSwap:()=>assert.fail("empty slot must not swap"),setCollectionDestination:(v:unknown)=>captured.push(v),setCollectionMarketPlayer:()=>{},setArenaOpen:()=>{},setActiveSlotId:()=>{},setBrowsePosition:()=>{},setVisibleStep:()=>{},setQuery:()=>{},scrollToLineupSection:(v:string)=>captured.push(v)};
    const choose=runInNewContext(ts.transpileModule(helper+"\nchooseCollectionPlace;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
    choose({area,slot:0});assert.equal((captured[0] as {area:string}).area,area);assert.equal(captured[1],"my-club-player-selection");
  }
});

test("original market confirmation preserves pending key owner, exact destination and suppresses cancelled late navigation",async()=>{
  const intent=intentApi.createCollectionMarketIntent(state,geometry,"account",{area:"reserves",slot:6})!;
  const helper=source.slice(source.indexOf("const confirmCollectionMarket ="),source.indexOf("const reviewBudgetRecovery ="));
  const calls:unknown[]=[];let finish:(success:boolean)=>void=()=>{};
  const confirmed:ClubAcquisitionState={...state,revision:10,players:[{playerId:"incoming",area:"reserves",slot:6,position:"RW",primaryDetail:"Right Wing",clubId:"fixture",valueEur:1_000_000}]};
  const context={...intentApi,collectionDestination:intent,collectionMarketPlayer:"incoming",geometry,snapshot:{userId:"account"},
    collectionMarketSending:{current:false},collectionMarketIntentRef:{current:intent as intentApi.CollectionMarketIntent|null},visualIntentEpoch:{current:0},
    collection:{state,purchase:(id:string,destination:unknown)=>{calls.push([id,destination]);return new Promise<boolean>(resolve=>{finish=resolve;});},getConfirmedState:()=>confirmed},
    canUseCollectionDestination:()=>true,primaryDetails:{incoming:"Right Wing"},catalogueById:new Map([["incoming",{clubName:"Fixture",editorialCard:{marketValueEur:1_000_000}}]]),marketPolicy:{},canBrowseMarketClub:()=>true,findTouchLineClub:()=>({teamId:"fixture"}),
    setCollectionDestination:(v:unknown)=>calls.push(["destination",v]),setCollectionMarketPlayer:()=>{},setSquadView:()=>{},setFeedback:()=>{},scrollToLineupSection:(v:string)=>calls.push(["scroll",v])};
  const confirm=runInNewContext(ts.transpileModule(helper+"\nconfirmCollectionMarket;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const pending=confirm();await confirm();assert.equal(calls.length,1,"double click must not submit twice");
  assert.equal(JSON.stringify(calls[0]),JSON.stringify(["incoming",{area:"reserves",slot:6}]));
  context.collectionMarketIntentRef.current=null;context.visualIntentEpoch.current++;finish(true);await pending;
  assert.equal(calls.length,1,"cancelled intent must not navigate or clear a newer selection");assert.equal(context.collectionMarketSending.current,false);
  context.collectionMarketIntentRef.current=intent;const success=confirm();finish(true);await success;
  assert.equal(JSON.stringify(calls.at(-1)),JSON.stringify(["scroll","my-club-xi-pitch"]));
  context.collection.state={...state,revision:11};const count=calls.length;await confirm();assert.equal(calls.length,count,"stale revision must not submit");
});
