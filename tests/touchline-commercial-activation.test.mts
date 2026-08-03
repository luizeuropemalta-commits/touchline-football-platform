import assert from "node:assert/strict";
import test from "node:test";

import {
  canTouchlineCompetitionClubEnterSportingActivity,
  isTouchlineCommercialOperationInScope,
  planTouchlineCompetitionReactivation,
  resolveTouchlineCommercialParticipation,
  touchlineCommercialCurrencyForCompetition,
} from "../lib/touchlineArena/commercial-activation.ts";

test("commercial competition scope keeps England GBP-only and future competitions disabled", () => {
  assert.equal(touchlineCommercialCurrencyForCompetition("england"), "GBP");
  assert.equal(touchlineCommercialCurrencyForCompetition("europe"), "EUR");
  assert.equal(isTouchlineCommercialOperationInScope({ competition: "england", currency: "GBP" }), true);
  assert.equal(isTouchlineCommercialOperationInScope({ competition: "england", currency: "EUR" }), false);
  assert.equal(isTouchlineCommercialOperationInScope({ competition: "europe", currency: "EUR" }), false);
});

test("past-due and inactive maintenance deny new sporting activity", () => {
  for (const status of ["PAYMENT_PAST_DUE", "INACTIVE_MAINTENANCE"] as const) {
    assert.deepEqual(resolveTouchlineCommercialParticipation({
      competition: "england",
      status,
      nextEligibleRoundAt: null,
    }, "2026-08-02T12:00:00.000Z"), { allowed: false, reason: "maintenance-inactive" });
  }
});

test("reactivation becomes eligible only at its recorded next-round boundary", () => {
  const reactivated = planTouchlineCompetitionReactivation({
    entitlement: {
      competition: "england",
      status: "INACTIVE_MAINTENANCE",
      nextEligibleRoundAt: null,
    },
    nextEligibleRoundAt: "2026-08-10T12:00:00.000Z",
  });

  assert.equal(reactivated.status, "REACTIVATED");
  assert.equal(canTouchlineCompetitionClubEnterSportingActivity(reactivated, "2026-08-10T11:59:59.000Z"), false);
  assert.equal(canTouchlineCompetitionClubEnterSportingActivity(reactivated, "2026-08-10T12:00:00.000Z"), true);
});

test("reactivation plan is idempotent and has no contract or payment payload", () => {
  const reactivated = {
    competition: "england" as const,
    status: "REACTIVATED" as const,
    nextEligibleRoundAt: "2026-08-10T12:00:00.000Z",
  };
  assert.equal(planTouchlineCompetitionReactivation({
    entitlement: reactivated,
    nextEligibleRoundAt: "2026-08-10T12:00:00.000Z",
  }), reactivated);
  assert.deepEqual(Object.keys(reactivated).sort(), ["competition", "nextEligibleRoundAt", "status"]);
});

test("future competition participation is blocked even with active status", () => {
  assert.deepEqual(resolveTouchlineCommercialParticipation({
    competition: "brazil",
    status: "ACTIVE",
    nextEligibleRoundAt: null,
  }, "2026-08-02T12:00:00.000Z"), { allowed: false, reason: "competition-not-launched" });
});
