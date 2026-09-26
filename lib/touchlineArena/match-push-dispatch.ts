import { matchPushDeliveryDecision, type MatchPushDeliveryContext } from "./match-push-delivery-policy.ts";

type Completion = "provider_accepted" | "cancelled" | "uncertain" | "failed";
type Claim = { id: string; leaseToken: string; leaseUntil: string; expiresAt: string };
type Dependencies = {
  enabled: boolean;
  now: () => Date;
  // Server adapter must bind fresh facts/payload to this claim and validate endpoint.
  loadFresh: (claim: Claim, signal: AbortSignal) => Promise<{
    policy: Omit<MatchPushDeliveryContext, "now" | "leaseUntil" | "expiresAt">;
    deliver: (signal: AbortSignal) => Promise<"provider_accepted" | "rejected">;
  }>;
  finish: (claim: Claim, state: Completion) => Promise<boolean>;
};

/** One claimed item, no retry. A transport exception/timeout is uncertain, not
 * failure: the provider might already have accepted it. No deployment adapter
 * is installed by this module; the default caller must remain disabled.
 */
export async function dispatchMatchPush(claim: Claim, deps: Dependencies) {
  if (deps.enabled !== true) return "disabled" as const;
  const remaining = Math.min(Date.parse(claim.leaseUntil), Date.parse(claim.expiresAt)) - deps.now().getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return "expired" as const;
  const controller = new AbortController();
  let attempted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    // Settle timeout first: an abort listener may synchronously settle transport.
    timer = setTimeout(() => { reject(new Error("push-deadline")); controller.abort(); }, Math.min(15_000, remaining));
  });
  let completion: Completion;
  try {
    const fresh = await Promise.race([deps.loadFresh(claim, controller.signal), deadline]);
    const decision = matchPushDeliveryDecision({ ...fresh.policy, now: deps.now(), leaseUntil: claim.leaseUntil, expiresAt: claim.expiresAt });
    if (decision !== "ready" || controller.signal.aborted) {
      completion = "cancelled";
    } else {
      attempted = true;
      const result = await Promise.race([fresh.deliver(controller.signal), deadline]);
      completion = controller.signal.aborted ? "uncertain"
        : result === "provider_accepted" ? "provider_accepted" : result === "rejected" ? "failed" : "uncertain";
    }
  } catch {
    completion = attempted ? "uncertain" : "cancelled";
  } finally {
    if (timer) clearTimeout(timer);
  }
  // A failed receipt never causes this function to retry the transport.
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const receiptDeadline = new Promise<false>((resolve) => {
      receiptTimer = setTimeout(() => resolve(false), 5_000);
    });
    return await Promise.race([deps.finish(claim, completion), receiptDeadline]) ? completion : "receipt-unconfirmed" as const;
  } catch {
    return "receipt-unconfirmed" as const;
  } finally {
    if (receiptTimer) clearTimeout(receiptTimer);
  }
}
