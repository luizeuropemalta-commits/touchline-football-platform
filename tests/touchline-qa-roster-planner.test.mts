import test from "node:test";
import assert from "node:assert/strict";
import { planQaRoster, rehearseQaRoster, type CataloguePlayer } from "../scripts/qa/plan-clubowner-test-rosters.mts";
import { CLUB_POSITION_LIMITS } from "../lib/touchlineFantasy/club-acquisition.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
const options={projectRef:"xgxbwqxjssxxuihuwmgy",coachValue:70_000_000,reserveCredits:50_000_000};
const fixtureDetails:Record<string,string>={GK:"Goalkeeper",CB:"Centre Back",RB:"Right Back",LB:"Left Back",
  DM:"Defensive Midfield",MID:"Central Midfield",RW:"Right Wing",LW:"Left Wing",CF:"Centre Forward"};
const catalogue:CataloguePlayer[]=Object.keys(CLUB_POSITION_LIMITS).flatMap((position,p)=>
  Array.from({length:20},(_,n)=>({player_id:`player-${p}-${n}`,club_id:`club-${n}`,
    name:`Player ${p} ${n}`,club_name:`Club ${n}`,position,primary_detail:fixtureDetails[position],value_eur:(n+1)*3_000_000})));

test("QA planner preserves exact position quotas, coach cost and fee reserve",()=>{
  const plan=planQaRoster(catalogue,options);
  assert.equal(plan.applied,false);
  assert.equal(plan.players.length,35);
  assert.deepEqual(plan.byPosition,CLUB_POSITION_LIMITS);
  assert.equal(new Set(plan.players.map(p=>p.player_id)).size,35);
  assert.equal(plan.playersValue+plan.coachValue+plan.remainingCredits,3_000_000_000);
  assert.ok(plan.remainingCredits>=50_000_000);
});
test("second roster can exclude the first to prepare distinct swap candidates",()=>{
  const first=planQaRoster(catalogue,options);
  const second=planQaRoster(catalogue,{...options,coachValue:50_000_000,exclude:first.players.map(p=>p.player_id)});
  const owned=new Set(first.players.map(p=>p.player_id));
  assert.equal(second.players.some(p=>owned.has(p.player_id)),false);
  assert.deepEqual(second.byPosition,CLUB_POSITION_LIMITS);
});
test("planner rejects other environments and invalid financial instructions",()=>{
  for(const projectRef of ["vxireiswggllwhbsmdcj","","qa"])
    assert.throws(()=>planQaRoster(catalogue,{...options,projectRef}),/QA_TARGET_REQUIRED/);
  assert.throws(()=>planQaRoster(catalogue,{...options,coachValue:0}),/INVALID_COACH_VALUE/);
  assert.throws(()=>planQaRoster(catalogue,{...options,reserveCredits:0}),/POSITIVE_FEE_RESERVE_REQUIRED/);
  assert.throws(()=>planQaRoster(catalogue,{...options,reserveCredits:3_000_000_000}),/INSUFFICIENT_BUDGET/);
});
test("planner permits all players from one club but rejects missing positions and unaffordable catalogue",()=>{
  assert.throws(()=>planQaRoster(catalogue.filter(p=>p.position!=="GK"),options),/NO_FEASIBLE_35_PLAYER_ROSTER/);
  assert.deepEqual(planQaRoster(catalogue.map(p=>({...p,club_id:"one"})),options).byClub,{one:35});
  assert.throws(()=>planQaRoster(catalogue.map(p=>({...p,value_eur:100_000_000})),options),/NO_ROSTER_WITHIN_BUDGET/);
});
test("planner rejects ambiguous identities and prices instead of inventing offers",()=>{
  assert.throws(()=>planQaRoster([...catalogue,catalogue[0]],options),/DUPLICATE_CATALOGUE_ID/);
  assert.throws(()=>planQaRoster([{...catalogue[0],value_eur:NaN},...catalogue.slice(1)],options),/INVALID_CATALOGUE_PLAYER/);
  assert.throws(()=>planQaRoster([{...catalogue[0],club_id:""},...catalogue.slice(1)],options),/INVALID_CATALOGUE_PLAYER/);
});
test("planning is deterministic and leaves the source catalogue untouched",()=>{
  const before=JSON.stringify(catalogue);
  assert.deepEqual(planQaRoster(catalogue,options),planQaRoster([...catalogue].reverse(),options));
  assert.equal(JSON.stringify(catalogue),before);
});
test("offline rehearsal uses canonical debit transitions and fills eleven, nine and fifteen",()=>{
  const plan=planQaRoster(catalogue,options);
  const result=rehearseQaRoster(plan,{seasonId:"test-season",coach:{id:"307",tier:"diamond-gold",valueEur:70_000_000},
    geometry:TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"],commandPrefix:"qa_roster_first"});
  assert.equal(result.applied,false);
  assert.equal(result.initial.players.length,0);
  assert.equal(result.acquisitions.length,35);
  assert.equal(result.projectedState.receipts.length,35);
  assert.equal(result.projectedState.revision,36);
  assert.equal(result.projectedState.balanceEur,plan.remainingCredits);
  assert.equal(result.projectedState.players.filter(p=>p.area==="starters").length,11);
  assert.equal(result.projectedState.players.filter(p=>p.area==="reserves").length,9);
  assert.equal(result.projectedState.players.filter(p=>p.area==="outside").length,15);
  assert.deepEqual(result.projectedState.players.filter(p=>p.area==="reserves").map(p=>p.position),
    ["GK","CB","RB","LB","DM","MID","RW","LW","CF"]);
  const slots=TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"].slots;
  for(const [slotId,detail] of [["RW","Right Wing"],["LW","Left Wing"]])
    assert.equal(result.projectedState.players.find(p=>p.area==="starters" && slots[p.slot].id===slotId)?.primaryDetail,detail);
});
test("offline rehearsal rejects missing or conflicting primary details without inventing them",()=>{
  for(const primary_detail of [undefined,"Right Wing"]) {
    const plan=planQaRoster(catalogue.map(p=>p.position==="GK"?{...p,primary_detail}:p),options);
    assert.throws(()=>rehearseQaRoster(plan,{seasonId:"test-season",coach:{id:"307",tier:"diamond-gold",valueEur:70_000_000},
      geometry:TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"],commandPrefix:"qa_invalid_detail"}),/CLUB_PRIMARY_POSITION_UNCONFIRMED/);
  }
});

test("offline rehearsal fills canonical CAM and paired inside tens using explicit attacking midfield details",()=>{
  // Exactly 35 synthetic offers retain the approved quotas. No real player's
  // registration is inferred or rewritten by this fixture.
  const offers=Object.entries(CLUB_POSITION_LIMITS).flatMap(([position,count])=>
    Array.from({length:count},(_,n)=>({player_id:`exact-${position}-${n}`,club_id:"synthetic-club",
      name:`Synthetic ${position} ${n}`,club_name:"Synthetic club",position,
      primary_detail:position==="MID" && n<2?"Attacking Midfield":fixtureDetails[position],
      value_eur:position==="MID" && n<2?20_000_000:10_000_000})));
  const plan=planQaRoster(offers,options),before=JSON.stringify(plan);
  for(const code of ["4-2-3-1","3-4-2-1"]) {
    const geometry=TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY[code];
    const result=rehearseQaRoster(plan,{seasonId:"synthetic-season",coach:{id:"307",tier:"diamond-gold",valueEur:70_000_000},
      geometry,commandPrefix:"qa_inside_tens"});
    const required=code==="4-2-3-1"?["CAM"]:["RAM","LAM"];
    for(const slotId of required)assert.equal(result.projectedState.players.find(player=>
      player.area==="starters" && geometry.slots[player.slot].id===slotId)?.primaryDetail,"Attacking Midfield");
    assert.deepEqual(result.projectedState.players.filter(player=>player.area==="reserves").map(player=>player.position),
      ["GK","CB","RB","LB","DM","MID","RW","LW","CF"]);
    assert.equal(result.projectedState.players.length,35);
    assert.equal(result.projectedState.receipts.length,35);
    assert.equal(result.projectedState.balanceEur,plan.remainingCredits);
    assert.equal(JSON.stringify(plan),before);
  }
});

test("quota-complete roster without an attacking midfielder cannot fill CAM or inside tens",()=>{
  const plan=planQaRoster(catalogue,options),before=JSON.stringify(plan);
  for(const code of ["4-2-3-1","3-4-2-1"])assert.throws(()=>rehearseQaRoster(plan,{
    seasonId:"synthetic-season",coach:{id:"307",tier:"diamond-gold",valueEur:70_000_000},
    geometry:TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY[code],commandPrefix:"qa_no_inside_ten",
  }),/ROSTER_CANNOT_FILL_FORMATION/);
  assert.equal(JSON.stringify(plan),before);
});
