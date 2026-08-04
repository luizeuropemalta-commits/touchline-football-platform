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
});

test("published Top 11 rejects incomplete, mismatched and duplicate slot payloads", () => {
  const base = { snapshotId: "snapshot-1", roundId: "round-1", publishedAt: "2026-08-04T12:00:00.000Z" };
  assert.equal(parseTouchlinePublishedTopEleven({ ...base, selectionPayload: { sourceSnapshotId: "other", complete: true, formation: "4-3-3", players: [] } }), null);
  assert.equal(parseTouchlinePublishedTopEleven({ ...base, selectionPayload: { sourceSnapshotId: "snapshot-1", complete: true, formation: "4-3-3", players: Array.from({ length: 11 }, () => ({ ...TOUCHLINE_SELECTION_SLOTS[0], player: { playerId: "x" } })) } }), null);
});
