import assert from "node:assert/strict";
import test from "node:test";

import { touchlineActivityArea } from "../lib/touchlineArena/activity-analytics.ts";

test("classifies every official TouchLine surface without depending on the legacy shell", () => {
  assert.equal(touchlineActivityArea("/arena"), "arena");
  assert.equal(touchlineActivityArea("/arena", "market"), "market");
  assert.equal(touchlineActivityArea("/arena/training"), "training");
  assert.equal(touchlineActivityArea("/club-owner/luiz-lopez"), "club-owner");
  assert.equal(touchlineActivityArea("/touchline-clubs/arsenal"), "club");
  assert.equal(touchlineActivityArea("/touchline-players/bukayo-saka"), "player");
  assert.equal(touchlineActivityArea("/touchline-player-card-rankings"), "ranking");
  assert.equal(touchlineActivityArea("/touchline-tables"), "ranking");
  assert.equal(touchlineActivityArea("/admin/cards"), "admin");
  assert.equal(touchlineActivityArea("/football-search"), "other");
  assert.equal(touchlineActivityArea("/notifications"), "other");
});

test("does not track authentication, QA or removed professional-platform surfaces", () => {
  assert.equal(touchlineActivityArea("/login"), null);
  assert.equal(touchlineActivityArea("/register"), null);
  assert.equal(touchlineActivityArea("/visual-qa/touchline-card-studio"), null);
  assert.equal(touchlineActivityArea("/dashboard"), null);
  assert.equal(touchlineActivityArea("/deals"), null);
});
