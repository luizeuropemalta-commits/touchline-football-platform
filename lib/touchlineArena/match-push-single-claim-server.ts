import "server-only";
import { randomUUID } from "node:crypto";
import { dispatchMatchPush } from "./match-push-dispatch";
import { readClaimedMatchPushSource } from "./match-push-claimed-source-server";
import { reserveMatchPushAttempt, finishMatchPushAttempt } from "./match-push-attempt-server";
import { matchPushSourceDeadline } from "./match-push-source-freshness";
import { matchPushDeliveryDecision } from "./match-push-delivery-policy";
import { isSupportedMatchPushEndpoint, sendMatchWebPush } from "./match-push-transport";
import { parseMatchPushVapidConfig } from "./match-push-vapid-config";

type Claim = Parameters<typeof dispatchMatchPush>[0];
type Options = {
  enabled: boolean;
  locale: "pt-BR" | "en-GB";
  maximumAgeMs: unknown;
  vapid: Parameters<typeof sendMatchWebPush>[0]["vapid"];
};

/** Internal single already-claimed item, not a scheduler or activation path.
 * Real wall clock throughout, including transport; no caller-supplied nonce.
 * Final reread reduces, but cannot eliminate, consent-to-HTTP races.
 */
export async function dispatchClaimedMatchPush(claim: Claim, options: Options) {
  if (options.enabled !== true) return "disabled" as const;
  const vapid = parseMatchPushVapidConfig(options.vapid);
  if (!vapid) return "unconfigured" as const;
  const now = () => new Date();
  return dispatchMatchPush(claim, {
    enabled: true, now, attemptId: randomUUID(),
    reserve: (current, attemptId, signal) => reserveMatchPushAttempt(current, attemptId, { enabled: true, signal }),
    loadFresh: async (current, signal) => {
      const fresh = await readClaimedMatchPushSource(current, {
        maximumAgeMs: options.maximumAgeMs, locale: options.locale, now, signal,
      });
      const subscription = fresh?.registration.subscription;
      if (signal.aborted || !fresh || !subscription || !isSupportedMatchPushEndpoint(subscription.endpoint)) {
        throw new Error("PUSH_SOURCE_UNAVAILABLE");
      }
      // Do not replace claim.expiresAt: the reader compares it with persisted data.
      const queueCutoff = Math.min(Date.parse(current.leaseUntil), Date.parse(current.expiresAt));
      if (!Number.isFinite(queueCutoff)) throw new Error("PUSH_SOURCE_UNAVAILABLE");
      const cutoff = matchPushSourceDeadline(fresh.source.evidence, options.maximumAgeMs, new Date(queueCutoff).toISOString(), now());
      if (!cutoff || Date.parse(cutoff) - now().getTime() < 1000) throw new Error("PUSH_SOURCE_UNAVAILABLE");
      const payload = JSON.stringify(fresh.payload);
      return {
        policy: fresh.policy,
        deliver: async (transportSignal: AbortSignal) => {
          const instant = now();
          if (transportSignal.aborted || Date.parse(cutoff) - instant.getTime() < 1000
            || matchPushDeliveryDecision({ ...fresh.policy, now: instant, leaseUntil: current.leaseUntil, expiresAt: current.expiresAt }) !== "ready") {
            throw new Error("PUSH_DELIVERY_UNAVAILABLE");
          }
          return sendMatchWebPush({ subscription, payload, vapid, expiresAt: new Date(cutoff), signal: transportSignal });
        },
      };
    },
    finish: async (current, state, reference) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        return await finishMatchPushAttempt(current, state, reference, { enabled: true, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
