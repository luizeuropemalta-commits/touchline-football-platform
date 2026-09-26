import { evaluateNotificationQuietHours } from "./notification-quiet-hours.ts";

export type MatchPushDeliveryContext = {
  now: Date;
  leaseUntil: string;
  expiresAt: string;
  sourceChecksum: string;
  currentSourceChecksum: string;
  sourceVerified: boolean;
  fixtureOptedIn: boolean;
  permission: string;
  subscriptionUnchanged: boolean;
  queuedSubscriptionFingerprint: string | null;
  currentSubscriptionFingerprint: string | null;
  channels: { push?: unknown } | null;
  settings: { goalsAndEvents?: unknown } | null;
  frequency: string;
  explicitConsentAt: string | null;
  quietHours: unknown;
};

/** Final synchronous policy check over freshly read server facts. Not transport,
 * endpoint validation, or proof that client-supplied claims are trustworthy.
 * The worker must supply current facts, not those saved with the queued payload.
 */
export function matchPushDeliveryDecision(context: MatchPushDeliveryContext):
  "ready" | "expired" | "source-changed" | "opted-out" | "device-changed" | "invalid-consent" | "quiet-hours" {
  const now = context.now.getTime();
  const lease = Date.parse(context.leaseUntil);
  const expiry = Date.parse(context.expiresAt);
  if (![now, lease, expiry].every(Number.isFinite) || lease <= now || expiry <= now) return "expired";
  if (context.sourceVerified !== true || !/^sha256:[a-f0-9]{64}$/.test(context.sourceChecksum)
    || context.currentSourceChecksum !== context.sourceChecksum) return "source-changed";
  if (context.fixtureOptedIn !== true || context.channels?.push !== true
    || context.settings?.goalsAndEvents !== true || context.frequency !== "realtime") return "opted-out";
  // A stable device ID or caller boolean cannot prove that its subscription
  // still matches the one admitted to the queue. Missing legacy binding closes.
  if (context.permission !== "granted" || context.subscriptionUnchanged !== true
    || typeof context.queuedSubscriptionFingerprint !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(context.queuedSubscriptionFingerprint)
    || context.currentSubscriptionFingerprint !== context.queuedSubscriptionFingerprint) return "device-changed";
  const consent = context.explicitConsentAt ? Date.parse(context.explicitConsentAt) : NaN;
  if (!Number.isFinite(consent) || consent > now) return "invalid-consent";
  const quiet = evaluateNotificationQuietHours(context.quietHours, context.now);
  if (quiet === "invalid") return "invalid-consent";
  if (quiet === "quiet") return "quiet-hours";
  return "ready";
}
