import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Claim = { id: string; leaseToken: string };
type Reference = { kind: "unreserved" } | { kind: "reserved"; attemptId: string };
type Completion = "provider_accepted" | "cancelled" | "uncertain" | "failed";
type Options = { enabled: boolean; signal: AbortSignal };
const validClaim = (claim: Claim) => UUID.test(claim.id) && UUID.test(claim.leaseToken);

/** One POST only. Caller owns the deadline and supplies its bounded signal.
 * Only an explicit SQL false is a refused reservation; all missing/error/lost
 * receipts throw a sanitised unknown outcome. Never retry or send on unknown.
 */
export async function reserveMatchPushAttempt(claim: Claim, attemptId: string, options: Options): Promise<boolean> {
  try {
    if (options.enabled !== true || options.signal.aborted || !validClaim(claim) || !UUID.test(attemptId)) throw new Error();
    const admin = createAdminClient();
    if (!admin) throw new Error();
    const result = await admin.rpc("touchline_reserve_match_push_attempt", {
      p_id: claim.id, p_lease_token: claim.leaseToken, p_attempt_id: attemptId,
    }).abortSignal(options.signal);
    if (options.signal.aborted || result.error || typeof result.data !== "boolean") throw new Error();
    return result.data;
  } catch {
    throw new Error("PUSH_RESERVATION_UNCONFIRMED");
  }
}

/** Receipt only, never delivery proof. Use a fresh bounded completion signal,
 * not the possibly-aborted preparation/transport signal. False never retries.
 */
export async function finishMatchPushAttempt(claim: Claim, state: Completion, reference: Reference, options: Options): Promise<boolean> {
  try {
    if (options.enabled !== true || options.signal.aborted || !validClaim(claim)
      || !["provider_accepted", "cancelled", "uncertain", "failed"].includes(state)) return false;
    if (reference.kind === "unreserved") {
      if (state !== "cancelled") return false;
    } else if (reference.kind !== "reserved" || !UUID.test(reference.attemptId)) return false;
    const admin = createAdminClient();
    if (!admin) return false;
    const result = reference.kind === "reserved"
      ? await admin.rpc("touchline_finish_match_push_attempt", {
        p_id: claim.id, p_lease_token: claim.leaseToken, p_attempt_id: reference.attemptId, p_state: state,
      }).abortSignal(options.signal)
      : await admin.rpc("touchline_finish_match_push", {
        p_id: claim.id, p_lease_token: claim.leaseToken, p_state: state,
      }).abortSignal(options.signal);
    return !options.signal.aborted && !result.error && result.data === true;
  } catch {
    return false;
  }
}
