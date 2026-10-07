import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Options = {
  enabled?: boolean; competitionId?: unknown; seasonId?: unknown;
  leadSeconds?: unknown; pageSize?: unknown; retrySeconds?: unknown;
};
type Counters = {
  scanned: number; inserted: number; processed: number; deferred: number;
  discoveryBusy: number; stored: number; closed: number;
};
export type LineupReminderAdmissionResult =
  | { status: "disabled" | "unconfigured" | "unconfirmed" | "busy" | "unavailable" | "policy-mismatch" }
  | (Counters & { status: "complete" | "partial"; sweep: string; sweepCompleted: boolean });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const counterKeys = ["scanned", "inserted", "processed", "deferred", "discoveryBusy", "stored", "closed"] as const;
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function receipt(value: unknown, pageSize: number): LineupReminderAdmissionResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>, keys = Object.keys(row);
  if (row.status === "unconfigured" || row.status === "busy" || row.status === "unavailable" || row.status === "policy-mismatch") {
    return keys.length === 1 ? { status: row.status } : null;
  }
  if ((row.status !== "complete" && row.status !== "partial") || keys.length !== 10
    || keys.some(key => !["status", ...counterKeys, "sweep", "sweepCompleted"].includes(key))
    || counterKeys.some(key => !integer(row[key], 0, key === "discoveryBusy" ? 1 : pageSize))
    || typeof row.sweep !== "string" || !/^[1-9]\d{0,18}$/.test(row.sweep)
    || (row.sweep.length === 19 && row.sweep > "9223372036854775807")
    || typeof row.sweepCompleted !== "boolean") return null;
  const counters = Object.fromEntries(counterKeys.map(key => [key, row[key]])) as Counters;
  if (counters.inserted > counters.scanned || counters.deferred + counters.stored + counters.closed > counters.processed
    || (row.status === "partial") !== (counters.deferred > 0 || counters.discoveryBusy > 0)
    || row.sweepCompleted !== (counters.scanned < pageSize && counters.discoveryBusy === 0)
    || (counters.discoveryBusy > 0 && counters.scanned >= pageSize)) return null;
  return { status: row.status, ...counters, sweep: row.sweep, sweepCompleted: row.sweepCompleted };
}

/** Dormant bounded admission only. The SQL authority owns scope, consent,
 * baseline and dedupe. An unconfirmed receipt may already have committed;
 * never retry here or infer zero admitted rows from a lost response.
 * No environment lookup, provider, delivery transport or scheduler activation.
 */
export async function runLineupReminderAdmission(options: Options = {}): Promise<LineupReminderAdmissionResult> {
  if (options.enabled !== true) return { status: "disabled" };
  const { competitionId, seasonId, leadSeconds, pageSize, retrySeconds } = options;
  if (typeof competitionId !== "string" || !UUID.test(competitionId) || typeof seasonId !== "string" || !UUID.test(seasonId)
    || !integer(leadSeconds, 1, 86_400) || !integer(pageSize, 1, 50) || !integer(retrySeconds, 1, 3_600)) return { status: "unconfigured" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const started = performance.now();
    const admin = createAdminClient();
    if (!admin) return { status: "unconfigured" };
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => { resolve(null); controller.abort(); }, 5_000);
    });
    const response = await Promise.race([
      admin.rpc("touchline_lineup_reminder_admission_scan", {
        p_competition_id: competitionId, p_season_id: seasonId, p_lead_seconds: leadSeconds,
        p_page_size: pageSize, p_retry_seconds: retrySeconds,
      }).abortSignal(controller.signal), deadline,
    ]);
    const elapsed = performance.now() - started;
    if (!response || controller.signal.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 5_000 || response.error) return { status: "unconfirmed" };
    return receipt(response.data, pageSize) ?? { status: "unconfirmed" };
  } catch {
    return { status: "unconfirmed" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
