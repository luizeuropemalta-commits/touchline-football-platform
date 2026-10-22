import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as position from "../lib/touchlineFantasy/club-position.ts";
import * as positionDisplay from "../lib/touchlineFantasy/collection-position-display.ts";
import * as allocationCopy from "../lib/touchlineFantasy/allocation-dialog-i18n.ts";
import * as allocation from "../lib/touchlineFantasy/club-allocation.ts";
import * as slotPlan from "../lib/touchlineFantasy/collection-slot-plan.ts";
import * as primaryIndex from "../lib/touchlineFantasy/club-primary-position-index.ts";
import * as primaryPolicy from "../lib/touchlineFantasy/club-primary-position-policy.ts";
import { CLUB_POSITION_LIMITS, type ClubAcquisitionState, type ClubOwnedPlayer } from "../lib/touchlineFantasy/club-acquisition.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";

const requireNative=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText;
type Props=Record<string,unknown>;
function render(props:Props, component="ClubOwnerCollectionPicker", buttons: Props[] = [], hooks: Props = {}) {
  const runtime=requireNative("react/jsx-runtime");
  const jsx=(type:unknown,values:Props,key:unknown)=>{if(type==="button")buttons.push(values);return runtime.jsx(type,values,key);};
  const jsxs=(type:unknown,values:Props,key:unknown)=>{if(type==="button")buttons.push(values);return runtime.jsxs(type,values,key);};
  const modules:Record<string,unknown>={
    "@/lib/touchlineFantasy/allocation-dialog-i18n":allocationCopy,
    react:{...React,...hooks},"react/jsx-runtime":{...runtime,jsx,jsxs},"react-dom":{createPortal:(node:React.ReactNode)=>node},
    "lucide-react":{ArrowLeftRight:()=>null},
    "@/lib/touchlineFantasy/club-position":position,"@/lib/touchlineFantasy/collection-position-display":positionDisplay,
    "@/lib/touchlineFantasy/club-allocation":allocation,"@/lib/touchlineFantasy/collection-slot-plan":slotPlan,
    "@/lib/touchlineFantasy/club-primary-position-index":primaryIndex,"@/lib/touchlineFantasy/club-primary-position-policy":primaryPolicy,
    "@/components/touchline/a11y/TouchlineDialog":{useTouchlineDialog:()=>({dialogProps:{role:"dialog"}}),useTouchlineDialogScrollLock:()=>{}},
    "./TouchlineGameweekCard":{__esModule:true,default:()=>null},
    "@/components/touchline/market/TouchlineMarketPlayerTile":{__esModule:true,default:({card,children}: {card:{id:string};children:React.ReactNode})=>React.createElement("div",{"data-card":card.id},children)},
  };
  const exports:Record<string,React.ComponentType<Props>>={};
  runInNewContext(code,{exports,document:{body:{}},require:(name:string)=>{
    if(name.endsWith(".css"))return{__esModule:true,default:{}};
    assert.ok(Object.hasOwn(modules,name),name);return modules[name];
  }});
  return renderToStaticMarkup(React.createElement(exports[component],props));
}
const state={revision:0,seasonId:"season",plan:"vip",balanceEur:1_190_000_000,coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},formationCode:"4-3-3",players:[],receipts:[]};
const card=(id:string,detail:string|null,positionLabel=detail??"Right Wing")=>({id,canonicalPlayerId:id,name:id,clubName:"Club",position:positionLabel,primaryPositionDetail:detail,editorialCard:{marketValueEur:1_000_000}});
const props={state,geometry:formations["4-3-3"],locale:"en-GB",busy:false,enabled:true,error:null,onClose:()=>{},onRefresh:()=>{},onPurchase:async()=>true,onMove:async()=>true};
test("picker blocks stale signing and exposes read-only recovery without purchase",async()=>{
  let purchases=0,refreshes=0,closed=0;const buttons:Props[]=[];
  const html=render({...props,enabled:false,verificationRequired:true,destination:{area:"reserves",slot:6},catalogue:[card("right","Right Wing")],
    onPurchase:async()=>{purchases++;return true;},onRefresh:()=>{refreshes++;},onClose:()=>{closed++;}},"ClubOwnerCollectionPicker",buttons);
  assert.match(html,/Signing paused until the squad is confirmed/);
  const sign=buttons.find(button=>button.children==="Sign")!;
  assert.equal(sign.disabled,true);await (sign.onClick as ()=>Promise<void>)();
  (buttons.find(button=>button.children==="Refresh squad")!.onClick as ()=>void)();
  assert.equal(purchases,0);assert.equal(closed,0);assert.equal(refreshes,1);
});
test("picker confirmed signing still dispatches once and closes on success",async()=>{
  let purchases=0,closed=0;const buttons:Props[]=[];
  render({...props,destination:{area:"reserves",slot:6},catalogue:[card("right","Right Wing")],
    onPurchase:async()=>{purchases++;return true;},onClose:()=>{closed++;}},"ClubOwnerCollectionPicker",buttons);
  const sign=buttons.find(button=>button.children==="Sign")!;
  assert.equal(sign.disabled,false);await (sign.onClick as ()=>Promise<void>)();
  assert.equal(purchases,1);assert.equal(closed,1);
});
test("a non-read eligibility lock does not incorrectly offer read recovery",()=>{
  const html=render({...props,enabled:false,verificationRequired:false,destination:{area:"reserves",slot:6},catalogue:[card("right","Right Wing")]});
  assert.match(html,/This slot is not available/);
  assert.doesNotMatch(html,/Refresh squad|Signing paused until/);
});
test("mounted collection picker displays only primary right wingers for fixed RW bench place",()=>{
  const legacy={id:"legacy",canonicalPlayerId:"legacy",name:"legacy",clubName:"Club",position:"Right Wing",editorialCard:{marketValueEur:1_000_000}};
  const html=render({...props,destination:{area:"reserves",slot:6},requiredPosition:"RW",catalogue:[card("right","Right Wing"),card("left","Left Wing"),card("ten","Attacking Midfield"),card("conflict",null),legacy]});
  assert.match(html,/data-card="right"/);assert.match(html,/data-card="legacy"/);
  for(const id of ["left","ten","conflict"]) assert.doesNotMatch(html,new RegExp(`data-card="${id}"`));
});
test("mounted Exchange picker checks planned vacancy even without a caller-supplied category",()=>{
  const html=render({...props,destination:{area:"outside",slot:0},catalogue:[card("keeper","Goalkeeper"),card("right","Right Wing")]});
  assert.match(html,/data-card="keeper"/);assert.doesNotMatch(html,/data-card="right"/);
});
test("mounted existing-player placement resolves legacy detail read-only and offers only the correct wing",()=>{
  const player={playerId:"legacy",clubId:"club",area:"outside",slot:0,position:"LW",valueEur:1_000_000};
  const owned={...state,players:[player]};const before=structuredClone(owned);
  const html=render({...props,state:owned,playerId:"legacy",enabled:true,catalogue:[card("legacy","Left Wing")]},"ClubOwnerPlayerPlacementDialog");
  assert.match(html,/Start at LW/);assert.doesNotMatch(html,/Start at RW/);
  assert.deepEqual(owned,before);assert.equal(Object.hasOwn(player,"primaryDetail"),false);
});

function swapHarness(overrides:Props={},component="ClubOwnerSquadSwapDialog") {
  const players=[{playerId:"starter",area:"starters",slot:8},{playerId:"bench",area:"reserves",slot:6},{playerId:"outside",area:"outside",slot:0}]
    .map(p=>({...p,clubId:"club",position:"RW",primaryDetail:"Right Wing",valueEur:1_000_000}));
  const owned={...state,players};
  let moves=0,closed=0,index=0;const cells:unknown[]=[];const moveArgs:unknown[][]=[];
  const hooks={useState:(initial:unknown)=>{const i=index++;if(!(i in cells))cells[i]=initial;return[cells[i],(v:unknown)=>{cells[i]=v;}];},useRef:(v:unknown)=>{const i=index++;if(!(i in cells))cells[i]={current:v};return cells[i];}};
  const input:Props={...props,state:owned,playerId:"starter",catalogue:[...players.map(p=>card(p.playerId,"Right Wing")),card("unowned","Right Wing")],onMove:async(...args:unknown[])=>{moves++;moveArgs.push(args);return true;},onClose:()=>{closed++;},...overrides};
  let buttons:Props[]=[];
  const draw=()=>{index=0;buttons=[];return render(input,component,buttons,hooks);};
  const click=async(label:string,occurrence=0)=>{const b=buttons.filter(b=>Array.isArray(b.children)?b.children.flat(Infinity).join("")===label:b.children===label)[occurrence];assert.ok(b,label);await(b.onClick as ()=>unknown)();};
  return{input,draw,click,moveArgs,get moves(){return moves;},get closed(){return closed;}};
}
test("internal swap lists contracted bench/outside only; choosing and cancelling never move",async()=>{
  const h=swapHarness(),html=h.draw();
  assert.match(html,/Bench/);assert.match(html,/Outside match squad/);
  assert.match(html,/data-card="bench"/);assert.match(html,/data-card="outside"/);
  assert.doesNotMatch(html,/data-card="starter"|data-card="unowned"|TouchLine Markt Transfer|>Sign</);
  await h.click("Select");assert.equal(h.moves,0);h.draw();await h.click("Back");h.draw();
  await h.click("Cancel");assert.equal(h.moves,0);assert.equal(h.closed,1);
});

const fullDetails:Record<ClubOwnedPlayer["position"],string>={GK:"Goalkeeper",CB:"Centre Back",RB:"Right Back",LB:"Left Back",DM:"Defensive Midfield",MID:"Central Midfield",RW:"Right Wing",LW:"Left Wing",CF:"Centre Forward"};
function full35State():ClubAcquisitionState {
  // A real eligible DM at RCM makes all nine quota categories present in XI.
  const seed:ClubOwnedPlayer={playerId:"seed",area:"starters",slot:5,position:"DM",primaryDetail:"Defensive Midfield",clubId:"fixture",valueEur:1_000_000};
  const plan=slotPlan.collectionSlotPlan(formations["4-3-3"],[seed]);assert.ok(plan);
  const players:ClubOwnedPlayer[]=(["starters","reserves","outside"] as const).flatMap(area=>plan[area].map((position,slot)=>({playerId:`${area}-${slot}`,area,slot,position,primaryDetail:fullDetails[position],clubId:"fixture",valueEur:1_000_000})));
  return {...state,plan:"vip",formationCode:"4-3-3",revision:7,players,receipts:[{key:"retained-receipt",playerId:"starters-0",area:"starters",slot:0,valueEur:1_000_000,revision:1}]};
}
function assertFull35Invariant(before:ClubAcquisitionState,after:ClubAcquisitionState){
  assert.equal(after.players.length,35);assert.equal(new Set(after.players.map(p=>p.playerId)).size,35);
  assert.deepEqual(["starters","reserves","outside"].map(area=>after.players.filter(p=>p.area===area).length),[11,9,15]);
  for(const [position,count]of Object.entries(CLUB_POSITION_LIMITS))assert.equal(after.players.filter(p=>p.position===position).length,count);
  const contracts=(s:ClubAcquisitionState)=>s.players.map(({area,slot,...contract})=>{void area;void slot;return contract;});
  assert.deepEqual(contracts(after),contracts(before));assert.equal(after.balanceEur,before.balanceEur);
  assert.deepEqual(after.coach,before.coach);assert.deepEqual(after.receipts,before.receipts);
  assert.ok(slotPlan.collectionSlotPlan(formations["4-3-3"],after.players));
  for(const p of after.players.filter(p=>p.area==="starters"))assert.ok(primaryPolicy.primaryPositionFitsTacticalSlot(p.primaryDetail,"4-3-3",formations["4-3-3"].slots[p.slot].id));
}
for(const position of Object.keys(fullDetails) as ClubOwnedPlayer["position"][])for(const area of ["starters","reserves","outside"] as const){
  test(`full35 confirmed swap ${position} source ${area} preserves both places and contracts`,async()=>{
    const before=full35State(),snapshot=structuredClone(before);assertFull35Invariant(before,before);
    const source=before.players.find(p=>p.position===position&&p.area===area);assert.ok(source);
    const target=before.players.find(p=>p.position===position&&p.area===(area==="reserves"?"outside":"reserves"));assert.ok(target);
    const catalogue=before.players.map(p=>card(p.playerId,p.primaryDetail??null));
    const h=swapHarness({state:before,playerId:source.playerId,catalogue});
    const rendered=h.draw();const ids=[...rendered.matchAll(/data-card="([^"]+)"/g)].map(m=>m[1]);
    const index=ids.indexOf(target.playerId);assert.ok(index>=0,`${target.playerId} must be offered`);
    await h.click("Select",index);assert.equal(h.moves,0);h.draw();await h.click("Cancel");
    assert.deepEqual(before,snapshot);assert.deepEqual(h.moveArgs,[]);
    const confirm=swapHarness({state:before,playerId:source.playerId,catalogue});confirm.draw();await confirm.click("Select",index);confirm.draw();await confirm.click("Confirm squad change");
    assert.equal(JSON.stringify(confirm.moveArgs),JSON.stringify([[target.playerId,{area:source.area,slot:source.slot}]]));
    const command={action:"move" as const,playerId:target.playerId,area:source.area,slot:source.slot,expectedRevision:before.revision,idempotencyKey:`full35_${position}_${area}`};
    const preview=slotPlan.previewPlannedClubAllocation(before,command,formations["4-3-3"]);assert.ok(preview);
    const applied=allocation.allocateClubPlayers(before,command,{marketOpen:true,geometry:formations["4-3-3"],reservedIds:[]});
    assert.deepEqual(applied,preview);assertFull35Invariant(before,applied);assert.deepEqual(before,snapshot);
    const moved=applied.players.find(p=>p.playerId===target.playerId)!;const displaced=applied.players.find(p=>p.playerId===source.playerId)!;
    assert.deepEqual([moved.area,moved.slot],[source.area,source.slot]);assert.deepEqual([displaced.area,displaced.slot],[target.area,target.slot]);assert.equal(applied.revision,before.revision+1);
  });
}
test("full35 rejects displaced MID into fixed DM bench and wrong-wing detail",()=>{
  const before=full35State(),snapshot=structuredClone(before);
  const mid=before.players.find(p=>p.position==="MID"&&p.area==="starters")!;
  const dm=before.players.find(p=>p.position==="DM"&&p.area==="reserves")!;
  assert.ok(primaryPolicy.primaryPositionFitsTacticalSlot(dm.primaryDetail,"4-3-3",formations["4-3-3"].slots[mid.slot].id),"incoming DM fits; displaced MID must still reject");
  assert.equal(slotPlan.previewPlannedClubAllocation(before,{action:"move",playerId:dm.playerId,area:mid.area,slot:mid.slot,expectedRevision:7,idempotencyKey:"invalid_displaced"},formations["4-3-3"]),null);
  const rw=before.players.find(p=>p.position==="RW"&&p.area==="starters")!,lw=before.players.find(p=>p.position==="LW"&&p.area==="outside")!;
  assert.equal(slotPlan.previewPlannedClubAllocation(before,{action:"move",playerId:lw.playerId,area:rw.area,slot:rw.slot,expectedRevision:7,idempotencyKey:"invalid_wing"},formations["4-3-3"]),null);
  assert.deepEqual(before,snapshot);
});
test("internal swap needs explicit confirmation and rejects stale revision",async()=>{
  const h=swapHarness();h.draw();await h.click("Select");h.draw();await h.click("Confirm squad change");assert.equal(h.moves,1);assert.equal(h.closed,1);
  assert.equal(JSON.stringify(h.moveArgs),JSON.stringify([["bench",{area:"starters",slot:8}]]));
  const stale=swapHarness();stale.draw();await stale.click("Select");
  stale.input.state={...(stale.input.state as object),revision:1};stale.draw();await stale.click("Confirm squad change");assert.equal(stale.moves,0);
});
test("internal swap disabled guard prevents selection even if handler is invoked",async()=>{
  const h=swapHarness({enabled:false});h.draw();await h.click("Select");assert.equal(h.moves,0);assert.doesNotMatch(h.draw(),/>Confirm squad change</);
});
test("outside-only action excludes bench and offers compatible outside places without immediate mutation",()=>{
  const h=swapHarness({outsideOnly:true});const html=h.draw();
  assert.doesNotMatch(html,/data-card="bench"/);assert.match(html,/data-card="outside"/);assert.equal(h.moves,0);
});
test("synchronous repeated confirmation cannot dispatch a second pending move",async()=>{
  let calls=0,finish:()=>void=()=>{};
  const h=swapHarness({onMove:()=>{calls++;return new Promise<boolean>(resolve=>{finish=()=>resolve(true);});}});
  h.draw();await h.click("Select");h.draw();const pending=h.click("Confirm squad change");
  await h.click("Confirm squad change");assert.equal(calls,1);finish();await pending;
});
test("both sides are validated: central starter cannot displace into incompatible fixed DM bench",()=>{
  const players=[{playerId:"starter",area:"starters",slot:5,position:"MID",primaryDetail:"Central Midfield"},
    {playerId:"bench",area:"reserves",slot:4,position:"DM",primaryDetail:"Defensive Midfield"}].map(p=>({...p,clubId:"club",valueEur:1_000_000}));
  const h=swapHarness({state:{...state,players},catalogue:[card("starter","Central Midfield"),card("bench","Defensive Midfield")]});
  assert.doesNotMatch(h.draw(),/data-card="bench"/);
});
test("outside player can enter starting XI only after explicit confirmation",async()=>{
  const h=swapHarness({playerId:"outside"},"ClubOwnerPlayerPlacementDialog");
  h.draw();await h.click("Start at RW · replacing starter");assert.equal(h.moves,0);
  h.draw();await h.click("Confirm");assert.equal(h.moves,1);
  assert.deepEqual(h.moveArgs,[[8]]);
});

test("incomplete squad cannot move starter outside without a contracted substitute",async()=>{
  const h=swapHarness({outsideOnly:true});
  h.input.state={...(h.input.state as typeof state),players:(h.input.state as typeof state).players.filter(p=>p.playerId==="starter")};
  const html=h.draw();
  assert.match(html,/No compatible players/);assert.doesNotMatch(html,/Vacant slot|>Select<|>Confirm squad change</);
  await h.click("Cancel");assert.deepEqual(h.moveArgs,[]);
});
test("outside replacement swaps exact contracted identities and destinations",async()=>{
  const out=swapHarness({outsideOnly:true});out.draw();await out.click("Select");out.draw();await out.click("Confirm squad change");
  assert.equal(JSON.stringify(out.moveArgs),JSON.stringify([["starter",{area:"outside",slot:0}]]));
  const occupied=swapHarness({playerId:"outside"});occupied.draw();await occupied.click("Select");occupied.draw();await occupied.click("Confirm squad change");
  assert.equal(JSON.stringify(occupied.moveArgs),JSON.stringify([["bench",{area:"outside",slot:0}]]));
});
test("outside slot integration routes occupied to squad swap and only empty to purchase",()=>{
  const source=readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx",import.meta.url),"utf8");
  const helper=source.slice(source.indexOf("const chooseCollectionPlace ="),source.indexOf("const guidedChoice ="));
  assert.match(source,/area="outside" count=\{15\} grouped[\s\S]*?onChoose=\{chooseCollectionPlace\}/);
  const calls:unknown[]=[];
  const context={editable:true,saving:false,collectionSlotsEditable:true,collection:{state:{players:[{playerId:"owned-outside",area:"outside",slot:0}]}},
    geometry:{slots:[]},primaryDetails:{},snapshot:{userId:"fixture"},canUseCollectionDestination:()=>true,createCollectionMarketIntent:(_state:unknown,_geometry:unknown,_account:unknown,destination:unknown)=>destination,
    visualIntentEpoch:{current:0},collectionMarketIntentRef:{current:null},setCollectionMarketPlayer:()=>{},setArenaOpen:()=>{},setActiveSlotId:()=>{},setBrowsePosition:()=>{},setVisibleStep:()=>{},setQuery:()=>{},scrollToLineupSection:()=>{},
    setSquadSwap:(v:unknown)=>calls.push(["swap",v]),setCollectionDestination:(v:unknown)=>{if(v)calls.push(["purchase",v]);}};
  const choose=runInNewContext(ts.transpileModule(helper+"\nchooseCollectionPlace;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  choose({area:"outside",slot:0});choose({area:"outside",slot:1});
  assert.equal(JSON.stringify(calls),JSON.stringify([["swap",{playerId:"owned-outside",outsideOnly:false}],["purchase",{area:"outside",slot:1}]]));
  context.collectionSlotsEditable=false;choose({area:"outside",slot:0});choose({area:"outside",slot:1});assert.equal(calls.length,2);
});
