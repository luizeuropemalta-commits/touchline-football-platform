import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeMatchPushSourceAgePolicy } from "./match-push-source-freshness";
import { parseMatchPushVapidConfig } from "./match-push-vapid-config";
import { dispatchClaimedMatchPush } from "./match-push-single-claim-server";

type Options = {
  enabled: boolean;
  maximumAgeMs: unknown;
  vapid: Parameters<typeof dispatchClaimedMatchPush>[1]["vapid"];
};
export type MatchPushWorkerResult =
  | { status: "disabled" | "unconfigured" | "idle" | "unconfirmed" }
  | { status: "processed"; outcome: Awaited<ReturnType<typeof dispatchClaimedMatchPush>> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** One trusted server invocation, one claim, at most one dispatch. No provider
 * reads, enqueue/history attestation, environment lookup, loop or retry.
 * A lost claim receipt may have committed; it must never authorize late sending.
 */
export async function runMatchPushWorker(options: Options): Promise<MatchPushWorkerResult> {
  if (options.enabled !== true) return { status: "disabled" };
  const policy = normalizeMatchPushSourceAgePolicy(options.maximumAgeMs);
  const vapid = parseMatchPushVapidConfig(options.vapid);
  if (!policy || !vapid) return { status: "unconfigured" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const admin = createAdminClient();
    if (!admin) return { status: "unconfigured" };
    const started = performance.now();
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => { resolve(null); controller.abort(); }, 5_000);
    });
    const response = await Promise.race([
      admin.rpc("touchline_claim_match_push_batch", { p_limit: 1 }).abortSignal(controller.signal),
      deadline,
    ]);
    const elapsed = performance.now() - started;
    if (!response || controller.signal.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 5_000
      || response.error || !Array.isArray(response.data) || response.data.length > 1) return { status: "unconfirmed" };
    clearTimeout(timer);
    timer = undefined;
    if (response.data.length === 0) return { status: "idle" };
    const row = object(response.data[0]);
    const payload = object(row?.payload);
    const instant = Date.now();
    if (!row || typeof row.id !== "string" || !UUID.test(row.id)
      || typeof row.lease_token !== "string" || !UUID.test(row.lease_token)
      || row.state !== "claimed" || typeof row.lease_until !== "string" || typeof row.expires_at !== "string"
      || !Number.isFinite(Date.parse(row.lease_until)) || Date.parse(row.lease_until) <= instant
      || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= instant
      || payload?.schemaVersion !== 1) {
      return { status: "unconfirmed" };
    }
    const outcome = await dispatchClaimedMatchPush({
      id: row.id, leaseToken: row.lease_token, leaseUntil: row.lease_until, expiresAt: row.expires_at,
    }, { enabled: true, maximumAgeMs: policy, vapid });
    return { status: "processed", outcome };
  } catch {
    return { status: "unconfirmed" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
