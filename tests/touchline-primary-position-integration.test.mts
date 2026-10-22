import test from "node:test";
import assert from "node:assert/strict";
import { clubPrimaryPositionIndex, ownedClubPrimaryDetail } from "../lib/touchlineFantasy/club-primary-position-index.ts";
import { purchaseClubPlayer, type ClubAcquisitionAuthority, type ClubAcquisitionStore } from "../lib/touchlineFantasy/club-acquisition-service.ts";
import { type ClubAcquisitionState, type ClubAcquisitionCommand } from "../lib/touchlineFantasy/club-acquisition.ts";
import { allocateClubPlayers } from "../lib/touchlineFantasy/club-allocation.ts";
import { validateTouchlineFantasyLineup } from "../lib/touchlineFantasy/domain.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";

const initial = (): ClubAcquisitionState => ({ revision:0, seasonId:"season", plan:"vip", balanceEur:1_190_000_000,
  coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},formationCode:"4-3-3",players:[],receipts:[] });
function fixture(state = initial()) {
  let persisted = structuredClone(state); let commits = 0;
  const store: ClubAcquisitionStore = {
    read:async()=>structuredClone(persisted),
    commit:async(_owner,before,next)=>{ assert.equal(before.revision,persisted.revision); commits++; persisted=structuredClone(next); return persisted; },
  };
  const authority: ClubAcquisitionAuthority = {ownerId:"owner",seasonId:"season",active:true,marketOpen:true,allowedClubIds:null,
    geometry:formations["4-3-3"],primaryDetails:{winger:"Right Wing"},
    offer:{playerId:"winger",clubId:"club",position:"RW",primaryDetail:"Right Wing",valueEur:70_000_000,published:true}};
  const command: ClubAcquisitionCommand = {playerId:"winger",area:"starters",slot:formations["4-3-3"].slots.findIndex(s=>s.id==="RW"),expectedRevision:state.revision,idempotencyKey:"purchase_winger"};
  return {store,authority,command,read:()=>persisted,commits:()=>commits};
}

test("trusted projection never falls back to a display bucket; legacy preview is opt-in and explicit null wins",()=>{
  const cards=[{id:"legacy",position:"Right Wing"},{id:"conflict",position:"Right Wing",primaryPositionDetail:null},{id:"valid",primaryPositionDetail:"Central Midfield"}];
  assert.equal(clubPrimaryPositionIndex(cards).legacy,null);
  assert.equal(clubPrimaryPositionIndex(cards,{allowLegacyDisplay:true}).legacy,"Right Wing");
  assert.equal(clubPrimaryPositionIndex(cards,{allowLegacyDisplay:true}).conflict,null);
  assert.equal(clubPrimaryPositionIndex([{id:"dup",primaryPositionDetail:"Right Wing"},{id:"dup",primaryPositionDetail:"Right Wing"}]).dup,null);
  assert.equal(ownedClubPrimaryDetail({playerId:"valid",position:"MID"},clubPrimaryPositionIndex(cards)),"Central Midfield");
  assert.equal(ownedClubPrimaryDetail({playerId:"valid",position:"MID",primaryDetail:"Attacking Midfield"},clubPrimaryPositionIndex(cards)),null);
  assert.equal(ownedClubPrimaryDetail({playerId:"valid",position:"RW"},clubPrimaryPositionIndex(cards)),null);
  assert.equal(ownedClubPrimaryDetail({playerId:"missing",position:"RW",primaryDetail:"Right Wing"},{}),null);
});
test("valid acquisition persists the primary detail and debits once; replay survives missing new catalogue authority",async()=>{
  const f=fixture(); const bought=await purchaseClubPlayer(f.store,f.authority,f.command);
  assert.equal(bought.state.players[0].primaryDetail,"Right Wing");
  assert.equal(bought.state.balanceEur,1_120_000_000);
  const replay=await purchaseClubPlayer(f.store,{...f.authority,marketOpen:false,offer:null,primaryDetails:{}},f.command);
  assert.equal(replay.replayed,true); assert.equal(f.commits(),1); assert.deepEqual(replay.state,bought.state);
});
test("an attacking midfielder cannot be bought into RW; failure commits nothing or changes balance",async()=>{
  const f=fixture(); const before=structuredClone(f.read());
  await assert.rejects(()=>purchaseClubPlayer(f.store,{...f.authority,primaryDetails:{winger:"Attacking Midfield"},
    offer:{...f.authority.offer!,position:"MID",primaryDetail:"Attacking Midfield"}},f.command),/CLUB_SLOT_POSITION_INVALID/);
  assert.equal(f.commits(),0); assert.deepEqual(f.read(),before);
  await assert.rejects(()=>purchaseClubPlayer(f.store,{...f.authority,primaryDetails:{}},f.command),/CLUB_PRIMARY_POSITION_UNCONFIRMED/);
  assert.equal(f.commits(),0);
});
test("bench and Exchange purchases respect the precomputed primary category, not a generic vacant plus",async()=>{
  const f=fixture();
  for(const destination of [{area:"reserves" as const,slot:7},{area:"outside" as const,slot:0}]) {
    await assert.rejects(()=>purchaseClubPlayer(f.store,f.authority,{...f.command,...destination}),/CLUB_COLLECTION_POSITION_INVALID/);
  }
  const bought=await purchaseClubPlayer(f.store,f.authority,{...f.command,area:"reserves",slot:6});
  assert.equal(bought.state.players[0].position,"RW"); assert.equal(f.commits(),1);
});
test("legacy contracts resolve via current trusted detail without adding or reclassifying stored fields",()=>{
  const state:ClubAcquisitionState={...initial(),players:[{playerId:"legacy",clubId:"club",position:"RW",area:"outside",slot:0,valueEur:50_000_000}]};
  const before=structuredClone(state);
  const command={action:"move" as const,playerId:"legacy",area:"starters" as const,slot:formations["4-3-3"].slots.findIndex(s=>s.id==="RW"),expectedRevision:0,idempotencyKey:"move_legacy"};
  const moved=allocateClubPlayers(state,command,{marketOpen:true,geometry:formations["4-3-3"],reservedIds:[],primaryDetails:{legacy:"Right Wing"}});
  assert.equal(Object.hasOwn(moved.players[0],"primaryDetail"),false);
  assert.equal(moved.players[0].position,"RW"); assert.equal(moved.balanceEur,state.balanceEur); assert.deepEqual(state,before);
  assert.throws(()=>allocateClubPlayers(state,command,{marketOpen:true,geometry:formations["4-3-3"],reservedIds:[]}),/CLUB_PRIMARY_POSITION_UNCONFIRMED/);
});
test("4-5-1 wide midfield accepts same-side winger without changing its quota; missing detail fails closed",()=>{
  const geometry=formations["4-5-1"];
  const args={geometry,selections:[{playerId:"winger",slotId:"RM"}],players:[{playerId:"winger",clubId:"club",marketValueEur:70_000_000,positionBucket:"attacker" as const}],budgetEur:null,maxPlayersPerClub:35};
  assert.equal(validateTouchlineFantasyLineup({...args,primaryDetails:{winger:"Right Wing"}}).valid,true);
  assert.equal(validateTouchlineFantasyLineup({...args,primaryDetails:{winger:"Left Wing"}}).valid,false);
  assert.equal(validateTouchlineFantasyLineup({...args,primaryDetails:{}}).valid,false);
  const player={playerId:"winger",clubId:"club",position:"RW" as const,primaryDetail:"Right Wing",area:"starters" as const,slot:geometry.slots.findIndex(s=>s.id==="RM"),valueEur:70_000_000};
  const plan=collectionSlotPlan(geometry,[player]); assert.ok(plan); assert.equal(plan.starters[player.slot],"RW");
});
test("a formation change cannot silently relocate a reserved starter",()=>{
  const geometry=formations["4-3-3"];
  const state:ClubAcquisitionState={...initial(),players:[{playerId:"reserved",clubId:"club",position:"RW",primaryDetail:"Right Wing",area:"starters",slot:geometry.slots.findIndex(s=>s.id==="RW"),valueEur:50_000_000}]};
  const before=structuredClone(state);
  assert.throws(()=>allocateClubPlayers(state,{action:"formation",formationCode:"3-5-2",expectedRevision:0,idempotencyKey:"change_shape"},
    {marketOpen:true,geometry:formations["3-5-2"],reservedIds:["reserved"]}),/CLUB_PLAYER_RESERVED_OR_MISSING/);
  assert.deepEqual(state,before);
});
