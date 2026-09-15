import assert from "node:assert/strict";
import test from "node:test";

import {
  decideTouchlineMatchPreviewDeliveryAttempt,
  planTouchlineMatchPreviewLiveDispatch,
} from "../lib/touchlineArena/social-match-preview-live-dispatch-plan.ts";

const startsAt = "2026-09-21T18:00:00.000Z";

function plan(overrides: Partial<Parameters<typeof planTouchlineMatchPreviewLiveDispatch>[0]> = {}) {
  return planTouchlineMatchPreviewLiveDispatch({
    fixtureId: "19722192",
    revision: 7,
    sourceRevisionChecksum: `sha256:${"a".repeat(64)}`,
    startsAt,
    now: "2026-09-20T17:59:59.999Z",
    editorialScheduledFor: null,
    accounts: { instagram: "ig-touchline", facebook: "fb-touchline", homeClub: "15", awayClub: "19" },
    enabled: {
      instagram: { feed: true, story: false },
      facebook: { feed: true, story: false },
      clubHubFeed: true,
    },
    approvals: { feed: true, story: false, clubHubFeed: true },
    ...overrides,
  });
}

test("Match Preview models four destinations and keeps T-24h as an editable suggestion until Admin sets a time", () => {
  const before = plan();
  assert.equal(before.length, 4);
  assert.deepEqual(before.map((task) => task.logicalDestination), ["INSTAGRAM", "FACEBOOK", "HOME_CLUB", "AWAY_CLUB"]);
  assert.ok(before.every((task) => task.presentation !== "SOCIAL_STORY" && task.state === "AWAITING_EDITORIAL_SCHEDULE"));
  assert.ok(before.every((task) => task.suggestedAt === "2026-09-20T18:00:00.000Z" && task.editorialScheduledFor === null));

  const at = plan({ now: "2026-09-20T18:00:00.000Z", editorialScheduledFor: "2026-09-20T18:00:00.000Z" });
  assert.ok(at.every((task) => task.state === "READY"));
  const after = plan({ now: "2026-09-20T18:00:00.001Z", editorialScheduledFor: "2026-09-20T18:00:00.000Z" });
  assert.ok(after.every((task) => task.state === "READY"));
});

test("a rescheduled fixture produces a new T-24h timing without changing the factual delivery identity", () => {
  const first = plan();
  const rescheduled = plan({ startsAt: "2026-09-22T20:30:00.000Z" });
  assert.ok(first.every((task) => task.suggestedAt === "2026-09-20T18:00:00.000Z"));
  assert.ok(rescheduled.every((task) => task.suggestedAt === "2026-09-21T20:30:00.000Z"));
  assert.equal(first[0]?.factualInstanceKey, rescheduled[0]?.factualInstanceKey);
});

test("Story is a separate candidate: enabling it adds separate receipts and never inherits Feed approval", () => {
  const tasks = plan({
    now: "2026-09-20T18:00:00.000Z", editorialScheduledFor: "2026-09-20T18:00:00.000Z",
    enabled: { instagram: { feed: true, story: true }, facebook: { feed: true, story: true }, clubHubFeed: true },
    approvals: { feed: true, story: false, clubHubFeed: true },
  });
  assert.equal(tasks.length, 6);
  const stories = tasks.filter((task) => task.presentation === "SOCIAL_STORY");
  assert.equal(stories.length, 2);
  assert.ok(stories.every((task) => task.state === "BLOCKED_APPROVAL"));
  assert.notEqual(stories[0]?.idempotencyKey, tasks.find((task) => task.platform === "INSTAGRAM" && task.presentation === "SOCIAL_FEED")?.idempotencyKey);
});

test("ClubHub means two club feeds only: ClubOwner and a duplicate club are rejected", () => {
  assert.throws(() => plan({ accounts: { instagram: "ig", facebook: "fb", homeClub: "ClubOwner", awayClub: "19" } }), /CLUBOWNER/);
  assert.throws(() => plan({ accounts: { instagram: "ig", facebook: "fb", homeClub: "15", awayClub: "15" } }), /DISTINCT/);
});

test("automatic and manual attempts use destination-scoped idempotence and uncertain responses reconcile", () => {
  assert.deepEqual(decideTouchlineMatchPreviewDeliveryAttempt("NONE"), { action: "ATTEMPT_ALLOWED" });
  assert.deepEqual(decideTouchlineMatchPreviewDeliveryAttempt("IN_FLIGHT"), { action: "SKIP_DUPLICATE_IN_FLIGHT" });
  assert.deepEqual(decideTouchlineMatchPreviewDeliveryAttempt("CONFIRMED"), { action: "SKIP_DUPLICATE_CONFIRMED" });
  assert.deepEqual(decideTouchlineMatchPreviewDeliveryAttempt("UNCERTAIN"), { action: "RECONCILE_BEFORE_RETRY" });
});
