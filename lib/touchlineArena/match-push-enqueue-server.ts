import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readTouchlineConfirmedEventPushSource } from "./social-confirmed-event-draft-server";
import { readTouchlineSocialSourceRevisionCheckpoint } from "./social-source-revision-server";
import { matchPushSourceDeadline } from "./match-push-source-freshness";
import { parseTouchlineDeviceRegistration } from "./push-device-contract";
import { touchlinePushSubscriptionFingerprint } from "./push-subscription-fingerprint";
import { evaluateNotificationQuietHours } from "./notification-quiet-hours";
import { buildMatchEventNotification } from "./match-event-notification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[1-9][0-9]{0,19}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
type Outcome = { status: "not-enqueued" | "unknown" } | { status: "stored-or-existing"; id: string };
type Input = { deviceId: string; fixtureProviderId: string; eventProviderId: string };
type Options = { enabled: boolean; historyComplete: boolean; maximumAgeMs: unknown;
  expiresAt: string; locale: "pt-BR" | "en-GB"; now: () => Date; signal: AbortSignal };

/** One entry-based deadline, including readers that do not support cancellation.
 * Late work remains observed but cannot progress to RPC after internal abort.
 */
export async function enqueueVerifiedMatchPush(input: Input, options: Options): Promise<Outcome> {
  if (options.enabled !== true || options.signal.aborted) return { status: "not-enqueued" };
  const controller = new AbortController();
  const state = { attempted: false };
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return await new Promise<Outcome>(resolve => {
    const finish = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      options.signal.removeEventListener("abort", stop);
      resolve(outcome);
    };
    const stop = () => {
      // Commit terminal outcome before synchronous abort listeners can settle RPC.
      finish({ status: state.attempted ? "unknown" : "not-enqueued" });
      controller.abort();
    };
    options.signal.addEventListener("abort", stop, { once: true });
    timer = setTimeout(stop, 15_000);
    if (options.signal.aborted) { stop(); return; }
    void enqueueCore(input, { ...options, signal: controller.signal }, state).then(finish,
      () => finish({ status: state.attempted ? "unknown" : "not-enqueued" }));
  });
}

/** Internal opt-in producer, not a route, scheduler or sender. No default policy.
 * historyComplete is a TRUSTED SERVER attestation, never a request parameter or
 * inference from empty/purged history. False still allows SQL to find prior rows.
 * Reads and enqueue are not atomic: the claimed-source adapter must revalidate.
 * An uncertain RPC is never retried here, including an abort after transmission.
 */
async function enqueueCore(
  input: Input,
  options: Options,
  state: { attempted: boolean },
): Promise<Outcome> {
  try {
    if (options.enabled !== true || options.signal.aborted || !UUID.test(input.deviceId)
      || !PROVIDER_ID.test(input.fixtureProviderId) || !PROVIDER_ID.test(input.eventProviderId)
      || !["pt-BR", "en-GB"].includes(options.locale)) return { status: "not-enqueued" };
    const admin = createAdminClient();
    if (!admin) return { status: "not-enqueued" };
    const source = await readTouchlineConfirmedEventPushSource(input.fixtureProviderId, input.eventProviderId);
    if (!source.ok || options.signal.aborted || !UUID.test(source.evidence.canonicalFixtureId)
      || source.evidence.fixtureProviderId !== input.fixtureProviderId
      || source.evidence.eventProviderId !== input.eventProviderId || !HASH.test(source.data.sourceChecksum)
      || !["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(source.data.contentType)
      || !matchPushSourceDeadline(source.evidence, options.maximumAgeMs, options.expiresAt, options.now())) return { status: "not-enqueued" };
    // Validate renderability but do not persist provisional initial/revision copy.
    // The consumer rebuilds using the kind authoritatively assigned by SQL.
    // update:false is one JSON byte larger; initial must also be renderable.
    const copy = buildMatchEventNotification(source, options.locale, false);
    if (!copy || Buffer.byteLength(JSON.stringify(copy), "utf8") > 3072) return { status: "not-enqueued" };
    const device = await admin.from("notification_devices")
      .select("user_id,installation_id,permission,push_subscription").eq("id", input.deviceId)
      .abortSignal(options.signal).maybeSingle();
    if (options.signal.aborted || device.error || !device.data || !UUID.test(String(device.data.user_id))) return { status: "not-enqueued" };
    const registration = parseTouchlineDeviceRegistration({ installationId: device.data.installation_id,
      permission: device.data.permission, subscription: device.data.push_subscription });
    const binding = touchlinePushSubscriptionFingerprint(registration);
    if (!binding) return { status: "not-enqueued" };
    const [preferences, interest] = await Promise.all([
      admin.from("notification_preferences").select("channels,settings,frequency,explicit_consent_at,quiet_hours")
        .eq("user_id", device.data.user_id).abortSignal(options.signal).maybeSingle(),
      admin.from("touchline_fixture_alert_subscriptions").select("fixture_id")
        .eq("fixture_id", source.evidence.canonicalFixtureId).eq("user_id", device.data.user_id)
        .abortSignal(options.signal).maybeSingle(),
    ]);
    if (options.signal.aborted || preferences.error || interest.error || !preferences.data || !interest.data) return { status: "not-enqueued" };
    const pref = preferences.data;
    if (pref.channels?.push !== true || pref.settings?.goalsAndEvents !== true || pref.frequency !== "realtime") return { status: "not-enqueued" };
    const revision = await readTouchlineSocialSourceRevisionCheckpoint(Object.keys(source.data.sourceRevisionManifest));
    if (!revision || revision.clockRevision !== source.evidence.clockRevision
      || revision.checksum !== source.data.sourceRevisionChecksum || options.signal.aborted) return { status: "not-enqueued" };
    const instant = options.now();
    const expiry = matchPushSourceDeadline(source.evidence, options.maximumAgeMs, options.expiresAt, instant);
    const consent = typeof pref.explicit_consent_at === "string" ? Date.parse(pref.explicit_consent_at) : NaN;
    const quiet = evaluateNotificationQuietHours(pref.quiet_hours, instant);
    if (!expiry || !Number.isFinite(consent) || consent > instant.getTime()
      || (quiet !== "disabled" && quiet !== "outside")) return { status: "not-enqueued" };
    if (options.signal.aborted) return { status: "not-enqueued" };
    state.attempted = true;
    const result = await admin.rpc("touchline_enqueue_match_push", {
      p_device_id: input.deviceId, p_fixture_id: source.evidence.canonicalFixtureId,
      p_event_id: input.eventProviderId, p_checksum: source.data.sourceChecksum,
      p_snapshot_at: source.data.sourceSnapshotAt, p_payload: { schemaVersion: 1, locale: options.locale },
      p_expires_at: expiry, p_fingerprint: binding, p_history_complete: options.historyComplete === true,
    }).abortSignal(options.signal);
    if (result.error || typeof result.data !== "string" || !UUID.test(result.data)) return { status: "unknown" };
    // A valid receipt confirms identity only; it may refer to an older expired,
    // cancelled or differently-bound record. Never advertise renewed eligibility.
    return { status: "stored-or-existing", id: result.data };
  } catch {
    return { status: state.attempted ? "unknown" : "not-enqueued" };
  }
}
