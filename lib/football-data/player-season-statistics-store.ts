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
import { inspectTouchlineOfficialTeamSheet } from "@/lib/football-data/official-team-sheet-readiness";
import type { TouchlineFantasyEvent, TouchlineFantasyFixtureFeed, TouchlineFantasyLineupMember, TouchlineFantasySidelinedPlayer } from "@/lib/football-data/types";
import { auditTouchlinePlayerScoreSettlementCoverage, rebuildTouchLinePlayerRankingV3 } from "@/lib/touchlineArena/player-ranking-rebuild-server";

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
  /** In-memory evidence only, never persisted as a season-wide membership. */
  sidelineFixtureIds?: Set<string>;
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
  fixture_payload?: unknown;
  lineups_payload: unknown;
  events_payload: unknown;
  sidelined_payload?: unknown;
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
async function readCompleteStatisticsInput(
  admin: SupabaseClient,
  table: string,
  columns: string,
  filter?: { column: string; values: string[] },
) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const chunks = filter
    ? Array.from({ length: Math.ceil(filter.values.length / 100) }, (_, i) => filter.values.slice(i * 100, (i + 1) * 100))
    : [null];
  for (const chunk of chunks) {
    let expected: number | null = null;
    for (let offset = 0; ; offset += 500) {
      let query = admin.from(table)
        .select(columns, { count: "exact" })
        .order("id", { ascending: true })
        .range(offset, offset + 499);
      if (filter && chunk) query = query.eq("provider", "sportmonks").in(filter.column, chunk);
      const { data, error, count } = await query;
      const fail = (code: string) => ({ data: null, error: { message: `${table}:${code}` } });
      if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count === null || count < 0) return fail("read-unavailable");
      if (count > 50000 || rows.length + data.length > 50000) return fail("read-limit");
      if (expected !== null && count !== expected) return fail("source-changed");
      expected = count;
      if (data.length !== Math.min(500, Math.max(0, count - offset))) return fail("read-incomplete");
      for (const row of data as unknown as Record<string, unknown>[]) {
        if (typeof row.id !== "string" || !row.id || seen.has(row.id)) return fail("read-duplicate-or-missing-id");
        seen.add(row.id);
        rows.push(row);
      }
      if (offset + data.length >= count) break;
    }
  }
  return { data: rows, error: null };
}

export async function syncTouchLinePlayerSeasonStatistics(admin: SupabaseClient): Promise<PlayerSeasonStatisticsSyncResult> {
  const result: PlayerSeasonStatisticsSyncResult = {
    ok: false,
    membershipsRead: 0,
    aggregatesWritten: 0,
    fixtureRowsWritten: 0,
    v3FixtureRowsWritten: 0,
    membershipsWritten: 0,
    canonicalEventsWritten: 0,
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
  const { data: fixtures, error: fixturesError } = await readCompleteStatisticsInput(admin,"football_fixtures",
    "id,provider,provider_fixture_id,competition_id,season_id,home_club_id,away_club_id,status,home_score,away_score,football_seasons(name),football_competitions(name)");
  if (fixturesError || !Array.isArray(fixtures)) {
    result.errors.push(fixturesError?.message ?? "fixtures-unavailable");
    return result;
  }
  const { data: feeds, error: feedsError } = await readCompleteStatisticsInput(admin,"football_fantasy_fixture_feeds",
    "id,provider,provider_fixture_id,fixture_payload,lineups_payload,events_payload,sidelined_payload,created_at,last_synced_at");
  if (feedsError || !Array.isArray(feeds)) {
    result.errors.push(feedsError?.message ?? "fixture-feeds-unavailable");
    return result;
  }
  const feedByKey = new Map((feeds as FeedRow[]).map((feed) => [`${feed.provider}:${feed.provider_fixture_id}`, feed]));

  // This writer resolves Sportmonks identities only. Reject inconsistent
  // provenance before numeric IDs can collide with that provider's mappings.
  for (const feed of feeds as FeedRow[]) {
    const members = lineupMembers(feed.lineups_payload) ?? [];
    if (members.some((member) => !member
      || feed.provider !== "sportmonks"
      || member.provider !== feed.provider
      || String(member.fixtureId) !== feed.provider_fixture_id
      || !/^\d+$/.test(String(member.playerId ?? ""))
      || !/^\d+$/.test(String(member.teamId ?? "")))) {
      result.errors.push("lineup-provenance-invalid");
      return result;
    }
  }

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
  // A final fixture's explicit sideline is evidence for that fixture only.
  // Reject conflicting club/lineup claims rather than guessing an identity.
  const sidelineFacts = (feeds as FeedRow[]).flatMap((feed) => {
    const matchingFixtures = (fixtures as FixtureRow[]).filter((candidate) => (
      candidate.provider === feed.provider && candidate.provider_fixture_id === feed.provider_fixture_id
    ));
    if (matchingFixtures.length !== 1 || (feeds as FeedRow[]).filter((candidate) => (
      candidate.provider === feed.provider && candidate.provider_fixture_id === feed.provider_fixture_id
    )).length !== 1) return [];
    const fixture = matchingFixtures[0];
    if (feed.provider !== "sportmonks" || !fixture?.season_id || !fixture.competition_id
      || !isTouchLineSettledFixtureStatus(fixture.status) || !Array.isArray(feed.sidelined_payload)) return [];
    const payload = feed.fixture_payload as TouchlineFantasyFixtureFeed["fixture"] | null;
    if (!payload || payload.provider !== feed.provider || payload.providerId !== feed.provider_fixture_id
      || !isTouchLineSettledFixtureStatus(payload.status) || !Number.isFinite(Date.parse(feed.last_synced_at ?? ""))
      || !Array.isArray(feed.lineups_payload) || !Array.isArray(feed.events_payload)) return [];
    const officialFeed: TouchlineFantasyFixtureFeed = {
      fixture: payload, lineups: feed.lineups_payload, events: feed.events_payload,
      sidelined: [], formations: [], fetchedAt: feed.last_synced_at!,
      mediaPolicy: { officialMediaExposed: false, note: "Persisted internal fixture evidence" },
    };
    if (!inspectTouchlineOfficialTeamSheet(officialFeed).completeTeamSheetsReady) return [];
    const rows = feed.sidelined_payload.filter((row): row is TouchlineFantasySidelinedPlayer => Boolean(
      row && typeof row === "object" && row.provider === feed.provider
      && row.fixtureId === feed.provider_fixture_id && /^\d+$/.test(String(row.playerId ?? ""))
      && /^\d+$/.test(String(row.teamId ?? ""))
      && [payload.homeTeam?.providerId, payload.awayTeam?.providerId].includes(String(row.teamId)),
    ));
    return rows.flatMap((member) => {
      if (new Set(rows.filter((row) => row.playerId === member.playerId).map((row) => row.teamId)).size !== 1
        || (lineupMembers(feed.lineups_payload) ?? []).some((row) => String(row.playerId) === String(member.playerId))) return [];
      return [{ fixture, feed, member }];
    });
  });
  const providerPlayerIds = [...new Set([...lineupFacts, ...sidelineFacts].map(({ member }) => String(member.playerId)))];
  const providerTeamIds = [...new Set([...lineupFacts, ...sidelineFacts].map(({ member }) => String(member.teamId)))];
  const [{ data: playerRows, error: playerRowsError }, { data: clubRows, error: clubRowsError }] = await Promise.all([
    providerPlayerIds.length
      ? readCompleteStatisticsInput(admin,"football_players","id,provider,provider_player_id,provider_position,position", {column:"provider_player_id",values:providerPlayerIds})
      : Promise.resolve({ data: [], error: null }),
    providerTeamIds.length
      ? readCompleteStatisticsInput(admin,"football_clubs","id,provider_team_id,name", {column:"provider_team_id",values:providerTeamIds})
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (playerRowsError || clubRowsError || !Array.isArray(playerRows) || !Array.isArray(clubRows)) {
    result.errors.push(playerRowsError?.message ?? clubRowsError?.message ?? "lineup-identity-mapping-unavailable");
    return result;
  }
  const playerIdByProviderId = new Map(playerRows.map((row) => [String(row.provider_player_id), String(row.id)]));
  const clubIdByProviderId = new Map(clubRows.map((row) => [String(row.provider_team_id), String(row.id)]));
  // A successful paginated read does not prove every team-sheet identity was
  // resolved. Never silently omit named participants or select an ambiguous
  // mapping before writing memberships, history, scores or ranking snapshots.
  const unresolvedLineupPlayers = new Set<string>();
  const unresolvedLineupClubs = new Set<string>();
  for (const { member } of lineupFacts) {
    const playerId = String(member.playerId);
    const teamId = String(member.teamId);
    if (playerRows.filter((row) => String(row.provider_player_id) === playerId).length !== 1) {
      unresolvedLineupPlayers.add(playerId);
    }
    if (clubRows.filter((row) => String(row.provider_team_id) === teamId).length !== 1) {
      unresolvedLineupClubs.add(teamId);
    }
  }
  if (unresolvedLineupPlayers.size || unresolvedLineupClubs.size) {
    result.errors.push(`lineup-identity-coverage:players=${unresolvedLineupPlayers.size};clubs=${unresolvedLineupClubs.size}`);
    return result;
  }
  const { data: existingMemberships, error: membershipsError } = await readCompleteStatisticsInput(admin,
    "football_player_season_memberships",
    "id,football_player_id,competition_id,season_id,club_id,source_synced_at,football_players(provider,provider_player_id,provider_position,position),football_seasons(name),football_competitions(name),football_clubs(name)");
  if (membershipsError || !existingMemberships) {
    result.errors.push(membershipsError?.message ?? "player-season-memberships-unavailable");
    return result;
  }
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

  // Store provider events as normalized facts. LINEUP_AVAILABLE is written
  // only by the shared official-team-sheet guard in live-sync; this statistics
  // rebuild must not maintain a weaker, duplicate lifecycle writer.
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
  }

  const membershipKey = (row: MembershipRow) => [row.football_player_id, row.competition_id, row.season_id, row.club_id].join(":");
  const membershipMap = new Map((existingMemberships as MembershipRow[]).map(row => [membershipKey(row),row]));
  for (const row of membershipRows) {
    const key = membershipKey(row);
    const previous = membershipMap.get(key);
    const context = fixtures.find(fixture => fixture.season_id === row.season_id && fixture.competition_id === row.competition_id);
    const club = clubRows.find(candidate => candidate.id === row.club_id);
    membershipMap.set(key, {
      ...previous,
      ...row,
      football_players: playerRows.find(player => String(player.id) === row.football_player_id),
      football_seasons: context?.football_seasons ?? previous?.football_seasons,
      football_competitions: context?.football_competitions ?? previous?.football_competitions,
      football_clubs: club?.name ? { name: club.name } : previous?.football_clubs,
    } as MembershipRow);
  }
  const memberships = [...membershipMap.values()];
  result.membershipsRead = memberships.length;
  const persistedKeys = new Set((memberships as MembershipRow[]).map(membershipKey));
  const scopedMemberships = new Map<string, MembershipRow>();
  for (const { fixture, feed, member } of sidelineFacts) {
    const matchingPlayers = playerRows.filter((row) => String(row.provider_player_id) === String(member.playerId));
    const matchingClubs = clubRows.filter((row) => String(row.provider_team_id) === String(member.teamId));
    if (matchingPlayers.length !== 1 || matchingClubs.length !== 1) continue;
    const player = matchingPlayers[0];
    const clubId = String(matchingClubs[0].id);
    if (!player || !clubId || (clubId !== fixture.home_club_id && clubId !== fixture.away_club_id)) continue;
    const row: MembershipRow = {
      football_player_id: String(player.id), competition_id: fixture.competition_id,
      season_id: fixture.season_id, club_id: clubId, source_synced_at: feed.last_synced_at,
      football_players: player, sidelineFixtureIds: new Set([fixture.id]),
    };
    const key = membershipKey(row);
    if (persistedKeys.has(key)) continue;
    const existing = scopedMemberships.get(key);
    if (existing) existing.sidelineFixtureIds!.add(fixture.id);
    else scopedMemberships.set(key, row);
  }

  // A full round can contain hundreds of players. Keep the persisted V2
  // audit rows and the active V3 rows, but materialise each table in one
  // idempotent command rather than making the live synchronisation wait for
  // one network round-trip per player and per fixture.
  const aggregateRows: Record<string, unknown>[] = [];
  const fixtureRows: Record<string, unknown>[] = [];
  const v3FixtureRows: Record<string, unknown>[] = [];
  const scoreableFixtures = (fixtures as FixtureRow[]).filter((fixture) => isTouchLineScoringFixtureStatus(fixture.status));
  result.scoringFixtureIds = scoreableFixtures.map((fixture) => fixture.id).sort();

  const membershipGroups = groupTouchLinePlayerSeasonMemberships([...(memberships as MembershipRow[]), ...scopedMemberships.values()]);
  for (const { canonicalMembership, historicalMemberships } of membershipGroups) {
    // An absence must not replace the existing season's canonical club.
    const membership = historicalMemberships.find((row) => !row.sidelineFixtureIds) ?? canonicalMembership;
    const providerPlayerId = String(membership.football_players?.provider_player_id ?? "").trim();
    const provider = membership.football_players?.provider;
    if (provider !== "sportmonks" || !/^\d+$/.test(providerPlayerId)) {
      result.errors.push(`invalid-player-mapping:${membership.football_player_id}`);
      continue;
    }
    const eligibleFixtures = (fixtures as FixtureRow[]).filter((fixture) =>
      fixture.provider === provider
      && fixture.season_id === membership.season_id
      && fixture.competition_id === membership.competition_id
      && isTouchLineScoringFixtureStatus(fixture.status)
      && historicalMemberships.some((candidate) => (
        (!candidate.sidelineFixtureIds || candidate.sidelineFixtureIds.has(fixture.id))
        && (candidate.club_id === fixture.home_club_id || candidate.club_id === fixture.away_club_id)
      )),
    );
    const fixtureSettlements = eligibleFixtures.map((fixture) => {
      const feed = feedByKey.get(`${fixture.provider}:${fixture.provider_fixture_id}`);
      const lineups = feed ? lineupMembers(feed.lineups_payload) : null;
      const member = lineups?.find((lineup) => String(lineup.playerId ?? "") === providerPlayerId);
      const lineupClubId = member?.teamId ? clubIdByProviderId.get(String(member.teamId)) : null;
      const fixtureMemberships = historicalMemberships.filter((candidate) => (
        (!candidate.sidelineFixtureIds || candidate.sidelineFixtureIds.has(fixture.id))
        && (candidate.club_id === fixture.home_club_id || candidate.club_id === fixture.away_club_id)
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
    const scoringIds = new Set(result.scoringFixtureIds);
    const seasonFixtures = new Map<string, string[]>();
    for (const fixture of fixtures as FixtureRow[]) {
      if (!scoringIds.has(fixture.id)) continue;
      const ids = seasonFixtures.get(fixture.season_id) ?? [];
      ids.push(fixture.id);
      seasonFixtures.set(fixture.season_id, ids);
    }
    for (const [seasonId, fixtureIds] of seasonFixtures) {
      const audit = await auditTouchlinePlayerScoreSettlementCoverage(admin, seasonId, fixtureIds);
      if (audit.error) result.errors.push(`v3-settlement-audit:${audit.error}`);
      result.missingSettlementFixtureIds.push(...audit.missingFixtureIds);
    }
    if (result.missingSettlementFixtureIds.length) {
      result.errors.push(`v3-fixture-backfill-missing:${result.missingSettlementFixtureIds.join(",")}`);
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
