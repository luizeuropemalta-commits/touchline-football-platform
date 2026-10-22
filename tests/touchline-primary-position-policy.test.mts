import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eligiblePrimaryDetails, primaryPositionFitsTacticalSlot as fits, resolvePrimaryPositionDetails as resolve, tacticalFunctionForSlot } from "../lib/touchlineFantasy/club-primary-position-policy.ts";
import { CLUB_POSITION_LIMITS } from "../lib/touchlineFantasy/club-acquisition.ts";
import { CLUB_RESERVE_POSITIONS } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { clubPlayerPosition } from "../lib/touchlineFantasy/club-position.ts";

const snapshot = JSON.parse(readFileSync(new URL("../docs/touchline/release-audit/2026-10-18-POSITION-AUDIT-SNAPSHOT.json", import.meta.url), "utf8")) as {
  players: { id: string; name: string; detail: unknown; membership_detail: unknown }[];
  geometries: { formation_code: string; geometry: { slots: { id: string }[] } }[];
};
const census = JSON.parse(readFileSync(new URL("../docs/touchline/release-audit/2026-10-18-POSITION-CENSUS.json", import.meta.url), "utf8")) as {
  rows: { id: string; catalogueAvailableFromSnapshot: boolean; canonicalPosition: string | null }[];
};
// Independent fixture, not generated from the implementation under test.
const expected: Record<string, string> = {
  "4-3-3": "GK:G RB:R RCB:B LCB:B LB:L RCM:C CM:C LCM:C RW:W ST:F LW:V",
  "4-4-2": "GK:G RB:R RCB:B LCB:B LB:L RM:X RCM:P LCM:P LM:Y RST:F LST:F",
  "4-2-3-1": "GK:G RB:R RCB:B LCB:B LB:L RDM:P LDM:P RAM:X CAM:A LAM:Y ST:F",
  "4-1-4-1": "GK:G RB:R RCB:B LCB:B LB:L DM:D RM:X RCM:I LCM:I LM:Y ST:F",
  "4-5-1": "GK:G RB:R RCB:B LCB:B LB:L RM:X RCM:C CM:C LCM:C LM:Y ST:F",
  "3-4-3": "GK:G RCB:B CB:B LCB:B RWB:R RCM:P LCM:P LWB:L RW:W ST:F LW:V",
  "3-5-2": "GK:G RCB:B CB:B LCB:B RWB:R RCM:C CM:C LCM:C LWB:L RST:F LST:F",
  "3-4-2-1": "GK:G RCB:B CB:B LCB:B RWB:R RCM:P LCM:P LWB:L RAM:A LAM:A ST:F",
  "5-2-3": "GK:G RWB:R RCB:B CB:B LCB:B LWB:L RCM:P LCM:P RW:W ST:F LW:V",
  "5-3-2": "GK:G RWB:R RCB:B CB:B LCB:B LWB:L RCM:C CM:C LCM:C RST:F LST:F",
  "5-4-1": "GK:G RWB:R RCB:B CB:B LCB:B LWB:L RM:X RCM:P LCM:P LM:Y ST:F",
};
const details: Record<string, string[]> = {
  G: ["Goalkeeper"], B: ["Centre Back"], R: ["Right Back"], L: ["Left Back"],
  D: ["Defensive Midfield"], P: ["Defensive Midfield", "Central Midfield"],
  C: ["Defensive Midfield", "Central Midfield", "Attacking Midfield"],
  I: ["Central Midfield", "Attacking Midfield"], A: ["Attacking Midfield"],
  W: ["Right Wing"], V: ["Left Wing"], X: ["Right Wing", "Right Midfield"],
  Y: ["Left Wing", "Left Midfield"], F: ["Centre Forward"],
};
const expectedAt = (formation: string, slot: string) => {
  const entry = expected[formation]?.split(" ").find(e => e.split(":")[0] === slot);
  return entry ? details[entry.split(":")[1]] : [];
};

test("one primary detail, separate quota, missing/conflict fail closed", () => {
  assert.deepEqual(resolve("Right Wing", "Right Winger"), { detail: "Right Wing", position: "RW", reason: null });
  assert.equal(resolve("Right Midfield", null).position, "MID");
  for (const [a,b] of [["Central Midfield","Attacking Midfield"],["Left Wing","Right Wing"]])
    assert.equal(resolve(a,b).reason, "PRIMARY_DETAIL_CONFLICT");
  for (const value of ["Midfielder","Secondary Striker","MID","attacker"])
    assert.equal(resolve(value,null).reason, "PRIMARY_DETAIL_UNSUPPORTED");
  assert.equal(resolve(null,null).reason, "PRIMARY_DETAIL_MISSING");
});

test("121 actual slots x13 details match independent reviewed matrix", () => {
  const allDetails = [...new Set(Object.values(details).flat()), "Secondary Striker"];
  assert.equal(allDetails.length,13);
  assert.deepEqual(snapshot.geometries.map(f => f.formation_code).sort(), Object.keys(expected).sort());
  let checks=0;
  for (const formation of snapshot.geometries) {
    const code=formation.formation_code;
    assert.deepEqual(formation.geometry.slots.map(s=>s.id).sort(),expected[code].split(" ").map(s=>s.split(":")[0]).sort());
    for (const slot of formation.geometry.slots) {
      assert.deepEqual(eligiblePrimaryDetails(code,slot.id),expectedAt(code,slot.id));
      for(const detail of allDetails) {
        assert.equal(fits(detail,code,slot.id),expectedAt(code,slot.id).includes(detail),code+"/"+slot.id+"/"+detail); checks++;
      }
    }
  }
  assert.equal(checks,1573);
});

test("side, formation-specific function, unknown slot and policy immutability", () => {
  for(const code of ["4-3-3","3-4-3","5-2-3"]) {
    for(const detail of ["Left Wing","Attacking Midfield","Central Midfield","Defensive Midfield"])
      assert.equal(fits(detail,code,"RW"),false);
    assert.equal(fits("Right Wing",code,"LW"),false);
    assert.equal(fits("Right Wing",code,"ST"),false);
  }
  assert.equal(fits("Right Wing","4-5-1","RM"),true);
  assert.equal(fits("Right Wing","4-5-1","LM"),false);
  assert.equal(fits("Right Wing","3-4-3","RWB"),false);
  for(const code of ["3-4-3","3-4-2-1","5-2-3","4-4-2","5-4-1"])
    assert.equal(fits("Attacking Midfield",code,"RCM"),false);
  assert.equal(fits("Attacking Midfield","3-4-2-1","RAM"),true);
  assert.equal(fits("Attacking Midfield","4-2-3-1","RAM"),false);
  assert.equal(fits("Attacking Midfield","4-3-3","LCM"),true);
  assert.equal(fits("Central Midfield","4-1-4-1","DM"),false);
  for(const [formation,slot] of [["unknown","RW"],["4-3-3","LIBERO"],["__proto__","RW"],["4-3-3","constructor"]]) {
    assert.equal(tacticalFunctionForSlot(formation,slot),null); assert.equal(fits("Right Wing",formation,slot),false);
  }
  (eligiblePrimaryDetails("4-3-3","RW") as string[]).push("Left Wing");
  assert.equal(fits("Left Wing","4-3-3","RW"),false);
});

test("complete686 registrations x121 slots, no source/contract mutation", () => {
  assert.equal(snapshot.players.length,686);
  const before=JSON.stringify(snapshot);
  let checks=0,available=0;
  for(const player of snapshot.players) {
    const resolved=resolve(player.detail,player.membership_detail);
    const entry=census.rows.find(p=>p.id===player.id);
    assert.ok(entry);
    if(entry.catalogueAvailableFromSnapshot) {
      assert.equal(resolved.position,entry.canonicalPosition,player.name); assert.ok(resolved.detail,player.name); available++;
    }
    for(const formation of snapshot.geometries) for(const slot of formation.geometry.slots) {
      checks++;
      assert.equal(fits(resolved.detail,formation.formation_code,slot.id),(expectedAt(formation.formation_code,slot.id) as readonly (string | null)[]).includes(resolved.detail));
    }
  }
  assert.equal(available,540); assert.equal(checks,83006); assert.equal(JSON.stringify(snapshot),before);
});

test("each formation has quota-feasible XI + fixed9bench +15outside, without reclassifying", () => {
  for(const formation of snapshot.geometries) {
    const remaining={...CLUB_POSITION_LIMITS};
    for(const position of CLUB_RESERVE_POSITIONS) remaining[position]--;
    const assign=(index:number):boolean=>{
      if(index===11)return true;
      for(const detail of eligiblePrimaryDetails(formation.formation_code,formation.geometry.slots[index].id)) {
        const position=clubPlayerPosition(detail); assert.ok(position);
        if(!remaining[position])continue;
        remaining[position]--;
        if(assign(index+1))return true;
        remaining[position]++;
      }
      return false;
    };
    assert.equal(assign(0),true,formation.formation_code);
    assert.equal(Object.values(remaining).reduce((a,b)=>a+b,0),15);
  }
  // Matching roles does not guarantee a valid roster:2wideMID+3centralMID+1benchMID exceedsMID5.
  assert.equal(clubPlayerPosition("Right Midfield"),"MID");
  assert.ok(2+3+1>CLUB_POSITION_LIMITS.MID);
});
