/**
 * Pure protocol for a future server-owned Arena match substitution projection.
 *
 * This module deliberately has no browser, database, API, storage, clock or
 * environment dependency. Persisting its snapshots/events is a separately
 * gated server concern while the remote data safety freeze is active.
 */

export type TouchlineDurableMatchdaySnapshot = {
  matchId: string;
  ownerId: string;
  rosterRevision: string;
  startingInventoryIds: readonly string[];
  benchInventoryIds: readonly string[];
};

export type TouchlineDurableQuickSubstitutionState = {
  matchId: string;
  ownerId: string;
  rosterRevision: string;
  revision: number;
  activeInventoryIds: readonly string[];
  availableBenchInventoryIds: readonly string[];
  substitutedOutInventoryIds: readonly string[];
  appliedEvents: readonly TouchlineDurableQuickSubstitutionEvent[];
};

export type TouchlineDurableQuickSubstitutionCommand = {
  commandId: string;
  commandHash: string;
  matchId: string;
  actorId: string;
  expectedRosterRevision: string;
  expectedRevision: number;
  outgoingInventoryId: string;
  incomingInventoryId: string;
  occurredAt: string;
};

export type TouchlineDurableQuickSubstitutionEvent = Readonly<
  TouchlineDurableQuickSubstitutionCommand & {
    resultingRevision: number;
  }
>;

export type TouchlineDurableQuickSubstitutionRejection =
  | "invalid_snapshot"
  | "invalid_command"
  | "wrong_match"
  | "wrong_actor"
  | "stale_roster_revision"
  | "stale_revision"
  | "duplicate_command_conflict"
  | "outgoing_not_active"
  | "incoming_already_active"
  | "incoming_not_on_matchday_bench"
  | "player_cannot_reenter";

export type TouchlineDurableQuickSubstitutionInitializationResult =
  | {
      status: "ready";
      state: TouchlineDurableQuickSubstitutionState;
    }
  | {
      status: "rejected";
      reason: "invalid_snapshot";
    };

export type TouchlineDurableQuickSubstitutionResult =
  | {
      status: "applied";
      state: TouchlineDurableQuickSubstitutionState;
      event: TouchlineDurableQuickSubstitutionEvent;
    }
  | {
      status: "replayed";
      state: TouchlineDurableQuickSubstitutionState;
      event: TouchlineDurableQuickSubstitutionEvent;
    }
  | {
      status: "rejected";
      reason: TouchlineDurableQuickSubstitutionRejection;
    };

const STARTING_XI_SIZE = 11;
const MATCHDAY_BENCH_SIZE = 9;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExactlyUniqueNonEmptyIds(ids: readonly string[], expectedSize: number) {
  return ids.length === expectedSize && ids.every(isNonEmptyString) && new Set(ids).size === expectedSize;
}

function isFiniteRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function hasValidCommandIdentity(command: TouchlineDurableQuickSubstitutionCommand) {
  return [
    command.commandId,
    command.commandHash,
    command.matchId,
    command.actorId,
    command.expectedRosterRevision,
    command.outgoingInventoryId,
    command.incomingInventoryId,
    command.occurredAt,
  ].every(isNonEmptyString)
    && isFiniteRevision(command.expectedRevision)
    && Number.isFinite(Date.parse(command.occurredAt));
}

function commandsMatch(
  event: TouchlineDurableQuickSubstitutionEvent,
  command: TouchlineDurableQuickSubstitutionCommand,
) {
  return event.commandHash === command.commandHash
    && event.matchId === command.matchId
    && event.actorId === command.actorId
    && event.expectedRosterRevision === command.expectedRosterRevision
    && event.expectedRevision === command.expectedRevision
    && event.outgoingInventoryId === command.outgoingInventoryId
    && event.incomingInventoryId === command.incomingInventoryId
    && event.occurredAt === command.occurredAt;
}

/**
 * Creates the immutable 11 + 9 matchday state. The input is expected to come
 * from a future protected server snapshot; inventory IDs are intentionally the
 * only player identity this protocol accepts.
 */
export function createTouchlineDurableQuickSubstitutionState(
  snapshot: TouchlineDurableMatchdaySnapshot,
): TouchlineDurableQuickSubstitutionInitializationResult {
  const allIds = [...snapshot.startingInventoryIds, ...snapshot.benchInventoryIds];
  if (!isNonEmptyString(snapshot.matchId)
    || !isNonEmptyString(snapshot.ownerId)
    || !isNonEmptyString(snapshot.rosterRevision)
    || !hasExactlyUniqueNonEmptyIds(snapshot.startingInventoryIds, STARTING_XI_SIZE)
    || !hasExactlyUniqueNonEmptyIds(snapshot.benchInventoryIds, MATCHDAY_BENCH_SIZE)
    || new Set(allIds).size !== allIds.length) {
    return { status: "rejected", reason: "invalid_snapshot" };
  }

  const state: TouchlineDurableQuickSubstitutionState = Object.freeze({
    matchId: snapshot.matchId,
    ownerId: snapshot.ownerId,
    rosterRevision: snapshot.rosterRevision,
    revision: 0,
    activeInventoryIds: Object.freeze([...snapshot.startingInventoryIds]),
    availableBenchInventoryIds: Object.freeze([...snapshot.benchInventoryIds]),
    substitutedOutInventoryIds: Object.freeze([]),
    appliedEvents: Object.freeze([]),
  });

  return { status: "ready", state };
}

/**
 * Applies one idempotent, revision-checked substitution event. The protocol
 * deliberately does not cap substitutions: the only approved gameplay rule
 * here is that a substituted-out player cannot re-enter the same match state.
 */
export function applyTouchlineDurableQuickSubstitution(
  state: TouchlineDurableQuickSubstitutionState,
  command: TouchlineDurableQuickSubstitutionCommand,
): TouchlineDurableQuickSubstitutionResult {
  if (!hasValidCommandIdentity(command)) {
    return { status: "rejected", reason: "invalid_command" };
  }

  const existingEvent = state.appliedEvents.find((event) => event.commandId === command.commandId);
  if (existingEvent) {
    return commandsMatch(existingEvent, command)
      ? { status: "replayed", state, event: existingEvent }
      : { status: "rejected", reason: "duplicate_command_conflict" };
  }

  if (command.matchId !== state.matchId) return { status: "rejected", reason: "wrong_match" };
  if (command.actorId !== state.ownerId) return { status: "rejected", reason: "wrong_actor" };
  if (command.expectedRosterRevision !== state.rosterRevision) return { status: "rejected", reason: "stale_roster_revision" };
  if (command.expectedRevision !== state.revision) return { status: "rejected", reason: "stale_revision" };

  if (state.substitutedOutInventoryIds.includes(command.incomingInventoryId)) {
    return { status: "rejected", reason: "player_cannot_reenter" };
  }
  if (!state.activeInventoryIds.includes(command.outgoingInventoryId)) {
    return { status: "rejected", reason: "outgoing_not_active" };
  }
  if (state.activeInventoryIds.includes(command.incomingInventoryId)) {
    return { status: "rejected", reason: "incoming_already_active" };
  }
  if (!state.availableBenchInventoryIds.includes(command.incomingInventoryId)) {
    return { status: "rejected", reason: "incoming_not_on_matchday_bench" };
  }

  const event: TouchlineDurableQuickSubstitutionEvent = Object.freeze({
    ...command,
    resultingRevision: state.revision + 1,
  });
  const nextState: TouchlineDurableQuickSubstitutionState = Object.freeze({
    ...state,
    revision: event.resultingRevision,
    activeInventoryIds: Object.freeze(state.activeInventoryIds.map((id) => (
      id === command.outgoingInventoryId ? command.incomingInventoryId : id
    ))),
    availableBenchInventoryIds: Object.freeze(state.availableBenchInventoryIds.filter((id) => id !== command.incomingInventoryId)),
    substitutedOutInventoryIds: Object.freeze([...state.substitutedOutInventoryIds, command.outgoingInventoryId]),
    appliedEvents: Object.freeze([...state.appliedEvents, event]),
  });

  return { status: "applied", state: nextState, event };
}

export const TOUCHLINE_DURABLE_QUICK_SUBSTITUTION_PROTOCOL = Object.freeze({
  startingXiSize: STARTING_XI_SIZE,
  matchdayBenchSize: MATCHDAY_BENCH_SIZE,
});
