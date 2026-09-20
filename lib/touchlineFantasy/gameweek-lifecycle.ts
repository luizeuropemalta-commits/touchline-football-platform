import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type Gameweek = Readonly<{ id: string; state: string }>;

// The database owns locking and scoring. A newly opened market must not hide
// the previous FINAL round: prepare copies only its immutable locked XI.
export async function reconcileTouchlineFantasyGameweeks(
  admin: Pick<SupabaseClient, "rpc">,
  gameweeks: readonly Gameweek[],
  includeSettled = false,
): Promise<{ reconciled: number; pendingStatistics?: boolean; error: string | null }> {
  let reconciled = 0;
  let pendingStatistics = false;
  for (const gameweek of gameweeks) {
    if (!["LOCKED", "LIVE", "FINAL"].includes(gameweek.state) && !(includeSettled && gameweek.state === "SETTLED")) continue;
    try {
      const { data, error } = await admin.rpc("touchline_fantasy_reconcile_gameweek", { p_gameweek_id: gameweek.id });
      if (error) {
        const code = error.code;
        return { reconciled, error: typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(code) ? code : "unknown" };
      }
      if (!data || data.ok !== true) return { reconciled, error: "not-confirmed" };
      pendingStatistics ||= data.pendingStatistics === true;
      reconciled += 1;
    } catch {
      return { reconciled, error: "unavailable" };
    }
  }
  return { reconciled, pendingStatistics, error: null };
}

export async function reconcilePendingTouchlineFantasyGameweeks(admin: SupabaseClient) {
  try {
    const { data: config, error: configError } = await admin.from("touchline_fantasy_configs")
      .select("season_id").eq("competition_key", "england").eq("status", "active").maybeSingle();
    if (configError) return { reconciled: 0, error: "config-unavailable" };
    if (!config) return { reconciled: 0, error: null };
    if (typeof config.season_id !== "string" || !config.season_id) return { reconciled: 0, error: "config-invalid" };
    // The database compares durable feed/statistics/score versions. Discovery
    // still works after a failed RPC and an idle tick with no incoming fixture.
    const { data, error } = await admin.rpc("touchline_fantasy_pending_gameweeks", { p_season_id: config.season_id });
    if (error || !Array.isArray(data)) return { reconciled: 0, error: "gameweeks-unavailable" };
    if (data.some((row) => typeof row.id !== "string" || typeof row.state !== "string")) {
      return { reconciled: 0, error: "gameweeks-invalid" };
    }
    return await reconcileTouchlineFantasyGameweeks(admin, data, true);
  } catch {
    return { reconciled: 0, error: "unavailable" };
  }
}
