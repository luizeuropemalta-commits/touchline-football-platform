import assert from "node:assert/strict";
import test from "node:test";

import {
  isTouchlineFormationCandidateEligible,
  reconcileTouchlineFormationStarters,
  touchlineFormationCapacities,
} from "../lib/touchlineArena/formation-transition.ts";

type Player = {
  id: string;
  role: "goalkeeper" | "defender" | "midfielder" | "forward";
};

function lineup433(): Player[] {
  return [
    { id: "gk", role: "goalkeeper" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `d${index}`, role: "defender" as const })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `m${index}`, role: "midfielder" as const })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `f${index}`, role: "forward" as const })),
  ];
}

test("4-3-3 to 4-4-2 preserves roles, moves one forward out and exposes one midfield vacancy", () => {
  const capacities = touchlineFormationCapacities("4-4-2");
  assert.ok(capacities);

  const result = reconcileTouchlineFormationStarters(lineup433(), capacities);

  assert.equal(result.starters.length, 10);
  assert.deepEqual(result.overflow.map((player) => player.id), ["f2"]);
  assert.deepEqual(result.vacancies, [{ role: "midfielder", count: 1 }]);
  assert.equal(result.starters.filter((player) => player.role === "forward").length, 2);
  assert.equal(result.starters.filter((player) => player.role === "midfielder").length, 3);

  const repeated = reconcileTouchlineFormationStarters(result.starters, capacities);
  assert.equal(repeated.overflow.length, 0);
  assert.deepEqual(repeated.vacancies, [{ role: "midfielder", count: 1 }]);
});

test("4-4-2 to 4-3-3 never coerces a midfielder into an attacker", () => {
  const capacities = touchlineFormationCapacities("4-3-3");
  assert.ok(capacities);
  const lineup442: Player[] = [
    { id: "gk", role: "goalkeeper" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `d${index}`, role: "defender" as const })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `m${index}`, role: "midfielder" as const })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `f${index}`, role: "forward" as const })),
  ];

  const result = reconcileTouchlineFormationStarters(lineup442, capacities);

  assert.deepEqual(result.overflow.map((player) => player.id), ["m3"]);
  assert.deepEqual(result.vacancies, [{ role: "forward", count: 1 }]);
  assert.equal(result.starters.some((player) => player.id === "m3"), false);
  assert.equal(result.starters.filter((player) => player.role === "forward").length, 2);
});

test("every supported eleven-player formation exposes exact role capacities", () => {
  for (const [formation, expected] of Object.entries({
    "3-4-3": [3, 4, 3],
    "3-5-2": [3, 5, 2],
    "4-3-3": [4, 3, 3],
    "4-4-2": [4, 4, 2],
    "4-5-1": [4, 5, 1],
    "5-2-3": [5, 2, 3],
    "5-3-2": [5, 3, 2],
    "5-4-1": [5, 4, 1],
  })) {
    const capacities = touchlineFormationCapacities(formation);
    assert.deepEqual(capacities, {
      goalkeeper: 1,
      defender: expected[0],
      midfielder: expected[1],
      forward: expected[2],
    });
  }
  assert.equal(touchlineFormationCapacities("4-2"), null);
  assert.equal(touchlineFormationCapacities("4-3-4"), null);
});

test("the canonical position contract filters every vacancy picker", () => {
  assert.equal(isTouchlineFormationCandidateEligible({ position: "GK", role: "goalkeeper" }, "goalkeeper"), true);
  assert.equal(isTouchlineFormationCandidateEligible({ position: "LB", role: "defender" }, "defender"), true);
  assert.equal(isTouchlineFormationCandidateEligible({ position: "CDM", role: "midfielder" }, "midfielder"), true);
  assert.equal(isTouchlineFormationCandidateEligible({ position: "CAM", role: "midfielder" }, "midfielder"), true);
  assert.equal(isTouchlineFormationCandidateEligible({ position: "ST", role: "forward" }, "forward"), true);
  assert.equal(isTouchlineFormationCandidateEligible({ position: "ST", role: "forward" }, "midfielder"), false);
  assert.equal(isTouchlineFormationCandidateEligible({ position: "N/A", role: null }, "forward"), false);
});
