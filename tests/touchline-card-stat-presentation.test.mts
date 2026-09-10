import assert from "node:assert/strict";
import test from "node:test";

import { buildTouchlineCardStatPresentation, isTouchlineGoalkeeper } from "../lib/touchlineArena/card-stat-presentation.ts";

test("goalkeeper recognition accepts the canonical role and GK position aliases", () => {
  assert.equal(isTouchlineGoalkeeper({ role: "Goalkeeper" }), true);
  assert.equal(isTouchlineGoalkeeper({ position: "GK" }), true);
  assert.equal(isTouchlineGoalkeeper({ role: "Defender", position: "CB" }), false);
});

test("outfield cards retain the existing common statistic order and semantics", () => {
  const stats = buildTouchlineCardStatPresentation({ role: "Defender", seasonStats: { goals: 2, assists: 4, defense: 18, cleanSheets: 7 } });
  assert.deepEqual(stats.map((stat) => [stat.id, stat.icon, stat.value, stat.valueState]), [
    ["goals", "ball", 2, "available"], ["assists", "boot", 4, "available"],
    ["defense", "defense", 18, "available"], ["cleanSheets", "clean-sheet", 7, "available"],
  ]);
});

test("goalkeeper cards replace defense with saves and the glove semantic", () => {
  const stats = buildTouchlineCardStatPresentation({ role: "Goalkeeper", seasonStats: { goals: 0, assists: 1, saves: 43, cleanSheets: 9, defense: 999 } });
  assert.deepEqual(stats.map((stat) => [stat.id, stat.icon, stat.value, stat.valueState]), [
    ["goals", "ball", 0, "available"], ["assists", "boot", 1, "available"],
    ["saves", "glove", 43, "available"], ["cleanSheets", "clean-sheet", 9, "available"],
  ]);
});

test("missing goalkeeper saves stays explicitly unavailable and is never fabricated as zero", () => {
  const saves = buildTouchlineCardStatPresentation({ position: "GK", seasonStats: { goals: 0, assists: 0, cleanSheets: 0 } }).find((stat) => stat.id === "saves");
  assert.deepEqual(saves, { id: "saves", label: "SAVES", icon: "glove", value: null, valueState: "unavailable" });
});

test("a present season-stat object never borrows a missing goalkeeper save total from legacy match stats", () => {
  const saves = buildTouchlineCardStatPresentation({ position: "GK", seasonStats: { goals: 0, assists: 0, cleanSheets: 1 }, matchStats: { saves: 99 } }).find((stat) => stat.id === "saves");
  assert.deepEqual(saves, { id: "saves", label: "SAVES", icon: "glove", value: null, valueState: "unavailable" });
});

test("season stats win over legacy match stats and invalid numeric values are unavailable", () => {
  const stats = buildTouchlineCardStatPresentation({ role: "Goalkeeper", seasonStats: { saves: 8, cleanSheets: Number.NaN }, matchStats: { saves: 99, cleanSheets: 2 } });
  assert.deepEqual(stats.find((stat) => stat.id === "saves"), { id: "saves", label: "SAVES", icon: "glove", value: 8, valueState: "available" });
  assert.deepEqual(stats.find((stat) => stat.id === "cleanSheets"), { id: "cleanSheets", label: "CS", icon: "clean-sheet", value: null, valueState: "unavailable" });
});
