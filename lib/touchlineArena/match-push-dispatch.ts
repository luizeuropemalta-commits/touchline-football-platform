import { matchPushDeliveryDecision, type MatchPushDeliveryContext } from "./match-push-delivery-policy.ts";

type Completion = "provider_accepted" | "cancelled" | "uncertain" | "failed";
type Claim = { id: string; leaseToken: string; leaseUntil: string; expiresAt: string };
type AttemptReference = { kind: "unreserved" } | { kind: "reserved"; attemptId: string };
type Dependencies = {
  enabled: boolean;
  now: () => Date;
  attemptId: string;
  reserve: (claim: Claim, attemptId: string, signal: AbortSignal) => Promise<boolean>;
  // Server adapter must bind fresh facts/payload to this claim and validate endpoint.
  loadFresh: (claim: Claim, signal: AbortSignal) => Promise<{
    policy: Omit<MatchPushDeliveryContext, "now" | "leaseUntil" | "expiresAt">;
    deliver: (signal: AbortSignal) => Promise<"provider_accepted" | "rejected">;
  }>;
  finish: (claim: Claim, state: Completion, attempt: AttemptReference) => Promise<boolean>;
};

/** One claimed item, no retry. A transport exception/timeout is uncertain, not
 * failure: the provider might already have accepted it. No deployment adapter
 * is installed by this module; the default caller must remain disabled.
 */
export async function dispatchMatchPush(claim: Claim, deps: Dependencies) {
  if (deps.enabled !== true) return "disabled" as const;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deps.attemptId)) return "reservation-unconfirmed" as const;
  const remaining = Math.min(Date.parse(claim.leaseUntil), Date.parse(claim.expiresAt)) - deps.now().getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return "expired" as const;
  const controller = new AbortController();
  let attempted = false;
  let reservationPending = false;
  let reference: AttemptReference = { kind: "unreserved" };
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
      reservationPending = true;
      const granted = await Promise.race([deps.reserve(claim, deps.attemptId, controller.signal), deadline]);
      if (controller.signal.aborted) return "reservation-unconfirmed" as const;
      if (granted === false) return "reservation-not-granted" as const;
      if (granted !== true) return "reservation-unconfirmed" as const;
      reference = { kind: "reserved", attemptId: deps.attemptId };
      reservationPending = false;
      // A lock wait may have outlived consent or source freshness. Never reuse
      // the pre-reservation closure; reread under the same entry deadline.
      const current = await Promise.race([deps.loadFresh(claim, controller.signal), deadline]);
      const currentDecision = matchPushDeliveryDecision({ ...current.policy, now: deps.now(), leaseUntil: claim.leaseUntil, expiresAt: claim.expiresAt });
      if (currentDecision !== "ready" || controller.signal.aborted) {
        completion = "cancelled";
      } else {
        attempted = true;
        const result = await Promise.race([current.deliver(controller.signal), deadline]);
        completion = controller.signal.aborted ? "uncertain"
          : result === "provider_accepted" ? "provider_accepted" : result === "rejected" ? "failed" : "uncertain";
      }
    }
  } catch {
    // Unknown reservation ownership must not send OR finish another caller's row.
    if (reservationPending) return "reservation-unconfirmed" as const;
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
    return await Promise.race([deps.finish(claim, completion, reference), receiptDeadline]) ? completion : "receipt-unconfirmed" as const;
  } catch {
    return "receipt-unconfirmed" as const;
  } finally {
    if (receiptTimer) clearTimeout(receiptTimer);
  }
}
