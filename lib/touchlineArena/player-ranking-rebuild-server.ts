import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isTouchLineSettledFixtureStatus } from "../football-data/fixture-settlement";
import { buildSportmonksRankingDraft, auditTouchlineRankingDraft } from "./card-ranking-pipeline";
import { buildTouchlineRankingPersistenceRecord } from "./card-ranking-persistence";
import { TOUCHLINE_ENGLAND_LEAGUE_KEY } from "./card-ranking-live";
import { loadTouchlinePublishedCardPresentations } from "./card-publication-read-model";
import {
  isTouchLinePlayerRankingAggregateComplete,
  isTouchLinePlayerRankingSettlementComplete,
} from "./player-ranking-eligibility";
import { buildTouchlineSelection } from "./touchline-selection";

type Row = Record<string, unknown>;

export type TouchLinePlayerRankingRebuildResult = Readonly<{
  ok: boolean;
  published: boolean;
  snapshotId: string | null;
  seasonId: string | null;
  roundId: string | null;
  playerCount: number;
  fixtureIds: string[];
  expectedFixtureIds: string[];
  coverageStatus: "complete" | "complete_for_scoring" | null;
  totalScorePoints: number | null;
  checksum: string | null;
  error?: string;
}>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((entry): entry is Row => Boolean(entry && typeof entry === "object")) : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter((entry): entry is string => Boolean(entry)))].sort() : [];
}

function finiteNonNegativeInteger(value: unknown) {
  const numeric = number(value);
  return numeric === null ? 0 : Math.max(0, Math.trunc(numeric));
}

function latestIso(values: unknown[]) {
  return values.map(text).filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((first, second) => Date.parse(first) - Date.parse(second)).at(-1) ?? null;
}

function sourceDigest(value: unknown) {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

type TouchLinePlayerRankingEngine = Readonly<{
  scoringVersion: "player_scoring_v2" | "player_scoring_v3";
  settlementTable: "football_player_fixture_statistics" | "touchline_player_fixture_score_settlements";
  snapshotPrefix: "player-v2" | "player-v3";
}>;

/** Inputs are persisted settlements only; this function never calls Sportmonks
 * and never recomputes points. V2 stays callable for audit; V3 is canonical. */
async function rebuildTouchLinePlayerRanking(
  admin: SupabaseClient,
  engine: TouchLinePlayerRankingEngine,
): Promise<TouchLinePlayerRankingRebuildResult> {
  const failure = (error: string, extra: Partial<TouchLinePlayerRankingRebuildResult> = {}): TouchLinePlayerRankingRebuildResult => ({
    ok: false, published: false, snapshotId: null, seasonId: null, roundId: null,
    playerCount: 0, fixtureIds: [], expectedFixtureIds: [], coverageStatus: null,
    totalScorePoints: null, checksum: null, error, ...extra,
  });

  const { data: season, error: seasonError } = await admin.from("football_seasons")
    .select("id,name,competition_id,football_competitions!inner(provider_competition_id)")
    .eq("provider", "sportmonks")
    .eq("is_current", true)
    .eq("football_competitions.provider_competition_id", "8")
    .maybeSingle();
  const seasonId = text(season?.id);
  if (seasonError || !seasonId) return failure("current-season-unavailable");

  const [{ data: aggregateData, error: aggregateError }, { data: fixtureData, error: fixtureError }] = await Promise.all([
    admin.from("football_player_season_statistics")
      .select("football_player_id,club_id,provider_player_id,summary_payload,coverage_status,expected_fixture_ids,aggregated_fixture_ids,source_synced_at")
      .eq("season_id", seasonId)
      .eq("scoring_version", engine.scoringVersion),
    admin.from("football_fixtures")
      .select("id,provider_fixture_id,round_id,starts_at,status,source_updated_at")
      .eq("season_id", seasonId),
  ]);
  if (aggregateError || fixtureError) return failure("ranking-source-unavailable", { seasonId });

  const aggregates = rows(aggregateData);
  const fixtures = rows(fixtureData).filter((fixture) => isTouchLineSettledFixtureStatus(text(fixture.status)));
  const aggregatePlayerIds = [...new Set(aggregates.map((row) => text(row.football_player_id)).filter((id): id is string => Boolean(id)))];
  if (!aggregatePlayerIds.length || !fixtures.length) return failure("ranking-source-empty", { seasonId });

  const [{ data: playerData, error: playerError }, { data: fixturePointData, error: pointError }] = await Promise.all([
    admin.from("football_players")
      .select("id,provider_player_id,display_name,name,provider_position,detailed_position,position,current_club_id")
      .in("id", aggregatePlayerIds),
    admin.from(engine.settlementTable)
      .select("football_player_id,fixture_id,touchline_points,settlement_status,ranking_coverage_status")
      .eq("season_id", seasonId)
      .eq("scoring_version", engine.scoringVersion),
  ]);
  if (playerError || pointError) return failure("ranking-player-source-unavailable", { seasonId });

  const playerRows = rows(playerData);
  const playerIds = playerRows.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
  const publishedCards = await loadTouchlinePublishedCardPresentations({ playerIds, providedAdmin: admin as never });
  const eligiblePlayerRows = playerRows.filter((row) => {
    const id = text(row.id)?.toLowerCase();
    return Boolean(id && publishedCards.has(id));
  });
  const aggregateByPlayerId = new Map(aggregates.flatMap((row) => text(row.football_player_id) ? [[text(row.football_player_id)!, row] as const] : []));
  // A provider-confirmed appearance without a Sportmonks rating has no V3
  // points. It remains visible on the player surface as unavailable, but may
  // not receive a fabricated zero or a ranking position. Other published
  // players still need complete final fixture coverage below.
  const rankingEligiblePlayerRows = eligiblePlayerRows.filter((player) => {
    const aggregate = aggregateByPlayerId.get(text(player.id) ?? "");
    return number(object(aggregate?.summary_payload).touchlinePoints) !== null;
  });
  if (!rankingEligiblePlayerRows.length) return failure("ranking-has-no-published-settlements", { seasonId });
  const fixtureRows = rows(fixturePointData);
  const settlementByPlayerFixture = new Map(fixtureRows.flatMap((row) => {
    const playerId = text(row.football_player_id);
    const fixtureId = text(row.fixture_id);
    return playerId && fixtureId ? [[`${playerId}:${fixtureId}`, row] as const] : [];
  }));
  const settledFixtureIds = new Set(fixtures.map((fixture) => text(fixture.id)).filter((id): id is string => Boolean(id)));
  if (rankingEligiblePlayerRows.some((player) => {
    const playerId = text(player.id) ?? "";
    const aggregate = aggregateByPlayerId.get(text(player.id) ?? "");
    if (!aggregate || !isTouchLinePlayerRankingAggregateComplete({
      coverageStatus: aggregate.coverage_status,
      expectedFixtureIds: aggregate.expected_fixture_ids,
      aggregatedFixtureIds: aggregate.aggregated_fixture_ids,
    })) return true;
    const expectedFixtureIds = stringArray(aggregate.expected_fixture_ids);
    return expectedFixtureIds.some((fixtureId) => {
      const settlement = settlementByPlayerFixture.get(`${playerId}:${fixtureId}`);
      return !settledFixtureIds.has(fixtureId) || !settlement || !isTouchLinePlayerRankingSettlementComplete({
        settlementStatus: settlement.settlement_status,
        rankingCoverageStatus: settlement.ranking_coverage_status,
      });
    });
  })) return failure("ranking-source-incomplete", { seasonId });
  const clubIds = [...new Set(rankingEligiblePlayerRows.map((row) => text(row.current_club_id)).filter((id): id is string => Boolean(id)))];
  const { data: clubData, error: clubError } = clubIds.length
    ? await admin.from("football_clubs").select("id,name").in("id", clubIds)
    : { data: [], error: null };
  if (clubError) return failure("ranking-club-source-unavailable", { seasonId });

  const fixtureById = new Map(fixtures.flatMap((row) => {
    const id = text(row.id);
    return id ? [[id, row] as const] : [];
  }));
  const roundIds = [...new Set(fixtures.map((fixture) => text(fixture.round_id)).filter((id): id is string => Boolean(id)))];
  const { data: roundData, error: roundError } = roundIds.length
    ? await admin.from("football_rounds").select("id,provider_round_id,name").in("id", roundIds)
    : { data: [], error: null };
  if (roundError) return failure("ranking-round-source-unavailable", { seasonId });
  const roundById = new Map(rows(roundData).flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const latestFixture = [...fixtures].sort((first, second) => Date.parse(text(second.starts_at) ?? "") - Date.parse(text(first.starts_at) ?? ""))[0];
  const latestRoundId = text(latestFixture?.round_id);
  const roundId = text(roundById.get(latestRoundId ?? "")?.provider_round_id)
    ?? text(roundById.get(latestRoundId ?? "")?.name)
    ?? "season-to-date";
  const latestRoundFixtureIds = new Set(fixtures.filter((fixture) => text(fixture.round_id) === latestRoundId).map((fixture) => text(fixture.id)).filter((id): id is string => Boolean(id)));
  const roundPointsByPlayerId = new Map<string, number>();
  for (const row of fixtureRows) {
    const playerId = text(row.football_player_id);
    const fixtureId = text(row.fixture_id);
    const points = number(row.touchline_points);
    if (!playerId || !fixtureId || points === null || !latestRoundFixtureIds.has(fixtureId)) continue;
    roundPointsByPlayerId.set(playerId, (roundPointsByPlayerId.get(playerId) ?? 0) + points);
  }

  const clubById = new Map(rows(clubData).flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const rankingPlayers = rankingEligiblePlayerRows.flatMap((player) => {
    const playerId = text(player.id);
    const aggregate = playerId ? aggregateByPlayerId.get(playerId) : null;
    const summary = object(aggregate?.summary_payload);
    const touchlinePoints = number(summary.touchlinePoints);
    const providerPlayerId = text(player.provider_player_id) ?? text(aggregate?.provider_player_id);
    const name = text(player.display_name) ?? text(player.name);
    const position = text(player.detailed_position) ?? text(player.provider_position) ?? text(player.position);
    const sourceFixtureInternalIds = stringArray(aggregate?.aggregated_fixture_ids);
    const sourceFixtureIds = sourceFixtureInternalIds.flatMap((id) => {
      const providerFixtureId = text(fixtureById.get(id)?.provider_fixture_id);
      return providerFixtureId ? [providerFixtureId] : [];
    });
    const clubName = text(clubById.get(text(player.current_club_id) ?? "")?.name);
    if (!playerId || !providerPlayerId || !name || !position || !clubName || touchlinePoints === null || !sourceFixtureIds.length) return [];
    return [{
      playerId,
      providerPlayerId,
      name,
      clubName,
      position,
      role: text(player.provider_position),
      touchlinePoints,
      roundPoints: roundPointsByPlayerId.get(playerId) ?? 0,
      minutesPlayed: finiteNonNegativeInteger(summary.minutes),
      appearances: finiteNonNegativeInteger(summary.appearances),
      provider: "sportmonks" as const,
      verified: true as const,
      sourceFixtureIds,
    }];
  });
  if (!rankingPlayers.length) return failure("ranking-has-no-published-settlements", { seasonId, roundId });

  const fixtureIds = [...new Set(rankingPlayers.flatMap((player) => player.sourceFixtureIds))].sort();
  const expectedFixtureIds = [...fixtureIds];
  const coverageStatus = rankingEligiblePlayerRows.every((player) => (
    aggregateByPlayerId.get(text(player.id) ?? "")?.coverage_status === "complete"
  )) ? "complete" as const : "complete_for_scoring" as const;
  const totalScorePoints = rankingPlayers.reduce((total, player) => total + player.touchlinePoints, 0);
  const receivedAt = latestIso([...aggregates.map((row) => row.source_synced_at), ...fixtures.map((row) => row.source_updated_at)]);
  if (!receivedAt) return failure("ranking-source-time-unavailable", {
    seasonId, roundId, playerCount: rankingPlayers.length, fixtureIds, expectedFixtureIds,
    coverageStatus, totalScorePoints,
  });
  const digest = sourceDigest({
    coverageStatus,
    expectedFixtureIds,
    players: rankingPlayers.map((player) => ({
      id: player.playerId,
      providerPlayerId: String(player.providerPlayerId),
      position: player.position,
      points: player.touchlinePoints,
      roundPoints: player.roundPoints,
      minutesPlayed: player.minutesPlayed,
      appearances: player.appearances,
      fixtureIds: player.sourceFixtureIds,
    })).sort((first, second) => first.id.localeCompare(second.id)),
  });
  const snapshotId = `${engine.snapshotPrefix}:${seasonId}:${digest}`;
  const draft = buildSportmonksRankingDraft({
    snapshotId,
    roundId,
    seasonId,
    receivedAt,
    expectedPlayerCount: rankingPlayers.length,
    scoringVersion: engine.scoringVersion,
    coverageStatus,
    fixtureIds,
    expectedFixtureIds,
    totalScorePoints,
    players: rankingPlayers,
  });
  const auditedAt = new Date().toISOString();
  const audit = auditTouchlineRankingDraft(draft, auditedAt);
  if (!audit.passed || !audit.snapshot) {
    return failure(`ranking-audit-failed:${audit.issues.map((issue) => issue.code).join(",")}`, {
      seasonId, roundId, snapshotId, playerCount: rankingPlayers.length, fixtureIds,
      expectedFixtureIds, coverageStatus, totalScorePoints,
    });
  }
  const selection = buildTouchlineSelection(audit.snapshot);
  if (!selection.complete) return failure(`ranking-selection-incomplete:${selection.missingSlots.join(",")}`, {
    seasonId, roundId, snapshotId, playerCount: rankingPlayers.length, fixtureIds,
    expectedFixtureIds, coverageStatus, totalScorePoints,
  });
  const record = buildTouchlineRankingPersistenceRecord({
    leagueKey: TOUCHLINE_ENGLAND_LEAGUE_KEY,
    expectedPlayerCount: rankingPlayers.length,
    audit,
    selection,
  });

  const { data: active } = await admin.from("touchline_card_ranking_active_snapshots")
    .select("snapshot_id").eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY).maybeSingle();
  if (active?.snapshot_id === snapshotId) {
    return {
      ok: true, published: false, snapshotId, seasonId, roundId,
      playerCount: rankingPlayers.length, fixtureIds, expectedFixtureIds,
      coverageStatus, totalScorePoints, checksum: record.checksum,
    };
  }

  const { error: insertError } = await admin.from("touchline_card_ranking_snapshots").upsert({
    snapshot_id: record.snapshotId,
    league_key: record.leagueKey,
    season_id: record.seasonId,
    round_id: record.roundId,
    source: record.source,
    status: record.status,
    generated_at: record.generatedAt,
    audited_at: record.auditedAt,
    published_at: null,
    price_table_version: record.priceTableVersion,
    checksum: record.checksum,
    expected_player_count: record.expectedPlayerCount,
    actual_player_count: record.actualPlayerCount,
    scoring_version: record.scoringVersion,
    coverage_status: record.coverageStatus,
    fixture_ids: record.fixtureIds,
    expected_fixture_ids: record.expectedFixtureIds,
    total_score_points: record.totalScorePoints,
    ranking_payload: record.rankingPayload,
    selection_version: record.selectionVersion,
    selection_payload: record.selectionPayload,
    audit_report: record.auditReport,
  }, { onConflict: "snapshot_id", ignoreDuplicates: true });
  if (insertError) return failure(`ranking-persist-failed:${insertError.message}`, {
    seasonId, roundId, snapshotId, playerCount: rankingPlayers.length, fixtureIds,
    expectedFixtureIds, coverageStatus, totalScorePoints, checksum: record.checksum,
  });

  const publishedAt = new Date().toISOString();
  const { error: publishError } = await admin.rpc("publish_touchline_card_ranking_snapshot", {
    requested_snapshot_id: snapshotId,
    requested_league_key: TOUCHLINE_ENGLAND_LEAGUE_KEY,
    requested_published_at: publishedAt,
  });
  if (publishError) return failure(`ranking-publish-failed:${publishError.message}`, {
    seasonId, roundId, snapshotId, playerCount: rankingPlayers.length, fixtureIds,
    expectedFixtureIds, coverageStatus, totalScorePoints, checksum: record.checksum,
  });
  return {
    ok: true, published: true, snapshotId, seasonId, roundId,
    playerCount: rankingPlayers.length, fixtureIds, expectedFixtureIds,
    coverageStatus, totalScorePoints, checksum: record.checksum,
  };
}

export function rebuildTouchLinePlayerRankingV2(admin: SupabaseClient) {
  return rebuildTouchLinePlayerRanking(admin, {
    scoringVersion: "player_scoring_v2",
    settlementTable: "football_player_fixture_statistics",
    snapshotPrefix: "player-v2",
  });
}

export function rebuildTouchLinePlayerRankingV3(admin: SupabaseClient) {
  return rebuildTouchLinePlayerRanking(admin, {
    scoringVersion: "player_scoring_v3",
    settlementTable: "touchline_player_fixture_score_settlements",
    snapshotPrefix: "player-v3",
  });
}
