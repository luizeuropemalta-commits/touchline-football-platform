import type {
  TouchlineAuditedRankingSnapshot,
  TouchlineRankingAuditReport,
} from "./card-ranking-pipeline.ts";
import type { TouchlineSelection } from "./touchline-selection.ts";

export type TouchlineRankingPersistenceRecord = {
  snapshotId: string;
  leagueKey: string;
  seasonId: string;
  scoringVersion: "player_scoring_v1" | "player_scoring_v2";
  coverageStatus: "complete" | "complete_for_scoring";
  fixtureIds: readonly string[];
  expectedFixtureIds: readonly string[];
  totalScorePoints: number;
  roundId: string;
  source: "sportmonks-audited";
  status: "audited";
  generatedAt: string;
  auditedAt: string;
  priceTableVersion: string;
  checksum: string;
  expectedPlayerCount: number;
  actualPlayerCount: number;
  rankingPayload: TouchlineAuditedRankingSnapshot;
  selectionVersion: string;
  selectionPayload: TouchlineSelection;
  auditReport: Omit<TouchlineRankingAuditReport, "snapshot">;
};

export function buildTouchlineRankingPersistenceRecord(input: {
  leagueKey: string;
  expectedPlayerCount: number;
  audit: TouchlineRankingAuditReport;
  selection: TouchlineSelection;
}): TouchlineRankingPersistenceRecord {
  if (!input.audit.passed || !input.audit.snapshot || !input.audit.checksum) {
    throw new Error("A failed ranking audit cannot be persisted for publication.");
  }
  if (!input.selection.complete || input.selection.players.length !== 11) {
    throw new Error("The TouchLine Selection must contain all 11 positions before publication.");
  }
  if (input.selection.sourceSnapshotId !== input.audit.snapshot.snapshotId) {
    throw new Error("Ranking and TouchLine Selection must come from the same snapshot.");
  }
  if (!input.leagueKey.trim()) throw new Error("leagueKey is required.");
  if (input.expectedPlayerCount !== input.audit.snapshot.players.length) {
    throw new Error("The persisted player count must match the audited snapshot.");
  }

  const { snapshot: _snapshot, ...auditReport } = input.audit;

  return {
    snapshotId: input.audit.snapshot.snapshotId,
    leagueKey: input.leagueKey,
    seasonId: input.audit.snapshot.seasonId,
    scoringVersion: input.audit.snapshot.scoringVersion,
    coverageStatus: input.audit.snapshot.coverageStatus,
    fixtureIds: input.audit.snapshot.fixtureIds,
    expectedFixtureIds: input.audit.snapshot.expectedFixtureIds,
    totalScorePoints: input.audit.snapshot.totalScorePoints,
    roundId: input.audit.snapshot.roundId,
    source: "sportmonks-audited",
    status: "audited",
    generatedAt: input.audit.snapshot.generatedAt,
    auditedAt: input.audit.snapshot.auditedAt,
    priceTableVersion: input.audit.snapshot.priceTableVersion,
    checksum: input.audit.checksum,
    expectedPlayerCount: input.expectedPlayerCount,
    actualPlayerCount: input.audit.snapshot.players.length,
    rankingPayload: input.audit.snapshot,
    selectionVersion: input.selection.version,
    selectionPayload: input.selection,
    auditReport,
  };
}
