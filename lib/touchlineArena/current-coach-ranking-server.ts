import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachCatalogue } from "./coach-catalogue-contract.ts";
import type { TouchLineCoachRankingState } from "./coach-ranking-snapshot-server.ts";
import { projectTouchlineCurrentCoachRanking } from "./current-coach-ranking.ts";

type Scope = Readonly<{ competitionId: string; seasonId: string; effectiveSeason: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reuses the confirmed current competition/season read. Appointments come
 * from the approved catalogue; current league membership comes from canonical
 * clubs, never from the last match, a historical club name, or static artwork. */
export async function readTouchlineCurrentCoachRanking(
  admin: SupabaseClient,
  raw: TouchLineCoachRankingState | null,
  catalogue: CoachCatalogue,
  scope: Scope | null,
): Promise<TouchLineCoachRankingState | null> {
  if (!scope || catalogue.phase !== "ready" || catalogue.current.length !== 20) return null;
  const teamIds = catalogue.current.map(entry => entry.coach.teamId!);
  if (new Set(teamIds).size !== 20) return null;
  async function readClubs() {
    const result = await admin.from("football_clubs")
      .select("id,provider,provider_team_id,competition_id,name", { count: "exact" })
      .eq("provider", "sportmonks").in("provider_team_id", teamIds).limit(21)
      .abortSignal(AbortSignal.timeout(8_000));
    if (result.error || !Array.isArray(result.data) || result.count !== 20 || result.data.length !== 20) return null;
    const rows = result.data;
    if (new Set(rows.map(row => row.id)).size !== 20 || new Set(rows.map(row => row.provider_team_id)).size !== 20
      || rows.some(row => !UUID.test(row.id) || row.provider !== "sportmonks" || !teamIds.includes(row.provider_team_id)
        || !UUID.test(row.competition_id)
        || typeof row.name !== "string" || !row.name.trim() || row.name.length > 160)) return null;
    return rows.sort((left, right) => left.provider_team_id < right.provider_team_id ? -1 : left.provider_team_id > right.provider_team_id ? 1 : 0);
  }
  try {
    const before = await readClubs();
    if (!before) return null;
    const after = await readClubs();
    if (!after || JSON.stringify(before) !== JSON.stringify(after)) return null;
    return projectTouchlineCurrentCoachRanking(raw, catalogue, { ...scope,
      clubs: after.filter(row => row.competition_id === scope!.competitionId)
        .map(row => ({ providerTeamId: row.provider_team_id, name: row.name })),
    });
  } catch { return null; }
}
