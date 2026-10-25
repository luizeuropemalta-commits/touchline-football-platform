import assert from "node:assert/strict";
import test from "node:test";
import { matchHeroGoals, matchHeroScorers } from "../lib/touchlineArena/match-hero-goals.ts";

test("goal summary retains scoring club, added time and only valid scoring events", () => {
  const events = [
    { id: "a", fixtureId: "game", teamId: "home", type: "goal", playerName: "Scorer", minute: 45, extraMinute: 2 },
    { id: "b", teamId: "home", type: "penalty", playerName: "Penalty scorer", minute: 12 },
    { id: "c", teamId: "away", type: "own goal", playerName: "Own-goal author", minute: 60 },
    { id: "d", teamId: "home", type: "missed penalty", playerName: "Missed", minute: 10 },
    { id: "e", fixtureId: "other", teamId: "home", type: "goal", playerName: "Other match", minute: 1 },
    { id: "f", teamId: "home", type: "yellowcard", playerName: "Booked", minute: 4 },
  ];
  const before = JSON.stringify(events);
  assert.deepEqual(matchHeroGoals(events, "game", "home").map(row => row.id), ["b", "a"]);
  assert.equal(matchHeroGoals(events, "game", "home")[1].extraMinute, 2);
  assert.deepEqual(matchHeroGoals(events, "game", "away").map(row => row.id), ["c"]);
  assert.deepEqual(matchHeroGoals(events, "game"), []);
  assert.equal(JSON.stringify(events), before);
});

test("subsequent snapshots add goals and rescinded revisions remove them without duplicates", () => {
  const goal = { id: "goal", teamId: "home", type: "goal", playerName: "Scorer", minute: 5 };
  assert.deepEqual(matchHeroGoals([], "game", "home"), []);
  assert.equal(matchHeroGoals([goal, goal], "game", "home").length, 1);
  assert.deepEqual(matchHeroGoals([goal, { ...goal, status: "rescinded" }], "game", "home"), []);
  assert.deepEqual(matchHeroGoals([{ ...goal, playerName: "" }], "game", "home"), []);
});

test("multiple goals group by player identity, retaining every minute and not merging namesakes", () => {
  const first = { id: "first", playerId: "player1", teamId: "home", type: "goal", playerName: "Same name", minute: 41 };
  const second = { ...first, id: "second", minute: 55 };
  const namesake = { ...first, id: "other", playerId: "player2", minute: 60 };
  const groups = matchHeroScorers([second, first, namesake], "game", "home");
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].goals.map(goal => goal.minute), [41, 55]);
  assert.equal(groups[1].goals.length, 1);
  assert.equal(matchHeroScorers([{...first, playerId: undefined}, {...second, playerId: undefined}], "game", "home").length, 2);
  const seven = Array.from({length: 7}, (_, index) => ({...first, id: `goal${index}`, minute: index * 10}));
  assert.equal(matchHeroScorers(seven, "game", "home")[0].goals.length, 7);
});
