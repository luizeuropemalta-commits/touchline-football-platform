import assert from "node:assert/strict";
import test from "node:test";

import {
  createTouchlineSeasonalContractTerm,
  isTouchlineSeasonalContractActive,
  planTouchlineSeasonReset,
} from "../lib/touchlineArena/seasonal-contracts.ts";

const season = {
  id: "2026-27",
  startsAt: "2026-08-01",
  endsAt: "2027-05-31",
};

test("a December contract expires at the current season end, not one year later", () => {
  const term = createTouchlineSeasonalContractTerm(season, "2026-12-20T09:15:00.000Z");

  assert.equal(term.seasonId, "2026-27");
  assert.equal(term.expiresAt, "2027-05-31T23:59:59.999Z");
  assert.equal(term.expiresAtSeasonEnd, true);
  assert.equal(isTouchlineSeasonalContractActive(term, "2027-05-31T23:59:59.999Z"), true);
  assert.equal(isTouchlineSeasonalContractActive(term, "2027-06-01T00:00:00.000Z"), false);
});

test("every in-season purchase shares the same season-end expiry", () => {
  const expiry = "2027-05-31T23:59:59.999Z";
  for (const contractedAt of [
    "2026-09-01T12:00:00.000Z",
    "2026-11-15T12:00:00.000Z",
    "2027-01-31T12:00:00.000Z",
    "2027-05-31T12:00:00.000Z",
  ]) {
    assert.equal(createTouchlineSeasonalContractTerm(season, contractedAt).expiresAt, expiry);
  }
});

test("a contract cannot be created outside the selected season", () => {
  assert.throws(
    () => createTouchlineSeasonalContractTerm(season, "2027-06-01T00:00:00.000Z"),
    /must fall within its season/,
  );
});

test("season reset ends only closing-season active contracts and preserves history", () => {
  const plan = planTouchlineSeasonReset({
    closingSeasonId: "2026-27",
    nextSeasonId: "2027-28",
    contracts: [
      { contractId: "closing-active", seasonId: "2026-27", status: "active" },
      { contractId: "closing-ended", seasonId: "2026-27", status: "ended" },
      { contractId: "next-active", seasonId: "2027-28", status: "active" },
    ],
  });

  assert.deepEqual(plan.contractIdsToEnd, ["closing-active"]);
  assert.equal(plan.historicalRecordsRetained, true);
  assert.deepEqual(plan.resetAreas, [
    "activeContracts",
    "squad",
    "startingXi",
    "bench",
    "reserveVault",
    "seasonTouchlinePoints",
    "seasonRankings",
    "roundPoints",
  ]);
});

test("season reset rejects duplicate or ambiguous contract rows", () => {
  assert.throws(() => planTouchlineSeasonReset({
    closingSeasonId: "2026-27",
    nextSeasonId: "2027-28",
    contracts: [
      { contractId: "duplicate", seasonId: "2026-27", status: "active" },
      { contractId: "duplicate", seasonId: "2026-27", status: "active" },
    ],
  }), /exactly once/);
});
