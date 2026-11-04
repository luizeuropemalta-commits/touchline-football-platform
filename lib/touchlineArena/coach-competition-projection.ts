import type { TouchLineCoachRankingState } from "./coach-ranking-server.ts";
import type { TouchlineCoachCompetitionSnapshot } from "./coach-scoring.ts";

/** Season facts survive a departure; only a current participant has a rank. */
export function coachCompetitionFromRanking(
  ranking: TouchLineCoachRankingState,
  coachProviderId: string,
  seasonLabel = "",
): TouchlineCoachCompetitionSnapshot | null {
  if (!ranking.seasonId || !ranking.scoringVersion) return null;
  const projection = ranking.currentProjection;
  if (ranking.phase === "preseason" && projection?.scope.seasonId === ranking.seasonId) {
    const current = ranking.catalogue?.current.find(entry => entry.coach.providerId === coachProviderId
      && projection.scope.clubs.some(club => club.providerTeamId === entry.coach.teamId));
    if (!current) return null;
    return { snapshotId: null, seasonId: ranking.seasonId, seasonLabel: projection.scope.effectiveSeason,
      rank: null, scoringVersion: ranking.scoringVersion,
      home: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 },
      away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 }, totalTouchlinePoints: 0 };
  }
  if (ranking.phase !== "ranked" || !ranking.snapshotId) return null;
  const currentRow = ranking.rows.find(candidate => candidate.coachProviderId === coachProviderId);
  const row = currentRow ?? (projection ? ranking.seasonRows?.find(candidate => candidate.coachProviderId === coachProviderId) : null);
  if (!row) return null;
  return { snapshotId: ranking.snapshotId, seasonId: ranking.seasonId,
    seasonLabel: projection?.scope.effectiveSeason ?? seasonLabel,
    rank: currentRow?.rank ?? null, scoringVersion: ranking.scoringVersion,
    home: row.home, away: row.away, totalTouchlinePoints: row.touchlinePoints };
}
