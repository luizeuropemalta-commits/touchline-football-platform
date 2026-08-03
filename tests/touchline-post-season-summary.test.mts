import assert from "node:assert/strict";
import test from "node:test";

import { buildTouchlinePostSeasonSummary } from "../lib/touchlineArena/post-season-summary.ts";

const lifecycleSchedule = {
  competitionEndsAt: "2027-05-31T20:00:00.000Z",
  dataValidationEndsAt: "2027-06-02T20:00:00.000Z",
  renewalWindowOpensAt: "2027-08-01T00:00:00.000Z",
  nextSeasonStartsAt: "2027-08-08T00:00:00.000Z",
};

const input = {
  now: "2027-06-03T12:00:00.000Z",
  lifecycleSchedule,
  season: { id: "season-2026-27", label: "TouchLine 2026/27" },
  clubOwner: {
    userId: "owner-1",
    summaryState: "VALIDATED" as const,
    validatedAt: "2027-06-03T10:00:00.000Z",
    frozenAt: null,
    finalRank: 4,
    totalTouchlinePoints: 1_820,
    bestWeeklyRank: 1,
    honours: [{ type: "top_11" as const, title: "Top 11" }],
  },
};

test("post-season history becomes available only after final data validation", () => {
  const summary = buildTouchlinePostSeasonSummary(input);
  assert.equal(summary.available, true);
  assert.equal(summary.phase, "POST_SEASON");
  assert.equal(summary.owner?.finalRank, 4);
  assert.equal(summary.owner?.totalTouchlinePoints, 1_820);
});

test("history does not invent a zero result while the season is still competitive", () => {
  const summary = buildTouchlinePostSeasonSummary({
    ...input,
    now: "2027-05-31T19:00:00.000Z",
  });
  assert.equal(summary.available, false);
  assert.equal(summary.owner, null);
});

test("history is never public during data validation, even if its server record is already validated", () => {
  const summary = buildTouchlinePostSeasonSummary({
    ...input,
    now: "2027-06-01T12:00:00.000Z",
  });
  assert.equal(summary.phase, "DATA_VALIDATION");
  assert.equal(summary.available, false);
  assert.equal(summary.owner, null);
});

test("a draft stays private and a frozen summary requires immutable timestamps", () => {
  const draft = buildTouchlinePostSeasonSummary({
    ...input,
    clubOwner: {
      ...input.clubOwner,
      summaryState: "DRAFT",
      validatedAt: null,
      frozenAt: null,
    },
  });
  assert.equal(draft.available, false);

  const frozen = buildTouchlinePostSeasonSummary({
    ...input,
    clubOwner: {
      ...input.clubOwner,
      summaryState: "FROZEN",
      frozenAt: "2027-06-04T12:00:00.000Z",
    },
  });
  assert.equal(frozen.owner?.summaryState, "FROZEN");
  assert.equal(frozen.owner?.frozenAt, "2027-06-04T12:00:00.000Z");

  assert.throws(() => buildTouchlinePostSeasonSummary({
    ...input,
    clubOwner: {
      ...input.clubOwner,
      summaryState: "FROZEN",
      frozenAt: null,
    },
  }), /Frozen summary date/);
});

test("post-season history retains nulls until final records exist and rejects duplicate honours", () => {
  const summary = buildTouchlinePostSeasonSummary({
    ...input,
    clubOwner: {
      ...input.clubOwner,
      finalRank: null,
      totalTouchlinePoints: null,
      bestWeeklyRank: null,
      honours: [],
    },
  });
  assert.equal(summary.owner?.finalRank, null);
  assert.equal(summary.owner?.totalTouchlinePoints, null);

  assert.throws(() => buildTouchlinePostSeasonSummary({
    ...input,
    clubOwner: {
      ...input.clubOwner,
      honours: [
        { type: "record", title: "Most points" },
        { type: "record", title: "Most points" },
      ],
    },
  }), /unique/);
});
