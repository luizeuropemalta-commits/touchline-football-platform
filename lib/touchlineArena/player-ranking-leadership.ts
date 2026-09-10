import type {
  LeadershipDecision,
  TouchlineLeadershipScope,
  TouchlineLeadershipSubject,
} from "./leadership-decision.ts";

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
