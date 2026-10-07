import { evaluateNotificationQuietHours } from "./notification-quiet-hours.ts";
import { touchlinePushSubscriptionFingerprint } from "./push-subscription-fingerprint.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^sha256:[a-f0-9]{64}$/;
type FinalBinding = Readonly<{ kind: string; fixtureId: string; factsFingerprint: string;
  sourceRevisionChecksum: string; clockRevision: number; validUntil: string }>;
export type FixtureFinalPushDeliveryContext = Readonly<{
  enabled: boolean; now: Date; leaseUntil: string; expiresAt: string;
  queued: Readonly<{ userId: string; installationId: string; deviceGeneration: number; subscriptionFingerprint: string | null; source: FinalBinding }>;
  current: Readonly<{ userId: string; installationId: string; deviceGeneration: number; registration: unknown; source: FinalBinding;
    fixtureOptedIn: boolean; channels: { push?: unknown } | null;
    settings: { selectedLiveMatches?: unknown; pushSilent?: unknown } | null;
    frequency: string; explicitConsentAt: string | null; quietHours: unknown }>;
}>;
type Decision = "disabled" | "expired" | "source-changed" | "opted-out" | "device-changed" | "invalid-consent" | "quiet-hours" | "ready";

/** Pure policy over fresh server reads. Invoke again AFTER a confirmed attempt
 * reservation and immediately before transport; this module does neither.
 * Saving a preference is not technical consent, admission, or proof of delivery.
 * pushSilent is presentation only: it cannot renew consent or bypass quiet hours.
 */
export function fixtureFinalPushDeliveryDecision(context: FixtureFinalPushDeliveryContext): Decision {
  if (context?.enabled !== true) return "disabled";
  try {
    const now = context.now.getTime(), lease = Date.parse(context.leaseUntil), expiry = Date.parse(context.expiresAt);
    if (![now, lease, expiry].every(Number.isFinite) || lease <= now || expiry <= now) return "expired";
    const { queued, current } = context;
    const previous = queued.source, fresh = current.source;
    if (previous.kind !== "fixture-final" || fresh.kind !== "fixture-final" || !UUID.test(previous.fixtureId)
      || previous.fixtureId !== fresh.fixtureId || !SHA.test(previous.factsFingerprint) || previous.factsFingerprint !== fresh.factsFingerprint
      || !SHA.test(previous.sourceRevisionChecksum) || previous.sourceRevisionChecksum !== fresh.sourceRevisionChecksum
      || !Number.isSafeInteger(previous.clockRevision) || previous.clockRevision < 0
      || !Number.isSafeInteger(fresh.clockRevision) || fresh.clockRevision < previous.clockRevision) return "source-changed";
    if (![previous.validUntil, fresh.validUntil].every(value => Number.isFinite(Date.parse(value)) && Date.parse(value) > now)) return "expired";
    if (!UUID.test(queued.userId) || current.userId !== queued.userId || !UUID.test(queued.installationId)
      || current.installationId !== queued.installationId || !Number.isSafeInteger(queued.deviceGeneration)
      || queued.deviceGeneration < 1 || current.deviceGeneration !== queued.deviceGeneration
      || typeof queued.subscriptionFingerprint !== "string" || !SHA.test(queued.subscriptionFingerprint)
      || touchlinePushSubscriptionFingerprint(current.registration) !== queued.subscriptionFingerprint
      || !current.registration || typeof current.registration !== "object"
      || (current.registration as { installationId?: unknown }).installationId !== current.installationId) return "device-changed";
    if (current.fixtureOptedIn !== true || current.channels?.push !== true
      || current.settings?.selectedLiveMatches !== true || current.frequency !== "realtime") return "opted-out";
    const consent = typeof current.explicitConsentAt === "string" && current.explicitConsentAt.trim()
      ? Date.parse(current.explicitConsentAt) : NaN;
    if (!Number.isFinite(consent) || consent > now) return "invalid-consent";
    const quiet = evaluateNotificationQuietHours(current.quietHours, context.now);
    if (quiet === "invalid") return "invalid-consent";
    if (quiet === "quiet") return "quiet-hours";
    return "ready";
  } catch {
    return "invalid-consent";
  }
}
