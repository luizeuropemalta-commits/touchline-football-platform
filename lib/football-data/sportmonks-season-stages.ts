import { strictSportmonksId } from "@/lib/football-data/sportmonks-season-topscorers";

/** Independent stage facts only. A complete list does not select an award stage. */
export function normalizeSportmonksSeasonStages(envelope: unknown, leagueId: string, seasonId: string) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
  const payload = envelope as Record<string, unknown>;
  if (!Array.isArray(payload.data) || payload.pagination != null || payload.has_more === true || payload.next_page != null) return null;
  const rows: Array<{ id: string; leagueId: string; seasonId: string; typeId: string }> = [];
  const ids = new Set<string>();
  for (const value of payload.data) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const id = strictSportmonksId(row.id), league = strictSportmonksId(row.league_id), season = strictSportmonksId(row.season_id), typeId = strictSportmonksId(row.type_id);
    if (!id || !typeId || league !== leagueId || season !== seasonId || ids.has(id)) return null;
    ids.add(id); rows.push({ id, leagueId: league, seasonId: season, typeId });
  }
  return rows;
}
