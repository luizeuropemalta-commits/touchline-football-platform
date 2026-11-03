import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { projectClubOwnerPublicPhotos, projectClubOwnerStandingViews, projectClubOwnerStandingIndex, type ClubOwnerStanding, type ClubOwnerStandingViews } from "./club-owner-standings";

import { publicOwnerAvatarService } from "./clubowner-public-avatar-server";

export type ClubOwnerStandingsRead = { status: "ready"; rows: ClubOwnerStanding[] } | { status: "unavailable"; rows: [] };
export type ClubOwnerStandingViewsRead =
  | ({ status: "ready" } & ClubOwnerStandingViews)
  | { status: "unavailable"; rows: []; viewerRanking: [] };

/** Server-only reusable season read. The caller provides an already verified
 * season and viewer; neither value is taken from a public request parameter. */
async function readStandingInputs(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  seasonId: string,
  limits?: { signal: AbortSignal; maxRows: number },
): Promise<{ input: unknown[]; registrations: unknown[] } | null> {
  const unavailable = null;
  try {
    if (!seasonId.trim()) return unavailable;
    const input: unknown[] = [];
    let expectedCount: number | null = null;
    for (let offset = 0; ; offset += 500) {
      const query = admin.from("touchline_fantasy_user_gameweeks")
        .select("id,user_id,market_plan_key_snapshot,users(full_name),touchline_fantasy_gameweeks!inner(season_id),touchline_fantasy_user_gameweek_scores(gameweek_score,settlement_status)", { count: "exact" })
        .in("market_plan_key_snapshot", ["standard", "pro", "master", "vip"])
        .eq("touchline_fantasy_gameweeks.season_id", seasonId)
        .order("id", { ascending: true }).range(offset, offset + 499);
      const result = await (limits ? query.abortSignal(limits.signal) : query);
      if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0
        || (limits && result.count > limits.maxRows)
        || (expectedCount !== null && result.count !== expectedCount)) return unavailable;
      expectedCount = result.count;
      input.push(...result.data);
      if (input.length === expectedCount) break;
      if (result.data.length !== 500 || input.length > expectedCount) return unavailable;
    }
    const registrations: unknown[] = [];
    let registrationCount: number | null = null;
    for (let offset = 0; ; offset += 500) {
      const query = admin.from("touchline_club_collections")
        .select("user_id,plan:state->>plan,users(full_name,touchline_fantasy_entitlements(entitlement_key,plan_key,status,current_period_start,current_period_end))", { count: "exact" })
        .eq("season_id", seasonId).order("user_id", { ascending: true }).range(offset, offset + 499);
      const result = await (limits ? query.abortSignal(limits.signal) : query);
      if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0
        || (limits && result.count > limits.maxRows)
        || (registrationCount !== null && result.count !== registrationCount)) return unavailable;
      registrationCount = result.count;
      registrations.push(...result.data);
      if (registrations.length === registrationCount) break;
      if (result.data.length !== 500 || registrations.length > registrationCount) return unavailable;
    }
    return { input, registrations };
  } catch { return unavailable; }
}

/** Existing public and viewer DTOs remain unchanged. */
export async function readClubOwnerStandingViewsForSeason(
  admin: NonNullable<ReturnType<typeof createAdminClient>>, seasonId: string, viewerUserId: string | null = null,
): Promise<ClubOwnerStandingViewsRead> {
  const inputs = await readStandingInputs(admin, seasonId);
  const views = inputs && projectClubOwnerStandingViews(inputs.input, inputs.registrations, Date.now(), viewerUserId);
  return views ? { status: "ready", ...views } : { status: "unavailable", rows: [], viewerRanking: [] };
}

/** Server-only internal join, bounded independently from public HTTP parameters. */
export async function readClubOwnerStandingIndexForSeason(
  admin: NonNullable<ReturnType<typeof createAdminClient>>, seasonId: string, signal: AbortSignal,
) {
  const inputs = await readStandingInputs(admin, seasonId, { signal, maxRows: 100_000 });
  return inputs && projectClubOwnerStandingIndex(inputs.input, inputs.registrations);
}

/** Read-only, no cross-request caching or account preparation. */
export async function loadClubOwnerStandings(): Promise<ClubOwnerStandingsRead> {
  try {
    const admin = createAdminClient();
    if (!admin) return { status: "unavailable", rows: [] };
    const config = await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key", "england").eq("status", "active").single();
    if (config.error || typeof config.data?.season_id !== "string") return { status: "unavailable", rows: [] };
    const signal = AbortSignal.timeout(10_000);
    const inputs = await readStandingInputs(admin, config.data.season_id, { signal, maxRows: 100_000 });
    const now = Date.now();
    const views = inputs && projectClubOwnerStandingViews(inputs.input, inputs.registrations, now);
    if (!views || !inputs) return { status: "unavailable", rows: [] };
    let rows = views.rows;
    // Optional photos fail closed independently: sporting standings stay available.
    if (publicOwnerAvatarService().enabled) {
      try {
        const candidates = await admin.rpc("touchline_people_directory_candidates", { p_viewer: null }).abortSignal(signal);
        const index = projectClubOwnerStandingIndex(inputs.input, inputs.registrations, now);
        if (!candidates.error && index && !signal.aborted) rows = projectClubOwnerPublicPhotos(rows, index, candidates.data);
      } catch { /* No public photo identity on unavailable or invalid publication data. */ }
    }
    const result = { status: "ready" as const, rows };
    // Never return a personalized view to the public ranking route.
    return result.status === "ready" ? { status: "ready", rows: result.rows } : { status: "unavailable", rows: [] };
  } catch { return { status: "unavailable", rows: [] }; }
}

/** Public profile adapter: same canonical inputs and timestamp for rank and points. */
export async function readClubOwnerProfileStandingForSeason(
  admin: NonNullable<ReturnType<typeof createAdminClient>>, seasonId: string, accountId: string, signal: AbortSignal,
) {
  const inputs = await readStandingInputs(admin, seasonId, { signal, maxRows: 100_000 });
  if (!inputs || signal.aborted) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  const now = Date.now();
  const index = projectClubOwnerStandingIndex(inputs.input, inputs.registrations, now);
  const views = projectClubOwnerStandingViews(inputs.input, inputs.registrations, now);
  if (!index || !views) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  const entry = index.find(row => row.accountId.toLowerCase() === accountId.toLowerCase());
  if (!entry) return null;
  const row = views.rows.find(row => row.rank === entry.rank);
  if (!row) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  return { rank: row.rank, points: row.touchlinePoints };
}
