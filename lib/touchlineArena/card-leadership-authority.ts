import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { TouchLineCoachRankingState } from "./coach-ranking-server";

export type TouchlineCardLeadershipAuthority = Readonly<{
  playerRanking: TouchlineActiveRankingState | null;
  coachRanking?: TouchLineCoachRankingState | null;
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

export function advancePlayerLeadershipRead(previous: PlayerLeadershipReadState, read: { state: TouchlineActiveRankingState; revision: number; requestEpoch: number; publicationDigest?: string } | null): PlayerLeadershipReadState {
  if (!read || read.revision <= previous.revision || read.requestEpoch <= previous.requestFloor) return previous;
  if (read.state.phase === "preseason") return { ...previous, current: read.state, revision: read.revision };
  if (read.publicationDigest && /^[0-9a-f]{32}$/.test(read.publicationDigest)) {
    // The active shared publication can legitimately reactivate a deduplicated
    // older snapshot after a VAR/reversal. Creation time is not activation order.
    const seed = previous.watermark;
    if (seed?.phase === "ranked" && (read.state.seasonId !== seed.seasonId || read.state.leagueKey !== seed.leagueKey)) {
      return { ...previous, revision: read.revision };
    }
    return { ...previous, current: read.state, watermark: read.state, revision: read.revision };
  }
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
  const verifiedCoaches = coaches?.phase === "ranked" && coaches.snapshotId && coaches.seasonId
    && coaches.scoringVersion === "coach_scoring_v2"
    && coaches.rows.every((row, index) => row.rank === index + 1 && row.coachProviderId && Number.isFinite(row.touchlinePoints))
    && new Set(coaches.rows.map(row => row.coachProviderId)).size === coaches.rows.length ? coaches : null;
  const leaders = verifiedCoaches?.rows.filter((row) => row.rank === 1) ?? [];
  const coachLeader = leaders.length === 1 && coaches?.snapshotId && coaches.seasonId
    && coaches.scoringVersion === "coach_scoring_v2" && leaders[0]!.coachProviderId
    ? { snapshotId: coaches.snapshotId, seasonId: coaches.seasonId, coachProviderId: leaders[0]!.coachProviderId }
    : null;
  return { playerRanking, coachLeader, coachRanking: verifiedCoaches };
}

export type CardLeadershipReadState = Readonly<{
  current: TouchlineCardLeadershipAuthority;
  seasonId: string | null;
  leagueKey: string | null;
  revision: number;
  requestFloor: number;
}>;

export function resetCardLeadershipSeed(current: TouchlineCardLeadershipAuthority, revision: number, requestFloor: number): CardLeadershipReadState {
  return { current, revision, requestFloor,
    seasonId: current.playerRanking?.seasonId ?? current.coachRanking?.seasonId ?? current.coachLeader?.seasonId ?? null,
    leagueKey: current.playerRanking?.leagueKey ?? null };
}

/** Accept player and coach facts together, in activation order, never one half of a publication. */
export function advanceCardLeadershipRead(previous: CardLeadershipReadState, read: {
  state: TouchlineActiveRankingState; coachRanking: TouchLineCoachRankingState | null;
  revision: number; requestEpoch: number; publicationDigest: string;
} | null): CardLeadershipReadState {
  if (!read || read.revision <= previous.revision || read.requestEpoch <= previous.requestFloor
    || !/^[0-9a-f]{32}$/.test(read.publicationDigest)) return previous;
  const player = read.state.phase === "ranked" ? read.state : null;
  const coach = read.coachRanking;
  const seasonId = player?.seasonId ?? coach?.seasonId ?? null;
  if ((coach && (coach.phase !== "ranked" || !coach.snapshotId || !coach.seasonId || coach.scoringVersion !== "coach_scoring_v2"))
    || (player && coach && player.seasonId !== coach.seasonId)
    || (seasonId && previous.seasonId && seasonId !== previous.seasonId)
    || (player && previous.leagueKey && player.leagueKey !== previous.leagueKey)) return { ...previous, revision: read.revision };
  return { ...previous, current: buildTouchlineCardLeadershipValue(read.state, coach), revision: read.revision,
    seasonId: seasonId ?? previous.seasonId, leagueKey: player?.leagueKey ?? previous.leagueKey };
}

/** Public season points may change with a result/VAR; an explicit settled value never changes. */
export function resolveCoachCardPoints(input: {
  authority: TouchlineCardLeadershipAuthority | null;
  coachProviderId?: string | null;
  editable?: boolean;
  liveRankingPoints?: boolean;
  publishedTouchlinePoints?: number | null;
  slotStatus: string;
  slotPoints?: number | null;
}): number | null {
  if (input.publishedTouchlinePoints != null) return Number.isFinite(input.publishedTouchlinePoints) ? input.publishedTouchlinePoints : null;
  if (input.liveRankingPoints && !input.editable && input.authority?.coachRanking !== undefined) {
    const ranking = input.authority.coachRanking;
    if (!ranking || ranking.phase !== "ranked" || !ranking.snapshotId || !ranking.seasonId
      || ranking.scoringVersion !== "coach_scoring_v2" || !input.coachProviderId) return null;
    const rows = ranking.rows.filter(row => row.coachProviderId === input.coachProviderId);
    return rows.length === 1 && Number.isFinite(rows[0]!.touchlinePoints) ? rows[0]!.touchlinePoints : null;
  }
  return input.slotStatus === "audited" && Number.isFinite(input.slotPoints) ? input.slotPoints! : null;
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
