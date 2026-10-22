import test from "node:test";
import assert from "node:assert/strict";
import { allocateClubPlayers, clubStarterSelections, clubStarterDestinations, parseClubAllocationCommand } from "../lib/touchlineFantasy/club-allocation.ts";
import { CLUB_POSITION_LIMITS, type ClubAcquisitionState, type ClubOwnedPlayer } from "../lib/touchlineFantasy/club-acquisition.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/collection-slot-plan.ts";
const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"];
const goalkeeperSlot = geometry.slots.findIndex(s => s.allowedPositions.includes("goalkeeper"));
const id = "00000000-0000-4000-8000-000000000001";
const state: ClubAcquisitionState = { revision:0,seasonId:"season",plan:"standard",balanceEur:480_000_000,
  coach:{id:"coach",tier:"ruby-red",valueEur:5_000_000},receipts:[],players:[
    {playerId:id,clubId:"one",position:"GK",primaryDetail:"Goalkeeper",valueEur:10_000_000,area:"reserves",slot:0},
    {playerId:"two",clubId:"two",position:"GK",primaryDetail:"Goalkeeper",valueEur:5_000_000,area:"outside",slot:0},
  ] };
const formation = {action:"formation" as const,formationCode:"4-3-3",expectedRevision:0,idempotencyKey:"formation_1"};
const context = {marketOpen:true,geometry,reservedIds:[]};
test("bench and Exchange placement previews expose only compatible XI positions without changing contracts", () => {
  const formed = allocateClubPlayers(state, formation, context);
  const before = structuredClone(formed);
  assert.deepEqual(clubStarterDestinations(formed, id, geometry), [{slot: goalkeeperSlot,position: geometry.slots[goalkeeperSlot].id,displacedPlayerId:null}]);
  assert.deepEqual(clubStarterDestinations(formed, "missing", geometry), []);
  const occupied = allocateClubPlayers(formed,{action:"move",playerId:id,area:"starters",slot:goalkeeperSlot,expectedRevision:1,idempotencyKey:"movement_1"},context);
  assert.deepEqual(clubStarterDestinations(occupied,"two",geometry), [{slot:goalkeeperSlot,position:geometry.slots[goalkeeperSlot].id,displacedPlayerId:id}]);
  assert.deepEqual(clubStarterDestinations(occupied,id,geometry), []);
  assert.deepEqual(formed,before);
  assert.equal(occupied.balanceEur, formed.balanceEur);
  assert.deepEqual(occupied.receipts, formed.receipts);
});
test("strict allocation request does not accept wallet, owner or exception fields", () => {
  assert.deepEqual(parseClubAllocationCommand(formation),formation);
  for (const patch of [{balanceEur:1},{ownerId:id},{action:"remove"},{formationCode:"foo"},{expectedRevision:-1}]) {
    assert.equal(parseClubAllocationCommand({...formation,...patch}),null);
  }
  assert.equal(parseClubAllocationCommand({action:"move",playerId:id,area:"reserves",slot:9,expectedRevision:0,idempotencyKey:"movement_1"}),null);
});
test("formation and relocation preserve exact ownership, cash and receipts across reload", () => {
  const formed = allocateClubPlayers(state,formation,context);
  const next = allocateClubPlayers(formed,{action:"move",playerId:id,area:"starters",slot:goalkeeperSlot,expectedRevision:1,idempotencyKey:"movement_1"},context);
  assert.equal(next.balanceEur,state.balanceEur);
  assert.deepEqual(next.receipts,state.receipts);
  assert.deepEqual(next.coach,state.coach);
  assert.deepEqual(clubStarterSelections(JSON.parse(JSON.stringify(next)),geometry),[{playerId:id,slotId:geometry.slots[goalkeeperSlot].id}]);
  const swapped = allocateClubPlayers(next,{action:"move",playerId:"two",area:"starters",slot:goalkeeperSlot,expectedRevision:2,idempotencyKey:"movement_2"},context);
  assert.equal(swapped.players.find(p=>p.playerId===id)?.area,"outside");
  assert.equal(swapped.players.length,2);
  assert.equal(state.players[0].area,"reserves","input unchanged");
});
test("allocation rejects stale, locked, reserved source/destination and incompatible position", () => {
  const formed = allocateClubPlayers(state,formation,context);
  const move = {action:"move" as const,playerId:id,area:"starters" as const,slot:goalkeeperSlot,expectedRevision:1,idempotencyKey:"movement_1"};
  assert.throws(()=>allocateClubPlayers(formed,{...move,expectedRevision:0},context),/CLUB_STALE_REVISION/);
  assert.throws(()=>allocateClubPlayers(formed,move,{...context,marketOpen:false}),/CLUB_MARKET_CLOSED/);
  assert.throws(()=>allocateClubPlayers(formed,move,{...context,reservedIds:[id]}),/CLUB_PLAYER_RESERVED/);
  assert.throws(()=>allocateClubPlayers(formed,{...move,area:"outside",slot:0},{...context,reservedIds:["two"]}),/CLUB_PLAYER_RESERVED/);
  assert.throws(()=>allocateClubPlayers(formed,{...move,slot:geometry.slots.findIndex(s=>!s.allowedPositions.includes("goalkeeper"))},context),/CLUB_SLOT_POSITION_INVALID/);
});

test("complete 35-player collection changes 4-3-3 to 3-5-2 without selling, losing ownership or spending", () => {
  const details: Record<ClubOwnedPlayer["position"],string> = { GK:"Goalkeeper", CB:"Centre Back", RB:"Right Back", LB:"Left Back", DM:"Defensive Midfield", MID:"Central Midfield", RW:"Right Wing", LW:"Left Wing", CF:"Centre Forward" };
  const plan = collectionSlotPlan(geometry)!;
  const players: ClubOwnedPlayer[] = (["starters","reserves","outside"] as const).flatMap(area => plan[area].map((position,slot)=>({
    playerId:`${area}-${slot}`,clubId:"one-club",position,primaryDetail:details[position],valueEur:1_000_000,area,slot,
  })));
  for(const [position,count] of Object.entries(CLUB_POSITION_LIMITS)) assert.equal(players.filter(p=>p.position===position).length,count);
  const complete:ClubAcquisitionState={...state,players,formationCode:"4-3-3",balanceEur:460_000_000};
  const nextGeometry=TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["3-5-2"];
  const command={...formation,formationCode:"3-5-2"};
  const next=allocateClubPlayers(complete,command,{...context,geometry:nextGeometry});
  assert.equal(next.players.length,35);
  assert.equal(next.balanceEur,complete.balanceEur);
  assert.deepEqual(next.players.map(({area,slot,...owned})=>{void area;void slot;return owned;}),
    complete.players.map(({area,slot,...owned})=>{void area;void slot;return owned;}));
  assert.equal(clubStarterSelections(next,nextGeometry).length,11);
  assert.deepEqual(["starters","reserves","outside"].map(area=>next.players.filter(p=>p.area===area).length),[11,9,15]);
  assert.throws(()=>allocateClubPlayers(complete,command,{...context,geometry:nextGeometry,
    reservedIds:players.filter(p=>p.area!=="starters").map(p=>p.playerId)}),/CLUB_FORMATION_REQUIRES_COMPATIBLE_PLAYER/);
  assert.equal(complete.formationCode,"4-3-3");
});
