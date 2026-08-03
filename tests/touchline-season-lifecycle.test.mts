import assert from "node:assert/strict";
import test from "node:test";

import {
  canTouchlineContractRenew,
  canTouchlineContractScore,
  resolveTouchlineContractLifecycleState,
  resolveTouchlineSeasonPhase,
  validateTouchlineSeasonLifecycleSchedule,
} from "../lib/touchlineArena/season-lifecycle.ts";

const schedule = {
  competitionEndsAt: "2027-05-31T20:00:00.000Z",
  dataValidationEndsAt: "2027-06-02T20:00:00.000Z",
  renewalWindowOpensAt: "2027-08-01T00:00:00.000Z",
  nextSeasonStartsAt: "2027-08-08T00:00:00.000Z",
};

test("season lifecycle keeps a configurable validation interval after the last official match", () => {
  assert.equal(resolveTouchlineSeasonPhase(schedule, "2027-05-31T19:59:59.999Z"), "COMPETITIVE");
  assert.equal(resolveTouchlineSeasonPhase(schedule, "2027-06-01T12:00:00.000Z"), "DATA_VALIDATION");
  assert.equal(resolveTouchlineSeasonPhase(schedule, "2027-06-03T12:00:00.000Z"), "POST_SEASON");
  assert.equal(resolveTouchlineSeasonPhase(schedule, "2027-08-03T12:00:00.000Z"), "RENEWAL_WINDOW");
  assert.equal(resolveTouchlineSeasonPhase(schedule, "2027-08-08T00:00:00.000Z"), "NEXT_SEASON_LIVE");
  assert.equal(canTouchlineContractScore("DATA_VALIDATION"), false);
  assert.equal(canTouchlineContractScore("COMPETITIVE"), true);
});

test("renewal cannot open before final data validation has ended", () => {
  assert.throws(() => validateTouchlineSeasonLifecycleSchedule({
    ...schedule,
    renewalWindowOpensAt: "2027-06-01T00:00:00.000Z",
  }), /after data validation/);
});

test("expired contracts become renewal candidates only during the renewal window", () => {
  const historical = {
    contractStatus: "ended" as const,
    belongsToClosingSeason: true,
    nextSeasonEligible: true,
  };
  assert.equal(resolveTouchlineContractLifecycleState(historical, "POST_SEASON"), "SEASON_FINISHED");
  const state = resolveTouchlineContractLifecycleState(historical, "RENEWAL_WINDOW");
  assert.equal(state, "RENEWAL_AVAILABLE");
  assert.equal(canTouchlineContractRenew(state), true);
});

test("ineligible or renewed historical contracts do not become purchasable renewals", () => {
  assert.equal(resolveTouchlineContractLifecycleState({
    contractStatus: "ended",
    belongsToClosingSeason: true,
    nextSeasonEligible: false,
  }, "RENEWAL_WINDOW"), "NOT_ELIGIBLE");

  assert.equal(resolveTouchlineContractLifecycleState({
    contractStatus: "ended",
    belongsToClosingSeason: true,
    renewalContractId: "new-contract",
    nextSeasonEligible: true,
  }, "RENEWAL_WINDOW"), "RENEWED");
});
