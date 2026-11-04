import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { legacyCoachCatalogue, parseCoachCatalogue, parseCoachCatalogueTransport, catalogueCoachForId,
  catalogueCoachForTeamHistory, UNAVAILABLE_COACH_CATALOGUE, type CoachCatalogue } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { classifyTouchlineCoach } from "../lib/touchlineArena/coach-classification.ts";
import { TOUCHLINE_LIVE_COACHES, touchlineCoachClassificationForProviderId } from "../lib/touchlineArena/live-coaches.ts";
import { selectTouchlineCoachTierRepresentatives } from "../lib/touchlineArena/clubhub-tier-showcase.ts";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { getTouchlineCoachCardCopy } from "../lib/touchlineArena/coach-card-i18n.ts";
import { getTouchlineCoachProfileCopy } from "../lib/touchlineArena/coach-profile-i18n.ts";
import { resolveTouchlineCoachZoomPresentation } from "../lib/touchlineArena/coach-zoom-i18n.ts";

const root=fileURLToPath(new URL("../",import.meta.url)), nativeRequire=createRequire(import.meta.url);
const locales=["pt-BR","en-GB","es-ES","it-IT","fr-FR","ar-SA","tr-TR","de-DE"] as const;
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function catalogueFixture() {
  const raw=legacyCoachCatalogue().current.map((e,i)=>({id:uuid(i+1),publicationId:uuid(i+101),providerId:e.coach.providerId,
    teamId:e.coach.teamId,name:e.coach.name,nationality:e.coach.nationality,countryId:e.coach.countryId,countryCode3:e.countryCode3,
    sourceKind:e.sourceKind,observedAt:e.fetchedAt,classification:e.classification}));
  const current=raw.find(e=>e.providerId==="523911")!; assert.equal(current.teamId,"20");
  const historical={...current,id:uuid(301),publicationId:uuid(401),providerId:"30314",name:"Matthias Jaissle",classification:classifyTouchlineCoach({coachProviderId:"30314"})};
  const otherClub={...current,publicationId:uuid(402),teamId:"19"};
  const oldPublication={...current,publicationId:uuid(403)};
  const value={revision:3,current:raw,history:[...raw,historical,otherClub,oldPublication]};
  const catalogue=parseCoachCatalogue(value); assert.equal(catalogue.phase,"ready");
  return {catalogue,value,current,historical,otherClub,oldPublication};
}

test("legacy coach references remain stable and immutable while caller envelopes stay independent",()=>{
  const seedBefore=JSON.stringify(TOUCHLINE_LIVE_COACHES);
  const classificationsBefore=TOUCHLINE_LIVE_COACHES.map(({coach})=>{
    const classification=touchlineCoachClassificationForProviderId(coach.providerId)!;
    return {classification,frozen:Object.isFrozen(classification),encoded:JSON.stringify(classification)};
  });
  const first=legacyCoachCatalogue(), second=legacyCoachCatalogue();
  assert.notEqual(first,second); assert.notEqual(first.current,second.current);
  assert.equal(first.current,first.history); assert.equal(second.current,second.history);
  assert.equal(first.current.length,20);
  first.current.forEach((entry,index)=>{
    const repeated=second.current[index], seed=TOUCHLINE_LIVE_COACHES[index];
    assert.notEqual(entry,repeated,"legacy entry envelopes remain caller-local");
    assert.equal(entry.coach,repeated.coach,"repeated selectors must receive the same canonical derived coach");
    assert.notEqual(entry.coach,seed.coach,"derive context without adding properties to the frozen seed");
    assert.equal(entry.coach.source,seed.coach.source);
    assert.equal(entry.classification,classificationsBefore[index].classification);
    assert.equal(Object.isFrozen(entry.coach),true);
    assert.equal(Object.isFrozen(entry.coach.catalogueAssociation),true);
    const {catalogueAssociation,...identity}=entry.coach;
    assert.deepEqual(identity,seed.coach);
    assert.deepEqual(catalogueAssociation,{kind:"current",providerId:seed.coach.providerId,teamId:seed.coach.teamId,publicationId:null});
    assert.equal(Reflect.set(entry.coach,"displayName","Unapproved mutation"),false);
    assert.equal(Reflect.set(catalogueAssociation!,"kind","historical"),false);
    assert.equal(Object.hasOwn(seed.coach,"catalogueAssociation"),false);
  });
  const representatives=selectTouchlineCoachTierRepresentatives();
  const repeatedRepresentatives=selectTouchlineCoachTierRepresentatives();
  representatives.forEach((row,index)=>{
    assert.equal(row.snapshot?.coach,repeatedRepresentatives[index].snapshot?.coach);
    if(row.snapshot) assert.equal(row.snapshot.coach,first.current.find(entry=>entry.coach.providerId===row.snapshot!.coach.providerId)?.coach);
  });
  assert.equal(Reflect.set(first.current[0],"countryCode3","ZZZ"),true,"entry envelopes keep the existing caller-local behavior");
  assert.equal(second.current[0].countryCode3,TOUCHLINE_LIVE_COACHES[0].countryCode3);
  assert.equal(legacyCoachCatalogue().current[0].countryCode3,TOUCHLINE_LIVE_COACHES[0].countryCode3);
  assert.equal(JSON.stringify(TOUCHLINE_LIVE_COACHES),seedBefore);
  classificationsBefore.forEach(({classification,frozen,encoded})=>{
    assert.equal(Object.isFrozen(classification),frozen,"do not freeze pre-existing classification objects");
    assert.equal(JSON.stringify(classification),encoded);
  });
});

test("current means exact publication+coach+club; historical identity never changes the current20 or classification",()=>{
  const {catalogue,value,current,otherClub,oldPublication}=catalogueFixture();
  assert.equal(catalogue.current.length,20);
  assert.equal(catalogueCoachForId(catalogue,"523911")?.coach.catalogueAssociation?.kind,"current");
  assert.equal(catalogueCoachForId(catalogue,"30314")?.coach.catalogueAssociation?.kind,"historical");
  assert.equal(catalogueCoachForTeamHistory(catalogue,"523911","19")?.coach.catalogueAssociation?.kind,"historical");
  assert.equal(catalogue.history.find(e=>e.publicationId===oldPublication.publicationId)?.coach.catalogueAssociation?.kind,"historical");
  assert.equal(catalogue.history.find(e=>e.publicationId===current.publicationId)?.coach.catalogueAssociation?.kind,"current");
  assert.equal(catalogueCoachForTeamHistory(catalogue,"523911","19")?.publicationId,otherClub.publicationId);
  for(const entry of catalogue.history) {
    const original=value.history.find(e=>e.publicationId===entry.publicationId)!;
    assert.deepEqual(entry.classification,original.classification);
    assert.equal(entry.coach.providerId,original.providerId);assert.equal(entry.coach.teamId,original.teamId);assert.equal(entry.coach.name,original.name);
    assert.equal(createTouchlineArenaCoachSlot(entry.coach,null,entry.classification.tierKey).cardTier,original.classification.tierKey);
  }
  for(const entry of legacyCoachCatalogue().current) assert.equal(entry.coach.catalogueAssociation?.kind,"current");
  assert.equal(catalogueCoachForId(UNAVAILABLE_COACH_CATALOGUE,"30314"),null);
});

test("transport rederives context and ignores forged history status; partial current still fails closed",()=>{
  const {catalogue,value}=catalogueFixture();
  const forged=JSON.parse(JSON.stringify(catalogue));
  for(const entry of forged.history) entry.coach.catalogueAssociation={kind:"current",providerId:entry.coach.providerId,teamId:entry.coach.teamId,publicationId:entry.publicationId};
  const parsed=parseCoachCatalogueTransport(forged); assert.ok(parsed);
  assert.equal(catalogueCoachForId(parsed,"30314")?.coach.catalogueAssociation?.kind,"historical");
  assert.equal(catalogueCoachForTeamHistory(parsed,"523911","19")?.coach.catalogueAssociation?.kind,"historical");
  assert.deepEqual(parseCoachCatalogueTransport(catalogue),catalogue);
  assert.deepEqual(parseCoachCatalogueTransport(legacyCoachCatalogue()),legacyCoachCatalogue());
  const previousLegacy=JSON.parse(JSON.stringify(legacyCoachCatalogue()));
  for(const entry of [...previousLegacy.current,...previousLegacy.history]) delete entry.coach.catalogueAssociation;
  assert.deepEqual(parseCoachCatalogueTransport(previousLegacy),legacyCoachCatalogue(),"exact old legacy DTO is upgraded by canonical derivation");
  const forgedLegacy=JSON.parse(JSON.stringify(previousLegacy));
  forgedLegacy.history[0].coach.catalogueAssociation={kind:"historical"};
  assert.equal(parseCoachCatalogueTransport(forgedLegacy),null,"unknown metadata is not stripped to bypass exact legacy comparison");
  previousLegacy.current[0].coach.displayName="Unapproved identity";
  assert.equal(parseCoachCatalogueTransport(previousLegacy),null);
  assert.equal(parseCoachCatalogue({...value,current:value.current.slice(1)}).phase,"unavailable");
});

function surfaces(catalogue:CoachCatalogue) {
  const cache=new Map<string,unknown>();
  const empty=()=>null, children=({children}:{children:React.ReactNode})=>children;
  const stubs:Record<string,unknown>={
    "next/link":{__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement("a",props,children)},
    "next/navigation":{notFound:()=>{throw new Error("COACH_NOT_FOUND");}},
    "@/lib/touchlineArena/coach-catalogue-server":{loadCoachCatalogue:async()=>catalogue},
    "@/lib/touchlineArena/coach-ranking-server":{loadTouchLineCoachRanking:async()=>({phase:"unavailable",rows:[],snapshotId:null})},
    "@/lib/touchlineArena/account-locale-context-server":{loadAccountLocaleContext:async()=>null},
    "@/lib/touchlineArena/site-locales-release":{isTouchLineSiteLocalesEnabled:()=>true},
    "./TouchlineCardLeadershipProvider":{useTouchlineCardLeadershipAuthority:()=>null},
    "@/components/touchline/TouchlineCoachProfilePublication":{TouchlineCoachProfilePublication:children,TouchlineCoachProfileValue:empty,TouchlineCoachProfilePerformance:empty,TouchlineCoachProfileCampaign:empty},
    "@/components/touchline/TouchlineLivePresentationRefresh":{__esModule:true,default:empty},
    "@/components/touchline/TouchlineGlobalNavigation":{__esModule:true,default:empty},
    "@/components/touchline/TouchlineBrandHeader":{__esModule:true,default:empty},
    "./TouchlineCardZoom":{__esModule:true,default:empty},
  };
  function load(specifier:string,parent:string):unknown {
    if(Object.hasOwn(stubs,specifier)) return stubs[specifier];
    if(!specifier.startsWith(".")&&!specifier.startsWith("@/")) return nativeRequire(specifier);
    const base=specifier.startsWith("@/")?path.join(root,specifier.slice(2)):path.resolve(path.dirname(parent),specifier);
    if(base.endsWith(".css")) return {__esModule:true,default:new Proxy({}, {get:(_,key)=>String(key)})};
    const file=[base,`${base}.ts`,`${base}.tsx`].find(existsSync); assert.ok(file,base);
    if(file.endsWith(".json")) return JSON.parse(readFileSync(file,"utf8"));
    if(file.endsWith(".ts")) return nativeRequire(file);
    if(cache.has(file)) return cache.get(file);
    const exports:Record<string,unknown>={};cache.set(file,exports);
    runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
      {exports,require:(name:string)=>load(name,file),URL,URLSearchParams,Intl,fetch:()=>assert.fail("No network")});
    return exports;
  }
  const entryFile=path.join(root,"test.ts");
  const Page=(load("@/app/touchline-coaches/[coach]/page",entryFile) as {default:(props:unknown)=>Promise<React.ReactNode>;generateMetadata:(props:unknown)=>Promise<{title:string}>});
  const Card=(load("@/components/touchline/cards/TouchlineCoachCard",entryFile) as {default:React.ComponentType<Record<string,unknown>>}).default;
  const Zoom=(load("@/components/touchline/cards/TouchlineCoachCardZoom",entryFile) as {default:(props:Record<string,unknown>)=>React.ReactElement<{details:{title:string;subtitle:string;eyebrow:string;fields:Array<{label:string;value:string}>};children:React.ReactElement<Record<string,unknown>>;expandedContent:React.ReactElement<Record<string,unknown>>}>}).default;
  return {Page,Card,Zoom};
}

for(const locale of locales) test(`real profile/card/zoom ${locale}: historical publication has no current-appointment or verified-identity label`,async()=>{
  const {catalogue}=catalogueFixture(), {Page,Card,Zoom}=surfaces(catalogue);
  const entry=catalogueCoachForId(catalogue,"30314")!, current=catalogueCoachForId(catalogue,"523911")!;
  const baselineCard=getTouchlineCoachCardCopy(locale,true), baselineProfile=getTouchlineCoachProfileCopy(locale,true), baselineZoom=resolveTouchlineCoachZoomPresentation(locale,true).copy;
  const historicalCard=getTouchlineCoachCardCopy(locale,true,entry.coach), historicalProfile=getTouchlineCoachProfileCopy(locale,true,entry.coach);
  const slot=createTouchlineArenaCoachSlot(entry.coach,null,entry.classification.tierKey);
  const props={coach:entry.coach,slot,clubName:"Newcastle United",clubLogoUrl:"/synthetic-crest.svg",locale,draftLocalesEnabled:true,contract:null,profileHref:"/touchline-coaches/30314"};
  const card=renderToStaticMarkup(React.createElement(Card,props));
  assert.ok(card.includes(historicalCard.currentClub));assert.ok(card.includes(historicalCard.firstTeamManager));assert.ok(card.includes("Matthias Jaissle"));
  assert.ok(!card.includes(baselineCard.currentClub));assert.ok(!card.includes(baselineCard.firstTeamManager));
  const zoom=Zoom(props).props;
  assert.equal(zoom.details.title,"Matthias Jaissle");
  assert.equal(zoom.details.fields[0].label,historicalCard.currentClub);
  assert.equal(zoom.details.fields.find(f=>f.label===baselineZoom.role)?.value,historicalCard.firstTeamManager);
  assert.ok(!JSON.stringify(zoom.details).includes(baselineZoom.verifiedIdentity));
  for(const zoomCard of [zoom.children,zoom.expandedContent]) {
    assert.equal(zoomCard.props.coach,entry.coach);
    const rendered=renderToStaticMarkup(zoomCard);assert.ok(rendered.includes(historicalCard.currentClub));assert.ok(!rendered.includes(baselineCard.currentClub));
  }
  const pageProps={params:Promise.resolve({coach:"30314"}),searchParams:Promise.resolve({lang:locale})};
  const page=renderToStaticMarkup(await Page.default(pageProps));
  assert.ok(page.includes(historicalProfile.verifiedBy));assert.ok(page.includes(historicalProfile.currentClubHeading));
  assert.ok(historicalProfile.associationNote && page.includes(historicalProfile.associationNote));
  for(const claim of [baselineProfile.verifiedBy,baselineProfile.currentClubHeading,baselineProfile.officialProfile,baselineCard.currentClub,baselineCard.firstTeamManager]) assert.ok(!page.includes(claim),claim);
  assert.equal((await Page.generateMetadata(pageProps)).title,"Matthias Jaissle | TouchLine England");
  const currentPage=renderToStaticMarkup(await Page.default({params:Promise.resolve({coach:"523911"}),searchParams:Promise.resolve({lang:locale})}));
  for(const expected of [current.coach.displayName,baselineProfile.verifiedBy,baselineProfile.currentClubHeading,baselineCard.currentClub,baselineCard.firstTeamManager]) assert.ok(currentPage.includes(expected),expected);
  assert.deepEqual(getTouchlineCoachCardCopy(locale,true,current.coach),baselineCard);
  assert.deepEqual(getTouchlineCoachProfileCopy(locale,true,current.coach),baselineProfile);
  assert.deepEqual(resolveTouchlineCoachZoomPresentation(locale,true,current.coach).copy,baselineZoom);
});

test("unknown/mismatched association remains neutral; locale gates, unavailable route and legacy current behavior stay explicit",async()=>{
  const {catalogue}=catalogueFixture(), entry=catalogueCoachForId(catalogue,"30314")!;
  const unknown={...entry.coach,catalogueAssociation:undefined};
  const mismatched={...catalogueCoachForId(catalogue,"523911")!.coach,teamId:"19"};
  for(const coach of [null,unknown,mismatched]) {
    assert.equal(getTouchlineCoachCardCopy("pt-BR",false,coach).currentClub,"Clube");
    assert.equal(getTouchlineCoachCardCopy("pt-BR",false,coach).firstTeamManager,"Treinador");
    assert.equal(resolveTouchlineCoachZoomPresentation("pt-BR",false,coach).copy.verifiedIdentity,"Identidade do treinador");
  }
  for(const locale of locales.slice(2)) assert.deepEqual(getTouchlineCoachCardCopy(locale,false,entry.coach),getTouchlineCoachCardCopy("en-GB",false,entry.coach));
  const legacy=legacyCoachCatalogue(), {Page}=surfaces(legacy);
  const html=renderToStaticMarkup(await Page.default({params:Promise.resolve({coach:"523911"}),searchParams:Promise.resolve({lang:"pt-BR"})}));
  assert.match(html,/CLUBE ATUAL|Clube atual/);assert.match(html,/TouchLine Verified/);
  await assert.rejects(surfaces(UNAVAILABLE_COACH_CATALOGUE).Page.default({params:Promise.resolve({coach:"30314"}),searchParams:Promise.resolve({lang:"pt-BR"})}),/COACH_NOT_FOUND/);
});
