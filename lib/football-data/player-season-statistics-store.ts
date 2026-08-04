import type { SupabaseClient } from "@supabase/supabase-js";

import { buildTouchLinePlayerSeasonAggregate } from "@/lib/football-data/player-season-statistics-sync";
import type { TouchlineFantasyLineupMember } from "@/lib/football-data/types";

type MembershipRow = {
  football_player_id: string;
  competition_id: string;
  season_id: string;
  club_id: string;
  football_players?: { provider?: string; provider_player_id?: string } | null;
  football_seasons?: { name?: string | null } | null;
  football_competitions?: { name?: string | null } | null;
  football_clubs?: { name?: string | null } | null;
};
type FixtureRow = {
  id: string;
  provider: string;
  provider_fixture_id: string;
  season_id: string;
  home_club_id: string | null;
  away_club_id: string | null;
  status: string | null;
};
type FeedRow = { provider: string; provider_fixture_id: string; lineups_payload: unknown; last_synced_at: string | null };

function isFinishedStatus(value: string | null) {
  return /^(?:finished|ft|after extra time|after penalties)$/i.test(String(value ?? "").trim());
}

function lineupMembers(value: unknown): TouchlineFantasyLineupMember[] | null {
  if (!Array.isArray(value)) return null;
  return value as TouchlineFantasyLineupMember[];
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

export type PlayerSeasonStatisticsSyncResult = {
  ok: boolean;
  membershipsRead: number;
  aggregatesWritten: number;
  fixtureRowsWritten: number;
  partialAggregates: number;
  unavailableAggregates: number;
  errors: string[];
};

/**
 * Rebuilds the canonical read model from persisted normalized fixtures and
 * feeds. It never calls an external provider and does not guess historical
 * membership: absent memberships yield unavailable rows instead of totals.
 */
export async function syncTouchLinePlayerSeasonStatistics(admin: SupabaseClient): Promise<PlayerSeasonStatisticsSyncResult> {
  const result: PlayerSeasonStatisticsSyncResult = {
    ok: false,
    membershipsRead: 0,
    aggregatesWritten: 0,
    fixtureRowsWritten: 0,
    partialAggregates: 0,
    unavailableAggregates: 0,
    errors: [],
  };
  const { data: memberships, error: membershipsError } = await admin
    .from("football_player_season_memberships")
    .select("football_player_id,competition_id,season_id,club_id,football_players(provider,provider_player_id),football_seasons(name),football_competitions(name),football_clubs(name)");
  if (membershipsError || !Array.isArray(memberships)) {
    result.errors.push(membershipsError?.message ?? "player-season-memberships-unavailable");
    return result;
  }
  result.membershipsRead = memberships.length;

  const { data: fixtures, error: fixturesError } = await admin
    .from("football_fixtures")
    .select("id,provider,provider_fixture_id,season_id,home_club_id,away_club_id,status");
  if (fixturesError || !Array.isArray(fixtures)) {
    result.errors.push(fixturesError?.message ?? "fixtures-unavailable");
    return result;
  }
  const { data: feeds, error: feedsError } = await admin
    .from("football_fantasy_fixture_feeds")
    .select("provider,provider_fixture_id,lineups_payload,last_synced_at");
  if (feedsError || !Array.isArray(feeds)) {
    result.errors.push(feedsError?.message ?? "fixture-feeds-unavailable");
    return result;
  }
  const feedByKey = new Map((feeds as FeedRow[]).map((feed) => [`${feed.provider}:${feed.provider_fixture_id}`, feed]));

  for (const membership of memberships as MembershipRow[]) {
    const providerPlayerId = String(membership.football_players?.provider_player_id ?? "").trim();
    const provider = membership.football_players?.provider;
    if (provider !== "sportmonks" || !/^\d+$/.test(providerPlayerId)) {
      result.errors.push(`invalid-player-mapping:${membership.football_player_id}`);
      continue;
    }
    const eligibleFixtures = (fixtures as FixtureRow[]).filter((fixture) =>
      fixture.season_id === membership.season_id
      && isFinishedStatus(fixture.status)
      && (fixture.home_club_id === membership.club_id || fixture.away_club_id === membership.club_id),
    );
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
      eligibleFixtures: eligibleFixtures.map((fixture) => {
        const feed = feedByKey.get(`${fixture.provider}:${fixture.provider_fixture_id}`);
        return {
          fixtureId: fixture.id,
          lineups: feed ? lineupMembers(feed.lineups_payload) : null,
          latestSyncAt: feed?.last_synced_at ?? null,
        };
      }),
    });
    const { error: aggregateError } = await admin
      .from("football_player_season_statistics")
      .upsert({
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
        source_synced_at: aggregate.latestSyncAt,
      }, { onConflict: "football_player_id,competition_id,season_id" });
    if (aggregateError) {
      result.errors.push(`aggregate:${membership.football_player_id}:${aggregateError.message}`);
      continue;
    }
    result.aggregatesWritten += 1;
    if (aggregate.coverageStatus === "partial") result.partialAggregates += 1;
    if (aggregate.coverageStatus === "unavailable") result.unavailableAggregates += 1;

    for (const fixture of eligibleFixtures) {
      const feed = feedByKey.get(`${fixture.provider}:${fixture.provider_fixture_id}`);
      const member = lineupMembers(feed?.lineups_payload)?.find((lineup) => String(lineup.playerId ?? "") === providerPlayerId);
      const statistics = member ? providerStatisticMap(member) : {};
      const { error: fixtureError } = await admin
        .from("football_player_fixture_statistics")
        .upsert({
          football_player_id: membership.football_player_id,
          fixture_id: fixture.id,
          competition_id: membership.competition_id,
          season_id: membership.season_id,
          club_id: membership.club_id,
          appearance_status: feed ? appearanceStatus(member) : "unavailable",
          minutes_played: statistics["minutes-played"] ?? statistics.minutes ?? null,
          rating: statistics.rating ?? null,
          statistics_payload: statistics,
          source_synced_at: feed?.last_synced_at ?? null,
        }, { onConflict: "football_player_id,fixture_id" });
      if (fixtureError) result.errors.push(`fixture:${fixture.id}:${fixtureError.message}`);
      else result.fixtureRowsWritten += 1;
    }
  }
  result.ok = result.errors.length === 0;
  return result;
}
