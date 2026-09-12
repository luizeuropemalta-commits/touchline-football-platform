import assert from "node:assert/strict";
import test from "node:test";
import { parseTouchlinePublishedTopEleven } from "../lib/touchlineArena/published-top-eleven.ts";
import { TOUCHLINE_SELECTION_SLOTS } from "../lib/touchlineArena/touchline-selection.ts";

test("published Top 11 accepts only a complete immutable selection for its snapshot", () => {
  const result = parseTouchlinePublishedTopEleven({
    snapshotId: "snapshot-1", roundId: "round-1", publishedAt: "2026-08-04T12:00:00.000Z",
    selectionPayload: { sourceSnapshotId: "snapshot-1", complete: true, formation: "4-3-3", players: TOUCHLINE_SELECTION_SLOTS.map((slot, index) => ({ ...slot, player: { playerId: `player-${index}`, providerPlayerId: `provider-${index}` } })) },
  });
  assert.equal(result?.slots.length, 11);
  assert.deepEqual(result?.slots[0].playerIds, ["player-0", "provider-0"]);
  assert.equal(result?.coach, null);
});

test("published Top 11 accepts a coach only when the immutable Gameweek payload carries valid points", () => {
  const result = parseTouchlinePublishedTopEleven({
    snapshotId: "snapshot-1", roundId: "round-1", publishedAt: "2026-08-04T12:00:00.000Z",
    selectionPayload: { sourceSnapshotId: "snapshot-1", complete: true, formation: "4-3-3", coach: { coachProviderId: "coach-7", touchlinePoints: 13 }, players: TOUCHLINE_SELECTION_SLOTS.map((slot, index) => ({ ...slot, player: { playerId: `player-${index}` } })) },
  });
  assert.deepEqual(result?.coach, { coachProviderId: "coach-7", touchlinePoints: 13 });
});

test("published Top 11 rejects incomplete, mismatched and duplicate slot payloads", () => {
  const base = { snapshotId: "snapshot-1", roundId: "round-1", publishedAt: "2026-08-04T12:00:00.000Z" };
  assert.equal(parseTouchlinePublishedTopEleven({ ...base, selectionPayload: { sourceSnapshotId: "other", complete: true, formation: "4-3-3", players: [] } }), null);
  assert.equal(parseTouchlinePublishedTopEleven({ ...base, selectionPayload: { sourceSnapshotId: "snapshot-1", complete: true, formation: "4-3-3", players: Array.from({ length: 11 }, () => ({ ...TOUCHLINE_SELECTION_SLOTS[0], player: { playerId: "x" } })) } }), null);
});

test("published Top 11 fails closed when a Gameweek coach is incomplete", () => {
  const base = { snapshotId: "snapshot-1", roundId: "round-1", publishedAt: "2026-08-04T12:00:00.000Z" };
  const players = TOUCHLINE_SELECTION_SLOTS.map((slot, index) => ({
    ...slot,
    player: { playerId: `player-${index}` },
  }));
  assert.equal(parseTouchlinePublishedTopEleven({
    ...base,
    selectionPayload: {
      sourceSnapshotId: "snapshot-1",
      complete: true,
      formation: "4-3-3",
      coach: { coachProviderId: "coach-1" },
      players,
    },
  }), null);
});
