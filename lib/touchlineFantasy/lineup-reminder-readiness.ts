export type LineupReminderReadiness = "INCOMPLETE" | "COMPLETE_UNCONFIRMED" | "CONFIRMED" | "CLOSED" | "UNAVAILABLE";

export type LineupReminderReadinessInput = {
  nowMs: number;
  maximumAgeMs: number;
  read: null | { status: "unavailable" } | {
    /** Set only by a trusted complete, scope-consistent reader, never a browser projection. */
    status: "complete";
    checkedAtMs: number;
    marketEditable: boolean;
    effectiveDeadlineMs: number;
    formation: { published: boolean; code: string; slotIds: string[] };
    userGameweek: null | {
      state: "DRAFT" | "CONFIRMED" | "LOCKED" | "FINAL";
      formationCode: string;
      selectedCoachId: string | null;
    };
    selections: { playerId: string; slotId: string }[];
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLOT = /^[A-Za-z0-9_-]{1,64}$/;
// Match the persisted selected_coach_id contract; never classify an ID that
// the lineup transaction cannot store as a complete team.
const COACH = /^[0-9]{1,16}$/;

/** Pure structural classification, not player eligibility, budget validation,
 * notification admission or consent. The save-lineup authority remains separate.
 * A missing projection must never be converted to a complete empty read.
 * Future/stale/incomplete evidence suppresses reminders, including closed states.
 */
export function evaluateLineupReminderReadiness(input: LineupReminderReadinessInput | null): LineupReminderReadiness {
  if (!input || !Number.isSafeInteger(input.nowMs) || input.nowMs < 0
    || !Number.isSafeInteger(input.maximumAgeMs) || input.maximumAgeMs <= 0) return "UNAVAILABLE";
  const read = input.read;
  if (!read || read.status !== "complete" || !Number.isSafeInteger(read.checkedAtMs)
    || read.checkedAtMs < 0 || read.checkedAtMs > input.nowMs
    || input.nowMs - read.checkedAtMs > input.maximumAgeMs
    || typeof read.marketEditable !== "boolean"
    || !Number.isSafeInteger(read.effectiveDeadlineMs) || read.effectiveDeadlineMs < 0) return "UNAVAILABLE";
  const user = read.userGameweek;
  if (user !== null && (!user || !["DRAFT", "CONFIRMED", "LOCKED", "FINAL"].includes(user.state))) return "UNAVAILABLE";
  // A known closed authority cannot produce a reminder, regardless of old roster geometry.
  if (!read.marketEditable || input.nowMs >= read.effectiveDeadlineMs
    || user?.state === "LOCKED" || user?.state === "FINAL") return "CLOSED";
  const formation = read.formation;
  if (!formation || formation.published !== true || typeof formation.code !== "string"
    || !formation.code.trim() || formation.code.length > 64 || !Array.isArray(formation.slotIds)
    || formation.slotIds.length !== 11 || formation.slotIds.some(id => typeof id !== "string" || !SLOT.test(id))
    || new Set(formation.slotIds).size !== 11 || !Array.isArray(read.selections)
    || read.selections.length > 11) return "UNAVAILABLE";
  const players = new Set<string>(), selectedSlots = new Set<string>();
  for (const selection of read.selections) {
    if (!selection || typeof selection.playerId !== "string" || !UUID.test(selection.playerId)
      || typeof selection.slotId !== "string" || !formation.slotIds.includes(selection.slotId)
      || players.has(selection.playerId.toLowerCase()) || selectedSlots.has(selection.slotId)) return "UNAVAILABLE";
    players.add(selection.playerId.toLowerCase()); selectedSlots.add(selection.slotId);
  }
  if (user === null) return read.selections.length === 0 ? "INCOMPLETE" : "UNAVAILABLE";
  if (user.formationCode !== formation.code || (user.selectedCoachId !== null
    && (typeof user.selectedCoachId !== "string" || !COACH.test(user.selectedCoachId)))) return "UNAVAILABLE";
  const complete = read.selections.length === 11 && user.selectedCoachId !== null;
  if (user.state === "CONFIRMED") return complete ? "CONFIRMED" : "UNAVAILABLE";
  return complete ? "COMPLETE_UNCONFIRMED" : "INCOMPLETE";
}
