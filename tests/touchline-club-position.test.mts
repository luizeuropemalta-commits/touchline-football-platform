import test from "node:test";
import assert from "node:assert/strict";
import { clubPlayerPosition } from "../lib/touchlineFantasy/club-position.ts";

test("exact positions preserve wing side and unknown positions are not invented", () => {
  for (const [label, expected] of [["Goalkeeper","GK"],["Centre-Back","CB"],["Right Back","RB"],
    ["Left Back","LB"],["Defensive Midfield","DM"],["Attacking Midfield","MID"],
    ["Right Wing","RW"],["Left Wing","LW"],["Centre-Forward","CF"],["Ponta Esquerdo","LW"]]) {
    assert.equal(clubPlayerPosition(label),expected);
  }
  for (const label of ["Winger","Forward","Player","Left Wing / Right Wing","Striker / Goalkeeper",null,26]) {
    assert.equal(clubPlayerPosition(label),null);
  }
});
