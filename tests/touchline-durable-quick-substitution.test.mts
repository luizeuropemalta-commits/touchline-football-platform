import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyTouchlineDurableQuickSubstitution,
  createTouchlineDurableQuickSubstitutionState,
  TOUCHLINE_DURABLE_QUICK_SUBSTITUTION_PROTOCOL,
  type TouchlineDurableMatchdaySnapshot,
  type TouchlineDurableQuickSubstitutionCommand,
  type TouchlineDurableQuickSubstitutionState,
} from "../lib/touchlineArena/durable-quick-substitution.ts";

function snapshot(overrides: Partial<TouchlineDurableMatchdaySnapshot> = {}): TouchlineDurableMatchdaySnapshot {
  return {
    matchId: "match:2026-27:round-01:fixture-001",
    ownerId: "owner:controlled-test",
    rosterRevision: "roster-revision:42",
    startingInventoryIds: Array.from({ length: 11 }, (_, index) => `contract:xi-${index + 1}`),
    benchInventoryIds: Array.from({ length: 9 }, (_, index) => `contract:bench-${index + 1}`),
    ...overrides,
  };
}

function readyState(input: TouchlineDurableMatchdaySnapshot = snapshot()) {
  const result = createTouchlineDurableQuickSubstitutionState(input);
  assert.equal(result.status, "ready");
  return result.state;
}

function command(
  state: TouchlineDurableQuickSubstitutionState,
  overrides: Partial<TouchlineDurableQuickSubstitutionCommand> = {},
): TouchlineDurableQuickSubstitutionCommand {
  return {
    commandId: `command:${state.revision + 1}`,
    commandHash: `hash:${state.revision + 1}`,
    matchId: state.matchId,
    actorId: state.ownerId,
    expectedRosterRevision: state.rosterRevision,
    expectedRevision: state.revision,
    outgoingInventoryId: state.activeInventoryIds[0]!,
    incomingInventoryId: state.availableBenchInventoryIds[0]!,
    occurredAt: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

test("durable Quick Sub starts only from exactly eleven active and nine bench inventory IDs", () => {
  assert.equal(TOUCHLINE_DURABLE_QUICK_SUBSTITUTION_PROTOCOL.startingXiSize, 11);
  assert.equal(TOUCHLINE_DURABLE_QUICK_SUBSTITUTION_PROTOCOL.matchdayBenchSize, 9);

  const ready = createTouchlineDurableQuickSubstitutionState(snapshot());
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  assert.equal(ready.state.activeInventoryIds.length, 11);
  assert.equal(ready.state.availableBenchInventoryIds.length, 9);

  const tooFewStarters = createTouchlineDurableQuickSubstitutionState(snapshot({
    startingInventoryIds: Array.from({ length: 10 }, (_, index) => `contract:xi-${index + 1}`),
  }));
  assert.deepEqual(tooFewStarters, { status: "rejected", reason: "invalid_snapshot" });

  const overlap = createTouchlineDurableQuickSubstitutionState(snapshot({
    benchInventoryIds: ["contract:xi-1", ...Array.from({ length: 8 }, (_, index) => `contract:bench-${index + 1}`)],
  }));
  assert.deepEqual(overlap, { status: "rejected", reason: "invalid_snapshot" });
});

test("a successful substitution freezes the outgoing player out of the matchday bench", () => {
  const state = readyState();
  const result = applyTouchlineDurableQuickSubstitution(state, command(state, {
    outgoingInventoryId: "contract:xi-4",
    incomingInventoryId: "contract:bench-7",
  }));

  assert.equal(result.status, "applied");
  if (result.status !== "applied") return;
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.activeInventoryIds[3], "contract:bench-7");
  assert.ok(!result.state.availableBenchInventoryIds.includes("contract:bench-7"));
  assert.ok(!result.state.availableBenchInventoryIds.includes("contract:xi-4"));
  assert.deepEqual(result.state.substitutedOutInventoryIds, ["contract:xi-4"]);
  assert.equal(result.state.appliedEvents.length, 1);
  assert.equal(result.event.resultingRevision, 1);
});

test("an identical command is idempotent while a conflicting reused command ID is rejected", () => {
  const initial = readyState();
  const firstCommand = command(initial);
  const applied = applyTouchlineDurableQuickSubstitution(initial, firstCommand);
  assert.equal(applied.status, "applied");
  if (applied.status !== "applied") return;

  const replay = applyTouchlineDurableQuickSubstitution(applied.state, firstCommand);
  assert.equal(replay.status, "replayed");
  if (replay.status !== "replayed") return;
  assert.strictEqual(replay.state, applied.state);
  assert.strictEqual(replay.event, applied.event);

  const conflict = applyTouchlineDurableQuickSubstitution(applied.state, {
    ...firstCommand,
    incomingInventoryId: "contract:bench-2",
  });
  assert.deepEqual(conflict, { status: "rejected", reason: "duplicate_command_conflict" });
});

test("a reload-equivalent reconstructed state rejects a substituted-out player attempting to re-enter", () => {
  const initial = readyState();
  const applied = applyTouchlineDurableQuickSubstitution(initial, command(initial, {
    outgoingInventoryId: "contract:xi-2",
    incomingInventoryId: "contract:bench-1",
  }));
  assert.equal(applied.status, "applied");
  if (applied.status !== "applied") return;

  const reloaded: TouchlineDurableQuickSubstitutionState = JSON.parse(JSON.stringify(applied.state));
  const reentry = applyTouchlineDurableQuickSubstitution(reloaded, command(reloaded, {
    commandId: "command:reentry",
    commandHash: "hash:reentry",
    incomingInventoryId: "contract:xi-2",
  }));
  assert.deepEqual(reentry, { status: "rejected", reason: "player_cannot_reenter" });
});

test("stale, cross-owner, cross-match, and non-bench commands fail closed", () => {
  const state = readyState();

  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { expectedRevision: 9 })),
    { status: "rejected", reason: "stale_revision" },
  );
  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { actorId: "owner:other" })),
    { status: "rejected", reason: "wrong_actor" },
  );
  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { matchId: "match:other" })),
    { status: "rejected", reason: "wrong_match" },
  );
  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { expectedRosterRevision: "roster-revision:other" })),
    { status: "rejected", reason: "stale_roster_revision" },
  );
  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { outgoingInventoryId: "contract:not-active" })),
    { status: "rejected", reason: "outgoing_not_active" },
  );
  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { incomingInventoryId: "contract:xi-2" })),
    { status: "rejected", reason: "incoming_already_active" },
  );
  assert.deepEqual(
    applyTouchlineDurableQuickSubstitution(state, command(state, { incomingInventoryId: "contract:not-on-bench" })),
    { status: "rejected", reason: "incoming_not_on_matchday_bench" },
  );
});

test("the protocol deliberately allows more than five valid substitutions because no maximum rule is approved", () => {
  let state = readyState();

  for (let index = 0; index < 6; index += 1) {
    const result = applyTouchlineDurableQuickSubstitution(state, command(state, {
      commandId: `command:unbounded-${index + 1}`,
      commandHash: `hash:unbounded-${index + 1}`,
      outgoingInventoryId: `contract:xi-${index + 1}`,
      incomingInventoryId: `contract:bench-${index + 1}`,
    }));
    assert.equal(result.status, "applied");
    if (result.status !== "applied") return;
    state = result.state;
  }

  assert.equal(state.revision, 6);
  assert.equal(state.substitutedOutInventoryIds.length, 6);
});

test("the protocol module has no browser, network, database, storage, environment, or implicit clock boundary", () => {
  const source = readFileSync(new URL("../lib/touchlineArena/durable-quick-substitution.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /create(?:Admin|Server|Browser)Client|from ["']@supabase/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|window\.|document\.|process\.env|Date\.now/);
  assert.doesNotMatch(source, /\/api\//);
});
