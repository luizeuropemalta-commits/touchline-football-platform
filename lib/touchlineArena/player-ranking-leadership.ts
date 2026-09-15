import type {
  LeadershipDecision,
  TouchlineLeadershipScope,
  TouchlineLeadershipSubject,
} from "./leadership-decision.ts";
import { compareTouchlineRankingPlayers } from "./card-ranking.ts";

/**
 * The one overall Player Card ranking scope. Positional rank #1 does not
 * imply overall leadership and therefore cannot produce a crown by itself.
 */
export const TOUCHLINE_PLAYER_OVERALL_RANKING_ID = "touchline-player-overall";

function normalizedIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlayerSubject(value: unknown): value is TouchlineLeadershipSubject {
  if (!value || typeof value !== "object") return false;
  const subject = value as Partial<TouchlineLeadershipSubject>;
  return subject.subjectType === "player" && Boolean(normalizedIdentifier(subject.subjectId));
}

export function touchlinePlayerLeadershipScope(snapshotId: string): TouchlineLeadershipScope {
  const normalizedSnapshotId = normalizedIdentifier(snapshotId);
  if (!normalizedSnapshotId) throw new Error("snapshotId is required for player leadership.");
  return { rankingId: TOUCHLINE_PLAYER_OVERALL_RANKING_ID, snapshotId: normalizedSnapshotId };
}

export function unavailableTouchlinePlayerLeadership(snapshotId: string): LeadershipDecision {
  return {
    status: "unavailable",
    scope: touchlinePlayerLeadershipScope(snapshotId),
    reason: "leader-not-explicitly-published",
  };
}

const CANONICAL_PLAYER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Publication-side classification for the immutable decision writer. Public
 * consumers still read only the persisted decision, never this calculation.
 * This validates the publication's strict JSONB input contract: a missing,
 * non-array, empty, or malformed `players` value publishes `unavailable`.
 */
export function classifyTouchlinePlayerLeadershipPublication(input: {
  snapshotId: string;
  rankingPayload: unknown;
}): LeadershipDecision {
  const scope = touchlinePlayerLeadershipScope(input.snapshotId);
  const payload = input.rankingPayload && typeof input.rankingPayload === "object"
    ? input.rankingPayload as { players?: unknown }
    : null;
  const rawPlayers = Array.isArray(payload?.players) ? payload.players : [];
  const candidates = rawPlayers.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const player = value as { playerId?: unknown; totalRating?: unknown; providerPlayerId?: unknown; minutesPlayed?: unknown; appearances?: unknown };
    const playerId = normalizedIdentifier(player.playerId);
    return CANONICAL_PLAYER_UUID.test(playerId) && typeof player.totalRating === "number" && Number.isFinite(player.totalRating)
      ? [{ playerId, totalRating: player.totalRating,
        providerPlayerId: typeof player.providerPlayerId === "number" || typeof player.providerPlayerId === "string" ? player.providerPlayerId : null,
        minutesPlayed: typeof player.minutesPlayed === "number" && Number.isFinite(player.minutesPlayed) && player.minutesPlayed >= 0 ? player.minutesPlayed : null,
        appearances: typeof player.appearances === "number" && Number.isInteger(player.appearances) && player.appearances >= 0 ? player.appearances : null,
      }]
      : [];
  });
  if (!candidates.length) return unavailableTouchlinePlayerLeadership(input.snapshotId);

  const maxRating = Math.max(...candidates.map((candidate) => candidate.totalRating));
  const ratingLeaders = candidates.filter((candidate) => candidate.totalRating === maxRating);
  // Legacy publications without tie evidence remain tied. Never fetch newer
  // mutable season statistics to break a tie in this immutable snapshot.
  const completeTiebreak = ratingLeaders.every(player => String(player.providerPlayerId ?? "").trim() && player.minutesPlayed !== null && player.appearances !== null);
  const ordered = completeTiebreak ? [...ratingLeaders].sort(compareTouchlineRankingPlayers) : ratingLeaders;
  const leaders = completeTiebreak ? ordered.filter(player => compareTouchlineRankingPlayers(player, ordered[0]!) === 0) : ordered;
  if (leaders.length === 1) {
    return { status: "unique-leader", scope, leader: { subjectType: "player", subjectId: leaders[0]!.playerId } };
  }
  return {
    status: "tied",
    scope,
    contenders: leaders.map((leader) => ({ subjectType: "player", subjectId: leader.playerId })),
  };
}

function hasExactScope(value: unknown, scope: TouchlineLeadershipScope) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TouchlineLeadershipScope>;
  return candidate.rankingId === scope.rankingId && candidate.snapshotId === scope.snapshotId;
}

/**
 * Decodes one explicit, immutable player-leadership publication. The source
 * ranking continues to render when this decorative metadata is absent or
 * malformed, but no crown may be granted in that case.
 */
export function parsePublishedTouchlinePlayerLeadership(input: {
  value: unknown;
  snapshotId: string;
  playerIds: readonly string[];
}): LeadershipDecision | null {
  if (!input.value || typeof input.value !== "object") return null;
  const decision = input.value as Partial<LeadershipDecision>;
  const scope = touchlinePlayerLeadershipScope(input.snapshotId);
  if (!hasExactScope(decision.scope, scope)) return null;

  const playerIds = new Set(input.playerIds.map(normalizedIdentifier).filter(Boolean));
  if (!playerIds.size) return null;

  if (decision.status === "unique-leader") {
    if (!isPlayerSubject(decision.leader) || !playerIds.has(decision.leader.subjectId.trim())) return null;
    return {
      status: "unique-leader",
      scope,
      leader: { subjectType: "player", subjectId: decision.leader.subjectId.trim() },
    };
  }

  if (decision.status === "tied") {
    if (!Array.isArray(decision.contenders) || decision.contenders.length < 2) return null;
    const contenders = decision.contenders
      .filter(isPlayerSubject)
      .map((subject) => ({ subjectType: "player" as const, subjectId: subject.subjectId.trim() }));
    if (contenders.length !== decision.contenders.length || new Set(contenders.map((subject) => subject.subjectId)).size !== contenders.length) return null;
    if (!contenders.every((subject) => playerIds.has(subject.subjectId))) return null;
    return { status: "tied", scope, contenders };
  }

  if (decision.status === "unavailable") {
    const reason = normalizedIdentifier(decision.reason);
    return reason ? { status: "unavailable", scope, reason } : null;
  }

  if (decision.status === "withdrawn") {
    if (!isPlayerSubject(decision.subject) || !playerIds.has(decision.subject.subjectId.trim())) return null;
    return {
      status: "withdrawn",
      scope,
      subject: { subjectType: "player", subjectId: decision.subject.subjectId.trim() },
    };
  }

  return null;
}

/** Decodes the immutable server-side decision row used by public read models. */
export function parsePersistedTouchlinePlayerLeadership(input: {
  value: unknown;
  snapshotId: string;
  playerIds: readonly string[];
}): LeadershipDecision | null {
  if (!input.value || typeof input.value !== "object") return null;
  const row = input.value as Record<string, unknown>;
  const scope = touchlinePlayerLeadershipScope(input.snapshotId);
  if (row.ranking_id !== scope.rankingId) return null;
  if (row.status === "unique-leader") {
    return parsePublishedTouchlinePlayerLeadership({
      snapshotId: input.snapshotId,
      playerIds: input.playerIds,
      value: { status: "unique-leader", scope, leader: { subjectType: "player", subjectId: row.leader_player_id } },
    });
  }
  if (row.status === "tied") {
    return parsePublishedTouchlinePlayerLeadership({
      snapshotId: input.snapshotId,
      playerIds: input.playerIds,
      value: { status: "tied", scope, contenders: Array.isArray(row.contender_player_ids) ? row.contender_player_ids.map((subjectId) => ({ subjectType: "player", subjectId })) : null },
    });
  }
  return row.status === "unavailable" ? unavailableTouchlinePlayerLeadership(input.snapshotId) : null;
}
