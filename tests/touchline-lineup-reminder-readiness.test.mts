import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLineupReminderReadiness, type LineupReminderReadinessInput } from "../lib/touchlineFantasy/lineup-reminder-readiness.ts";

const slots = Array.from({ length: 11 }, (_, i) => `slot-${i}`);
function input(): LineupReminderReadinessInput {
  return { nowMs: 10_000, maximumAgeMs: 1_000, read: {
    status: "complete", checkedAtMs: 9_500, marketEditable: true, effectiveDeadlineMs: 20_000,
    formation: { published: true, code: "4-3-3", slotIds: slots },
    userGameweek: { state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "307" },
    selections: slots.map((slotId, i) => ({ slotId, playerId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })),
  } };
}
function completeInput() { const value = input(); assert.equal(value.read?.status, "complete"); return value as LineupReminderReadinessInput & { read: Extract<NonNullable<LineupReminderReadinessInput["read"]>, { status: "complete" }> }; }
test("zero/ten/eleven players distinguish incomplete and structurally complete draft", () => {
  for (const count of [0, 10, 11]) { const value = completeInput(); value.read.selections = value.read.selections.slice(0, count); assert.equal(evaluateLineupReminderReadiness(value), count === 11 ? "COMPLETE_UNCONFIRMED" : "INCOMPLETE"); }
});
test("confirmed requires structurally complete trusted data", () => {
  const value = completeInput(); value.read.userGameweek!.state = "CONFIRMED";
  assert.equal(evaluateLineupReminderReadiness(value), "CONFIRMED");
  value.read.selections = value.read.selections.slice(0, 10);
  assert.equal(evaluateLineupReminderReadiness(value), "UNAVAILABLE");
});
test("missing coach is incomplete, malformed coach is unavailable", () => {
  const value = completeInput(); value.read.userGameweek!.selectedCoachId = null;
  assert.equal(evaluateLineupReminderReadiness(value), "INCOMPLETE");
  value.read.userGameweek!.selectedCoachId = "bad";
  assert.equal(evaluateLineupReminderReadiness(value), "UNAVAILABLE");
});
test("coach identifiers use the same sixteen-digit limit as lineup persistence", () => {
  for (const coachId of ["12345678901234567", "12345678901234567890"]) {
    const value = completeInput(); value.read.userGameweek!.selectedCoachId = coachId;
    assert.equal(evaluateLineupReminderReadiness(value), "UNAVAILABLE");
  }
  const value = completeInput(); value.read.userGameweek!.selectedCoachId = "1234567890123456";
  assert.equal(evaluateLineupReminderReadiness(value), "COMPLETE_UNCONFIRMED");
});
test("null user only establishes missing team with a complete read and no orphan selections", () => {
  const value = completeInput(); value.read.userGameweek = null;
  assert.equal(evaluateLineupReminderReadiness(value), "UNAVAILABLE");
  value.read.selections = [];
  assert.equal(evaluateLineupReminderReadiness(value), "INCOMPLETE");
});
test("invalid/duplicate players and slots never become reminders", () => {
  for (const change of [
    (v: ReturnType<typeof completeInput>) => { v.read.selections[0].playerId = "not-uuid"; },
    (v: ReturnType<typeof completeInput>) => { v.read.selections[1].playerId = v.read.selections[0].playerId; },
    (v: ReturnType<typeof completeInput>) => { v.read.selections[1].slotId = v.read.selections[0].slotId; },
    (v: ReturnType<typeof completeInput>) => { v.read.selections[0].slotId = "unknown"; },
    (v: ReturnType<typeof completeInput>) => { v.read.formation.slotIds = [...slots.slice(0, 10), slots[0]]; },
    (v: ReturnType<typeof completeInput>) => { v.read.formation.slotIds = slots.slice(0, 10); },
    (v: ReturnType<typeof completeInput>) => { v.read.formation.published = false; },
    (v: ReturnType<typeof completeInput>) => { v.read.userGameweek!.formationCode = "4-4-2"; },
  ]) { const value = completeInput(); change(value); assert.equal(evaluateLineupReminderReadiness(value), "UNAVAILABLE"); }
});
test("error/null/partial reads fail closed instead of meaning zero selections", () => {
  for (const read of [null, { status: "unavailable" as const }, { ...completeInput().read, status: "partial" }]) {
    assert.equal(evaluateLineupReminderReadiness({ ...input(), read } as LineupReminderReadinessInput), "UNAVAILABLE");
  }
});
test("freshness and explicit maximum age boundaries", () => {
  for (const checkedAtMs of [NaN, 10_001, 8_999]) { const value = completeInput(); value.read.checkedAtMs = checkedAtMs; assert.equal(evaluateLineupReminderReadiness(value), "UNAVAILABLE"); }
  const value = completeInput(); value.read.checkedAtMs = 9_000;
  assert.equal(evaluateLineupReminderReadiness(value), "COMPLETE_UNCONFIRMED");
  for (const maximumAgeMs of [0, -1, NaN, Infinity]) assert.equal(evaluateLineupReminderReadiness({ ...value, maximumAgeMs }), "UNAVAILABLE");
  assert.equal(evaluateLineupReminderReadiness({ ...value, nowMs: NaN }), "UNAVAILABLE");
});
test("deadline equality, noneditable market and locked/final records close the reminder", () => {
  const value = completeInput(); value.nowMs = value.read.effectiveDeadlineMs; value.read.checkedAtMs = value.nowMs;
  assert.equal(evaluateLineupReminderReadiness(value), "CLOSED");
  for (const state of ["LOCKED", "FINAL"] as const) { const v = completeInput(); v.read.userGameweek!.state = state; assert.equal(evaluateLineupReminderReadiness(v), "CLOSED"); }
  const v = completeInput(); v.read.marketEditable = false; assert.equal(evaluateLineupReminderReadiness(v), "CLOSED");
  v.read.effectiveDeadlineMs = NaN; assert.equal(evaluateLineupReminderReadiness(v), "UNAVAILABLE");
});
