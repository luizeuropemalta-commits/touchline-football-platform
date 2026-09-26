import type { TouchLineCoachRankingState } from "./coach-ranking-server.ts";
import type { TouchlineCoachCompetitionSnapshot } from "./coach-scoring.ts";

/** The same canonical competition record for profile, gallery and expanded card. */
export function coachCompetitionFromRanking(
  ranking: TouchLineCoachRankingState,
  coachProviderId: string,
  seasonLabel = "",
): TouchlineCoachCompetitionSnapshot | null {
  if (ranking.phase !== "ranked" || !ranking.snapshotId || !ranking.seasonId || !ranking.scoringVersion) return null;
  const row = ranking.rows.find((candidate) => candidate.coachProviderId === coachProviderId);
  if (!row) return null;
  return {
    snapshotId: ranking.snapshotId,
    seasonId: ranking.seasonId,
    seasonLabel,
    rank: row.rank,
    scoringVersion: ranking.scoringVersion,
    home: row.home,
    away: row.away,
    totalTouchlinePoints: row.touchlinePoints,
  };
}
