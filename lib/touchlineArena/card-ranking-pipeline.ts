import {
  TOUCHLINE_POSITION_RANKING_GROUPS,
  buildTouchlineRankingSnapshot,
  type TouchlineRankingPlayerInput,
  type TouchlineRankingSnapshot,
} from "./card-ranking.ts";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  touchlineArenaTierForKey,
} from "./card-rules.ts";

export type TouchlineSportmonksRankingPlayer = TouchlineRankingPlayerInput & {
  provider: "sportmonks";
  providerPlayerId: string | number;
  verified: true;
  sourceFixtureIds: readonly string[];
};

export type TouchlineRankingDraft = {
  seasonId: string;
  scoringVersion: "player_scoring_v1" | "player_scoring_v2" | "player_scoring_v3";
  coverageStatus: "complete" | "complete_for_scoring";
  fixtureIds: readonly string[];
  expectedFixtureIds: readonly string[];
  totalScorePoints: number;
  receivedAt: string;
  expectedPlayerCount: number;
  priceTableVersion: string;
  rows: readonly TouchlineSportmonksRankingPlayer[];
  snapshot: TouchlineRankingSnapshot;
};

export type TouchlineRankingAuditIssue = {
  code: string;
  message: string;
  playerId?: string;
};

export type TouchlineRankingAuditCheck = {
  key: string;
  label: string;
  passed: boolean;
};

export type TouchlineAuditedRankingSnapshot = TouchlineRankingSnapshot & {
  status: "audited";
  source: "sportmonks-audited";
  seasonId: string;
  scoringVersion: "player_scoring_v1" | "player_scoring_v2" | "player_scoring_v3";
  coverageStatus: "complete" | "complete_for_scoring";
  fixtureIds: readonly string[];
  expectedFixtureIds: readonly string[];
  totalScorePoints: number;
  auditedAt: string;
  priceTableVersion: string;
  checksum: string;
};

export type TouchlinePublishedRankingSnapshot = Omit<TouchlineAuditedRankingSnapshot, "status"> & {
  status: "published";
  publishedAt: string;
};

export type TouchlineRankingAuditReport = {
  auditId: string;
  snapshotId: string;
  auditedAt: string;
  passed: boolean;
  checks: readonly TouchlineRankingAuditCheck[];
  issues: readonly TouchlineRankingAuditIssue[];
  checksum?: string;
  snapshot?: TouchlineAuditedRankingSnapshot;
};

function validIsoDate(value: string) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function checksumFor(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function touchlineRankingSnapshotChecksum(input: {
  seasonId: string;
  priceTableVersion: string;
  snapshot: TouchlineRankingSnapshot;
  scoringVersion?: "player_scoring_v1" | "player_scoring_v2" | "player_scoring_v3";
  coverageStatus?: "complete" | "complete_for_scoring";
  fixtureIds?: readonly string[];
  expectedFixtureIds?: readonly string[];
  totalScorePoints?: number;
}) {
  const canonicalRows = [...input.snapshot.players]
    .sort((first, second) => first.playerId.localeCompare(second.playerId, "en"))
    .map((player) => ({
      playerId: player.playerId,
      providerPlayerId: String(player.providerPlayerId ?? ""),
      positionGroup: player.positionGroup,
      positionRank: player.positionRank,
      points: player.touchlinePoints,
      roundPoints: player.roundPoints ?? 0,
      totalRating: player.totalRating ?? null,
      minutes: player.minutesPlayed ?? 0,
      appearances: player.appearances ?? 0,
      tierKey: player.tierKey,
      priceTc: player.priceTc,
    }));

  return checksumFor(JSON.stringify({
    snapshotId: input.snapshot.snapshotId,
    roundId: input.snapshot.roundId,
    seasonId: input.seasonId,
    scoringVersion: input.scoringVersion ?? "player_scoring_v1",
    coverageStatus: input.coverageStatus ?? "complete",
    fixtureIds: [...(input.fixtureIds ?? [])].sort(),
    expectedFixtureIds: [...(input.expectedFixtureIds ?? input.fixtureIds ?? [])].sort(),
    totalScorePoints: input.totalScorePoints ?? input.snapshot.players.reduce((total, player) => total + player.touchlinePoints, 0),
    generatedAt: input.snapshot.generatedAt,
    priceTableVersion: input.priceTableVersion,
    rows: canonicalRows,
  }));
}

export function buildSportmonksRankingDraft(input: {
  snapshotId: string;
  roundId: string;
  seasonId: string;
  receivedAt: string;
  expectedPlayerCount: number;
  priceTableVersion?: string;
  scoringVersion?: "player_scoring_v1" | "player_scoring_v2" | "player_scoring_v3";
  coverageStatus?: "complete" | "complete_for_scoring";
  fixtureIds?: readonly string[];
  expectedFixtureIds?: readonly string[];
  totalScorePoints?: number;
  players: readonly TouchlineSportmonksRankingPlayer[];
}): TouchlineRankingDraft {
  const fixtureIds = [...new Set(input.fixtureIds ?? input.players.flatMap((player) => player.sourceFixtureIds))].sort();
  return {
    seasonId: input.seasonId,
    scoringVersion: input.scoringVersion ?? "player_scoring_v1",
    coverageStatus: input.coverageStatus ?? "complete",
    fixtureIds,
    expectedFixtureIds: [...new Set(input.expectedFixtureIds ?? fixtureIds)].sort(),
    totalScorePoints: input.totalScorePoints ?? input.players.reduce((total, player) => total + player.touchlinePoints, 0),
    receivedAt: input.receivedAt,
    expectedPlayerCount: input.expectedPlayerCount,
    priceTableVersion: input.priceTableVersion ?? TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    rows: input.players,
    snapshot: buildTouchlineRankingSnapshot({
      snapshotId: input.snapshotId,
      roundId: input.roundId,
      generatedAt: input.receivedAt,
      status: "draft",
      source: "sportmonks",
      players: input.players,
    }),
  };
}

export function auditTouchlineRankingDraft(
  draft: TouchlineRankingDraft,
  auditedAt: string,
): TouchlineRankingAuditReport {
  const issues: TouchlineRankingAuditIssue[] = [];
  const duplicateProviderIds = new Set<string>();
  const seenProviderIds = new Set<string>();

  for (const row of draft.rows) {
    const providerId = String(row.providerPlayerId).trim();
    if (!providerId) issues.push({ code: "provider-player-id-missing", message: "SportMonks player ID is missing.", playerId: row.playerId });
    if (seenProviderIds.has(providerId)) duplicateProviderIds.add(providerId);
    seenProviderIds.add(providerId);
    if (row.provider !== "sportmonks" || row.verified !== true) {
      issues.push({ code: "provider-row-unverified", message: "Player row is not verified by SportMonks.", playerId: row.playerId });
    }
    if (!row.sourceFixtureIds.length) {
      issues.push({ code: "source-fixture-missing", message: "Player row has no source fixture trace.", playerId: row.playerId });
    }
    if (!Number.isFinite(row.touchlinePoints)) {
      issues.push({ code: "points-invalid", message: "TouchLine points must be finite.", playerId: row.playerId });
    }
    if (row.roundPoints !== null && row.roundPoints !== undefined && !Number.isFinite(row.roundPoints)) {
      issues.push({ code: "round-points-invalid", message: "Round points must be finite.", playerId: row.playerId });
    }
    if (row.totalRating !== null && row.totalRating !== undefined && !Number.isFinite(row.totalRating)) {
      issues.push({ code: "total-rating-invalid", message: "Total rating must be finite when available.", playerId: row.playerId });
    }
    for (const [key, value] of [["minutes", row.minutesPlayed], ["appearances", row.appearances]] as const) {
      if (value === null || value === undefined || !Number.isInteger(value) || value < 0) {
        issues.push({ code: `${key}-invalid`, message: `${key} must be a non-negative integer.`, playerId: row.playerId });
      }
    }
  }

  for (const providerId of duplicateProviderIds) {
    issues.push({ code: "provider-player-id-duplicate", message: `Duplicate SportMonks player ID: ${providerId}.` });
  }

  const missingGroups = TOUCHLINE_POSITION_RANKING_GROUPS.filter(
    (group) => !draft.snapshot.positions.find((position) => position.group === group)?.players.length,
  );
  for (const group of missingGroups) {
    issues.push({ code: "position-group-empty", message: `Position group has no players: ${group}.` });
  }

  const priceMismatch = draft.snapshot.players.some((player) => (
    touchlineArenaTierForKey(player.tierKey)?.retailPriceTc !== player.priceTc
  ));
  if (priceMismatch) issues.push({ code: "price-mismatch", message: "A ranked card price does not match the authoritative price table." });
  if (draft.priceTableVersion !== TOUCHLINE_CARD_PRICE_TABLE_VERSION) {
    issues.push({ code: "price-version-mismatch", message: "The ranking uses a stale card price table." });
  }
  if (draft.rows.length !== draft.expectedPlayerCount) {
    issues.push({ code: "player-count-mismatch", message: `Expected ${draft.expectedPlayerCount} players and received ${draft.rows.length}.` });
  }
  if (!draft.snapshot.snapshotId.trim() || !draft.snapshot.roundId.trim() || !draft.seasonId.trim()) {
    issues.push({ code: "identity-missing", message: "Snapshot, round and season IDs are required." });
  }
  if (!validIsoDate(draft.receivedAt) || !validIsoDate(auditedAt)) {
    issues.push({ code: "timestamp-invalid", message: "Received and audit timestamps must be valid ISO dates." });
  }
  if (draft.coverageStatus !== "complete" && draft.coverageStatus !== "complete_for_scoring") {
    issues.push({ code: "coverage-invalid", message: "Ranking coverage must be complete for scoring." });
  }
  if (
    !draft.fixtureIds.length
    || draft.fixtureIds.length !== draft.expectedFixtureIds.length
    || draft.fixtureIds.some((fixtureId, index) => fixtureId !== draft.expectedFixtureIds[index])
  ) {
    issues.push({ code: "fixture-coverage-mismatch", message: "Expected and included ranking fixture sets must match exactly." });
  }
  const calculatedTotalScorePoints = draft.rows.reduce((total, row) => total + row.touchlinePoints, 0);
  if (!Number.isFinite(draft.totalScorePoints) || draft.totalScorePoints !== calculatedTotalScorePoints) {
    issues.push({ code: "total-score-points-mismatch", message: "Snapshot total points must equal the ranked player sum." });
  }

  const checks: TouchlineRankingAuditCheck[] = [
    { key: "provider", label: "Linhas verificadas pelo SportMonks", passed: !issues.some((issue) => issue.code.includes("provider") || issue.code === "source-fixture-missing") },
    { key: "players", label: "Quantidade e IDs dos atletas", passed: !issues.some((issue) => issue.code.includes("player-count") || issue.code === "identity-missing") },
    { key: "positions", label: "Seis grupos posicionais completos", passed: missingGroups.length === 0 },
    { key: "statistics", label: "Pontos, minutos e jogos válidos", passed: !issues.some((issue) => /points|minutes|appearances/.test(issue.code)) },
    { key: "coverage", label: "Cobertura final completa para pontuação", passed: !issues.some((issue) => /coverage|fixture-coverage/.test(issue.code)) },
    { key: "prices", label: "Tabela de preços oficial", passed: !issues.some((issue) => issue.code.includes("price")) },
    { key: "timestamps", label: "Rastreabilidade temporal", passed: !issues.some((issue) => issue.code.includes("timestamp")) },
  ];
  const passed = issues.length === 0;
  const checksum = passed
    ? touchlineRankingSnapshotChecksum({
      seasonId: draft.seasonId,
      priceTableVersion: draft.priceTableVersion,
      snapshot: draft.snapshot,
      scoringVersion: draft.scoringVersion,
      coverageStatus: draft.coverageStatus,
      fixtureIds: draft.fixtureIds,
      expectedFixtureIds: draft.expectedFixtureIds,
      totalScorePoints: draft.totalScorePoints,
    })
    : undefined;
  const snapshot = passed && checksum ? {
    ...draft.snapshot,
    status: "audited" as const,
    source: "sportmonks-audited" as const,
    seasonId: draft.seasonId,
    scoringVersion: draft.scoringVersion,
    coverageStatus: draft.coverageStatus,
    fixtureIds: draft.fixtureIds,
    expectedFixtureIds: draft.expectedFixtureIds,
    totalScorePoints: draft.totalScorePoints,
    auditedAt,
    priceTableVersion: draft.priceTableVersion,
    checksum,
  } : undefined;

  return {
    auditId: `${draft.snapshot.snapshotId}:audit`,
    snapshotId: draft.snapshot.snapshotId,
    auditedAt,
    passed,
    checks,
    issues,
    checksum,
    snapshot,
  };
}

export function publishTouchlineRankingSnapshot(
  report: TouchlineRankingAuditReport,
  publishedAt: string,
): TouchlinePublishedRankingSnapshot {
  if (!report.passed || !report.snapshot) throw new Error("Only a passed ranking audit can be published.");
  if (!validIsoDate(publishedAt)) throw new Error("publishedAt must be a valid ISO date.");
  if (Date.parse(publishedAt) < Date.parse(report.snapshot.auditedAt)) {
    throw new Error("A ranking cannot be published before it is audited.");
  }

  return {
    ...report.snapshot,
    status: "published",
    positions: report.snapshot.positions.map((position) => ({ ...position, players: position.players.map((player) => ({ ...player })) })),
    players: report.snapshot.players.map((player) => ({ ...player })),
    publishedAt,
  };
}

export function keepLastPublishedRanking(
  current: TouchlinePublishedRankingSnapshot | null,
  candidate: TouchlineRankingAuditReport,
  publishedAt: string,
) {
  return candidate.passed ? publishTouchlineRankingSnapshot(candidate, publishedAt) : current;
}
