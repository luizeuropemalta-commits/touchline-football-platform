import { compareTouchlineRankingPlayers } from './card-ranking.ts';
import { parseTouchlineActiveRankingState, parseTouchlineRankingPresentation, TOUCHLINE_PRESEASON_RANKING_STATE,
  type TouchlineActiveRankingState } from './card-ranking-live.ts';
import { parsePublishedTouchlinePlayerLeadership } from './player-ranking-leadership.ts';

export type TouchlineCurrentLeagueScope = Readonly<{
  competitionId: string; seasonId: string; providerSeasonId: string; effectiveSeason: string;
}>;
export type TouchlineCurrentPlayerAdmission = Readonly<{
  playerId: string; providerPlayerId: string; clubId: string; membershipId: string | null;
  status: 'eligible' | 'outside-league' | 'inactive';
}>;
export type TouchlineCurrentPlayerRanking = Readonly<{
  version: 1; phase: 'ready' | 'preseason' | 'unavailable'; reason: string | null;
  sourceSnapshotId: string | null; sourcePlayerCount: number;
  scope: TouchlineCurrentLeagueScope | null; revision: string | null;
  admissions: readonly TouchlineCurrentPlayerAdmission[];
  state: TouchlineActiveRankingState | null;
}>;
const uuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36
  && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
const provider = (value: unknown): value is string => typeof value === 'string' && !/\s/.test(value) && /^[1-9][0-9]{0,19}$/.test(value);
export function validCurrentLeagueScope(scope: TouchlineCurrentLeagueScope | null): scope is TouchlineCurrentLeagueScope {
  return !!scope && typeof scope === 'object' && typeof scope.effectiveSeason === 'string' && uuid(scope.competitionId) && uuid(scope.seasonId) && provider(scope.providerSeasonId)
    && scope.effectiveSeason.length === 7 && /^\d{4}-\d{2}$/.test(scope.effectiveSeason);
}
export function currentRankingCandidateIds(raw: TouchlineActiveRankingState | null): string[] {
  return [...new Set([...(raw?.players.map(row => row.playerId) ?? []), ...(raw?.cardGoals?.rows.map(row => row.playerId) ?? [])])].sort();
}
export function unavailableCurrentPlayerRanking(raw: TouchlineActiveRankingState | null, reason: string,
  scope: TouchlineCurrentLeagueScope | null = null): TouchlineCurrentPlayerRanking {
  return { version: 1, phase: 'unavailable', reason, sourceSnapshotId: raw?.snapshotId ?? null,
    sourcePlayerCount: raw?.players.length ?? 0, scope, revision: null, admissions: [], state: null };
}

/** Read-time view only. UUID+competition+season owns totals; current club only
 * admits/excludes a row. No season writer, stored publication or price changes. */
export function projectTouchlineCurrentPlayerRanking(input: {
  raw: TouchlineActiveRankingState | null; scope: TouchlineCurrentLeagueScope | null;
  admissions: readonly TouchlineCurrentPlayerAdmission[] | null; revision: string;
}): TouchlineCurrentPlayerRanking {
  const raw = input.raw === null ? null : parseTouchlineActiveRankingState(input.raw);
  const scope = input.scope;
  if (input.raw !== null && (!raw || raw.phase === 'ranked' && raw.scoringVersion !== 'player_scoring_v4') || !validCurrentLeagueScope(scope) || typeof input.revision !== 'string' || input.revision.length !== 64 || !/^[0-9a-f]{64}$/.test(input.revision)) {
    return unavailableCurrentPlayerRanking(raw, 'invalid-source-or-current-scope');
  }
  const base = { version: 1 as const, sourceSnapshotId: raw?.snapshotId ?? null, sourcePlayerCount: raw?.players.length ?? 0,
    scope, revision: input.revision };
  const projection = { version: 1 as const, revision: input.revision, competitionId: scope.competitionId,
    currentSeasonId: scope.seasonId, sourceSnapshotId: raw?.snapshotId ?? null,
    sourcePlayerCount: raw?.players.length ?? 0, eligiblePlayerCount: 0, effectiveSeason: scope.effectiveSeason, bindings: [] as Array<{playerId:string;clubId:string;membershipId:string}> };
  // A new season starts without inherited totals. The old source remains in
  // the enclosing historical publication; an empty view is not a DB reset.
  if (!raw || raw.phase === 'preseason' || raw.seasonId !== scope.seasonId) {
    return { ...base, phase: 'preseason', reason: null, admissions: [],
      state: { ...TOUCHLINE_PRESEASON_RANKING_STATE, seasonId: scope.seasonId, currentProjection: projection } };
  }
  const expected = currentRankingCandidateIds(raw);
  const expectedIds = new Set(expected);
  const admissions = input.admissions;
  if (!Array.isArray(admissions) || admissions.length !== expected.length
    || admissions.some(row => !row || typeof row !== 'object')
    || new Set(admissions.map(row => row.playerId)).size !== expected.length
    || new Set(admissions.map(row => row.providerPlayerId)).size !== expected.length
    || admissions.some(row => !uuid(row.playerId) || !expectedIds.has(row.playerId)
      || !provider(row.providerPlayerId) || !uuid(row.clubId)
      || !['eligible', 'outside-league', 'inactive'].includes(row.status)
      || (row.status === 'eligible' ? !uuid(row.membershipId) : row.membershipId !== null && !uuid(row.membershipId)))
    ) {
    return unavailableCurrentPlayerRanking(raw, 'current-admissions-incomplete', scope);
  }
  const byId = new Map(admissions.map(row => [row.playerId,row]));
  if (raw.players.some(row => String(row.providerPlayerId) !== byId.get(row.playerId)?.providerPlayerId)) {
    return unavailableCurrentPlayerRanking(raw, 'current-admission-provider-mismatch', scope);
  }
  const eligible = new Set(admissions.filter(row => row.status === 'eligible').map(row => row.playerId));
  const sorted = raw.players.filter(row => eligible.has(row.playerId)).sort(compareTouchlineRankingPlayers);
  const groups = new Map<string, number>();
  for (const row of sorted) groups.set(row.positionGroup, (groups.get(row.positionGroup) ?? 0) + 1);
  const positions = new Map<string, number>();
  let rank = 0;
  const players = sorted.map(row => {
    const positionRank = (positions.get(row.positionGroup) ?? 0) + 1;
    positions.set(row.positionGroup, positionRank);
    return { ...row, positionRank, groupSize: groups.get(row.positionGroup)!,
      officialRank: row.totalRating === null ? null : ++rank };
  });
  const state: TouchlineActiveRankingState = { ...raw, players,
    seasonTotals: raw.players.map(row => ({playerId:row.playerId,providerPlayerId:row.providerPlayerId ?? null,totalRating:row.totalRating})),
    currentProjection: { ...projection, eligiblePlayerCount: players.length, bindings: admissions.filter(row => row.status === 'eligible').map(row => ({playerId:row.playerId,clubId:row.clubId,membershipId:row.membershipId!})).sort((a,b)=>a.playerId.localeCompare(b.playerId)) },
    // A persisted crown is not silently reassigned to a runner-up.
    leadershipDecision: parsePublishedTouchlinePlayerLeadership({ value: raw.leadershipDecision,
      snapshotId: raw.snapshotId!, playerIds: players.map(row => row.playerId) }),
    cardGoals: raw.cardGoals ? { ...raw.cardGoals, rows: raw.cardGoals.rows.filter(row => eligible.has(row.playerId)) } : null,
  };
  const validated = parseTouchlineRankingPresentation(state);
  return validated ? { ...base, phase: 'ready', reason: null, admissions: [...admissions].sort((a,b) => a.playerId.localeCompare(b.playerId)), state: validated }
    : unavailableCurrentPlayerRanking(raw, 'invalid-current-projection', scope);
}

/** Recompute every derived row/rank/goal from the separate immutable source.
 * No manually supplied totals, partial admissions or tier changes are trusted. */
export function parseTouchlineCurrentPlayerRanking(value: unknown, raw: TouchlineActiveRankingState | null): TouchlineCurrentPlayerRanking | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as TouchlineCurrentPlayerRanking;
  if (candidate.version !== 1 || candidate.sourceSnapshotId !== (raw?.snapshotId ?? null)
    || candidate.sourcePlayerCount !== (raw?.players.length ?? 0)) return null;
  if (candidate.phase === 'unavailable') {
    if (typeof candidate.reason !== 'string' || !candidate.reason || candidate.state !== null
      || candidate.revision !== null || !Array.isArray(candidate.admissions) || candidate.admissions.length
      || candidate.scope !== null && !validCurrentLeagueScope(candidate.scope)) return null;
    return unavailableCurrentPlayerRanking(raw, candidate.reason, candidate.scope);
  }
  const projected = projectTouchlineCurrentPlayerRanking({ raw, scope: candidate.scope,
    admissions: candidate.admissions, revision: candidate.revision ?? '' });
  return JSON.stringify(candidate) === JSON.stringify(projected) ? projected : null;
}
