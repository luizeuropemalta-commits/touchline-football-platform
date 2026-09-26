import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { TouchLineCoachRankingState } from "./coach-ranking-server";

export type TouchlineCardLeadershipAuthority = Readonly<{
  playerRanking: TouchlineActiveRankingState | null;
  coachLeader: Readonly<{ snapshotId: string; seasonId: string; coachProviderId: string }> | null;
}>;

export const EMPTY_CARD_LEADERSHIP_AUTHORITY: TouchlineCardLeadershipAuthority = Object.freeze({
  playerRanking: null, coachLeader: null,
});

/** Existing singleton feed may advance a seed, but never roll it back. */
export function selectPlayerLeadershipPublication(seed: TouchlineActiveRankingState | null, live: TouchlineActiveRankingState | null) {
  if (!seed || seed.phase !== "ranked" || !seed.snapshotId || !seed.seasonId) return seed;
  if (!live || live.phase !== "ranked" || !live.snapshotId || live.seasonId !== seed.seasonId || live.leagueKey !== seed.leagueKey) return seed;
  const seedTime = Date.parse(seed.publishedAt ?? "");
  const liveTime = Date.parse(live.publishedAt ?? "");
  if (!Number.isFinite(seedTime) || !Number.isFinite(liveTime) || liveTime < seedTime) return seed;
  // Equal timestamps are not permission to replace a different publication.
  if (liveTime === seedTime && live.snapshotId !== seed.snapshotId) return seed;
  return live;
}

export type PlayerLeadershipReadState = Readonly<{
  current: TouchlineActiveRankingState | null;
  watermark: TouchlineActiveRankingState | null;
  revision: number;
  requestFloor: number;
}>;

export function resetPlayerLeadershipSeed(seed: TouchlineActiveRankingState | null, revision: number, requestFloor: number): PlayerLeadershipReadState {
  return { current: seed, watermark: seed, revision, requestFloor };
}

export function advancePlayerLeadershipRead(previous: PlayerLeadershipReadState, read: { state: TouchlineActiveRankingState; revision: number; requestEpoch: number } | null): PlayerLeadershipReadState {
  if (!read || read.revision <= previous.revision || read.requestEpoch <= previous.requestFloor) return previous;
  if (read.state.phase === "preseason") return { ...previous, current: read.state, revision: read.revision };
  const selected = previous.watermark?.phase === "ranked"
    ? selectPlayerLeadershipPublication(previous.watermark, read.state)
    : read.state;
  if (selected !== read.state) return { ...previous, revision: read.revision };
  return { ...previous, current: selected, watermark: selected, revision: read.revision };
}

export function buildTouchlineCardLeadershipValue(
  playerRanking: TouchlineActiveRankingState | null,
  coaches: TouchLineCoachRankingState | null,
): TouchlineCardLeadershipAuthority {
  const leaders = coaches?.phase === "ranked" ? coaches.rows.filter((row) => row.rank === 1) : [];
  const coachLeader = leaders.length === 1 && coaches?.snapshotId && coaches.seasonId
    && coaches.scoringVersion === "coach_scoring_v2" && leaders[0]!.coachProviderId
    ? { snapshotId: coaches.snapshotId, seasonId: coaches.seasonId, coachProviderId: leaders[0]!.coachProviderId }
    : null;
  return { playerRanking, coachLeader };
}

export function allowsInheritedCardLeadership(pathname: string | null) {
  if (!pathname) return false;
  return !["/admin", "/visual-qa", "/audit", "/audit-index", "/preview"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function inheritedCoachCrown(input: {
  authority: TouchlineCardLeadershipAuthority | null;
  coachProviderId?: string | null;
  explicit?: boolean;
  editable?: boolean;
  publishedTouchlinePoints?: number | null;
}) {
  if (input.editable) return false;
  if (input.explicit !== undefined) return input.explicit;
  // Frozen points are not evidence of an award from the current publication.
  if (input.publishedTouchlinePoints != null) return false;
  const leader = input.authority?.coachLeader;
  return Boolean(leader?.snapshotId && leader.seasonId && input.coachProviderId
    && leader.coachProviderId === input.coachProviderId);
}
