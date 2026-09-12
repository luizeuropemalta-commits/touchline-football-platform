import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  resolveTouchlinePublishedGameweekBest,
  resolveTouchlinePublishedGameweekCoach,
} from "../lib/touchlineArena/published-gameweek-best.ts";
import type { TouchlinePublishedTopEleven } from "../lib/touchlineArena/published-top-eleven.ts";
import { TOUCHLINE_SELECTION_SLOTS } from "../lib/touchlineArena/touchline-selection.ts";

const tablesClient = readFileSync(
  new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url),
  "utf8",
);

const selection: TouchlinePublishedTopEleven = {
  snapshotId: "snapshot-gameweek-3",
  roundId: "3",
  publishedAt: "2026-09-10T18:00:00.000Z",
  coach: null,
  slots: TOUCHLINE_SELECTION_SLOTS.map((slot, index) => ({ ...slot, playerIds: [`player-${index}`] })),
};

const cards = selection.slots.map((slot, index) => ({
  id: `card-${index}`,
  canonicalPlayerId: `player-${index}`,
  sportmonksPlayerId: `provider-${index}`,
}));

test("published Gameweek Best XI exposes exactly eleven distinct resolved cards", () => {
  const result = resolveTouchlinePublishedGameweekBest({ selection, cards: cards as never[] });
  assert.equal(result.phase, "ready");
  if (result.phase !== "ready") return;
  assert.equal(result.roundId, "3");
  assert.equal(result.slots.length, 11);
  assert.equal(new Set(result.slots.map((entry) => entry.card.canonicalPlayerId)).size, 11);
  assert.equal(result.coach, null);
});

test("Gameweek Best XI fails closed instead of showing a partial eleven", () => {
  const result = resolveTouchlinePublishedGameweekBest({ selection, cards: cards.slice(0, 10) as never[] });
  assert.deepEqual(result, { phase: "unavailable", reason: "incomplete-card-catalogue" });
});

test("Gameweek coach resolves only the exact immutable payload, never a season fallback", () => {
  const withCoach: TouchlinePublishedTopEleven = {
    ...selection,
    coach: { coachProviderId: "107439", touchlinePoints: 17 },
  };
  assert.deepEqual(resolveTouchlinePublishedGameweekCoach(withCoach), {
    phase: "ready",
    coachProviderId: "107439",
    touchlinePoints: 17,
  });
  assert.deepEqual(resolveTouchlinePublishedGameweekCoach(selection), {
    phase: "unavailable",
    reason: "no-published-coach",
  });
  assert.deepEqual(resolveTouchlinePublishedGameweekCoach(null), {
    phase: "unavailable",
    reason: "no-published-selection",
  });
});

test("pending Gameweek coach state never presents a leadership crown", () => {
  const pendingGate = tablesClient.match(
    /data-gameweek-coach-state="pending">([\s\S]*?)<\/div>}\s*<\/>/,
  );

  assert.ok(pendingGate, "Gameweek coach pending gate must remain explicit");
  assert.doesNotMatch(pendingGate[1], /<Crown\b/, "an unpublished Gameweek coach cannot appear as leader");
  assert.match(tablesClient, /data-gameweek-coach-state="published"[\s\S]*?<Crown\b/, "only the published coach gate may show the crown");
});
