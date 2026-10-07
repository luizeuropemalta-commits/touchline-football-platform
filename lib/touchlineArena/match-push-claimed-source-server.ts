import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readTouchlineConfirmedEventPushSource } from "./social-confirmed-event-draft-server";
import { matchPushSourceFreshness } from "./match-push-source-freshness";
import { readTouchlineSocialSourceRevisionCheckpoint } from "./social-source-revision-server";
import { parseTouchlineDeviceRegistration } from "./push-device-contract";
import { touchlinePushSubscriptionFingerprint } from "./push-subscription-fingerprint";
import { matchPushDeliveryDecision } from "./match-push-delivery-policy";
import { buildMatchEventNotification } from "./match-event-notification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[1-9][0-9]{0,19}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
type Claim = { id: string; leaseToken: string; leaseUntil: string; expiresAt: string };
function enrollmentGeneration(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value)
    && BigInt(value) <= BigInt("9223372036854775807") ? value : null;
}

/** Read-only internal adapter. No producer or delivery authority.
 * Resolves canonical UUID to provider identity, never from payload or names.
 * A caller must still recheck device/consent/revisions before transport.
 */
export async function readClaimedMatchPushSource(
  claim: Claim,
  options: { maximumAgeMs: unknown; now: () => Date; signal: AbortSignal; locale?: unknown },
) {
  const validTime = () => {
    const now = options.now().getTime();
    return Number.isFinite(now) && Date.parse(claim.leaseUntil) > now && Date.parse(claim.expiresAt) > now;
  };
  if (!UUID.test(claim.id) || !UUID.test(claim.leaseToken) || options.signal.aborted || !validTime()) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const readClaim = () => admin.from("touchline_match_push_outbox")
    .select("id,device_id,fixture_id,provider_event_id,source_checksum,subscription_fingerprint,enrollment_generation,delivery_kind,lease_until,expires_at")
    .eq("id", claim.id).eq("lease_token", claim.leaseToken).eq("state", "claimed")
    .abortSignal(options.signal).maybeSingle();
  const initial = await readClaim();
  const row = initial.data;
  if (initial.error || !row || !UUID.test(String(row.fixture_id)) || !UUID.test(String(row.device_id))
    || !PROVIDER_ID.test(String(row.provider_event_id)) || !HASH.test(String(row.source_checksum))
    || !HASH.test(String(row.subscription_fingerprint))
    || enrollmentGeneration(row.enrollment_generation) === null
    || (row.delivery_kind !== "initial" && row.delivery_kind !== "revision")
    || Date.parse(row.lease_until) !== Date.parse(claim.leaseUntil)
    || Date.parse(row.expires_at) !== Date.parse(claim.expiresAt)) return null;
  const readEnrollment = async () => {
    const enrollment = await admin.from("touchline_match_push_enrollments")
      .select("generation,needs_baseline,subscription_fingerprint")
      .eq("device_id", row.device_id).eq("fixture_id", row.fixture_id)
      .abortSignal(options.signal).maybeSingle();
    return !enrollment.error && enrollment.data?.needs_baseline === false
      && enrollmentGeneration(enrollment.data.generation) === enrollmentGeneration(row.enrollment_generation)
      && enrollment.data.subscription_fingerprint === row.subscription_fingerprint;
  };
  if (!await readEnrollment() || options.signal.aborted || !validTime()) return null;
  const fixture = await admin.from("football_fixtures").select("provider_fixture_id")
    .eq("id", row.fixture_id).eq("provider", "sportmonks").abortSignal(options.signal).maybeSingle();
  const providerId = String(fixture.data?.provider_fixture_id ?? "");
  if (fixture.error || !PROVIDER_ID.test(providerId) || options.signal.aborted || !validTime()) return null;
  // Shared reader does not yet propagate abort; reject its late result below.
  const source = await readTouchlineConfirmedEventPushSource(providerId, row.provider_event_id);
  if (!source.ok || options.signal.aborted || !validTime()
    || source.evidence.canonicalFixtureId.toLowerCase() !== row.fixture_id.toLowerCase()
    || source.evidence.fixtureProviderId !== providerId || source.evidence.eventProviderId !== row.provider_event_id
    || source.data.sourceChecksum !== row.source_checksum
    || !["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(source.data.contentType)
    || matchPushSourceFreshness(source.evidence, options.maximumAgeMs, options.now()) !== "current") return null;
  const device = await admin.from("notification_devices")
    .select("user_id,installation_id,permission,push_subscription").eq("id", row.device_id)
    .abortSignal(options.signal).maybeSingle();
  if (device.error || !device.data || !UUID.test(String(device.data.user_id))) return null;
  const registration = parseTouchlineDeviceRegistration({ installationId: device.data.installation_id,
    permission: device.data.permission, subscription: device.data.push_subscription });
  const currentBinding = touchlinePushSubscriptionFingerprint(registration);
  if (!registration?.subscription || currentBinding !== row.subscription_fingerprint) return null;
  const [preferences, interest] = await Promise.all([
    admin.from("notification_preferences").select("channels,settings,frequency,explicit_consent_at,quiet_hours,game_locale")
      .eq("user_id", device.data.user_id).abortSignal(options.signal).maybeSingle(),
    admin.from("touchline_fixture_alert_subscriptions").select("fixture_id")
      .eq("fixture_id", row.fixture_id).eq("user_id", device.data.user_id).abortSignal(options.signal).maybeSingle(),
  ]);
  if (preferences.error || interest.error || !preferences.data || !interest.data) return null;
  const policy = { sourceChecksum: row.source_checksum as string, currentSourceChecksum: source.data.sourceChecksum,
    sourceVerified: true, fixtureOptedIn: true, permission: registration.permission,
    subscriptionUnchanged: true, queuedSubscriptionFingerprint: row.subscription_fingerprint as string,
    currentSubscriptionFingerprint: currentBinding, channels: preferences.data.channels,
    settings: preferences.data.settings, frequency: preferences.data.frequency as string,
    explicitConsentAt: preferences.data.explicit_consent_at as string | null, quietHours: preferences.data.quiet_hours };
  // Detect revoked/replaced claims or changed queue facts during source I/O.
  const final = await readClaim();
  const finalRow = final.data;
  if (final.error || !finalRow || options.signal.aborted || !validTime()) return null;
  const fields = ["id", "device_id", "fixture_id", "provider_event_id", "source_checksum", "subscription_fingerprint", "enrollment_generation", "delivery_kind", "lease_until", "expires_at"] as const;
  if (fields.some(key => finalRow[key] !== row[key])) return null;
  const revision = await readTouchlineSocialSourceRevisionCheckpoint(Object.keys(source.data.sourceRevisionManifest));
  if (!revision || revision.clockRevision !== source.evidence.clockRevision
    || revision.checksum !== source.data.sourceRevisionChecksum
    || options.signal.aborted || !validTime()) return null;
  if (matchPushSourceFreshness(source.evidence, options.maximumAgeMs, options.now()) !== "current") return null;
  if (!await readEnrollment() || options.signal.aborted || !validTime()) return null;
  // Rebuild public copy from verified current facts, never the queued payload.
  // Only this owner-bound fresh snapshot chooses the language. The formatter
  // rejects missing/unknown values rather than falling back to queue metadata.
  const copy = buildMatchEventNotification(source, preferences.data.game_locale, row.delivery_kind === "revision");
  const payload = copy ? { ...copy, ...(preferences.data.settings?.silentPush === true ? { silent: true } : {}) } : null;
  if (!payload || Buffer.byteLength(JSON.stringify(payload), "utf8") > 3072) return null;
  if (matchPushDeliveryDecision({ ...policy, now: options.now(), leaseUntil: claim.leaseUntil, expiresAt: claim.expiresAt }) !== "ready") return null;
  return { source, registration, policy, payload, deviceId: row.device_id as string, queuedSubscriptionFingerprint: row.subscription_fingerprint as string };
}
