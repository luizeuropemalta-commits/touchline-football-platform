import {
  evaluateLineupReminderReadiness,
  type LineupReminderReadiness,
  type LineupReminderReadinessInput,
} from "./lineup-reminder-readiness.ts";

type CompleteRead = Extract<NonNullable<LineupReminderReadinessInput["read"]>, { status: "complete" }>;
export type LineupReminderScope = {
  userId: string;
  gameweekId: string;
  competitionId: string;
  seasonId: string;
};
export type LineupReminderSource = LineupReminderScope & {
  schemaVersion: 1;
  checkedAtMs: number;
  read: CompleteRead;
};
export type LineupReminderRpcPort = {
  rpc(name: "touchline_fantasy_read_lineup_reminder", args: {
    p_user_id: string;
    p_gameweek_id: string;
  }): PromiseLike<{ data: unknown; error: unknown }>;
};
export type LineupReminderSourceResult =
  | { status: "UNAVAILABLE"; source: null }
  | { status: Exclude<LineupReminderReadiness, "UNAVAILABLE">; source: LineupReminderSource };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLOT = /^[A-Za-z0-9_-]{1,64}$/;
const COACH = /^[0-9]{1,16}$/;
const scopeKeys = ["userId", "gameweekId", "competitionId", "seasonId"] as const;
const unavailable = (): LineupReminderSourceResult => ({ status: "UNAVAILABLE", source: null });
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function instant(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Parse the entire transport shape, including closed rounds. Never filter bad
 * selections into a smaller (apparently incomplete) team. Return a detached DTO.
 */
function parseSource(value: unknown, scope: LineupReminderScope): LineupReminderSource | null {
  if (!record(value) || value.schemaVersion !== 1 || !instant(value.checkedAtMs)) return null;
  for (const key of scopeKeys) {
    if (!uuid(value[key]) || value[key].toLowerCase() !== scope[key].toLowerCase()) return null;
  }
  const read = value.read;
  if (!record(read) || read.status !== "complete" || read.checkedAtMs !== value.checkedAtMs
    || typeof read.marketEditable !== "boolean" || !instant(read.effectiveDeadlineMs)) return null;
  const formation = read.formation;
  if (!record(formation) || formation.published !== true || typeof formation.code !== "string"
    || !formation.code.trim() || formation.code.length > 64 || !Array.isArray(formation.slotIds)
    || formation.slotIds.length !== 11 || !Array.isArray(read.selections) || read.selections.length > 11) return null;
  const slotIds: string[] = [];
  for (const slot of formation.slotIds) {
    if (typeof slot !== "string" || !SLOT.test(slot) || slotIds.includes(slot)) return null;
    slotIds.push(slot);
  }
  const selections: CompleteRead["selections"] = [];
  const players = new Set<string>(), slots = new Set<string>();
  for (const selection of read.selections) {
    if (!record(selection) || !uuid(selection.playerId) || typeof selection.slotId !== "string"
      || !slotIds.includes(selection.slotId) || players.has(selection.playerId.toLowerCase())
      || slots.has(selection.slotId)) return null;
    players.add(selection.playerId.toLowerCase()); slots.add(selection.slotId);
    selections.push({ playerId: selection.playerId, slotId: selection.slotId });
  }
  let userGameweek: CompleteRead["userGameweek"] = null;
  const user = read.userGameweek;
  if (user !== null) {
    if (!record(user) || (user.state !== "DRAFT" && user.state !== "CONFIRMED"
      && user.state !== "LOCKED" && user.state !== "FINAL") || user.formationCode !== formation.code
      || (user.selectedCoachId !== null && (typeof user.selectedCoachId !== "string" || !COACH.test(user.selectedCoachId)))) return null;
    userGameweek = { state: user.state, formationCode: formation.code, selectedCoachId: user.selectedCoachId };
  } else if (selections.length !== 0) return null;
  return {
    schemaVersion: 1, userId: value.userId as string, gameweekId: value.gameweekId as string,
    competitionId: value.competitionId as string, seasonId: value.seasonId as string,
    checkedAtMs: value.checkedAtMs,
    read: { status: "complete", checkedAtMs: value.checkedAtMs, marketEditable: read.marketEditable,
      effectiveDeadlineMs: read.effectiveDeadlineMs,
      formation: { published: true, code: formation.code, slotIds }, userGameweek, selections },
  };
}

/** Internal read-only adapter. The server supplies the trusted RPC port; this is
 * neither browser authorization nor permission to queue/send a notification.
 * Freshness is checked at completion, not against a pre-request clock sample.
 */
export async function readLineupReminderSource(
  port: LineupReminderRpcPort,
  input: LineupReminderScope & { maximumAgeMs: number },
  now: () => number = Date.now,
): Promise<LineupReminderSourceResult> {
  try {
    const scope = { userId: input.userId, gameweekId: input.gameweekId,
      competitionId: input.competitionId, seasonId: input.seasonId };
    const maximumAgeMs = input.maximumAgeMs;
    const startedAtMs = now();
    if (!scopeKeys.every(key => uuid(scope[key])) || !instant(startedAtMs)
      || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0) return unavailable();
    const response = await port.rpc("touchline_fantasy_read_lineup_reminder", {
      p_user_id: scope.userId, p_gameweek_id: scope.gameweekId,
    });
    const completedAtMs = now();
    if (!response || response.error || !instant(completedAtMs) || completedAtMs < startedAtMs) return unavailable();
    const source = parseSource(response.data, scope);
    if (!source) return unavailable();
    const status = evaluateLineupReminderReadiness({ nowMs: completedAtMs, maximumAgeMs, read: source.read });
    return status === "UNAVAILABLE" ? unavailable() : { status, source };
  } catch {
    // Transport, decoding and clock errors never establish an empty team.
    return unavailable();
  }
}
