import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchGamePush } from "../touchlineArena/match-push-dispatch.ts";
import { parseMatchPushVapidConfig } from "../touchlineArena/match-push-vapid-config.ts";
import { isSupportedMatchPushEndpoint, sendMatchWebPush } from "../touchlineArena/match-push-transport.ts";
import { touchlinePushSubscriptionFingerprint } from "../touchlineArena/push-subscription-fingerprint.ts";
import { readClaimedLineupReminderSource } from "./lineup-reminder-claimed-source-server.ts";
import { lineupReminderDeliveryDecision, type LineupReminderDeliveryContext } from "./lineup-reminder-delivery-policy.ts";
import { buildLineupReminderNotification } from "./lineup-reminder-notification.ts";

type Claim = Parameters<typeof dispatchGamePush>[0];
// Legacy locale hints are ignored; the final account read owns language selection.
type Options = { enabled?: boolean; locale?: unknown; maximumAgeMs?: number; vapid?: unknown };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One bounded RPC receipt; unknown means unknown, never an implicit refusal.
 * No retries, and the completion uses its own signal after transport timeout.
 */
async function booleanRpc(name: "touchline_game_notification_reserve" | "touchline_game_notification_finish",
  args: Record<string, string | null>, parent?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detach: (() => void) | undefined;
  const started = performance.now();
  try {
    if (parent?.aborted) throw new Error();
    const deadline = new Promise<never>((_, reject) => {
      const stop = () => { reject(new Error("GAME_PUSH_RPC_UNCONFIRMED")); controller.abort(); };
      timer = setTimeout(stop, 5_000);
      parent?.addEventListener("abort", stop, { once: true });
      detach = () => parent?.removeEventListener("abort", stop);
    });
    const admin = createAdminClient();
    if (!admin) throw new Error();
    const response = await Promise.race([admin.rpc(name, args).abortSignal(controller.signal), deadline]);
    const elapsed = performance.now() - started;
    if (controller.signal.aborted || parent?.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 5_000
      || response.error || typeof response.data !== "boolean") throw new Error();
    return response.data;
  } catch {
    controller.abort();
    throw new Error("GAME_PUSH_RPC_UNCONFIRMED");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    detach?.();
  }
}

/** Dormant single already-claimed item. No environment lookup, claim discovery,
 * scheduler or activation. A provider acceptance is not proof of user delivery.
 */
export async function dispatchClaimedLineupReminder(claim: Claim, options: Options = {}) {
  if (options.enabled !== true) return "disabled" as const;
  const { maximumAgeMs } = options;
  const vapid = parseMatchPushVapidConfig(options.vapid);
  if (!vapid || typeof maximumAgeMs !== "number"
    || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0
    || !UUID.test(claim.id) || !UUID.test(claim.leaseToken)) return "unconfigured" as const;
  const now = () => new Date();
  return dispatchGamePush<Omit<LineupReminderDeliveryContext, "now" | "leaseUntil" | "expiresAt">>(claim, {
    enabled: true, now, attemptId: randomUUID(),
    decide: (policy, clock) => lineupReminderDeliveryDecision({ ...policy, ...clock }) === "ready" ? "ready" : "cancelled",
    reserve: (owned, attemptId, signal) => booleanRpc("touchline_game_notification_reserve", {
      p_id: owned.id, p_lease_token: owned.leaseToken, p_attempt_id: attemptId,
    }, signal),
    loadFresh: async (owned, signal) => {
      const fresh = await readClaimedLineupReminderSource(owned, { maximumAgeMs, now, signal });
      const subscription = fresh?.registration.subscription;
      if (signal.aborted || !fresh || !subscription || !isSupportedMatchPushEndpoint(subscription.endpoint)) throw new Error("GAME_PUSH_SOURCE_UNAVAILABLE");
      const copy = buildLineupReminderNotification({ identityId: fresh.identityId, kind: fresh.policy.queued.kind, locale: fresh.locale });
      const payload = copy ? JSON.stringify({ ...copy, ...(fresh.policy.current.settings?.silentPush === true ? { silent: true } : {}) }) : "";
      const sourceCutoff = fresh.source.checkedAtMs + maximumAgeMs;
      const bindingCutoff = fresh.policy.current.checkedAtMs + maximumAgeMs;
      const cutoff = Math.min(Date.parse(owned.leaseUntil), Date.parse(owned.expiresAt),
        fresh.source.read.effectiveDeadlineMs, sourceCutoff, bindingCutoff);
      const bindingMatches = () => touchlinePushSubscriptionFingerprint(fresh.registration) === fresh.queuedSubscriptionFingerprint
        && fresh.queuedSubscriptionFingerprint === fresh.policy.queued.subscriptionFingerprint;
      if (!payload || Buffer.byteLength(payload, "utf8") > 3072 || !Number.isSafeInteger(sourceCutoff)
        || !Number.isSafeInteger(bindingCutoff) || !Number.isSafeInteger(cutoff)
        || cutoff - now().getTime() < 1_000 || !bindingMatches()) throw new Error("GAME_PUSH_SOURCE_UNAVAILABLE");
      return { policy: fresh.policy, deliver: async (transportSignal: AbortSignal) => {
        const instant = now();
        if (transportSignal.aborted || cutoff - instant.getTime() < 1_000 || !bindingMatches()
          || lineupReminderDeliveryDecision({ ...fresh.policy, now: instant, leaseUntil: owned.leaseUntil, expiresAt: owned.expiresAt }) !== "ready") throw new Error("GAME_PUSH_DELIVERY_UNAVAILABLE");
        return sendMatchWebPush({ subscription, payload, vapid, expiresAt: new Date(cutoff), signal: transportSignal });
      } };
    },
    finish: async (owned, state, reference) => {
      if (reference.kind === "unreserved" && state !== "cancelled") return false;
      try {
        return await booleanRpc("touchline_game_notification_finish", {
          p_id: owned.id, p_lease_token: owned.leaseToken,
          p_attempt_id: reference.kind === "reserved" ? reference.attemptId : null, p_state: state,
        });
      } catch { return false; }
    },
  });
}
