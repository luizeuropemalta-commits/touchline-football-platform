import test from "node:test";
import assert from "node:assert/strict";
import { clubRelatedConfirmed, readClubRelatedSnapshot } from "../lib/touchlineFantasy/club-round-confirmation.ts";
test("changing a reserve invalidates confirmation even when the XI is unchanged",()=>{
  const players=[...Array.from({length:11},(_,slot)=>({playerId:`xi${slot}`,area:"starters",slot})),
    ...Array.from({length:9},(_,slot)=>({playerId:`bench${slot}`,area:"reserves",slot})),
    {playerId:"outside",area:"outside",slot:0}];
  const saved=players.filter(p=>p.area!=="outside");
  assert.equal(clubRelatedConfirmed(players,saved),true);
  const moved=players.map(p=>p.playerId==="bench0"?{...p,area:"outside",slot:0}:p.playerId==="outside"?{...p,area:"reserves",slot:0}:p);
  assert.equal(clubRelatedConfirmed(moved,saved),false);
  assert.equal(clubRelatedConfirmed(moved,moved.filter(p=>p.area!=="outside")),true);
  assert.equal(clubRelatedConfirmed([...players,{playerId:"newOutside",area:"outside",slot:1}],saved),true);
  assert.equal(clubRelatedConfirmed(players,null),false);
});
test("related snapshots reject malformed, duplicate, outside and over-capacity records",()=>{
  const one={playerId:"one",area:"starters",slot:0};
  for(const value of [{},[one,one],[{...one,area:"outside"}],[{...one,slot:11}],[{...one,slot:0.5}],Array(21).fill(one)])
    assert.equal(readClubRelatedSnapshot(value),null);
  assert.deepEqual(readClubRelatedSnapshot([{...one,privateBalance:100}]),[one]);
});
