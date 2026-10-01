import type { TouchlineSeasonTopScorer, TouchlineSeasonTopScorers } from "./types.ts";

export function strictSportmonksId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** No association is borrowed from the request URL, a name or row ordering. */
export function normalizeSportmonksSeasonTopScorers(
  values: readonly unknown[],
  requestedSeasonId: string,
): Pick<TouchlineSeasonTopScorers, "rows" | "scopeStatus" | "reason"> {
  let missing = false, conflict = false;
  function identity(...values: unknown[]) {
    const explicit = values.filter(value => value !== undefined && value !== null);
    const ids = explicit.map(strictSportmonksId);
    if (!ids.length || ids.some(id => id === null)) missing = true;
    if (new Set(ids.filter(Boolean)).size > 1) conflict = true;
    return ids.find((id): id is string => id !== null) ?? null;
  }
  const rows = values.map((value): TouchlineSeasonTopScorer => {
    const row = record(value), season = record(row.season), stage = record(row.stage);
    const seasonId = identity(row.season_id, season.id, stage.season_id);
    const type = identity(row.type_id, record(row.type).id);
    const goals = typeof row.total === "number" ? row.total
      : typeof row.total === "string" && /^(0|[1-9]\d*)$/.test(row.total) ? Number(row.total) : NaN;
    if (!Number.isSafeInteger(goals) || goals < 0 || type !== "208") missing = true;
    if (seasonId !== null && seasonId !== requestedSeasonId) conflict = true;
    return {
      providerRecordId: identity(row.id),
      providerPlayerId: identity(row.player_id, record(row.player).id),
      providerTeamId: identity(row.participant_id, row.team_id, record(row.team).id),
      leagueId: identity(row.league_id, record(row.league).id, season.league_id, stage.league_id),
      seasonId,
      stageId: identity(row.stage_id, stage.id),
      goals: Number.isSafeInteger(goals) && goals >= 0 ? goals : null,
    };
  });
  const byId = new Map<string, TouchlineSeasonTopScorer>();
  const byPlayerStage = new Map<string, TouchlineSeasonTopScorer>();
  for (const row of rows) {
    const key = `${row.seasonId}:${row.stageId}:${row.providerPlayerId}`;
    const previousId = row.providerRecordId ? byId.get(row.providerRecordId) : undefined;
    const previousPlayer = byPlayerStage.get(key);
    if (previousId && JSON.stringify(previousId) !== JSON.stringify(row)) conflict = true;
    if (previousPlayer && (previousPlayer.goals !== row.goals || previousPlayer.providerTeamId !== row.providerTeamId || previousPlayer.leagueId !== row.leagueId)) conflict = true;
    if (row.providerRecordId) byId.set(row.providerRecordId, row);
    byPlayerStage.set(key, row);
  }
  return {
    rows: [...byPlayerStage.values()],
    scopeStatus: conflict ? "ambiguous" : missing ? "unavailable" : "complete",
    reason: conflict ? "conflicting-provider-facts" : missing ? "missing-explicit-provider-facts" : null,
  };
}
