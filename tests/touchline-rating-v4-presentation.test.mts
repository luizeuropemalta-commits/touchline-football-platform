import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The unused original GoalHatLayoutDemo is a byte-locked historical approval.
// Its active successors below use V4 copy; history is not relabelled.
for (const name of ["TouchlineSocialEventsLiveGoalHat", "TouchlineSocialApprovedGoalHatLayoutDemo", "TouchlineSocialConfirmedEventDraft", "TouchlineSocialEventsLiveReview"]) {
  test(`${name} never presents the whole match rating as an additive goal bonus`, () => {
    const source = readFileSync(new URL(`../components/touchline/social/${name}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /touchlinePoints > 0 \? "\+"/);
    assert.match(source, /MATCH RATING/);
  });
}
