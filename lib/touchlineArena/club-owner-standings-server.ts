import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { projectClubOwnerStandings, type ClubOwnerStanding } from "./club-owner-standings";

export type ClubOwnerStandingsRead = { status: "ready"; rows: ClubOwnerStanding[] } | { status: "unavailable"; rows: [] };

/** Read-only, not cached across requests; same participation and FINAL-score
 * authority used by Fantasy's competitive ranking. No account preparation. */
export async function loadClubOwnerStandings(): Promise<ClubOwnerStandingsRead> {
  const unavailable = { status: "unavailable", rows: [] } as const;
  try {
    const admin = createAdminClient();
    if (!admin) return { status: "unavailable", rows: [] };
    const config = await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key", "england").eq("status", "active").single();
    if (config.error || typeof config.data?.season_id !== "string") return { status: "unavailable", rows: [] };
    const input: unknown[] = [];
    let expectedCount: number | null = null;
    for (let offset = 0; ; offset += 500) {
      const result = await admin.from("touchline_fantasy_user_gameweeks")
        .select("id,user_id,market_plan_key_snapshot,users(full_name),touchline_fantasy_gameweeks!inner(season_id),touchline_fantasy_user_gameweek_scores(gameweek_score,settlement_status)", { count: "exact" })
        .in("market_plan_key_snapshot", ["standard", "pro", "master", "vip"])
        .eq("touchline_fantasy_gameweeks.season_id", config.data.season_id)
        .order("id", { ascending: true }).range(offset, offset + 499);
      if (result.error || !Array.isArray(result.data) || result.count === null
        || (expectedCount !== null && result.count !== expectedCount)) return { ...unavailable, rows: [] };
      expectedCount = result.count;
      input.push(...result.data);
      if (input.length === expectedCount) break;
      if (result.data.length !== 500 || input.length > expectedCount) return { ...unavailable, rows: [] };
    }
    const registrations: unknown[] = [];
    let registrationCount: number | null = null;
    for (let offset = 0; ; offset += 500) {
      const result = await admin.from("touchline_club_collections")
        .select("user_id,plan:state->>plan,users(full_name,touchline_fantasy_entitlements(entitlement_key,plan_key,status,current_period_start,current_period_end))", { count: "exact" })
        .eq("season_id", config.data.season_id).order("user_id", { ascending: true }).range(offset, offset + 499);
      if (result.error || !Array.isArray(result.data) || result.count === null
        || (registrationCount !== null && result.count !== registrationCount)) return { ...unavailable, rows: [] };
      registrationCount = result.count;
      registrations.push(...result.data);
      if (registrations.length === registrationCount) break;
      if (result.data.length !== 500 || registrations.length > registrationCount) return { ...unavailable, rows: [] };
    }
    const rows = projectClubOwnerStandings(input, registrations);
    return rows ? { status: "ready", rows } : { ...unavailable, rows: [] };
  } catch { return { ...unavailable, rows: [] }; }
}
