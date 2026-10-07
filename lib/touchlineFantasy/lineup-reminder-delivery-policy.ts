import { evaluateNotificationQuietHours } from "../touchlineArena/notification-quiet-hours.ts";
import { evaluateLineupReminderReadiness } from "./lineup-reminder-readiness.ts";
import type { LineupReminderScope, LineupReminderSource } from "./lineup-reminder-source.ts";

export type LineupReminderKind = "missing_xi" | "complete_unconfirmed";
type Binding = LineupReminderScope & { deviceId: string };
export type LineupReminderDeliveryContext = {
  now: Date;
  leaseUntil: string;
  expiresAt: string;
  maximumAgeMs: number;
  queued: Binding & {
    kind: LineupReminderKind;
    generation: string | number | null;
    effectiveDeadlineMs: number;
    subscriptionFingerprint: string | null;
  };
  current: Binding & {
    checkedAtMs: number;
    generation: string | number | null;
    needsBaseline: boolean;
    suppressed: boolean;
    subscriptionFingerprint: string | null;
    permission: string;
    enrollmentConsentAt: string | null;
    explicitConsentAt: string | null;
    channels: { push?: unknown } | null;
    settings: { lineupReminders?: unknown; silentPush?: unknown } | null;
    frequency: string;
    quietHours: unknown;
  };
  source: LineupReminderSource | null;
};
export type LineupReminderDeliveryDecision = "ready" | "expired" | "source-unavailable"
  | "scope-changed" | "readiness-changed" | "deadline-changed" | "enrollment-changed"
  | "device-changed" | "opted-out" | "invalid-consent" | "quiet-hours";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^sha256:[a-f0-9]{64}$/;
const scopeKeys = ["userId", "gameweekId", "competitionId", "seasonId"] as const;
function sameId(a: unknown, b: unknown): boolean {
  return typeof a === "string" && typeof b === "string" && UUID.test(a) && UUID.test(b) && a.toLowerCase() === b.toLowerCase();
}
function generation(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value)
    && BigInt(value) <= BigInt("9223372036854775807") ? value : null;
}
function timestamp(value: unknown): number {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const instant = Date.parse(value), wall = Date.parse(`${value.slice(0, 19)}Z`);
  return Number.isFinite(instant) && Number.isFinite(wall)
    && new Date(wall).toISOString().slice(0, 19) === value.slice(0, 19) ? instant : NaN;
}
function fresh(checkedAtMs: unknown, nowMs: number, maximumAgeMs: number): boolean {
  return typeof checkedAtMs === "number" && Number.isSafeInteger(checkedAtMs)
    && checkedAtMs >= 0 && checkedAtMs <= nowMs && nowMs - checkedAtMs <= maximumAgeMs;
}

/** Synchronous policy, not evidence acquisition or send authority. A trusted
 * claimed-source reader must bind these rows to the owned claim, derive both
 * fingerprints from the actual private subscription JSON, and reread all facts
 * after reservation. No browser-supplied readiness/consent boolean is accepted.
 */
export function lineupReminderDeliveryDecision(context: LineupReminderDeliveryContext): LineupReminderDeliveryDecision {
  try {
    const nowMs = context.now.getTime(), lease = timestamp(context.leaseUntil), expiry = timestamp(context.expiresAt);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isFinite(lease) || !Number.isFinite(expiry)
      || lease <= nowMs || expiry <= nowMs || lease > expiry) return "expired";
    const { queued, current, source, maximumAgeMs } = context;
    if (!source || source.schemaVersion !== 1 || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0
      || !fresh(source.checkedAtMs, nowMs, maximumAgeMs) || source.checkedAtMs !== source.read?.checkedAtMs
      || !fresh(current.checkedAtMs, nowMs, maximumAgeMs)) return "source-unavailable";
    if (scopeKeys.some(key => !sameId(queued[key], current[key]) || !sameId(queued[key], source[key]))) return "scope-changed";
    if (!sameId(queued.deviceId, current.deviceId)) return "device-changed";
    if (!Number.isSafeInteger(queued.effectiveDeadlineMs) || queued.effectiveDeadlineMs <= nowMs
      || queued.effectiveDeadlineMs !== source.read.effectiveDeadlineMs || expiry !== queued.effectiveDeadlineMs) return "deadline-changed";
    const readiness = evaluateLineupReminderReadiness({ nowMs, maximumAgeMs, read: source.read });
    const kind = readiness === "INCOMPLETE" ? "missing_xi"
      : readiness === "COMPLETE_UNCONFIRMED" ? "complete_unconfirmed" : null;
    if (kind === null || queued.kind !== kind) return "readiness-changed";
    const queuedGeneration = generation(queued.generation);
    if (queuedGeneration === null || queuedGeneration !== generation(current.generation)
      || current.needsBaseline !== false || current.suppressed !== false) return "enrollment-changed";
    if (current.permission !== "granted" || typeof queued.subscriptionFingerprint !== "string"
      || !HASH.test(queued.subscriptionFingerprint)
      || current.subscriptionFingerprint !== queued.subscriptionFingerprint) return "device-changed";
    if (current.channels?.push !== true || current.settings?.lineupReminders !== true
      || current.frequency !== "realtime") return "opted-out";
    const consentAt = timestamp(current.explicitConsentAt);
    if (!Number.isFinite(consentAt) || consentAt > nowMs
      || current.enrollmentConsentAt !== current.explicitConsentAt) return "invalid-consent";
    const quiet = evaluateNotificationQuietHours(current.quietHours, context.now);
    return quiet === "invalid" ? "invalid-consent" : quiet === "quiet" ? "quiet-hours" : "ready";
  } catch {
    return "source-unavailable";
  }
}
