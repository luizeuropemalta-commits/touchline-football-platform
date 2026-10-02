import assert from "node:assert/strict";
import test from "node:test";
import { cardGoalsLeaderIds, cardGoalsLeadership, parseCardGoalsPublication } from "../lib/touchlineArena/card-goals-leadership.ts";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const publication = (goals: Array<number | null>, snapshotId = "ranking-1") => ({
  source: "published-card-goals-v1" as const, snapshotId,
  rows: goals.map((goals, index) => ({ playerId: id(index + 1), goals })),
});
test("maximum card goals, not rating or position, decides the boot", () => {
  assert.deepEqual(cardGoalsLeaderIds(publication([2, 9, 5]), "ranking-1"), [id(2)]);
  assert.equal(cardGoalsLeadership(publication([2, 9, 5])).status, "unique-leader");
});
test("all positive joint leaders receive the boot; zero/unknown do not", () => {
  assert.deepEqual(cardGoalsLeaderIds(publication([9, null, 9, 0]), "ranking-1"), [id(1), id(3)]);
  assert.deepEqual(cardGoalsLeaderIds(publication([0, null, 0]), "ranking-1"), []);
});
test("next publication changes the leader automatically and rejects another snapshot", () => {
  assert.deepEqual(cardGoalsLeaderIds(publication([5, 4]), "ranking-1"), [id(1)]);
  assert.deepEqual(cardGoalsLeaderIds(publication([5, 6], "ranking-2"), "ranking-2"), [id(2)]);
  assert.deepEqual(cardGoalsLeaderIds(publication([5, 6], "ranking-2"), "ranking-1"), []);
});
test("invalid or duplicate identities and invalid goal values fail closed", () => {
  for (const goals of [-1, 0.5, Infinity, NaN]) assert.equal(parseCardGoalsPublication(publication([goals]), "ranking-1"), null);
  const duplicate = publication([5, 9]); duplicate.rows[1]!.playerId = id(1);
  assert.equal(parseCardGoalsPublication(duplicate, "ranking-1"), null);
  assert.equal(parseCardGoalsPublication(undefined, "ranking-1"), null);
});
