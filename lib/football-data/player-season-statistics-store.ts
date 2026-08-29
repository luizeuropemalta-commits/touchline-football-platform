import type { SupabaseClient } from "@supabase/supabase-js";

import { isTouchLineSettledFixtureStatus } from "@/lib/football-data/fixture-settlement";
import { buildTouchLinePlayerSeasonAggregate } from "@/lib/football-data/player-season-statistics-sync";
import {
  touchLinePlayerFixturePoints,
} from "@/lib/football-data/player-fixture-scoring";
import { touchLinePlayerFixtureScoreV3 } from "@/lib/football-data/player-score-engine-v3";
import { classifyTouchLinePlayerRankingCoverage } from "@/lib/football-data/player-ranking-coverage";
import { groupTouchLinePlayerSeasonMemberships } from "@/lib/football-data/player-season-membership-grouping";
import { upsertTouchLineRowsResiliently } from "@/lib/football-data/resilient-batch-upsert";
import type { TouchlineFantasyEvent, TouchlineFantasyLineupMember } from "@/lib/football-data/types";
import { rebuildTouchLinePlayerRankingV3 } from "@/lib/touchlineArena/player-ranking-rebuild-server";

const TOUCHLINE_LIVE_FIXTURE_STATUS = /^(?:live|in[ -]?play|in progress|1st half|2nd half|half[ -]?time|ht|extra time|penalties)$/i;

function isTouchLineScoringFixtureStatus(value?: string | null) {
  const status = String(value ?? "").trim();
  return isTouchLineSettledFixtureStatus(status) || TOUCHLINE_LIVE_FIXTURE_STATUS.test(status);
}

type MembershipRow = {
  football_player_id: string;
  competition_id: string;
  season_id: string;
  club_id: string;
  source_synced_at?: string | null;
  football_players?: { provider?: string; provider_player_id?: string; provider_position?: string | null; position?: string | null } | null;
  football_seasons?: { name?: string | null } | null;
  football_competitions?: { name?: string | null } | null;
  football_clubs?: { name?: string | null } | null;
};
type FixtureRow = {
  id: string;
  provider: string;
  provider_fixture_id: string;
  season_id: string;
  competition_id: string;
  home_club_id: string | null;
  away_club_id: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
};
type FeedRow = {
  provider: string;
  provider_fixture_id: string;
  lineups_payload: unknown;
  events_payload: unknown;
  created_at: string | null;
  last_synced_at: string | null;
};

function lineupMembers(value: unknown): TouchlineFantasyLineupMember[] | null {
  if (!Array.isArray(value)) return null;
  return value as TouchlineFantasyLineupMember[];
}

function fantasyEvents(value: unknown): TouchlineFantasyEvent[] | null {
  return Array.isArray(value) ? value as TouchlineFantasyEvent[] : null;
}

function providerStatisticMap(member: TouchlineFantasyLineupMember) {
  return Object.fromEntries(member.statistics.flatMap((statistic) => {
    const key = String(statistic.code ?? "").trim().toLowerCase();
    const value = typeof statistic.value === "number" ? statistic.value : typeof statistic.value === "string" && statistic.value.trim() ? Number(statistic.value) : NaN;
    return key && Number.isFinite(value) ? [[key, value] as const] : [];
  }));
}

function appearanceStatus(member: TouchlineFantasyLineupMember | undefined) {
  if (!member) return "absent" as const;
  const statistics = providerStatisticMap(member);
  const minutes = statistics["minutes-played"] ?? statistics.minutes;
  if (member.isStarter) return "started" as const;
  if (member.isSubstitute && typeof minutes === "number" && minutes > 0) return "substitute" as const;
  return "unused" as const;
}

function teamGoalsConceded(fixture: FixtureRow, clubId: string) {
  if (fixture.home_club_id === clubId) return fixture.away_score;
  if (fixture.away_club_id === clubId) return fixture.home_score;
  return null;
}

export type PlayerSeasonStatisticsSyncResult = {
  ok: boolean;
  membershipsRead: number;
  aggregatesWritten: number;
  fixtureRowsWritten: number;
  v3FixtureRowsWritten: number;
  membershipsWritten: number;
  canonicalEventsWritten: number;
  lifecycleEventsWritten: number;
  partialAggregates: number;
  completeForScoringAggregates: number;
  unavailableAggregates: number;
  errors: string[];
  rankingSnapshotId: string | null;
  rankingPlayers: number;
  rankingPublished: boolean;
  rankingError: string | null;
  scoringFixtureIds: string[];
  failedFixtureIds: string[];
  missingSettlementFixtureIds: string[];
};

function stringField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function aggregateRowKey(row: Record<string, unknown>) {
  return ["football_player_id", "competition_id", "season_id", "scoring_version"]
    .map((key) => stringField(row, key))
    .join(":");
}

function fixtureRowKey(row: Record<string, unknown>) {
  return ["football_player_id", "fixture_id"].map((key) => stringField(row, key)).join(":");
}

function v3FixtureRowKey(row: Record<string, unknown>) {
  return ["football_player_id", "fixture_id", "scoring_version"]
    .map((key) => stringField(row, key))
    .join(":");
}

/**
 * Rebuilds the QA-only V3 canonical read model from persisted normalized fixtures and
 * feeds. It never calls an external provider and does not guess historical
 * membership: absent memberships yield unavailable rows instead of totals.
 */
export async function syncTouchLinePlayerSeasonStatistics(admin: SupabaseClient): Promise<PlayerSeasonStatisticsSyncResult> {
  const result: PlayerSeasonStatisticsSyncResult = {
    ok: false,
    membershipsRead: 0,
    aggregatesWritten: 0,
    fixtureRowsWritten: 0,
    v3FixtureRowsWritten: 0,
    membershipsWritten: 0,
    canonicalEventsWritten: 0,
    lifecycleEventsWritten: 0,
    partialAggregates: 0,
    completeForScoringAggregates: 0,
    unavailableAggregates: 0,
    errors: [],
    rankingSnapshotId: null,
    rankingPlayers: 0,
    rankingPublished: false,
    rankingError: null,
    scoringFixtureIds: [],
    failedFixtureIds: [],
    missingSettlementFixtureIds: [],
  };
  const { data: fixtures, error: fixturesError } = await admin
    .from("football_fixtures")
    .select("id,provider,provider_fixture_id,competition_id,season_id,home_club_id,away_club_id,status,home_score,away_score");
  if (fixturesError || !Array.isArray(fixtures)) {
    result.errors.push(fixturesError?.message ?? "fixtures-unavailable");
    return result;
  }
  const { data: feeds, error: feedsError } = await admin
    .from("football_fantasy_fixture_feeds")
    .select("provider,provider_fixture_id,lineups_payload,events_payload,created_at,last_synced_at");
  if (feedsError || !Array.isArray(feeds)) {
    result.errors.push(feedsError?.message ?? "fixture-feeds-unavailable");
    return result;
  }
  const feedByKey = new Map((feeds as FeedRow[]).map((feed) => [`${feed.provider}:${feed.provider_fixture_id}`, feed]));

  // A persisted official team sheet is itself verified membership evidence.
  // Materialise that relation before building statistics instead of requiring
  // a separate historical bootstrap that can silently leave the read model at
  // zero rows.
  const lineupFacts = (feeds as FeedRow[]).flatMap((feed) => {
    const fixture = (fixtures as FixtureRow[]).find((candidate) => (
      candidate.provider === feed.provider && candidate.provider_fixture_id === feed.provider_fixture_id
    ));
    if (!fixture?.season_id || !fixture.competition_id) return [];
    return (lineupMembers(feed.lineups_payload) ?? []).flatMap((member) => (
      member.playerId && member.teamId ? [{ fixture, feed, member }] : []
    ));
  });
  const providerPlayerIds = [...new Set(lineupFacts.map(({ member }) => String(member.playerId)))];
  const providerTeamIds = [...new Set(lineupFacts.map(({ member }) => String(member.teamId)))];
  const [{ data: playerRows, error: playerRowsError }, { data: clubRows, error: clubRowsError }] = await Promise.all([
    providerPlayerIds.length
      ? admin.from("football_players").select("id,provider_player_id").eq("provider", "sportmonks").in("provider_player_id", providerPlayerIds)
      : Promise.resolve({ data: [], error: null }),
    providerTeamIds.length
      ? admin.from("football_clubs").select("id,provider_team_id").eq("provider", "sportmonks").in("provider_team_id", providerTeamIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (playerRowsError || clubRowsError || !Array.isArray(playerRows) || !Array.isArray(clubRows)) {
    result.errors.push(playerRowsError?.message ?? clubRowsError?.message ?? "lineup-identity-mapping-unavailable");
    return result;
  }
  const playerIdByProviderId = new Map(playerRows.map((row) => [String(row.provider_player_id), String(row.id)]));
  const clubIdByProviderId = new Map(clubRows.map((row) => [String(row.provider_team_id), String(row.id)]));
  const membershipRows = [...new Map(lineupFacts.flatMap(({ fixture, feed, member }) => {
    const footballPlayerId = playerIdByProviderId.get(String(member.playerId));
    const clubId = clubIdByProviderId.get(String(member.teamId));
    if (!footballPlayerId || !clubId) return [];
    const row = {
      football_player_id: footballPlayerId,
      competition_id: fixture.competition_id,
      season_id: fixture.season_id,
      club_id: clubId,
      source_synced_at: feed.last_synced_at,
    };
    return [[`${footballPlayerId}:${fixture.competition_id}:${fixture.season_id}:${clubId}`, row] as const];
  })).values()];
  if (membershipRows.length) {
    const { error } = await admin.from("football_player_season_memberships").upsert(membershipRows, {
      onConflict: "football_player_id,competition_id,season_id,club_id",
    });
    if (error) {
      result.errors.push(`memberships:${error.message}`);
      return result;
    }
    result.membershipsWritten = membershipRows.length;
  }

  // Store the provider events as normalized facts and record the first time a
  // complete line-up became observable. Both writes are naturally idempotent.
  for (const feed of feeds as FeedRow[]) {
    const fixture = (fixtures as FixtureRow[]).find((candidate) => (
      candidate.provider === feed.provider && candidate.provider_fixture_id === feed.provider_fixture_id
    ));
    if (!fixture) continue;
    const eventRows = (fantasyEvents(feed.events_payload) ?? []).map((event) => ({
      fixture_id: fixture.id,
      provider: event.provider,
      provider_event_id: event.providerId,
      provider_sort_order: event.sortOrder ?? null,
      minute: event.minute ?? null,
      extra_minute: event.extraMinute ?? null,
      provider_team_id: event.teamId ?? null,
      provider_player_id: event.playerId ?? null,
      football_player_id: event.playerId ? playerIdByProviderId.get(String(event.playerId)) ?? null : null,
      player_name: event.playerName ?? null,
      related_provider_player_id: event.relatedPlayerId ?? null,
      related_football_player_id: event.relatedPlayerId ? playerIdByProviderId.get(String(event.relatedPlayerId)) ?? null : null,
      related_player_name: event.relatedPlayerName ?? null,
      event_type: event.type ?? "Unknown",
      result: event.result ?? null,
      info: event.info ?? null,
      addition: event.addition ?? null,
      event_status: event.status ?? "recorded",
      source_synced_at: feed.last_synced_at,
    }));
    if (eventRows.length) {
      const { error } = await admin.from("football_fixture_events").upsert(eventRows, {
        onConflict: "provider,provider_event_id",
      });
      if (error) result.errors.push(`events:${fixture.id}:${error.message}`);
      else result.canonicalEventsWritten += eventRows.length;
    }
    if ((lineupMembers(feed.lineups_payload) ?? []).length) {
      const firstObservedAt = feed.created_at ?? feed.last_synced_at;
      if (!firstObservedAt) {
        result.errors.push(`lifecycle:${fixture.id}:observation-timestamp-unavailable`);
        continue;
      }
      const { error } = await admin.from("football_fixture_lifecycle_events").upsert({
        fixture_id: fixture.id,
        event_type: "LINEUP_AVAILABLE",
        first_observed_at: firstObservedAt,
        source_synced_at: feed.last_synced_at,
        evidence_payload: {
          lineupCount: lineupMembers(feed.lineups_payload)?.length ?? 0,
          observationBasis: feed.created_at ? "first-persisted-feed" : "first-sync-timestamp",
          providerPublicationTimestampAvailable: false,
        },
      }, { onConflict: "fixture_id,event_type" });
      if (error) result.errors.push(`lifecycle:${fixture.id}:${error.message}`);
      else result.lifecycleEventsWritten += 1;
    }
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("football_player_season_memberships")
    .select("football_player_id,competition_id,season_id,club_id,source_synced_at,football_players(provider,provider_player_id,provider_position,position),football_seasons(name),football_competitions(name),football_clubs(name)");
  if (membershipsError || !Array.isArray(memberships)) {
    result.errors.push(membershipsError?.message ?? "player-season-memberships-unavailable");
    return result;
  }
  result.membershipsRead = memberships.length;

  // A full round can contain hundreds of players. Keep the persisted V2
  // audit rows and the active V3 rows, but materialise each table in one
  // idempotent command rather than making the live synchronisation wait for
  // one network round-trip per player and per fixture.
  const aggregateRows: Record<string, unknown>[] = [];
  const fixtureRows: Record<string, unknown>[] = [];
  const v3FixtureRows: Record<string, unknown>[] = [];
  const scoreableFixtures = (fixtures as FixtureRow[]).filter((fixture) => isTouchLineScoringFixtureStatus(fixture.status));
  result.scoringFixtureIds = scoreableFixtures.map((fixture) => fixture.id).sort();

  const membershipGroups = groupTouchLinePlayerSeasonMemberships(memberships as MembershipRow[]);
  for (const { canonicalMembership: membership, historicalMemberships } of membershipGroups) {
    const providerPlayerId = String(membership.football_players?.provider_player_id ?? "").trim();
    const provider = membership.football_players?.provider;
    if (provider !== "sportmonks" || !/^\d+$/.test(providerPlayerId)) {
      result.errors.push(`invalid-player-mapping:${membership.football_player_id}`);
      continue;
    }
    const historicalClubIds = new Set(historicalMemberships.map((candidate) => candidate.club_id));
    const eligibleFixtures = (fixtures as FixtureRow[]).filter((fixture) =>
      fixture.season_id === membership.season_id
      && fixture.competition_id === membership.competition_id
      && isTouchLineScoringFixtureStatus(fixture.status)
      && (
        (fixture.home_club_id ? historicalClubIds.has(fixture.home_club_id) : false)
        || (fixture.away_club_id ? historicalClubIds.has(fixture.away_club_id) : false)
      ),
    );
    const fixtureSettlements = eligibleFixtures.map((fixture) => {
      const feed = feedByKey.get(`${fixture.provider}:${fixture.provider_fixture_id}`);
      const lineups = feed ? lineupMembers(feed.lineups_payload) : null;
      const member = lineups?.find((lineup) => String(lineup.playerId ?? "") === providerPlayerId);
      const lineupClubId = member?.teamId ? clubIdByProviderId.get(String(member.teamId)) : null;
      const fixtureMemberships = historicalMemberships.filter((candidate) => (
        candidate.club_id === fixture.home_club_id || candidate.club_id === fixture.away_club_id
      ));
      const fixtureMembership = (
        lineupClubId
          ? fixtureMemberships.find((candidate) => candidate.club_id === lineupClubId)
          : null
      ) ?? fixtureMemberships.find((candidate) => candidate.club_id === membership.club_id)
        ?? fixtureMemberships[0];
      if (!fixtureMembership) return null;
      const statistics = member ? providerStatisticMap(member) : {};
      const resolvedAppearanceStatus = feed ? appearanceStatus(member) : "unavailable";
      const minutesPlayed = statistics["minutes-played"] ?? statistics.minutes ?? null;
      const rating = statistics.rating ?? null;
      const events = feed ? fantasyEvents(feed.events_payload) : null;
      const pointResult = touchLinePlayerFixturePoints({
        providerPlayerId,
        positionGroup: membership.football_players?.provider_position ?? membership.football_players?.position,
        appearanceStatus: resolvedAppearanceStatus,
        minutesPlayed,
        rating,
        statistics: member ? statistics : null,
        events,
        teamGoalsConceded: teamGoalsConceded(fixture, fixtureMembership.club_id),
      });
      const settlementStatus = isTouchLineSettledFixtureStatus(fixture.status) ? "final" as const : "provisional" as const;
      const isParticipant = (resolvedAppearanceStatus === "started" || resolvedAppearanceStatus === "substitute")
        && typeof minutesPlayed === "number" && minutesPlayed > 0;
      const v3PointResult = touchLinePlayerFixtureScoreV3(isParticipant ? rating : null);
      // `member` is the mapped raw Sportmonks lineup row. Therefore this flag
      // can only represent an authoritative omission in a final provider
      // payload; a missing/mis-mapped member never reaches this branch.
      const providerRatingAbsentFromFinalLineup = Boolean(member)
        && isParticipant
        && rating === null;
      const rankingCoverageStatus = classifyTouchLinePlayerRankingCoverage({
        fixtureFinal: settlementStatus === "final",
        points: v3PointResult.points,
        scoringCoverageStatus: v3PointResult.coverageStatus,
        missingFacts: v3PointResult.missingFacts,
        appearanceStatus: resolvedAppearanceStatus,
        providerRatingAbsentFromFinalLineup,
      });
      return {
        fixture,
        fixtureMembership,
        feed,
        lineups,
        statistics,
        appearanceStatus: resolvedAppearanceStatus,
        minutesPlayed,
        rating,
        pointResult,
        v3PointResult,
        isParticipant,
        providerRatingAbsentFromFinalLineup,
        settlementStatus,
        rankingCoverageStatus,
      };
    }).filter((settlement): settlement is NonNullable<typeof settlement> => settlement !== null);
    const aggregate = buildTouchLinePlayerSeasonAggregate({
      providerPlayerId,
      season: {
        seasonId: membership.season_id,
        seasonName: membership.football_seasons?.name ?? null,
        competitionId: membership.competition_id,
        competitionName: membership.football_competitions?.name ?? null,
        clubId: membership.club_id,
        clubName: membership.football_clubs?.name ?? null,
      },
      eligibleFixtures: fixtureSettlements.map(({ fixture, feed, lineups, v3PointResult, isParticipant, providerRatingAbsentFromFinalLineup, rankingCoverageStatus }) => {
        return {
          fixtureId: fixture.id,
          lineups,
          events: feed ? fantasyEvents(feed.events_payload) : null,
          latestSyncAt: feed?.last_synced_at ?? null,
          touchlinePoints: v3PointResult.points,
          scoringIncluded: isParticipant && !providerRatingAbsentFromFinalLineup,
          scoringComplete: v3PointResult.coverageStatus === "complete",
          providerRatingAbsentFromFinalLineup,
          rankingCoverageStatus,
        };
      }),
    });
    aggregateRows.push({
        football_player_id: membership.football_player_id,
        competition_id: membership.competition_id,
        season_id: membership.season_id,
        club_id: membership.club_id,
        provider,
        provider_player_id: providerPlayerId,
        coverage_status: aggregate.coverageStatus,
        expected_fixture_count: aggregate.expectedFixtureCount,
        synchronized_fixture_count: aggregate.synchronizedFixtureCount,
        expected_fixture_ids: aggregate.expectedFixtureIds,
        aggregated_fixture_ids: aggregate.aggregatedFixtureIds,
        summary_payload: aggregate.summary,
        position_statistics_payload: aggregate.positionStatistics,
        scoring_version: "player_scoring_v3",
        source_synced_at: aggregate.latestSyncAt,
    });
    if (aggregate.coverageStatus === "partial") result.partialAggregates += 1;
    if (aggregate.coverageStatus === "complete_for_scoring") result.completeForScoringAggregates += 1;
    if (aggregate.coverageStatus === "unavailable") result.unavailableAggregates += 1;

    for (const settlement of fixtureSettlements) {
      const {
          fixture,
          fixtureMembership,
        feed,
        statistics,
        appearanceStatus: resolvedAppearanceStatus,
        minutesPlayed,
        rating,
        pointResult,
        v3PointResult,
        settlementStatus,
        rankingCoverageStatus,
      } = settlement;
      fixtureRows.push({
          football_player_id: membership.football_player_id,
          fixture_id: fixture.id,
          competition_id: membership.competition_id,
          season_id: membership.season_id,
          club_id: fixtureMembership.club_id,
          appearance_status: resolvedAppearanceStatus,
          minutes_played: minutesPlayed,
          rating,
          statistics_payload: { ...statistics, ...pointResult.statistics },
          touchline_points: pointResult.points,
          touchline_points_breakdown: pointResult.contributions,
          scoring_version: pointResult.scoringVersion,
          scoring_coverage_status: pointResult.coverageStatus,
          ranking_coverage_status: rankingCoverageStatus,
          missing_scoring_facts: pointResult.missingFacts,
          position_group: pointResult.positionGroup,
          settlement_status: settlementStatus,
          source_synced_at: feed?.last_synced_at ?? null,
      });

      v3FixtureRows.push({
          football_player_id: membership.football_player_id,
          fixture_id: fixture.id,
          competition_id: membership.competition_id,
          season_id: membership.season_id,
          club_id: fixtureMembership.club_id,
          scoring_version: v3PointResult.scoringVersion,
          appearance_status: resolvedAppearanceStatus,
          minutes_played: minutesPlayed,
          rating,
          touchline_points: v3PointResult.points,
          touchline_points_breakdown: v3PointResult.contributions,
          statistics_payload: { ...statistics, ...pointResult.statistics },
          scoring_coverage_status: v3PointResult.coverageStatus,
          ranking_coverage_status: rankingCoverageStatus,
          missing_scoring_facts: v3PointResult.missingFacts,
          settlement_status: settlementStatus,
          source_synced_at: feed?.last_synced_at ?? null,
      });
    }
  }

  const aggregateWrite = await upsertTouchLineRowsResiliently(aggregateRows, async (batch) => admin
    .from("football_player_season_statistics")
    .upsert(batch, { onConflict: "football_player_id,competition_id,season_id,scoring_version" }));
  result.aggregatesWritten = aggregateWrite.written.length;
  const successfulAggregateKeys = new Set(aggregateWrite.written.map(aggregateRowKey));
  for (const failure of aggregateWrite.failed) {
    const key = aggregateRowKey(failure.row);
    const affectedFixtureIds = fixtureRows
      .filter((row) => aggregateRowKey({ ...row, scoring_version: "player_scoring_v3" }) === key)
      .map((row) => stringField(row, "fixture_id"))
      .filter(Boolean);
    result.failedFixtureIds.push(...affectedFixtureIds);
    result.errors.push(`aggregate-row:${key}:${failure.error}:fixtures=${affectedFixtureIds.join(",") || "none"}`);
  }

  const eligibleFixtureRows = fixtureRows.filter((row) => successfulAggregateKeys.has(aggregateRowKey({
    ...row,
    scoring_version: "player_scoring_v3",
  })));
  const eligibleV3FixtureRows = v3FixtureRows.filter((row) => successfulAggregateKeys.has(aggregateRowKey(row)));
  const fixtureWrite = await upsertTouchLineRowsResiliently(eligibleFixtureRows, async (batch) => admin
    .from("football_player_fixture_statistics")
    .upsert(batch, { onConflict: "football_player_id,fixture_id" }));
  result.fixtureRowsWritten = fixtureWrite.written.length;
  for (const failure of fixtureWrite.failed) {
    const fixtureId = stringField(failure.row, "fixture_id");
    if (fixtureId) result.failedFixtureIds.push(fixtureId);
    result.errors.push(`fixture-row:${fixtureRowKey(failure.row)}:${failure.error}`);
  }

  const v3FixtureWrite = await upsertTouchLineRowsResiliently(eligibleV3FixtureRows, async (batch) => admin
    .from("touchline_player_fixture_score_settlements")
    .upsert(batch, { onConflict: "football_player_id,fixture_id,scoring_version" }));
  result.v3FixtureRowsWritten = v3FixtureWrite.written.length;
  for (const failure of v3FixtureWrite.failed) {
    const fixtureId = stringField(failure.row, "fixture_id");
    if (fixtureId) result.failedFixtureIds.push(fixtureId);
    result.errors.push(`v3-fixture-row:${v3FixtureRowKey(failure.row)}:${failure.error}`);
  }

  result.failedFixtureIds = [...new Set(result.failedFixtureIds)].sort();
  if (result.scoringFixtureIds.length) {
    const { data: persistedSettlements, error: settlementAuditError } = await admin
      .from("touchline_player_fixture_score_settlements")
      .select("fixture_id")
      .eq("scoring_version", "player_scoring_v3")
      .in("fixture_id", result.scoringFixtureIds);
    if (settlementAuditError || !Array.isArray(persistedSettlements)) {
      result.errors.push(`v3-settlement-audit:${settlementAuditError?.message ?? "unavailable"}`);
    } else {
      const persistedFixtureIds = new Set(persistedSettlements.map((row) => String(row.fixture_id ?? "")).filter(Boolean));
      result.missingSettlementFixtureIds = result.scoringFixtureIds.filter((fixtureId) => !persistedFixtureIds.has(fixtureId));
      if (result.missingSettlementFixtureIds.length) {
        result.errors.push(`v3-fixture-backfill-missing:${result.missingSettlementFixtureIds.join(",")}`);
      }
    }
  }

  const ranking = await rebuildTouchLinePlayerRankingV3(admin);
  result.rankingSnapshotId = ranking.snapshotId;
  result.rankingPlayers = ranking.playerCount;
  result.rankingPublished = ranking.published;
  result.rankingError = ranking.ok ? null : ranking.error ?? "unavailable";
  // Missing provider scoring facts must defer ranking publication without
  // rolling back otherwise valid per-player settlements. Infrastructure or
  // persistence failures remain fatal and visible to the protected sync.
  if (!ranking.ok && ranking.error !== "ranking-source-incomplete") {
    result.errors.push(`ranking:${ranking.error ?? "unavailable"}`);
  }
  result.ok = result.errors.length === 0;
  return result;
}
