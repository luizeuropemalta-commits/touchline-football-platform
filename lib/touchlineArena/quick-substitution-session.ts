/**
 * Pure, in-memory projection for the Quick Sub interface.
 *
 * The caller supplies a canonical 11 + 9 matchday snapshot and every command
 * identity. This module deliberately creates no player IDs, timestamps, or
 * persistence side effects. A future protected match-state boundary can own
 * storage while the interface uses this projection to keep substitutions
 * visually stable within one session.
 */

import {
  applyTouchlineDurableQuickSubstitution,
  createTouchlineDurableQuickSubstitutionState,
  type TouchlineDurableQuickSubstitutionEvent,
  type TouchlineDurableQuickSubstitutionRejection,
  type TouchlineDurableQuickSubstitutionState,
} from "./durable-quick-substitution.ts";

export type TouchlineQuickSubstitutionPositionSlot = Readonly<{
  positionSlotId: string;
  inventoryId: string;
}>;

export type TouchlineQuickSubstitutionSessionSnapshot = Readonly<{
  matchId: string;
  ownerId: string;
  rosterRevision: string;
  startingSlots: readonly TouchlineQuickSubstitutionPositionSlot[];
  benchInventoryIds: readonly string[];
}>;

export type TouchlineQuickSubstitutionSessionCommand = Readonly<{
  commandId: string;
  commandHash: string;
  expectedRevision: number;
  outgoingPositionSlotId: string;
  incomingInventoryId: string;
  occurredAt: string;
}>;

export type TouchlineQuickSubstitutionSessionEvent = Readonly<{
  commandId: string;
  commandHash: string;
  outgoingPositionSlotId: string;
  outgoingInventoryId: string;
  incomingInventoryId: string;
  resultingRevision: number;
  occurredAt: string;
}>;

export type TouchlineQuickSubstitutionSessionState = Readonly<{
  matchId: string;
  ownerId: string;
  rosterRevision: string;
  revision: number;
  activeSlots: readonly TouchlineQuickSubstitutionPositionSlot[];
  availableBenchInventoryIds: readonly string[];
  substitutedOutInventoryIds: readonly string[];
  appliedEvents: readonly TouchlineQuickSubstitutionSessionEvent[];
  durableState: TouchlineDurableQuickSubstitutionState;
}>;

export type TouchlineQuickSubstitutionSessionRejection =
  | "invalid_snapshot"
  | "invalid_session_state"
  | "unknown_position_slot"
  | TouchlineDurableQuickSubstitutionRejection;

export type TouchlineQuickSubstitutionSessionInitializationResult =
  | Readonly<{
      status: "ready";
      state: TouchlineQuickSubstitutionSessionState;
    }>
  | Readonly<{
      status: "rejected";
      reason: "invalid_snapshot";
  }>;

export type TouchlineQuickSubstitutionSessionRestoreResult =
  | Readonly<{
      status: "ready";
      state: TouchlineQuickSubstitutionSessionState;
    }>
  | Readonly<{
      status: "rejected";
      reason: "invalid_snapshot" | "invalid_session_state";
    }>;

export type TouchlineQuickSubstitutionSessionResult =
  | Readonly<{
      status: "applied";
      state: TouchlineQuickSubstitutionSessionState;
      event: TouchlineQuickSubstitutionSessionEvent;
    }>
  | Readonly<{
      status: "replayed";
      state: TouchlineQuickSubstitutionSessionState;
      event: TouchlineQuickSubstitutionSessionEvent;
    }>
  | Readonly<{
      status: "rejected";
      reason: TouchlineQuickSubstitutionSessionRejection;
    }>;

const STARTING_XI_SIZE = 11;
const MATCHDAY_BENCH_SIZE = 9;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function hasUniqueNonEmptyValues(values: readonly unknown[], expectedSize: number) {
  return values.length === expectedSize
    && values.every(isNonEmptyString)
    && new Set(values).size === expectedSize;
}

function hasSameOrderedValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasValidStartingSlots(value: unknown): value is readonly TouchlineQuickSubstitutionPositionSlot[] {
  if (!Array.isArray(value) || value.length !== STARTING_XI_SIZE) return false;

  const positionSlotIds: string[] = [];
  const inventoryIds: string[] = [];
  for (const slot of value) {
    if (!slot || typeof slot !== "object"
      || !isNonEmptyString(slot.positionSlotId)
      || !isNonEmptyString(slot.inventoryId)) {
      return false;
    }
    positionSlotIds.push(slot.positionSlotId);
    inventoryIds.push(slot.inventoryId);
  }

  return hasUniqueNonEmptyValues(positionSlotIds, STARTING_XI_SIZE)
    && hasUniqueNonEmptyValues(inventoryIds, STARTING_XI_SIZE);
}

function hasValidSnapshot(input: unknown): input is TouchlineQuickSubstitutionSessionSnapshot {
  if (!input || typeof input !== "object") return false;

  const snapshot = input as Partial<TouchlineQuickSubstitutionSessionSnapshot>;
  return isNonEmptyString(snapshot.matchId)
    && isNonEmptyString(snapshot.ownerId)
    && isNonEmptyString(snapshot.rosterRevision)
    && hasValidStartingSlots(snapshot.startingSlots)
    && Array.isArray(snapshot.benchInventoryIds)
    && hasUniqueNonEmptyValues(snapshot.benchInventoryIds, MATCHDAY_BENCH_SIZE);
}

function hasValidCommandShape(command: unknown): command is TouchlineQuickSubstitutionSessionCommand {
  if (!command || typeof command !== "object") return false;

  const candidate = command as Partial<TouchlineQuickSubstitutionSessionCommand>;
  return [
    candidate.commandId,
    candidate.commandHash,
    candidate.outgoingPositionSlotId,
    candidate.incomingInventoryId,
    candidate.occurredAt,
  ].every(isNonEmptyString)
    && isFiniteRevision(candidate.expectedRevision)
    && isNonEmptyString(candidate.occurredAt)
    && Number.isFinite(Date.parse(candidate.occurredAt));
}

function toSessionEvent(
  event: TouchlineDurableQuickSubstitutionEvent,
  outgoingPositionSlotId: string,
): TouchlineQuickSubstitutionSessionEvent {
  return Object.freeze({
    commandId: event.commandId,
    commandHash: event.commandHash,
    outgoingPositionSlotId,
    outgoingInventoryId: event.outgoingInventoryId,
    incomingInventoryId: event.incomingInventoryId,
    resultingRevision: event.resultingRevision,
    occurredAt: event.occurredAt,
  });
}

function hasValidSessionState(state: unknown): state is TouchlineQuickSubstitutionSessionState {
  if (!state || typeof state !== "object") return false;

  const candidate = state as Partial<TouchlineQuickSubstitutionSessionState>;
  const durableState = candidate.durableState;
  if (!durableState || typeof durableState !== "object"
    || !isNonEmptyString(candidate.matchId)
    || !isNonEmptyString(candidate.ownerId)
    || !isNonEmptyString(candidate.rosterRevision)
    || !isFiniteRevision(candidate.revision)
    || !hasValidStartingSlots(candidate.activeSlots)
    || !Array.isArray(candidate.availableBenchInventoryIds)
    || !Array.isArray(candidate.substitutedOutInventoryIds)
    || !Array.isArray(candidate.appliedEvents)
    || !isNonEmptyString(durableState.matchId)
    || !isNonEmptyString(durableState.ownerId)
    || !isNonEmptyString(durableState.rosterRevision)
    || !isFiniteRevision(durableState.revision)
    || !Array.isArray(durableState.activeInventoryIds)
    || !Array.isArray(durableState.availableBenchInventoryIds)
    || !Array.isArray(durableState.substitutedOutInventoryIds)
    || !Array.isArray(durableState.appliedEvents)) {
    return false;
  }

  const activeInventoryIds = candidate.activeSlots.map((slot) => slot.inventoryId);
  const allInventoryIds = [
    ...activeInventoryIds,
    ...candidate.availableBenchInventoryIds,
    ...candidate.substitutedOutInventoryIds,
  ];
  if (!hasUniqueNonEmptyValues(activeInventoryIds, STARTING_XI_SIZE)
    || !allInventoryIds.every(isNonEmptyString)
    || new Set(allInventoryIds).size !== allInventoryIds.length
    || candidate.availableBenchInventoryIds.length + candidate.substitutedOutInventoryIds.length !== MATCHDAY_BENCH_SIZE) {
    return false;
  }

  if (candidate.matchId !== durableState.matchId
    || candidate.ownerId !== durableState.ownerId
    || candidate.rosterRevision !== durableState.rosterRevision
    || candidate.revision !== durableState.revision
    || !hasSameOrderedValues(activeInventoryIds, durableState.activeInventoryIds)
    || !hasSameOrderedValues(candidate.availableBenchInventoryIds, durableState.availableBenchInventoryIds)
    || !hasSameOrderedValues(candidate.substitutedOutInventoryIds, durableState.substitutedOutInventoryIds)
    || candidate.appliedEvents.length !== durableState.appliedEvents.length) {
    return false;
  }

  return candidate.appliedEvents.every((event, index) => {
    const durableEvent = durableState.appliedEvents[index];
    return Boolean(durableEvent)
      && event != null
      && typeof event === "object"
      && isNonEmptyString(event.commandId)
      && isNonEmptyString(event.commandHash)
      && isNonEmptyString(event.outgoingPositionSlotId)
      && isNonEmptyString(event.outgoingInventoryId)
      && isNonEmptyString(event.incomingInventoryId)
      && isFiniteRevision(event.resultingRevision)
      && isNonEmptyString(event.occurredAt)
      && event.commandId === durableEvent.commandId
      && event.commandHash === durableEvent.commandHash
      && event.outgoingInventoryId === durableEvent.outgoingInventoryId
      && event.incomingInventoryId === durableEvent.incomingInventoryId
      && event.resultingRevision === durableEvent.resultingRevision
      && event.occurredAt === durableEvent.occurredAt;
  });
}

/**
 * Guards a JSON-restored session projection before a caller resumes Quick Sub
 * interactions. It accepts no implicit repair path: malformed or incomplete
 * inventory state must be rehydrated from the canonical matchday snapshot.
 */
export function isTouchlineQuickSubstitutionSessionState(
  value: unknown,
): value is TouchlineQuickSubstitutionSessionState {
  return hasValidSessionState(value);
}

function createSessionState(
  durableState: TouchlineDurableQuickSubstitutionState,
  activeSlots: readonly TouchlineQuickSubstitutionPositionSlot[],
  appliedEvents: readonly TouchlineQuickSubstitutionSessionEvent[],
): TouchlineQuickSubstitutionSessionState {
  return Object.freeze({
    matchId: durableState.matchId,
    ownerId: durableState.ownerId,
    rosterRevision: durableState.rosterRevision,
    revision: durableState.revision,
    activeSlots: Object.freeze(activeSlots.map((slot) => Object.freeze({ ...slot }))),
    availableBenchInventoryIds: Object.freeze([...durableState.availableBenchInventoryIds]),
    substitutedOutInventoryIds: Object.freeze([...durableState.substitutedOutInventoryIds]),
    appliedEvents: Object.freeze([...appliedEvents]),
    durableState,
  });
}

function hasSameSessionState(
  left: TouchlineQuickSubstitutionSessionState,
  right: TouchlineQuickSubstitutionSessionState,
) {
  return left.matchId === right.matchId
    && left.ownerId === right.ownerId
    && left.rosterRevision === right.rosterRevision
    && left.revision === right.revision
    && hasSameOrderedValues(
      left.activeSlots.map((slot) => `${slot.positionSlotId}:${slot.inventoryId}`),
      right.activeSlots.map((slot) => `${slot.positionSlotId}:${slot.inventoryId}`),
    )
    && hasSameOrderedValues(left.availableBenchInventoryIds, right.availableBenchInventoryIds)
    && hasSameOrderedValues(left.substitutedOutInventoryIds, right.substitutedOutInventoryIds)
    && left.appliedEvents.length === right.appliedEvents.length
    && left.appliedEvents.every((event, index) => {
      const candidate = right.appliedEvents[index];
      return candidate?.commandId === event.commandId
        && candidate.commandHash === event.commandHash
        && candidate.outgoingPositionSlotId === event.outgoingPositionSlotId
        && candidate.outgoingInventoryId === event.outgoingInventoryId
        && candidate.incomingInventoryId === event.incomingInventoryId
        && candidate.resultingRevision === event.resultingRevision
        && candidate.occurredAt === event.occurredAt;
    });
}

/**
 * Initializes the session only from a complete, inventory-backed matchday.
 * Position slot IDs remain fixed; substitutions replace only their inventory
 * occupant, so the incoming player is rendered at the outgoing player's spot.
 */
export function createTouchlineQuickSubstitutionSession(
  snapshot: TouchlineQuickSubstitutionSessionSnapshot,
): TouchlineQuickSubstitutionSessionInitializationResult {
  if (!hasValidSnapshot(snapshot)) {
    return { status: "rejected", reason: "invalid_snapshot" };
  }

  const startingInventoryIds = snapshot.startingSlots.map((slot) => slot.inventoryId);
  if (new Set([...startingInventoryIds, ...snapshot.benchInventoryIds]).size
    !== startingInventoryIds.length + snapshot.benchInventoryIds.length) {
    return { status: "rejected", reason: "invalid_snapshot" };
  }

  const initialized = createTouchlineDurableQuickSubstitutionState({
    matchId: snapshot.matchId,
    ownerId: snapshot.ownerId,
    rosterRevision: snapshot.rosterRevision,
    startingInventoryIds,
    benchInventoryIds: snapshot.benchInventoryIds,
  });
  if (initialized.status !== "ready") {
    return { status: "rejected", reason: "invalid_snapshot" };
  }

  return {
    status: "ready",
    state: createSessionState(initialized.state, snapshot.startingSlots, []),
  };
}

/**
 * Rebuilds a browser-restored projection exclusively by replaying its event
 * log against the current 11 + 9 snapshot. The serialized derived fields are
 * never trusted: a changed slot, bench partition or forged re-entry is
 * discarded and the caller can start a fresh local session instead.
 */
export function restoreTouchlineQuickSubstitutionSession(
  snapshot: TouchlineQuickSubstitutionSessionSnapshot,
  persisted: unknown,
): TouchlineQuickSubstitutionSessionRestoreResult {
  const initialized = createTouchlineQuickSubstitutionSession(snapshot);
  if (initialized.status !== "ready") return initialized;
  if (!isTouchlineQuickSubstitutionSessionState(persisted)
    || persisted.matchId !== snapshot.matchId
    || persisted.ownerId !== snapshot.ownerId
    || persisted.rosterRevision !== snapshot.rosterRevision) {
    return { status: "rejected", reason: "invalid_session_state" };
  }

  let replayed = initialized.state;
  for (const event of persisted.appliedEvents) {
    const result = applyTouchlineQuickSubstitutionSession(replayed, {
      commandId: event.commandId,
      commandHash: event.commandHash,
      expectedRevision: replayed.revision,
      outgoingPositionSlotId: event.outgoingPositionSlotId,
      incomingInventoryId: event.incomingInventoryId,
      occurredAt: event.occurredAt,
    });
    if (result.status !== "applied"
      || result.event.outgoingInventoryId !== event.outgoingInventoryId
      || result.event.resultingRevision !== event.resultingRevision) {
      return { status: "rejected", reason: "invalid_session_state" };
    }
    replayed = result.state;
  }

  return hasSameSessionState(replayed, persisted)
    ? { status: "ready", state: replayed }
    : { status: "rejected", reason: "invalid_session_state" };
}

/**
 * Applies one no-reentry substitution to the in-memory projection. The durable
 * protocol remains the authority for command validation and event idempotency;
 * this wrapper adds the fixed visual position-slot mapping.
 */
export function applyTouchlineQuickSubstitutionSession(
  state: TouchlineQuickSubstitutionSessionState,
  command: TouchlineQuickSubstitutionSessionCommand,
): TouchlineQuickSubstitutionSessionResult {
  if (!hasValidSessionState(state)) {
    return { status: "rejected", reason: "invalid_session_state" };
  }
  if (!hasValidCommandShape(command)) {
    return { status: "rejected", reason: "invalid_command" };
  }

  const outgoingSlot = state.activeSlots.find((slot) => slot.positionSlotId === command.outgoingPositionSlotId);
  if (!outgoingSlot) {
    return { status: "rejected", reason: "unknown_position_slot" };
  }

  const result = applyTouchlineDurableQuickSubstitution(state.durableState, {
    commandId: command.commandId,
    commandHash: command.commandHash,
    matchId: state.matchId,
    actorId: state.ownerId,
    expectedRosterRevision: state.rosterRevision,
    expectedRevision: command.expectedRevision,
    outgoingInventoryId: outgoingSlot.inventoryId,
    incomingInventoryId: command.incomingInventoryId,
    occurredAt: command.occurredAt,
  });

  if (result.status === "rejected") {
    return result;
  }

  if (result.status === "replayed") {
    const event = state.appliedEvents.find((candidate) => candidate.commandId === result.event.commandId);
    return event
      ? { status: "replayed", state, event }
      : { status: "rejected", reason: "invalid_session_state" };
  }

  const event = toSessionEvent(result.event, command.outgoingPositionSlotId);
  return {
    status: "applied",
    event,
    state: createSessionState(
      result.state,
      state.activeSlots.map((slot) => (
        slot.positionSlotId === command.outgoingPositionSlotId
          ? { ...slot, inventoryId: command.incomingInventoryId }
          : slot
      )),
      [...state.appliedEvents, event],
    ),
  };
}

export const TOUCHLINE_QUICK_SUBSTITUTION_SESSION_RULES = Object.freeze({
  startingXiSize: STARTING_XI_SIZE,
  matchdayBenchSize: MATCHDAY_BENCH_SIZE,
});
