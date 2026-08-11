import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyTouchlineQuickSubstitutionSession,
  createTouchlineQuickSubstitutionSession,
  isTouchlineQuickSubstitutionSessionState,
  restoreTouchlineQuickSubstitutionSession,
  TOUCHLINE_QUICK_SUBSTITUTION_SESSION_RULES,
  type TouchlineQuickSubstitutionSessionCommand,
  type TouchlineQuickSubstitutionSessionSnapshot,
  type TouchlineQuickSubstitutionSessionState,
} from "../lib/touchlineArena/quick-substitution-session.ts";

function snapshot(
  overrides: Partial<TouchlineQuickSubstitutionSessionSnapshot> = {},
): TouchlineQuickSubstitutionSessionSnapshot {
  return {
    matchId: "match:2026-27:round-01:fixture-001",
    ownerId: "owner:controlled-test",
    rosterRevision: "roster-revision:42",
    startingSlots: Array.from({ length: 11 }, (_, index) => ({
      positionSlotId: `pitch-slot:${index + 1}`,
      inventoryId: `contract:xi-${index + 1}`,
    })),
    benchInventoryIds: Array.from({ length: 9 }, (_, index) => `contract:bench-${index + 1}`),
    ...overrides,
  };
}

function readyState(input: TouchlineQuickSubstitutionSessionSnapshot = snapshot()) {
  const result = createTouchlineQuickSubstitutionSession(input);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("Expected an initialized Quick Sub session.");
  return result.state;
}

function command(
  state: TouchlineQuickSubstitutionSessionState,
  overrides: Partial<TouchlineQuickSubstitutionSessionCommand> = {},
): TouchlineQuickSubstitutionSessionCommand {
  return {
    commandId: `command:${state.revision + 1}`,
    commandHash: `hash:${state.revision + 1}`,
    expectedRevision: state.revision,
    outgoingPositionSlotId: state.activeSlots[0]!.positionSlotId,
    incomingInventoryId: state.availableBenchInventoryIds[0]!,
    occurredAt: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

function partition(state: TouchlineQuickSubstitutionSessionState) {
  return [
    ...state.activeSlots.map((slot) => slot.inventoryId),
    ...state.availableBenchInventoryIds,
    ...state.substitutedOutInventoryIds,
  ];
}

test("the Quick Sub session initializes only with exactly eleven stable slots and nine unique inventory-backed bench players", () => {
  assert.equal(TOUCHLINE_QUICK_SUBSTITUTION_SESSION_RULES.startingXiSize, 11);
  assert.equal(TOUCHLINE_QUICK_SUBSTITUTION_SESSION_RULES.matchdayBenchSize, 9);

  const state = readyState();
  assert.equal(state.activeSlots.length, 11);
  assert.equal(state.availableBenchInventoryIds.length, 9);
  assert.deepEqual(state.substitutedOutInventoryIds, []);

  assert.deepEqual(
    createTouchlineQuickSubstitutionSession(snapshot({
      startingSlots: Array.from({ length: 10 }, (_, index) => ({
        positionSlotId: `pitch-slot:${index + 1}`,
        inventoryId: `contract:xi-${index + 1}`,
      })),
    })),
    { status: "rejected", reason: "invalid_snapshot" },
  );
  assert.deepEqual(
    createTouchlineQuickSubstitutionSession(snapshot({
      startingSlots: [
        { positionSlotId: "pitch-slot:1", inventoryId: "" },
        ...Array.from({ length: 10 }, (_, index) => ({
          positionSlotId: `pitch-slot:${index + 2}`,
          inventoryId: `contract:xi-${index + 2}`,
        })),
      ],
    })),
    { status: "rejected", reason: "invalid_snapshot" },
  );
  assert.deepEqual(
    createTouchlineQuickSubstitutionSession(snapshot({
      benchInventoryIds: ["contract:xi-1", ...Array.from({ length: 8 }, (_, index) => `contract:bench-${index + 1}`)],
    })),
    { status: "rejected", reason: "invalid_snapshot" },
  );
});

test("two substitutions retain fixed pitch slots and a complete, disjoint player partition", () => {
  const initial = readyState();
  const initialPartition = partition(initial).sort();

  const first = applyTouchlineQuickSubstitutionSession(initial, command(initial, {
    outgoingPositionSlotId: "pitch-slot:4",
    incomingInventoryId: "contract:bench-7",
  }));
  assert.equal(first.status, "applied");
  if (first.status !== "applied") return;
  assert.deepEqual(first.state.activeSlots[3], {
    positionSlotId: "pitch-slot:4",
    inventoryId: "contract:bench-7",
  });
  assert.deepEqual(first.state.substitutedOutInventoryIds, ["contract:xi-4"]);

  const second = applyTouchlineQuickSubstitutionSession(first.state, command(first.state, {
    outgoingPositionSlotId: "pitch-slot:9",
    incomingInventoryId: "contract:bench-2",
  }));
  assert.equal(second.status, "applied");
  if (second.status !== "applied") return;
  assert.deepEqual(second.state.activeSlots[8], {
    positionSlotId: "pitch-slot:9",
    inventoryId: "contract:bench-2",
  });
  assert.deepEqual(second.state.substitutedOutInventoryIds, ["contract:xi-4", "contract:xi-9"]);
  assert.equal(second.state.activeSlots.length, 11);
  assert.equal(second.state.availableBenchInventoryIds.length, 7);
  assert.equal(second.state.substitutedOutInventoryIds.length, 2);
  assert.equal(new Set(partition(second.state)).size, 20);
  assert.deepEqual(partition(second.state).sort(), initialPartition);
});

test("a substituted-out player cannot re-enter through any active position slot", () => {
  const initial = readyState();
  const first = applyTouchlineQuickSubstitutionSession(initial, command(initial, {
    outgoingPositionSlotId: "pitch-slot:2",
    incomingInventoryId: "contract:bench-1",
  }));
  assert.equal(first.status, "applied");
  if (first.status !== "applied") return;

  assert.deepEqual(
    applyTouchlineQuickSubstitutionSession(first.state, command(first.state, {
      outgoingPositionSlotId: "pitch-slot:2",
      incomingInventoryId: "contract:xi-2",
    })),
    { status: "rejected", reason: "player_cannot_reenter" },
  );
  assert.deepEqual(first.state.substitutedOutInventoryIds, ["contract:xi-2"]);
});

test("a substitute who later leaves the pitch is also permanently unavailable", () => {
  const initial = readyState();
  const first = applyTouchlineQuickSubstitutionSession(initial, command(initial, {
    outgoingPositionSlotId: "pitch-slot:5",
    incomingInventoryId: "contract:bench-7",
  }));
  assert.equal(first.status, "applied");
  if (first.status !== "applied") return;

  const second = applyTouchlineQuickSubstitutionSession(first.state, command(first.state, {
    outgoingPositionSlotId: "pitch-slot:5",
    incomingInventoryId: "contract:bench-2",
  }));
  assert.equal(second.status, "applied");
  if (second.status !== "applied") return;

  assert.deepEqual(second.state.activeSlots[4], {
    positionSlotId: "pitch-slot:5",
    inventoryId: "contract:bench-2",
  });
  assert.deepEqual(second.state.substitutedOutInventoryIds, ["contract:xi-5", "contract:bench-7"]);
  assert.deepEqual(
    applyTouchlineQuickSubstitutionSession(second.state, command(second.state, {
      outgoingPositionSlotId: "pitch-slot:5",
      incomingInventoryId: "contract:bench-7",
    })),
    { status: "rejected", reason: "player_cannot_reenter" },
  );
});

test("the session rejects missing inventory, unknown pitch slots, and malformed session inputs", () => {
  const state = readyState();

  assert.equal(isTouchlineQuickSubstitutionSessionState(JSON.parse(JSON.stringify(state))), true);
  assert.equal(isTouchlineQuickSubstitutionSessionState({ ...state, revision: -1 }), false);

  assert.deepEqual(
    applyTouchlineQuickSubstitutionSession(state, command(state, { incomingInventoryId: "" })),
    { status: "rejected", reason: "invalid_command" },
  );
  assert.deepEqual(
    applyTouchlineQuickSubstitutionSession(state, command(state, { outgoingPositionSlotId: "pitch-slot:unknown" })),
    { status: "rejected", reason: "unknown_position_slot" },
  );
  assert.deepEqual(
    applyTouchlineQuickSubstitutionSession({
      ...state,
      activeSlots: state.activeSlots.map((slot, index) => (
        index === 0 ? { ...slot, inventoryId: "" } : slot
      )),
    }, command(state)),
    { status: "rejected", reason: "invalid_session_state" },
  );
});

test("a restored browser session is replayed from the canonical snapshot and rejects forged derived fields", () => {
  const initial = readyState();
  const first = applyTouchlineQuickSubstitutionSession(initial, command(initial, {
    outgoingPositionSlotId: "pitch-slot:2",
    incomingInventoryId: "contract:bench-1",
  }));
  assert.equal(first.status, "applied");
  if (first.status !== "applied") return;

  const restored = restoreTouchlineQuickSubstitutionSession(snapshot(), JSON.parse(JSON.stringify(first.state)));
  assert.equal(restored.status, "ready");
  if (restored.status === "ready") assert.deepEqual(restored.state, first.state);

  const forged = JSON.parse(JSON.stringify(first.state)) as TouchlineQuickSubstitutionSessionState;
  forged.activeSlots = forged.activeSlots.map((slot, index) => (
    index === 1 ? { ...slot, inventoryId: "contract:xi-2" } : slot
  ));
  forged.availableBenchInventoryIds = ["contract:bench-2", ...forged.availableBenchInventoryIds.slice(1)];
  forged.substitutedOutInventoryIds = ["contract:bench-1"];
  forged.durableState = {
    ...forged.durableState,
    activeInventoryIds: forged.activeSlots.map((slot) => slot.inventoryId),
    availableBenchInventoryIds: forged.availableBenchInventoryIds,
    substitutedOutInventoryIds: forged.substitutedOutInventoryIds,
  };
  assert.equal(isTouchlineQuickSubstitutionSessionState(forged), true);
  assert.deepEqual(
    restoreTouchlineQuickSubstitutionSession(snapshot(), forged),
    { status: "rejected", reason: "invalid_session_state" },
  );
});

test("the session projection has no browser, network, database, storage, environment, or implicit clock boundary", () => {
  const source = readFileSync(new URL("../lib/touchlineArena/quick-substitution-session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /create(?:Admin|Server|Browser)Client|from ["']@supabase/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|window\.|document\.|process\.env|Date\.now/);
  assert.doesNotMatch(source, /\/api\//);
});
