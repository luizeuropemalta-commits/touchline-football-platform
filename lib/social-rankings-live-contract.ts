import { buildTouchLinePlayerSeasonAggregate } from "./football-data/player-season-statistics-sync.ts";
import { isTouchLineSettledFixtureStatus } from "./football-data/fixture-settlement.ts";
import { resolveTouchlineOfficialLeagueTable } from "./football-data/official-league-table.ts";
import { buildSportmonksRankingDraft, auditTouchlineRankingDraft, type TouchlineSportmonksRankingPlayer } from "./touchlineArena/card-ranking-pipeline.ts";
import { compareTouchlineRankingPlayers } from "./touchlineArena/card-ranking.ts";
import { isTouchLinePlayerRankingSettlementComplete } from "./touchlineArena/player-ranking-eligibility.ts";
import { buildTouchlineSelection } from "./touchlineArena/touchline-selection.ts";
import { classifyTouchlinePlayerLeadershipPublication } from "./touchlineArena/player-ranking-leadership.ts";
import { touchlineCoachOutcome, touchlineCoachPoints, emptyTouchlineCoachRecord, type TouchlineCoachRecord } from "./touchlineArena/coach-scoring.ts";
import { touchlineLiveCoachForProviderId } from "./touchlineArena/live-coaches.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "./touchlineArena/demo-data.ts";
import { classifyTouchlineConfirmedMatchEvent } from "./touchlineArena/social-confirmed-event-contract.ts";
import { touchlineSocialFinalScoreGoalsMatchScore } from "./touchlineArena/social-final-score-events.ts";
import type { TouchlineFantasyLineupMember } from "./football-data/types.ts";

export const RANKINGS_LIVE_ART_IDS = ["OVERALL_LEADER", "GAMEWEEK_HERO", "GAMEWEEK_TOP_CARD", "GAMEWEEK_XI_COACH", "SEASON_XI_COACH", "GOLDEN_BOOT", "TOP_COACH", "LEAGUE_TABLE_PREVIEW", "LEAGUE_TABLE_FINAL"] as const;
export type RankingsLiveArtId = typeof RANKINGS_LIVE_ART_IDS[number];
export const RANKINGS_LIVE_LOOP_MS = 6000;
export const RANKINGS_LIVE_COMPETITION = "ce833f5a-4121-47d7-86f6-2e37f2f74a2a";
export const RANKINGS_LIVE_SEASON = "1e83121b-b778-459b-b9a0-7cf1eaff5729";
type Fixture = { id: string; provider_fixture_id: string; season_id: string; round_id: string; home_club_id: string; away_club_id: string; starts_at: string; status: string; home_score: number | null; away_score: number | null; source_updated_at: string; finalized_at: string | null };
type Club = { id: string; provider_team_id: string; name: string; short_code: string; logo_url: string; source_updated_at: string };
type Goal = { fixture_id: string; provider_event_id: string; provider_team_id: string; provider_player_id: string | null; football_player_id: string | null; event_type: string; event_status: string; info: string | null; addition: string | null; name: string | null; current_club_id: string | null };
export type RankingsLiveSource = {
  fetchedAt: string; competitionId: string;
  season: { id: string; provider_season_id: string; name: string; source_updated_at: string };
  fixtures: Fixture[]; clubs: Club[]; rounds: { id: string; provider_round_id: string; name: string }[]; goals: Goal[];
  playerSnapshot: { snapshot_id: string; generated_at: string; fixture_ids: string[] };
  coachSnapshot: { snapshot_id: string; season_id: string; league_key: string; scoring_version: string; generated_at: string; fixture_ids: string[]; ranking_payload: { rank: number; clubName: string; tiebreaker: string; coachProviderId: string; touchlinePoints: number; wins: number; draws: number; losses: number; awayWins: number; home: TouchlineCoachRecord; away: TouchlineCoachRecord }[] };
};
type Settlement = { football_player_id: string; fixture_id: string; club_id: string; scoring_version: string; appearance_status: string; minutes_played: number | null; rating: number | null; ranking_coverage_status: "complete" | "complete_for_scoring" | "blocking_partial"; settlement_status: string; source_synced_at: string };
export type RankingsLiveEvidence = {
  fetchedAt: string; settlements: Settlement[]; publishedPlayerIds: string[];
  ratingFeeds: { fixtureId: string; providerFixtureId: string; lastSyncedAt: string; lineups: TouchlineFantasyLineupMember[] }[];
  players: { id: string; provider_player_id: string; name: string; display_name: string | null; current_club_id: string; provider_position: string | null; detailed_position: string | null; position: string | null }[];
  memberships: { football_player_id: string; club_id: string }[];
};

/** Local-only replay. No publisher, database client or remote write is imported. */
export function deriveRankingsLive(source: RankingsLiveSource, evidence: RankingsLiveEvidence, eligiblePlayerIds: readonly string[], revision: string) {
  if (source.competitionId !== RANKINGS_LIVE_COMPETITION || source.season.id !== RANKINGS_LIVE_SEASON || source.season.provider_season_id !== "28083") throw new Error("RANKINGS_WRONG_SCOPE");
  const now = Date.parse(evidence.fetchedAt);
  if (!Number.isFinite(now)) throw new Error("RANKINGS_TIME_MISSING");
  const finals = source.fixtures.filter((f) => isTouchLineSettledFixtureStatus(f.status));
  if (!finals.length || finals.some((f) => f.season_id !== source.season.id || f.home_score === null || f.away_score === null || Date.parse(f.starts_at) > now)) throw new Error("RANKINGS_FINAL_FACTS_INVALID");
  if (new Set(finals.map((f) => f.id)).size !== finals.length || new Set(finals.map((f) => f.provider_fixture_id)).size !== finals.length) throw new Error("RANKINGS_DUPLICATE_FIXTURE");
  const latest = [...finals].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))[0]!;
  const round = source.rounds.find((r) => r.id === latest.round_id);
  const roundFixtures = source.fixtures.filter((f) => f.round_id === latest.round_id);
  if (!round || roundFixtures.length !== 10 || roundFixtures.some((f) => !isTouchLineSettledFixtureStatus(f.status)) || new Set(roundFixtures.flatMap((f) => [f.home_club_id, f.away_club_id])).size !== 20) throw new Error("RANKINGS_ROUND_INCOMPLETE");
  const eligible = new Set(eligiblePlayerIds);
  const feeds = new Map(evidence.ratingFeeds.map((f) => [f.fixtureId, f]));
  if (feeds.size !== finals.length || finals.some((f) => !feeds.has(f.id))) throw new Error("RANKINGS_LINEUP_COVERAGE_MISSING");
  const clubs = new Map(source.clubs.map((c) => [c.id, c]));
  const settlements = new Map<string, Settlement>();
  for (const row of evidence.settlements) {
    const key = `${row.football_player_id}:${row.fixture_id}`;
    if (settlements.has(key)) throw new Error("RANKINGS_DUPLICATE_SETTLEMENT");
    settlements.set(key, row);
  }
  function ranking(scope: Fixture[], label: string) {
    const rows: TouchlineSportmonksRankingPlayer[] = [];
    for (const p of evidence.players.filter((player) => eligible.has(player.id))) {
      const memberships = new Set(evidence.memberships.filter((m) => m.football_player_id === p.id).map((m) => m.club_id));
      // Same historical club-union fence as player-season-statistics-store.
      const expected = scope.filter((f) => memberships.has(f.home_club_id) || memberships.has(f.away_club_id));
      if (!expected.length) continue;
      const parts = expected.map((f) => {
        const row = settlements.get(`${p.id}:${f.id}`);
        if (!row || row.scoring_version !== "player_scoring_v3" || !isTouchLinePlayerRankingSettlementComplete({ settlementStatus: row.settlement_status, rankingCoverageStatus: row.ranking_coverage_status })) throw new Error(`RANKINGS_MISSING_SETTLEMENT:${p.id}:${f.id}`);
        if (![f.home_club_id, f.away_club_id].includes(row.club_id)) throw new Error("RANKINGS_SETTLEMENT_CLUB_MISMATCH");
        if (row.rating !== null && (!Number.isFinite(row.rating) || row.rating < 0 || row.rating > 10)) throw new Error("RANKINGS_RATING_INVALID");
        const feed = feeds.get(f.id)!;
        const member = feed.lineups.find((m) => String(m.playerId) === p.provider_player_id);
        const stat = (code: string) => {
          const value = member?.statistics.find((s) => s.code === code)?.value;
          return value === undefined || value === null ? null : Number(value);
        };
        if (stat("rating") !== row.rating || (stat("minutes-played") ?? stat("minutes")) !== row.minutes_played) throw new Error(`RANKINGS_FEED_SETTLEMENT_MISMATCH:${p.id}:${f.id}`);
        // Feed rows are preserved verbatim for rating/minutes fields, including
        // unused substitutes. The canonical aggregator owns null semantics.
        return {
          fixtureId: f.id, latestSyncAt: feed.lastSyncedAt,
          rankingCoverageStatus: row.ranking_coverage_status,
          lineups: feed.lineups,
        };
      });
      const club = clubs.get(p.current_club_id);
      if (!club) throw new Error(`RANKINGS_PLAYER_CLUB_MISSING:${p.id}`);
      const aggregate = buildTouchLinePlayerSeasonAggregate({ season: { seasonId: source.season.id, seasonName: source.season.name, competitionId: source.competitionId, competitionName: "Premier League", clubId: club.id, clubName: club.name }, providerPlayerId: p.provider_player_id, eligibleFixtures: parts });
      if (!["complete", "complete_for_scoring"].includes(aggregate.coverageStatus)) throw new Error(`RANKINGS_AGGREGATE_INCOMPLETE:${p.id}`);
      if (aggregate.summary.totalRating === null) continue;
      rows.push({ playerId: p.id, providerPlayerId: p.provider_player_id, name: p.display_name || p.name, clubName: club.name, position: p.detailed_position || p.provider_position || p.position, role: p.provider_position, totalRating: aggregate.summary.totalRating, minutesPlayed: aggregate.summary.minutes ?? 0, appearances: aggregate.summary.appearances ?? 0, provider: "sportmonks", verified: true, sourceFixtureIds: expected.map((f) => f.provider_fixture_id) });
    }
    const fixtureIds = scope.map((f) => f.provider_fixture_id).sort();
    const draft = buildSportmonksRankingDraft({ snapshotId: `local-review:${label}:${revision}`, seasonId: source.season.id, roundId: round!.provider_round_id, receivedAt: evidence.fetchedAt, expectedPlayerCount: rows.length, scoringVersion: "player_scoring_v3", coverageStatus: "complete_for_scoring", fixtureIds, expectedFixtureIds: fixtureIds, totalScorePoints: 0, players: rows });
    const audit = auditTouchlineRankingDraft(draft, evidence.fetchedAt);
    if (!audit.passed || !audit.snapshot) throw new Error(`RANKINGS_AUDIT_FAILED:${audit.issues.map((i) => i.code).join(",")}`);
    return { snapshot: audit.snapshot, audit };
  }
  const seasonRanking = ranking(finals, "season");
  const weeklyRanking = ranking(roundFixtures, "round");
  const overall = [...seasonRanking.snapshot.players].sort(compareTouchlineRankingPlayers)[0]!;
  const weeklyOverall = [...weeklyRanking.snapshot.players].sort(compareTouchlineRankingPlayers)[0]!;
  const selection = buildTouchlineSelection(seasonRanking.snapshot);
  const weeklySelection = buildTouchlineSelection(weeklyRanking.snapshot);
  if (!selection.complete || !weeklySelection.complete) throw new Error("RANKINGS_XI_INCOMPLETE");
  const leadership = classifyTouchlinePlayerLeadershipPublication({ snapshotId: seasonRanking.snapshot.snapshotId, rankingPayload: { players: seasonRanking.snapshot.players } });
  const coachSnapshot = source.coachSnapshot;
  const publishedCoachRows = coachSnapshot.ranking_payload;
  if (coachSnapshot.season_id !== source.season.id || coachSnapshot.league_key !== "touchline-england" || coachSnapshot.scoring_version !== "coach_scoring_v2" || !coachSnapshot.snapshot_id || !Number.isFinite(Date.parse(coachSnapshot.generated_at))) throw new Error("RANKINGS_COACH_SCOPE_INVALID");
  if (!Array.isArray(coachSnapshot.fixture_ids) || [...coachSnapshot.fixture_ids].sort().join(",") !== finals.map(f => f.provider_fixture_id).sort().join(",")) throw new Error("RANKINGS_COACH_COVERAGE_MISMATCH");
  if (!Array.isArray(publishedCoachRows) || publishedCoachRows.length !== source.clubs.length || new Set(publishedCoachRows.map(row => row.coachProviderId)).size !== publishedCoachRows.length) throw new Error("RANKINGS_COACH_PAYLOAD_INCOMPLETE");
  // The published payload owns participants, rank and season points. The
  // runtime lookup supplies existing card assets only; a changed assignment
  // cannot silently move the published score to a different coach or club.
  const publishedCoaches = publishedCoachRows.map((row, index) => {
    const identity = touchlineLiveCoachForProviderId(row.coachProviderId);
    const club = source.clubs.find(c => c.provider_team_id === identity?.coach.teamId);
    if (!identity || !club || row.clubName !== club.name) throw new Error(`RANKINGS_COACH_IDENTITY_MISMATCH:${row.coachProviderId}`);
    const records = [row.home, row.away];
    if (row.rank !== index + 1 || row.tiebreaker !== "points,wins,awayWins,coachProviderId" || ![row.touchlinePoints, row.wins, row.draws, row.losses, row.awayWins].every(Number.isInteger) || records.some(record => !record || ![record.touchlinePoints, record.wins, record.draws, record.losses].every(Number.isInteger) || [record.wins, record.draws, record.losses].some(n => n < 0))) throw new Error("RANKINGS_COACH_PAYLOAD_INVALID");
    return { ...row, name: identity.coach.displayName || identity.coach.name, clubId: club.id, clubProviderId: club.provider_team_id };
  });
  if (new Set(publishedCoaches.map(c => c.clubId)).size !== source.clubs.length) throw new Error("RANKINGS_COACH_CLUB_COVERAGE_MISMATCH");
  function rankCoaches(scope: Fixture[]) { return publishedCoaches.map((published) => {
    const home = emptyTouchlineCoachRecord(), away = emptyTouchlineCoachRecord();
    for (const f of scope.filter((f) => [f.home_club_id, f.away_club_id].includes(published.clubId))) {
      const context = f.home_club_id === published.clubId ? "home" : "away";
      const outcome = touchlineCoachOutcome(context, f.home_score!, f.away_score!);
      const record = context === "home" ? home : away;
      const key = outcome === "win" ? "wins" : outcome === "draw" ? "draws" : "losses";
      // Public record types are readonly; construct new records below.
      Object.assign(record, { [key]: record[key] + 1, touchlinePoints: record.touchlinePoints + touchlineCoachPoints(context, outcome) });
    }
    return { ...published, home, away, wins: home.wins + away.wins, draws: home.draws + away.draws, losses: home.losses + away.losses, awayWins: away.wins, touchlinePoints: home.touchlinePoints + away.touchlinePoints };
  }).sort((a, b) => b.touchlinePoints - a.touchlinePoints || b.wins - a.wins || b.awayWins - a.awayWins || (a.coachProviderId < b.coachProviderId ? -1 : a.coachProviderId > b.coachProviderId ? 1 : 0)).map((c, index) => ({ ...c, rank: index + 1 })); }
  // Exact published SQL order: points,wins,awayWins,coachProviderId. Only scope differs.
  const reconciledCoaches = rankCoaches(finals);
  for (const [index, row] of publishedCoaches.entries()) {
    const replay = reconciledCoaches[index]!;
    const fields = ["rank", "coachProviderId", "touchlinePoints", "wins", "draws", "losses", "awayWins"] as const;
    const recordFields = ["touchlinePoints", "wins", "draws", "losses"] as const;
    if (fields.some(key => row[key] !== replay[key]) || recordFields.some(key => row.home[key] !== replay.home[key] || row.away[key] !== replay.away[key])) throw new Error(`RANKINGS_COACH_PUBLISHED_REPLAY_MISMATCH:${row.coachProviderId}`);
  }
  const coaches = publishedCoaches;
  const weeklyCoaches = rankCoaches(roundFixtures);
  const table = resolveTouchlineOfficialLeagueTable({ competitionProviderId: "8", season: { id: source.season.id, providerSeasonId: source.season.provider_season_id, name: source.season.name, sourceUpdatedAt: source.season.source_updated_at }, now, teams: source.clubs.map((c) => ({ clubId: c.id, providerTeamId: c.provider_team_id, name: c.name, shortCode: c.short_code, slug: TOUCHLINE_ENGLAND_CLUBS.find((t) => t.teamId === c.provider_team_id)?.slug ?? null, logoUrl: TOUCHLINE_ENGLAND_CLUBS.find((t) => t.teamId === c.provider_team_id)?.logoUrl ?? c.logo_url, sourceUpdatedAt: c.source_updated_at })), fixtures: finals.map((f) => ({ provider: "sportmonks", providerFixtureId: f.provider_fixture_id, seasonId: f.season_id, status: f.status, homeClubId: f.home_club_id, awayClubId: f.away_club_id, homeScore: f.home_score, awayScore: f.away_score, startsAt: f.starts_at, sourceUpdatedAt: f.source_updated_at })) });
  if (table.state !== "ready" || table.coverage.completedFixtures !== finals.length) throw new Error("RANKINGS_TABLE_INCOMPLETE");
  const goals = source.goals.filter((g) => ["goal", "penalty", "own-goal"].includes(classifyTouchlineConfirmedMatchEvent({ type: g.event_type, status: g.event_status, info: g.info, addition: g.addition }) ?? ""));
  const goalMismatches = finals.filter((f) => !touchlineSocialFinalScoreGoalsMatchScore(goals.filter((g) => g.fixture_id === f.id).map((g) => ({ teamId: g.provider_team_id })), { homeTeamId: clubs.get(f.home_club_id)!.provider_team_id, awayTeamId: clubs.get(f.away_club_id)!.provider_team_id, homeScore: f.home_score!, awayScore: f.away_score! })).map((f) => f.provider_fixture_id);
  const goalCounts = new Map<string, { playerId: string; providerPlayerId: string; name: string; clubId: string; goals: number }>();
  for (const g of goals.filter((g) => g.event_type !== "Own Goal")) {
    if (!g.football_player_id || !g.provider_player_id || !g.name || !g.current_club_id) continue;
    const entry = goalCounts.get(g.football_player_id) ?? { playerId: g.football_player_id, providerPlayerId: g.provider_player_id, name: g.name, clubId: g.current_club_id, goals: 0 };
    entry.goals += 1; goalCounts.set(entry.playerId, entry);
  }
  const maxGoals = Math.max(0, ...[...goalCounts.values()].map((g) => g.goals));
  const topScorers = [...goalCounts.values()].filter((g) => g.goals === maxGoals);
  const nextRound = source.rounds.filter((r) => Number(r.name) > Number(round.name)).sort((a, b) => Number(a.name) - Number(b.name))[0] ?? null;
  const nextRoundStartsAt = nextRound ? source.fixtures.filter((f) => f.round_id === nextRound.id).map((f) => f.starts_at).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null : null;
  const latestFact = [...finals.map((f) => f.source_updated_at), ...evidence.settlements.map((s) => s.source_synced_at)].sort((a, b) => Date.parse(b) - Date.parse(a))[0]!;
  const playerClubProviderIds = Object.fromEntries(seasonRanking.snapshot.players.map((player) => {
    const identity = evidence.players.find((p) => p.id === player.playerId)!;
    return [player.playerId, clubs.get(identity.current_club_id)!.provider_team_id];
  }));
  return { provenance: { source: "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED", revision, fetchedAt: evidence.fetchedAt, asOf: latestFact, competitionId: source.competitionId, seasonId: source.season.id, fixtureIds: finals.map((f) => f.provider_fixture_id), activePlayerSnapshot: source.playerSnapshot.snapshot_id, activeCoachSnapshot: source.coachSnapshot.snapshot_id }, publishable: false as const, outbound: "DISABLED" as const, round, nextRound, nextRoundStartsAt, overall, weeklyOverall, leadership, seasonRanking, weeklyRanking, weeklyLeaders: weeklyRanking.snapshot.positions.map((p) => p.players[0]!), selection, weeklySelection, coaches, weeklyCoaches, playerClubProviderIds, table, goldenBoot: { state: goalMismatches.length ? "BLOCKED_RECONCILIATION" as const : "FACTUAL_REVIEW" as const, mismatchedFixtureIds: goalMismatches, candidates: topScorers }, gates: ["OWNER_VIDEO_AND_CAPTION_REVIEW_REQUIRED", "ACTIVE_PLAYER_SNAPSHOT_REQUIRES_RECONCILIATION", "LOCAL_REPLAY_NOT_REMOTE_RANKING", "WEEKLY_ONE_PER_POSITION_REVIEW_PROPOSAL", "FORMATION_USES_CANONICAL_4_3_3_V2", ...(goalMismatches.length ? ["GOLDEN_BOOT_GOAL_HISTORY_UNRECONCILED"] : [])] };
}
export type RankingsLiveDerived = ReturnType<typeof deriveRankingsLive>;
