import "server-only";
import { isDeepStrictEqual } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTouchlineNotificationCopy } from "../touchlineArena/notification-i18n.ts";
import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { parseTouchlineDeviceRegistration } from "../touchlineArena/push-device-contract.ts";
import { touchlinePushSubscriptionFingerprint } from "../touchlineArena/push-subscription-fingerprint.ts";
import { readLineupReminderSourceServer } from "./lineup-reminder-source-server.ts";
import { lineupReminderDeliveryDecision, type LineupReminderDeliveryContext } from "./lineup-reminder-delivery-policy.ts";

type Claim = { id: string; leaseToken: string; leaseUntil: string; expiresAt: string };
type Options = { maximumAgeMs: number; now: () => Date; signal: AbortSignal };
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function record(value: unknown): value is Row { return value !== null && typeof value === "object" && !Array.isArray(value); }
function generation(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value)
    && BigInt(value) <= BigInt("9223372036854775807") ? value : null;
}

/** Read-only internal evidence. Sequential rereads reduce, but do not eliminate,
 * the final-read-to-send race. Caller must reserve its own nonce and re-run this
 * reader afterwards; this function does not prove attempt ownership or send.
 */
export async function readClaimedLineupReminderSource(claim: Claim, options: Options) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detach: (() => void) | undefined;
  let activeController: AbortController | undefined;
  try {
    const owned = { ...claim }, maximumAgeMs = options.maximumAgeMs, now = options.now, signal = options.signal;
    const startMs = now().getTime(), lease = Date.parse(owned.leaseUntil), expiry = Date.parse(owned.expiresAt);
    if (!uuid(owned.id) || !uuid(owned.leaseToken) || signal.aborted
      || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0
      || !Number.isSafeInteger(startMs) || startMs < 0 || !Number.isFinite(lease) || !Number.isFinite(expiry)
      || lease <= startMs || expiry <= startMs || lease > expiry) return null;
    const controller = new AbortController(), started = performance.now();
    activeController = controller;
    const budget = Math.min(5_000, lease - startMs, expiry - startMs);
    const alive = () => {
      const at = now().getTime(), elapsed = performance.now() - started;
      return !controller.signal.aborted && !signal.aborted && Number.isSafeInteger(at) && at >= startMs
        && at < lease && at < expiry && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < budget;
    };
    const deadline = new Promise<null>(resolve => {
      const stop = () => { resolve(null); controller.abort(); };
      timer = setTimeout(stop, budget);
      signal.addEventListener("abort", stop, { once: true });
      detach = () => signal.removeEventListener("abort", stop);
    });
    const work = async () => {
      const admin = createAdminClient();
      if (!admin || !alive()) return null;
      const one = async (table: string, columns: string, filters: Record<string, string>): Promise<Row | null> => {
        if (!alive()) return null;
        let query = admin.from(table).select(columns);
        for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
        const response = await query.abortSignal(controller.signal).maybeSingle();
        return alive() && !response.error && record(response.data) ? structuredClone(response.data) : null;
      };
      const queueRead = () => one("touchline_game_notification_deliveries",
        "id,identity_id,device_id,generation,subscription,created_at,expires_at,state,lease_token,lease_expires_at,attempt_id,attempt_started_at",
        { id: owned.id, lease_token: owned.leaseToken, state: "queued" });
      const queue = await queueRead();
      if (!queue || queue.id !== owned.id || queue.lease_token !== owned.leaseToken || queue.state !== "queued"
        || !uuid(queue.identity_id) || !uuid(queue.device_id) || generation(queue.generation) === null
        || typeof queue.lease_expires_at !== "string" || Date.parse(queue.lease_expires_at) !== lease
        || typeof queue.expires_at !== "string" || Date.parse(queue.expires_at) !== expiry
        || typeof queue.created_at !== "string" || !Number.isFinite(Date.parse(queue.created_at))
        || Date.parse(queue.created_at) > startMs || Date.parse(queue.created_at) >= expiry) return null;
      // Both pre-reservation and post-reservation reads are legitimate. A nonce
      // may be present, but malformed/partially written attempt metadata is not.
      if (queue.attempt_id === null ? queue.attempt_started_at !== null
        : !uuid(queue.attempt_id) || typeof queue.attempt_started_at !== "string"
          || !Number.isFinite(Date.parse(queue.attempt_started_at))
          || Date.parse(queue.attempt_started_at) < Date.parse(queue.created_at)
          || Date.parse(queue.attempt_started_at) > now().getTime()
          || Date.parse(queue.attempt_started_at) >= expiry) return null;
      const identityRead = () => one("touchline_game_notification_identities", "id,user_id,gameweek_id,kind", { id: queue.identity_id as string });
      const identity = await identityRead();
      if (!identity || identity.id !== queue.identity_id || !uuid(identity.user_id) || !uuid(identity.gameweek_id)
        || (identity.kind !== "missing_xi" && identity.kind !== "complete_unconfirmed")) return null;
      const gameweekRead = () => one("touchline_fantasy_gameweeks", "id,competition_id,season_id", { id: identity.gameweek_id as string });
      const gameweek = await gameweekRead();
      if (!gameweek || gameweek.id !== identity.gameweek_id || !uuid(gameweek.competition_id) || !uuid(gameweek.season_id)) return null;
      const scope = { userId: identity.user_id, gameweekId: identity.gameweek_id,
        competitionId: gameweek.competition_id, seasonId: gameweek.season_id };
      const deviceId = queue.device_id;
      const parentsRead = () => Promise.all([
        one("touchline_game_notification_enrollments", "user_id,device_id,gameweek_id,generation,needs_baseline,suppressed,deadline,subscription,consent_at",
          { user_id: scope.userId, device_id: deviceId, gameweek_id: scope.gameweekId }),
        one("notification_devices", "id,user_id,installation_id,permission,push_subscription", { id: deviceId, user_id: scope.userId }),
        one("notification_preferences", "user_id,channels,settings,frequency,explicit_consent_at,quiet_hours,game_locale", { user_id: scope.userId }),
      ]);
      const before = await parentsRead();
      if (!alive() || before.some(row => row === null)) return null;
      const source = await readLineupReminderSourceServer({ ...scope, maximumAgeMs });
      if (!alive() || source.status === "UNAVAILABLE" || !source.source) return null;
      const checkedAtMs = now().getTime();
      const [finalQueue, finalIdentity, finalGameweek, after] = await Promise.all([queueRead(), identityRead(), gameweekRead(), parentsRead()]);
      if (!alive() || !finalQueue || !finalIdentity || !finalGameweek || after.some(row => row === null)
        || !isDeepStrictEqual(queue, finalQueue) || !isDeepStrictEqual(identity, finalIdentity)
        || !isDeepStrictEqual(gameweek, finalGameweek) || !isDeepStrictEqual(before, after)) return null;
      const [enrollment, device, preferences] = after as [Row, Row, Row];
      if (!getTouchlineNotificationCopy(preferences.game_locale)) return null;
      if (enrollment.user_id !== scope.userId || enrollment.device_id !== deviceId || enrollment.gameweek_id !== scope.gameweekId
        || device.id !== deviceId || device.user_id !== scope.userId || preferences.user_id !== scope.userId
        || enrollment.needs_baseline !== false || enrollment.suppressed !== false
        || typeof enrollment.deadline !== "string" || Date.parse(enrollment.deadline) !== expiry
        || typeof enrollment.consent_at !== "string" || typeof preferences.explicit_consent_at !== "string"
        || typeof preferences.frequency !== "string" || !record(preferences.channels) || !record(preferences.settings)
        || !isDeepStrictEqual(enrollment.subscription, queue.subscription)
        || !isDeepStrictEqual(device.push_subscription, queue.subscription)) return null;
      const registration = parseTouchlineDeviceRegistration({ installationId: device.installation_id,
        permission: device.permission, subscription: device.push_subscription });
      const queuedRegistration = parseTouchlineDeviceRegistration({ installationId: device.installation_id,
        permission: "granted", subscription: queue.subscription });
      const queuedSubscriptionFingerprint = touchlinePushSubscriptionFingerprint(queuedRegistration);
      const currentFingerprint = touchlinePushSubscriptionFingerprint(registration);
      if (!registration?.subscription || !queuedSubscriptionFingerprint || !currentFingerprint) return null;
      const policy: Omit<LineupReminderDeliveryContext, "now" | "leaseUntil" | "expiresAt"> = {
        maximumAgeMs, source: source.source,
        queued: { ...scope, deviceId, kind: identity.kind, generation: generation(queue.generation),
          effectiveDeadlineMs: expiry, subscriptionFingerprint: queuedSubscriptionFingerprint },
        current: { ...scope, deviceId, checkedAtMs, generation: generation(enrollment.generation),
          needsBaseline: enrollment.needs_baseline, suppressed: enrollment.suppressed,
          subscriptionFingerprint: currentFingerprint, permission: registration.permission,
          enrollmentConsentAt: enrollment.consent_at, explicitConsentAt: preferences.explicit_consent_at,
          channels: preferences.channels, settings: preferences.settings, frequency: preferences.frequency, quietHours: preferences.quiet_hours },
      };
      if (!alive() || lineupReminderDeliveryDecision({ ...policy, now: now(), leaseUntil: owned.leaseUntil, expiresAt: owned.expiresAt }) !== "ready") return null;
      return { policy, registration, source: source.source, locale: preferences.game_locale as TouchLineLocale,
        identityId: identity.id as string, deviceId, queuedSubscriptionFingerprint };
    };
    return await Promise.race([work(), deadline]);
  } catch {
    activeController?.abort();
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    detach?.();
  }
}
