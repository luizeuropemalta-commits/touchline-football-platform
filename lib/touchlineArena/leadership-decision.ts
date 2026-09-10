/**
 * Canonical, pure leadership decision contract.
 *
 * It does not calculate a rank or pick a tiebreaker. A ranking publisher must
 * provide an explicit decision for one immutable ranking snapshot. Consumers
 * fail closed: only an exact `unique-leader` match may render a crown.
 */

export type TouchlineLeadershipSubjectType = "player" | "coach" | "clubOwner";

export type TouchlineLeadershipSubject = Readonly<{
  subjectType: TouchlineLeadershipSubjectType;
  subjectId: string;
}>;

export type TouchlineLeadershipScope = Readonly<{
  rankingId: string;
  snapshotId: string;
}>;

export type LeadershipDecision =
  | Readonly<{
    status: "unique-leader";
    scope: TouchlineLeadershipScope;
    leader: TouchlineLeadershipSubject;
  }>
  | Readonly<{
    status: "tied";
    scope: TouchlineLeadershipScope;
    contenders: readonly TouchlineLeadershipSubject[];
  }>
  | Readonly<{
    status: "unavailable";
    scope: TouchlineLeadershipScope;
    reason: string;
  }>
  | Readonly<{
    status: "withdrawn";
    scope: TouchlineLeadershipScope;
    subject: TouchlineLeadershipSubject;
  }>;

function requiredIdentifier(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be a non-empty identifier.`);
  return normalized;
}

function normalizeSubject(subject: TouchlineLeadershipSubject): TouchlineLeadershipSubject {
  return {
    subjectType: subject.subjectType,
    subjectId: requiredIdentifier(subject.subjectId, "subjectId"),
  };
}

function normalizeScope(scope: TouchlineLeadershipScope): TouchlineLeadershipScope {
  return {
    rankingId: requiredIdentifier(scope.rankingId, "rankingId"),
    snapshotId: requiredIdentifier(scope.snapshotId, "snapshotId"),
  };
}

/** Creates the only decision state which can ever authorize a crown. */
export function createUniqueLeadershipDecision(input: {
  subjectType: TouchlineLeadershipSubjectType;
  subjectId: string;
  scope: TouchlineLeadershipScope;
}): LeadershipDecision {
  return {
    status: "unique-leader",
    leader: normalizeSubject({ subjectType: input.subjectType, subjectId: input.subjectId }),
    scope: normalizeScope(input.scope),
  };
}

function sameSubject(first: TouchlineLeadershipSubject, second: TouchlineLeadershipSubject) {
  return first.subjectType === second.subjectType && first.subjectId === second.subjectId;
}

function sameScope(first: TouchlineLeadershipScope, second: TouchlineLeadershipScope) {
  return first.rankingId === second.rankingId && first.snapshotId === second.snapshotId;
}

/**
 * Returns true only for the unique leader of the exact decision scope.
 * All non-unique, absent, withdrawn, malformed, and mismatched states are
 * intentionally false so a consumer can safely render no crown.
 */
export function leadershipCrownEligibility(
  decision: LeadershipDecision | null | undefined,
  subject: TouchlineLeadershipSubject,
  requiredScope?: TouchlineLeadershipScope,
) {
  if (!decision || decision.status !== "unique-leader") return false;

  try {
    const normalizedSubject = normalizeSubject(subject);
    const normalizedDecisionScope = normalizeScope(decision.scope);
    const normalizedLeader = normalizeSubject(decision.leader);
    if (requiredScope && !sameScope(normalizedDecisionScope, normalizeScope(requiredScope))) return false;
    return sameSubject(normalizedLeader, normalizedSubject);
  } catch {
    return false;
  }
}
