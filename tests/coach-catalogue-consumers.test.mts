import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { legacyCoachCatalogue, parseCoachCatalogue, UNAVAILABLE_COACH_CATALOGUE, type CoachCatalogue } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { classifyTouchlineCoach } from "../lib/touchlineArena/coach-classification.ts";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { CLUB_COACH_VALUES, inspectClubAcquisition } from "../lib/touchlineFantasy/club-acquisition.ts";

function publishedCatalogue() {
  const history=legacyCoachCatalogue().current.map(e=>({id:randomUUID(),publicationId:randomUUID(),providerId:e.coach.providerId,teamId:e.coach.teamId,name:e.coach.name,nationality:e.coach.nationality,countryId:e.coach.countryId,countryCode3:e.countryCode3,sourceKind:"legacy_seed_bootstrap",observedAt:e.fetchedAt,classification:e.classification}));
  const current=[...history];const added={...history[0],id:randomUUID(),publicationId:randomUUID(),providerId:"99991",name:"Synthetic replacement",sourceKind:"sportmonks.fixture.coaches",classification:classifyTouchlineCoach({coachProviderId:"99991"})};current[0]=added;history.push(added);
  const catalogue=parseCoachCatalogue({revision:4,current,history});assert.equal(catalogue.phase,"ready");return catalogue;
}
function fantasyReader(catalogue:CoachCatalogue) {
  let reads=0;
  const exports:Record<string,unknown>={};
  const modules:Record<string,unknown>={"@/lib/touchlineArena/coach-catalogue-server":{loadCoachCatalogue:async()=>catalogue},
    "@/lib/touchlineArena/coach-ranking-server":{loadTouchLineCoachRanking:async()=>({phase:"unavailable",rows:[]})},
    "@/lib/touchlineArena/coach-card":{createTouchlineArenaCoachSlot}};
  const source=readFileSync(new URL("../lib/touchlineFantasy/server.ts",import.meta.url),"utf8")+"\nexports.loadCoachesForTest=loadCoaches;";
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>modules[name]??{}});
  const admin={from(table:string){assert.equal(table,"football_clubs");reads++;const query={select:()=>query,eq:()=>query,in(_key:string,ids:string[]){assert.equal(new Set(ids).size,ids.length);return Promise.resolve({error:null,data:ids.map(id=>({id:`canonical-club-${id}`,provider_team_id:id,name:`Club ${id}`,logo_url:null}))});}};return query;}};
  return {reads:()=>reads,run:()=> (exports.loadCoachesForTest as (admin:unknown)=>Promise<Array<{id:string;selectable:boolean;catalogueRevision?:number;cataloguePublicationId?:string;slot:{cardTier:keyof typeof CLUB_COACH_VALUES};coach:{providerId:string}}>>)(admin)};
}
test("real Fantasy coach reader keeps the purchased historical card while only current publications remain selectable",async()=>{
  const catalogue=publishedCatalogue(),reader=fantasyReader(catalogue),before={...CLUB_COACH_VALUES};
  const rows=await reader.run();assert.equal(reader.reads(),1);assert.equal(rows.length,21);assert.equal(rows.filter(r=>r.selectable).length,20);
  assert.equal(rows.find(r=>r.id==="307")?.selectable,false);assert.equal(rows.find(r=>r.id==="99991")?.selectable,true);
  assert.equal(rows.find(r=>r.id==="99991")?.catalogueRevision,catalogue.revision);
  assert.equal(rows.find(r=>r.id==="99991")?.cataloguePublicationId,catalogue.current.find(e=>e.coach.providerId==="99991")?.publicationId);
  assert.equal(rows.find(r=>r.id==="307")?.slot.cardTier,"diamond-gold");assert.equal(rows.find(r=>r.id==="99991")?.slot.cardTier,"sapphire-blue");assert.deepEqual(CLUB_COACH_VALUES,before);
  const owned={revision:1,seasonId:"season",plan:"standard" as const,balanceEur:30_000_000,coach:{id:"307",tier:"diamond-gold" as const,valueEur:70_000_000},players:[],receipts:[],formationCode:"4-3-3"};
  const copy=structuredClone(owned);assert.doesNotThrow(()=>inspectClubAcquisition(owned));assert.deepEqual(owned,copy);
});
test("real Fantasy reader does not query clubs or restore a seed after enabled catalogue failure",async()=>{
  const reader=fantasyReader(UNAVAILABLE_COACH_CATALOGUE);assert.equal((await reader.run()).length,0);assert.equal(reader.reads(),0);
});
