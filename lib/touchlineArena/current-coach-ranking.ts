import type { TouchLineCoachRankingState, TouchLineCoachRankingRow } from "./coach-ranking-snapshot-server.ts";
import { parseCoachCatalogueTransport, type CoachCatalogue } from "./coach-catalogue-contract.ts";

export type CurrentCoachLeagueScope = Readonly<{
  competitionId: string;
  seasonId: string;
  effectiveSeason: string;
  /** Complete canonical lookup of the catalogue's current club identities.
   * Clubs whose current competition differs have already been excluded. */
  clubs: readonly Readonly<{ providerTeamId: string; name: string }>[];
}>;

export type CurrentCoachProjection = Readonly<{
  version: 1;
  scope: CurrentCoachLeagueScope;
  sourceSnapshotId: string | null;
  catalogueRevision: number | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[1-9][0-9]{0,15}$/;

function validScope(scope: CurrentCoachLeagueScope | null): scope is CurrentCoachLeagueScope {
  return Boolean(scope && typeof scope.competitionId === "string" && typeof scope.seasonId === "string"
    && typeof scope.effectiveSeason === "string" && UUID.test(scope.competitionId) && UUID.test(scope.seasonId)
    && /^\d{4}-\d{2}$/.test(scope.effectiveSeason) && Array.isArray(scope.clubs)
    && scope.clubs.length <= 20 && new Set(scope.clubs.map(club => club.providerTeamId)).size === scope.clubs.length
    && scope.clubs.every(club => ID.test(club.providerTeamId) && typeof club.name === "string"
      && club.name.trim().length > 0 && club.name.length <= 160));
}

function compare(left: TouchLineCoachRankingRow, right: TouchLineCoachRankingRow) {
  return right.touchlinePoints - left.touchlinePoints || right.wins - left.wins || right.awayWins - left.awayWins
    || (left.coachProviderId < right.coachProviderId ? -1 : left.coachProviderId > right.coachProviderId ? 1 : 0);
}

/** A derived CURRENT view. The audited publication and its season ledger are
 * never edited, and club changes never participate in the score identity. */
export function projectTouchlineCurrentCoachRanking(
  raw: TouchLineCoachRankingState | null,
  catalogue: CoachCatalogue,
  scope: CurrentCoachLeagueScope | null,
): TouchLineCoachRankingState | null {
  if (!validScope(scope) || catalogue.phase !== "ready" || catalogue.current.length !== 20
    || new Set(catalogue.current.map(entry => entry.coach.providerId)).size !== 20
    || new Set(catalogue.current.map(entry => entry.coach.teamId)).size !== 20) return null;
  if (raw && (raw.phase !== "ranked" || !raw.snapshotId || !raw.seasonId
    || raw.scoringVersion !== "coach_scoring_v2" || raw.currentProjection)) return null;
  const clubs = new Map(scope.clubs.map(club => [club.providerTeamId, club]));
  const current = new Map(catalogue.current.filter(entry => clubs.has(entry.coach.teamId!))
    .map(entry => [entry.coach.providerId, entry]));
  const sameSeason = Boolean(raw && raw.seasonId === scope.seasonId);
  const sourceRows = sameSeason ? raw!.rows : [];
  const rows = sourceRows.filter(row => current.has(row.coachProviderId)).map(row => {
    const entry = current.get(row.coachProviderId)!;
    return { ...row, coachName: entry.coach.displayName ?? entry.coach.name,
      clubName: clubs.get(entry.coach.teamId!)!.name };
  }).sort(compare).map((row, index) => ({ ...row, rank: index + 1 }));
  const currentProjection: CurrentCoachProjection = {
    version: 1, scope: { competitionId: scope.competitionId, seasonId: scope.seasonId,
      effectiveSeason: scope.effectiveSeason, clubs: scope.clubs.map(club => ({ providerTeamId: club.providerTeamId, name: club.name })) },
    sourceSnapshotId: raw?.snapshotId ?? null, catalogueRevision: catalogue.revision,
  };
  const currentRevision = JSON.stringify([scope.competitionId, scope.seasonId, catalogue.phase,
    catalogue.revision, [...current].map(([id, entry]) => [id, entry.coach.teamId, clubs.get(entry.coach.teamId!)!.name]).sort()]);
  return {
    phase: sameSeason ? "ranked" : "preseason", catalogue,
    snapshotId: sameSeason ? raw!.snapshotId : null, seasonId: scope.seasonId,
    scoringVersion: "coach_scoring_v2", generatedAt: sameSeason ? raw!.generatedAt : null,
    fixtureIds: sameSeason ? [...raw!.fixtureIds] : [], rows,
    seasonRows: sourceRows.map(row => ({ ...row, home: { ...row.home }, away: { ...row.away } })),
    currentProjection, currentRevision,
  };
}

/** Transport is checked by deriving every row again from the unmodified ledger.
 * A caller cannot restore an excluded coach or invent a current position. */
export function parseTouchlineCurrentCoachRanking(value: unknown, raw: TouchLineCoachRankingState | null): TouchLineCoachRankingState | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    const projection = input.currentProjection as CurrentCoachProjection | undefined;
    const catalogue = parseCoachCatalogueTransport(input.catalogue);
    if (!catalogue || !projection || projection.version !== 1
      || projection.sourceSnapshotId !== (raw?.snapshotId ?? null)) return null;
    const expected = projectTouchlineCurrentCoachRanking(raw, catalogue, projection.scope);
    return expected && JSON.stringify(expected) === JSON.stringify(input) ? expected : null;
  } catch { return null; }
}
