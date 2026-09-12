import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTouchlineClubFollowIds,
  setTouchlineClubFollow,
} from "../lib/touchlineArena/club-follow-preferences.ts";

test("club follows stay bounded, canonical and unique for an account preference", () => {
  assert.deepEqual(normalizeTouchlineClubFollowIds(["19", "15", "19", "0", "club", 12]), ["15", "19"]);
  assert.deepEqual(setTouchlineClubFollow(["19"], "15", true), ["15", "19"]);
  assert.deepEqual(setTouchlineClubFollow(["19", "15"], "19", false), ["15"]);
});

test("club follow rejects a malformed club identity without changing the existing preference", () => {
  assert.deepEqual(setTouchlineClubFollow(["15"], "liverpool", true), ["15"]);
});
