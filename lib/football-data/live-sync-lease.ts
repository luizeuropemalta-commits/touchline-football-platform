import type { SupabaseClient } from "@supabase/supabase-js";

const COMPETITION_ID = "8";
export const TOUCHLINE_LIVE_SYNC_STALE_RUN_MS = 10 * 60 * 1000;

/**
 * Calls the transactional QA lease RPC. The database owns concurrency; this
 * wrapper only validates its fail-closed response before any provider work.
 */
export async function acquireTouchlineLiveSyncRun(
  admin: SupabaseClient,
  now: number,
  forceFixtureId?: string | null,
) {
  const { data, error } = await admin.rpc("touchline_try_begin_live_sync_run", {
    p_now: new Date(now).toISOString(),
    p_stale_before: new Date(now - TOUCHLINE_LIVE_SYNC_STALE_RUN_MS).toISOString(),
    p_source_payload: {
      competitionProviderId: COMPETITION_ID,
      forcedFixture: Boolean(forceFixtureId),
    },
  });
  if (error) throw new Error(`Could not acquire live sync lease: ${error.code ?? "unknown"}`);
  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const acquired = payload.acquired === true;
  const runId = typeof payload.runId === "string" ? payload.runId : undefined;
  if (acquired && !runId) throw new Error("Live sync lease returned no run identity.");
  return acquired
    ? { acquired: true as const, runId: runId! }
    : { acquired: false as const, reason: "live_sync_in_flight" as const };
}
