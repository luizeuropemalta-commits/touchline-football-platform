import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveNextTouchlineCompetitionRound,
  resolveTouchlineCompetitionRoundEligibility,
} from "../lib/touchlineArena/competition-round-eligibility.ts";

const round = (overrides = {}) => ({
  id: "round-1",
  competition: "england" as const,
  sequence: 1,
  entryStatus: "OPEN" as const,
  ...overrides,
});

test("expired maintenance blocks only a new TouchLine competition round", () => {
  assert.deepEqual(resolveTouchlineCompetitionRoundEligibility({
    clubCompetition: "england",
    maintenanceStatus: "INACTIVE_MAINTENANCE",
    round: round(),
    alreadyLockedForRound: false,
  }), { allowed: false, reason: "maintenance-inactive" });
});

test("an entry locked before maintenance expiry remains eligible and immutable", () => {
  assert.deepEqual(resolveTouchlineCompetitionRoundEligibility({
    clubCompetition: "england",
    maintenanceStatus: "INACTIVE_MAINTENANCE",
    round: round({ entryStatus: "LOCKED" }),
    alreadyLockedForRound: true,
  }), { allowed: true, reason: "already-locked" });
});

test("reactivation returns a club to the next open round in its own competition", () => {
  const next = resolveNextTouchlineCompetitionRound({
    competition: "england",
    maintenanceStatus: "REACTIVATED",
    rounds: [
      round({ id: "england-3", sequence: 3, entryStatus: "SCHEDULED" }),
      round({ id: "brazil-1", competition: "brazil", sequence: 1 }),
      round({ id: "england-4", sequence: 4 }),
    ],
  });
  assert.equal(next?.id, "england-4");
});

test("eligibility is competition-engine scoped and never depends on an external football calendar", () => {
  assert.deepEqual(resolveTouchlineCompetitionRoundEligibility({
    clubCompetition: "england",
    maintenanceStatus: "ACTIVE",
    round: round({ competition: "brazil" }),
    alreadyLockedForRound: true,
  }), { allowed: false, reason: "round-not-open" });
});
