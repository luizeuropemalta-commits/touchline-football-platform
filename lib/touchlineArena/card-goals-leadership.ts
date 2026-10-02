import { createUniqueLeadershipDecision, type LeadershipDecision } from "./leadership-decision.ts";

export type CardGoalsRow = Readonly<{ playerId: string; goals: number | null }>;
export type CardGoalsPublication = Readonly<{
  source: "published-card-goals-v1";
  snapshotId: string;
  rows: readonly CardGoalsRow[];
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CARD_GOALS_RANKING_ID = "touchline-player-goals";

/** All published cards participate, independently of rating/position. Unknown
 * goals stay unknown; neither absence nor an invalid number becomes zero. */
export function parseCardGoalsPublication(value: unknown, snapshotId: string): CardGoalsPublication | null {
  if (!value || typeof value !== "object" || !snapshotId.trim()) return null;
  const row = value as Partial<CardGoalsPublication>;
  if (row.source !== "published-card-goals-v1" || row.snapshotId !== snapshotId || !Array.isArray(row.rows)) return null;
  const ids = new Set<string>();
  const result: CardGoalsRow[] = [];
  for (const candidate of row.rows) {
    if (!candidate || typeof candidate.playerId !== "string" || !UUID.test(candidate.playerId)
      || (candidate.goals !== null && (!Number.isSafeInteger(candidate.goals) || candidate.goals < 0))) return null;
    const playerId = candidate.playerId.toLowerCase();
    if (ids.has(playerId)) return null;
    ids.add(playerId);
    result.push(Object.freeze({ playerId, goals: candidate.goals }));
  }
  return Object.freeze({ source: row.source, snapshotId, rows: Object.freeze(result.sort((a, b) => a.playerId.localeCompare(b.playerId))) });
}

export function cardGoalsLeadership(publication: CardGoalsPublication): LeadershipDecision {
  const scope = { rankingId: CARD_GOALS_RANKING_ID, snapshotId: publication.snapshotId };
  const valid = parseCardGoalsPublication(publication, publication.snapshotId);
  if (!valid) return { status: "unavailable", scope, reason: "invalid-card-goals" };
  const maximum = Math.max(0, ...valid.rows.map(row => row.goals ?? 0));
  if (maximum === 0) return { status: "unavailable", scope, reason: "no-positive-card-goals" };
  const contenders = valid.rows.filter(row => row.goals === maximum)
    .map(row => ({ subjectType: "player" as const, subjectId: row.playerId }));
  return contenders.length === 1
    ? createUniqueLeadershipDecision({ ...contenders[0]!, scope })
    : { status: "tied", scope, contenders };
}

export function cardGoalsLeaderIds(value: unknown, snapshotId: string): readonly string[] {
  const publication = parseCardGoalsPublication(value, snapshotId);
  if (!publication) return [];
  const decision = cardGoalsLeadership(publication);
  return decision.status === "unique-leader" ? [decision.leader.subjectId]
    : decision.status === "tied" ? decision.contenders.map(subject => subject.subjectId) : [];
}
