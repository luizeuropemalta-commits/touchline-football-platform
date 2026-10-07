import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMatchPushVapidConfig } from "../touchlineArena/match-push-vapid-config.ts";
import { dispatchClaimedLineupReminder } from "./lineup-reminder-single-claim-server.ts";

type Options = { enabled?: boolean; locale?: unknown; maximumAgeMs?: unknown; leaseSeconds?: unknown; vapid?: unknown };
export type LineupReminderWorkerResult =
  | { status: "disabled" | "unconfigured" | "idle" | "unconfirmed" }
  | { status: "processed"; outcome: Awaited<ReturnType<typeof dispatchClaimedLineupReminder>> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const time = Date.parse(value), wall = Date.parse(`${value.slice(0, 19)}Z`);
  return Number.isFinite(time) && Number.isFinite(wall) && new Date(wall).toISOString().slice(0, 19) === value.slice(0, 19) ? time : NaN;
}

/** Dormant, single-item worker. Discovery is only a hint; the service-only claim
 * RPC owns eligibility/locking, and dispatch rereads evidence before sending.
 * One shared five-second budget for discovery + claim. No admission, user scan,
 * environment lookup, retry, expired-item cleanup or scheduler activation.
 */
export async function runLineupReminderWorker(options: Options = {}): Promise<LineupReminderWorkerResult> {
  if (options.enabled !== true) return { status: "disabled" };
  const { maximumAgeMs, leaseSeconds } = options;
  const vapid = parseMatchPushVapidConfig(options.vapid);
  if (typeof maximumAgeMs !== "number"
    || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0 || typeof leaseSeconds !== "number"
    || !Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 60 || !vapid) return { status: "unconfigured" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const admin = createAdminClient();
    if (!admin) return { status: "unconfigured" };
    const started = performance.now(), requestedAt = Date.now();
    if (!Number.isSafeInteger(requestedAt) || requestedAt < 0) return { status: "unconfirmed" };
    const nowIso = new Date(requestedAt).toISOString();
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => { resolve(null); controller.abort(); }, 5_000);
    });
    const alive = () => {
      const elapsed = performance.now() - started, wall = Date.now();
      return !controller.signal.aborted && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 5_000
        && Number.isSafeInteger(wall) && wall >= requestedAt;
    };
    const response = await Promise.race([
      admin.from("touchline_game_notification_deliveries")
        .select("id,state,created_at,expires_at,lease_token,lease_expires_at,attempt_id")
        .eq("state", "queued").is("attempt_id", null).gt("expires_at", nowIso)
        .or(`lease_expires_at.is.null,lease_expires_at.lte.${nowIso}`)
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .limit(1).abortSignal(controller.signal), deadline,
    ]);
    if (!response || !alive() || response.error || !Array.isArray(response.data) || response.data.length > 1) return { status: "unconfirmed" };
    if (response.data.length === 0) return { status: "idle" };
    const row = object(response.data[0]);
    const expiry = instant(row?.expires_at), created = instant(row?.created_at);
    if (!row || typeof row.id !== "string" || !UUID.test(row.id) || row.state !== "queued" || row.attempt_id !== null
      || !Number.isFinite(created) || created > requestedAt || !Number.isFinite(expiry) || expiry <= Date.now() || created >= expiry
      || (row.lease_token === null ? row.lease_expires_at !== null
        : typeof row.lease_token !== "string" || !UUID.test(row.lease_token)
          || !Number.isFinite(instant(row.lease_expires_at)) || instant(row.lease_expires_at) > requestedAt)) return { status: "unconfirmed" };
    const claim = await Promise.race([
      admin.rpc("touchline_game_notification_claim", { p_id: row.id, p_lease_seconds: leaseSeconds }).abortSignal(controller.signal), deadline,
    ]);
    if (!claim || !alive() || claim.error) return { status: "unconfirmed" };
    if (claim.data === null) return { status: "idle" };
    const owned = object(claim.data), now = Date.now();
    const lease = instant(owned?.leaseUntil), claimedExpiry = instant(owned?.expiresAt);
    if (!owned || owned.id !== row.id || typeof owned.leaseToken !== "string" || !UUID.test(owned.leaseToken)
      || owned.leaseToken === row.lease_token
      || !Number.isFinite(lease) || lease <= now || lease > expiry || lease - now > leaseSeconds * 1_000
      || instant(owned.leaseExpiresAt) !== lease || claimedExpiry !== expiry || claimedExpiry <= now
      || typeof owned.leaseUntil !== "string" || typeof owned.expiresAt !== "string") return { status: "unconfirmed" };
    clearTimeout(timer); timer = undefined;
    const outcome = await dispatchClaimedLineupReminder({ id: row.id, leaseToken: owned.leaseToken,
      leaseUntil: owned.leaseUntil, expiresAt: owned.expiresAt }, { enabled: true, maximumAgeMs, vapid });
    return { status: "processed", outcome };
  } catch {
    return { status: "unconfirmed" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
