import "server-only";

import { readPublicCompetitionFixtureByProviderId } from "@/lib/football-data/fixture-schedule-store";
import { toPublicFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-fixture";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import {
  publicPremierSquadPlayerToCard,
  readPublicPremierSquad,
} from "@/lib/football-data/public-premier-squad-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  type ClubOwnerSquadCard,
  type TouchLineClubVisual,
} from "@/lib/touchlineArena/demo-data";
import { applyTouchlineSeasonPoints } from "@/lib/touchlineArena/matchday-player-points";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import { resolveTouchlineFixtureVenue } from "@/lib/touchlineArena/stadium-catalog";
import { buildTouchlineFinalResultCaption } from "@/lib/touchlineArena/social-final-result-caption";
import { checksumTouchlineFinalResultRenderSource } from "@/lib/touchlineArena/social-final-result-render-source";
import {
  classifyTouchlineSocialFinalScoreGoalType,
  touchlineSocialFinalScoreGoalsMatchScore,
  type TouchlineSocialFinalScoreGoalKind,
} from "@/lib/touchlineArena/social-final-score-events";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMPETITION_PROVIDER_ID = "8";
const SOURCE_VERSION = "touchline-final-result-v1";
export const TOUCHLINE_FULL_TIME_TEMPLATE_VERSION = "touchline-full-time-feed-v1";
export const TOUCHLINE_FINAL_SCORE_TEMPLATE_VERSION = "touchline-final-score-story-v1";

function timestamp(value: unknown) {
  const candidate = String(value ?? "").trim();
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

export type TouchlineSocialFinalScoreGoal = Readonly<{
  id: string;
  teamId: string;
  playerName: string;
  relatedPlayerName: string | null;
  minute: number;
  extraMinute: number | null;
  kind: TouchlineSocialFinalScoreGoalKind;
}>;

export type TouchlineSocialFinalScoreDraft = Readonly<{
  sourceProvenance: "PERSISTED_VERIFIED_FINAL_RESULT";
  fixtureId: string;
  capturedAt: string;
  sourceSnapshotAt: string;
  startsAt: string;
  status: string;
  seasonProviderId: string;
  gameweekNumber: number;
  venue: Readonly<{ name: string; interiorImageUrl: string }>;
  caption: string;
  sourceVersion: typeof SOURCE_VERSION;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  home: TouchLineClubVisual & Readonly<{ logoUrl: string }>;
  away: TouchLineClubVisual & Readonly<{ logoUrl: string }>;
  score: Readonly<{ home: number; away: number }>;
  goals: readonly TouchlineSocialFinalScoreGoal[];
  topMatchCard: Readonly<{
    card: ClubOwnerSquadCard;
    officialMatchRating: number;
    team: TouchLineClubVisual;
  }>;
}>;

export type TouchlineSocialFinalScoreDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialFinalScoreDraft }>
  | Readonly<{ ok: false; reason: string }>;

function clubForTeamId(teamId: string) {
  const matches = TOUCHLINE_ENGLAND_CLUBS.filter((club) => club.teamId === teamId && club.logoUrl);
  return matches.length === 1
    ? matches[0] as TouchLineClubVisual & Readonly<{ logoUrl: string }>
    : null;
}

/**
 * Canonical read-only 042 source. It uses one persisted TouchLine revision for
 * the exact fixture and fails closed unless the final score, goal timeline,
 * V3 player settlements, current coach settlement state and published Top
 * Match Card agree. No public consumer reads the upstream source directly.
 */
export async function readTouchlineSocialFinalScoreDraft(
  fixtureIdInput: string,
): Promise<TouchlineSocialFinalScoreDraftResult> {
  const fixtureId = fixtureIdInput.trim();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "invalid-fixture-id" };
  const sourceReadStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  if (!sourceReadStart) return { ok: false, reason: "source-revision-unavailable" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "qa-read-model-unavailable" };

  const [snapshot, fixture, canonicalFixtureResult] = await Promise.all([
    readPersistedFantasyFixtureFeed(fixtureId),
    readPublicCompetitionFixtureByProviderId(fixtureId, { providedAdmin: admin }),
    admin.from("football_fixtures")
      .select("id,competition_id,season_id,round_id,home_club_id,away_club_id,source_updated_at")
      .eq("provider", "sportmonks")
      .eq("provider_fixture_id", fixtureId)
      .maybeSingle(),
  ]);
  const canonicalFixture = canonicalFixtureResult.data;
  if (!snapshot || !fixture || fixture.competitionId !== COMPETITION_PROVIDER_ID
    || canonicalFixtureResult.error || !canonicalFixture
    || ![canonicalFixture.id, canonicalFixture.competition_id, canonicalFixture.season_id,
      canonicalFixture.round_id, canonicalFixture.home_club_id, canonicalFixture.away_club_id]
      .every((value) => UUID.test(String(value ?? "")))) {
    return { ok: false, reason: "canonical-fixture-unavailable" };
  }
  const publicFeed = toPublicFantasyFixtureFeed(snapshot.feed);
  if (!publicFeed) return { ok: false, reason: "public-fixture-feed-unavailable" };
  const detail = await readPublicFantasyFixtureMatchDetail(fixtureId, publicFeed);
  if (!detail || touchlineFixtureState(fixture) !== "finished"
    || touchlineFixtureState(detail.fixture) !== "finished") {
    return { ok: false, reason: "fixture-not-finished" };
  }

  const startsAt = timestamp(fixture.startsAt);
  const capturedAt = timestamp(snapshot.capturedAt);
  const homeScore = fixture.homeScore;
  const awayScore = fixture.awayScore;
  const homeTeamId = String(fixture.homeTeam?.providerId ?? "").trim();
  const awayTeamId = String(fixture.awayTeam?.providerId ?? "").trim();
  const detailHomeTeamId = String(detail.fixture.homeTeam?.id ?? "").trim();
  const detailAwayTeamId = String(detail.fixture.awayTeam?.id ?? "").trim();
  if (!startsAt || !capturedAt || !Number.isSafeInteger(homeScore) || Number(homeScore) < 0
    || !Number.isSafeInteger(awayScore) || Number(awayScore) < 0
    || homeTeamId === awayTeamId || homeTeamId !== detailHomeTeamId || awayTeamId !== detailAwayTeamId
    || Number(homeScore) !== detail.fixture.homeScore || Number(awayScore) !== detail.fixture.awayScore) {
    return { ok: false, reason: "canonical-final-score-conflict" };
  }
  const home = clubForTeamId(homeTeamId);
  const away = clubForTeamId(awayTeamId);
  if (!home || !away) return { ok: false, reason: "club-identity-unavailable" };
  const venue = resolveTouchlineFixtureVenue(fixture);
  const gameweekMatch = String(fixture.roundName ?? "").match(/\d+/);
  const gameweekNumber = gameweekMatch ? Number(gameweekMatch[0]) : NaN;
  if (!venue?.name || !venue.interiorImageUrl || !Number.isSafeInteger(gameweekNumber) || gameweekNumber < 1) {
    return { ok: false, reason: "verified-match-context-unavailable" };
  }

  const goalEvents = detail.events.flatMap((event) => {
    const kind = classifyTouchlineSocialFinalScoreGoalType(event.type);
    const teamId = String(event.teamId ?? "").trim();
    const playerName = event.playerName?.trim() ?? "";
    if (!kind || !NUMERIC_ID.test(event.id) || (teamId !== homeTeamId && teamId !== awayTeamId)
      || !playerName || !Number.isSafeInteger(event.minute) || Number(event.minute) < 0) return [];
    return [{
      id: event.id,
      teamId,
      playerName,
      relatedPlayerName: event.relatedPlayerName?.trim() || null,
      minute: Number(event.minute),
      extraMinute: Number.isSafeInteger(event.extraMinute) && Number(event.extraMinute) > 0
        ? Number(event.extraMinute) : null,
      kind,
    }];
  }).sort((left, right) => left.minute - right.minute
    || (left.extraMinute ?? 0) - (right.extraMinute ?? 0)
    || left.id.localeCompare(right.id));
  if (!touchlineSocialFinalScoreGoalsMatchScore(goalEvents, {
    homeTeamId, awayTeamId, homeScore: Number(homeScore), awayScore: Number(awayScore),
  })) return { ok: false, reason: "official-goal-timeline-incomplete" };

  if (!detail.playerStatistics.length
    || detail.playerStatistics.some((row) => row.settlementStatus !== "final")) {
    return { ok: false, reason: "player-scoring-v3-not-final" };
  }
  const coachRows = await admin.from("touchline_coach_fixture_points")
    .select("settlement_status")
    .eq("fixture_id", String(canonicalFixture.id))
    .eq("scoring_version", "coach_scoring_v2");
  if (coachRows.error || !Array.isArray(coachRows.data) || coachRows.data.length === 0
    || coachRows.data.some((row) => row.settlement_status !== "final")) {
    return { ok: false, reason: "coach-scoring-v2-not-final" };
  }

  const rankedRatings = detail.playerStatistics.filter((row) => (
    (row.appearanceStatus === "started" || row.appearanceStatus === "substitute")
    && typeof row.rating === "number" && Number.isFinite(row.rating)
    && (row.teamId === homeTeamId || row.teamId === awayTeamId)
  )).sort((left, right) => Number(right.rating) - Number(left.rating)
    || Number(right.minutes ?? -1) - Number(left.minutes ?? -1)
    || left.playerId.localeCompare(right.playerId));
  const topRating = rankedRatings[0];
  if (!topRating || topRating.rating === null || !topRating.teamId) {
    return { ok: false, reason: "final-official-match-rating-unavailable" };
  }
  const topTeam = topRating.teamId === homeTeamId ? home : away;
  const squadResult = await readPublicPremierSquad(topRating.teamId, { providedAdmin: admin });
  if (squadResult.status !== 200 || squadResult.body.ok === false) {
    return { ok: false, reason: "top-match-card-squad-unavailable" };
  }
  const topCard = (squadResult.body.rosterPlayers ?? squadResult.body.players)
    .map((player) => publicPremierSquadPlayerToCard(player, topTeam.name))
    .find((card) => String(card.id) === topRating.playerId);
  if (!topCard?.editorialCard || !topCard.cardTier || !UUID.test(String(topCard.canonicalPlayerId ?? ""))) {
    return { ok: false, reason: "top-match-card-unpublished" };
  }
  // The social card must receive the same season-total/rule-filtered facts as
  // the live product card.  A global "current season" read can legitimately
  // be between markers while a finished fixture is already canonical, which
  // would otherwise turn valid card fields into visual placeholders.
  const seasonPoints = await readPublicSeasonPlayerPoints([topCard.canonicalPlayerId!], {
    competitionId: String(canonicalFixture.competition_id).toLowerCase(),
    seasonId: String(canonicalFixture.season_id).toLowerCase(),
    providedAdmin: admin,
  });
  const decoratedCard = applyTouchlineSeasonPoints([topCard], seasonPoints)[0];
  if (!decoratedCard) return { ok: false, reason: "top-match-card-unavailable" };

  const caption = buildTouchlineFinalResultCaption({
    homeName: home.name,
    awayName: away.name,
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    venueName: venue.name,
    gameweekNumber,
    goals: goalEvents,
    topCardName: decoratedCard.name,
    officialMatchRating: topRating.rating,
  });
  if (!caption.ok) return { ok: false, reason: `caption-${caption.reason.toLowerCase()}` };

  const sourceSnapshotAt = [capturedAt, timestamp(canonicalFixture.source_updated_at)]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (!sourceSnapshotAt) return { ok: false, reason: "source-timestamp-unavailable" };
  const baseSource = {
    sourceProvenance: "PERSISTED_VERIFIED_FINAL_RESULT" as const,
    fixtureId,
    capturedAt,
    sourceSnapshotAt,
    startsAt,
    status: fixture.status ?? detail.fixture.status ?? "FINISHED",
    seasonProviderId: String(fixture.seasonId ?? ""),
    gameweekNumber,
    venue: { name: venue.name, interiorImageUrl: venue.interiorImageUrl },
    caption: caption.caption,
    sourceVersion: SOURCE_VERSION,
    home,
    away,
    score: { home: Number(homeScore), away: Number(awayScore) },
    goals: goalEvents,
    topMatchCard: {
      card: { ...decoratedCard, matchRating: topRating.rating },
      officialMatchRating: topRating.rating,
      team: topTeam,
    },
  } as const;
  const sourceChecksum = checksumTouchlineFinalResultRenderSource(baseSource);
  if (!SHA256.test(sourceChecksum)) return { ok: false, reason: "source-checksum-invalid" };
  const sourceKeys = [
    `fixture-provider:${fixtureId}`,
    `fixture:${String(canonicalFixture.id).toLowerCase()}`,
    `competition:${String(canonicalFixture.competition_id).toLowerCase()}`,
    `season:${String(canonicalFixture.season_id).toLowerCase()}`,
    `round:${String(canonicalFixture.round_id).toLowerCase()}`,
    `club:${String(canonicalFixture.home_club_id).toLowerCase()}`,
    `club:${String(canonicalFixture.away_club_id).toLowerCase()}`,
    `player:${String(topCard.canonicalPlayerId).toLowerCase()}`,
  ];
  const sourceReadEnd = await readTouchlineSocialSourceRevisionCheckpoint(sourceKeys);
  if (!sourceReadEnd || sourceReadEnd.clockRevision !== sourceReadStart.clockRevision) {
    return { ok: false, reason: "source-revision-changed-during-read" };
  }
  return {
    ok: true,
    data: {
      ...baseSource,
      sourceChecksum,
      sourceRevisionManifest: sourceReadEnd.manifest,
      sourceRevisionChecksum: sourceReadEnd.checksum,
    },
  };
}

// Private FINAL SCORE push evidence.
// The public reader above, including its DTO, queries and editorial checksum,
// stays unchanged. None of the following is a delivery or consent authority.
export type TouchlineFinalScorePushEvidence = Readonly<{
  fixtureId: string; providerFixtureId: string;
  competitionId: string; competitionProviderId: string;
  seasonId: string; seasonProviderId: string; roundId: string;
  homeClubId: string; homeProviderTeamId: string; awayClubId: string; awayProviderTeamId: string;
  clockRevision: number; capturedAt: string; fixtureUpdatedAt: string;
  players: readonly Readonly<{ id: string; playerId: string; clubId: string; sourceSyncedAt: string }>[];
  coaches: readonly Readonly<{ id: string; contractId: string; clubId: string; sourceUpdatedAt: string; settledAt: string }>[];
}>;
export type TouchlineFinalScorePushEvidenceResult =
  | Readonly<{ ok: true; data: TouchlineSocialFinalScoreDraft; evidence: TouchlineFinalScorePushEvidence }>
  | Readonly<{ ok: false; reason: string }>;
export type TouchlineFinalScorePushReadOptions = Readonly<{
  enabled: boolean; now: () => number; maxRows: number; timeoutMs: number;
}>;

function pushRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function pushUuid(value: unknown): value is string {
  return typeof value === "string" && value === value.toLowerCase() && UUID.test(value);
}
function pushTimestamp(value: unknown, now: number): value is string {
  // Keep the persisted value; do not replace it with read time or settled_at.
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59
    || (parts[7] !== undefined && (Number(parts[7]) > 23 || Number(parts[8]) > 59))) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now;
}
function pushRows(value: unknown, count: unknown, maxRows: number): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || !Number.isSafeInteger(count) || Number(count) < 1
    || Number(count) > maxRows || value.length !== count) return null;
  const rows = value.map(pushRecord);
  return rows.every((row): row is Record<string, unknown> => row !== null) ? rows : null;
}

/** Private, bounded, read-only preparation. Counts prove the complete persisted
 * set, not completeness of the upstream provider's roster. Source timestamps
 * describe persisted updates/syncs, never a new observation of the provider.
 * Equal semantic checkpoints alone do not fence every timestamp-only change:
 * fixture/source_synced_at evidence still needs an atomic read before admission.
 * This preparatory reader must not be wired to transport on that assumption.
 * The legacy social read has no AbortSignal: timeout closes this caller and
 * prevents further private reads, but cannot cancel its already-started work.
 */
export async function readTouchlineFinalScorePushEvidence(
  input: Readonly<{ canonicalFixtureId: string; providerFixtureId: string }>,
  options: TouchlineFinalScorePushReadOptions,
): Promise<TouchlineFinalScorePushEvidenceResult> {
  if (options?.enabled !== true) return { ok: false, reason: "disabled" };
  const maxRows = options.maxRows, timeoutMs = options.timeoutMs, now = options.now;
  if (!input || !pushUuid(input.canonicalFixtureId) || typeof input.providerFixtureId !== "string"
    || !NUMERIC_ID.test(input.providerFixtureId) || typeof now !== "function"
    || !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 1000
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    return { ok: false, reason: "invalid-private-read-policy" };
  }
  const fixtureId = input.canonicalFixtureId, providerFixtureId = input.providerFixtureId;
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; controller.abort(); reject(new Error("private-read-deadline")); }, timeoutMs);
  });
  const step = async <T,>(operation: () => PromiseLike<T>): Promise<T> => {
    if (expired) throw new Error("private-read-deadline");
    const result = await Promise.race([Promise.resolve().then(operation), deadline]);
    if (expired) throw new Error("private-read-deadline");
    return result;
  };
  try {
    const instant = now();
    if (!Number.isFinite(instant)) return { ok: false, reason: "invalid-server-clock" };
    const start = await step(() => readTouchlineSocialSourceRevisionCheckpoint([]));
    if (!start) return { ok: false, reason: "source-revision-unavailable" };
    const publicResult = await step(() => readTouchlineSocialFinalScoreDraft(providerFixtureId));
    if (!publicResult.ok) return publicResult;
    const data = publicResult.data;
    const admin = createAdminClient();
    if (!admin) return { ok: false, reason: "qa-read-model-unavailable" };
    const canonicalResult = await step(() => admin.from("football_fixtures")
      .select("id,provider,provider_fixture_id,competition_id,season_id,round_id,home_club_id,away_club_id,source_updated_at,status,home_score,away_score")
      .eq("id", fixtureId).eq("provider", "sportmonks").eq("provider_fixture_id", providerFixtureId)
      .abortSignal(controller.signal).maybeSingle());
    const f = pushRecord(canonicalResult.data);
    if (canonicalResult.error || !f || f.id !== fixtureId || f.provider !== "sportmonks" || f.provider_fixture_id !== providerFixtureId
      || ![f.competition_id, f.season_id, f.round_id, f.home_club_id, f.away_club_id].every(pushUuid)
      || f.home_club_id === f.away_club_id || typeof f.status !== "string"
      || touchlineFixtureState({ status: f.status, startsAt: data.startsAt }) !== "finished"
      || !Number.isSafeInteger(f.home_score) || !Number.isSafeInteger(f.away_score)
      || f.home_score !== data.score.home || f.away_score !== data.score.away
      || !pushTimestamp(f.source_updated_at, instant) || !pushTimestamp(data.capturedAt, instant)) {
      return { ok: false, reason: "private-fixture-conflict" };
    }
    const competitionId = String(f.competition_id), seasonId = String(f.season_id), roundId = String(f.round_id);
    const homeClubId = String(f.home_club_id), awayClubId = String(f.away_club_id);
    const competition = await step(() => admin.from("football_competitions").select("id,provider,provider_competition_id")
      .eq("id", competitionId).abortSignal(controller.signal).maybeSingle());
    const season = await step(() => admin.from("football_seasons").select("id,provider,provider_season_id,competition_id")
      .eq("id", seasonId).abortSignal(controller.signal).maybeSingle());
    const clubs = await step(() => admin.from("football_clubs").select("id,provider,provider_team_id", { count: "exact" })
      .in("id", [homeClubId, awayClubId]).order("id").range(0, 1).abortSignal(controller.signal));
    const c = pushRecord(competition.data), s = pushRecord(season.data), clubRows = pushRows(clubs.data, clubs.count, 2);
    const home = clubRows?.find(row => row.id === homeClubId), away = clubRows?.find(row => row.id === awayClubId);
    if (competition.error || season.error || clubs.error || !c || !s || !home || !away || clubRows?.length !== 2
      || c.id !== competitionId || c.provider !== "sportmonks" || c.provider_competition_id !== COMPETITION_PROVIDER_ID
      || s.id !== seasonId || s.provider !== "sportmonks" || s.competition_id !== competitionId
      || typeof s.provider_season_id !== "string" || !NUMERIC_ID.test(s.provider_season_id) || s.provider_season_id !== data.seasonProviderId
      || home.provider !== "sportmonks" || away.provider !== "sportmonks"
      || home.provider_team_id !== data.home.teamId || away.provider_team_id !== data.away.teamId
      || home.provider_team_id === away.provider_team_id) return { ok: false, reason: "private-scope-conflict" };
    const playersResult = await step(() => admin.from("touchline_player_fixture_score_settlements")
      .select("id,football_player_id,fixture_id,competition_id,season_id,club_id,scoring_version,settlement_status,source_synced_at", { count: "exact" })
      .eq("fixture_id", fixtureId).eq("scoring_version", "player_scoring_v4")
      .order("id").range(0, maxRows - 1).abortSignal(controller.signal));
    const coachesResult = await step(() => admin.from("touchline_coach_fixture_points")
      .select("id,contract_id,fixture_id,fixture_context,home_score,away_score,scoring_version,settlement_status,provider_source_updated_at,settled_at", { count: "exact" })
      .eq("fixture_id", fixtureId).eq("scoring_version", "coach_scoring_v2")
      .order("id").range(0, maxRows - 1).abortSignal(controller.signal));
    const playerRows = pushRows(playersResult.data, playersResult.count, maxRows), coachRows = pushRows(coachesResult.data, coachesResult.count, maxRows);
    if (playersResult.error || coachesResult.error || !playerRows || !coachRows) return { ok: false, reason: "private-settlement-set-incomplete" };
    const players: TouchlineFinalScorePushEvidence["players"][number][] = [];
    const coaches: TouchlineFinalScorePushEvidence["coaches"][number][] = [];
    const playerIds = new Set<string>(), playerKeys = new Set<string>(), coachIds = new Set<string>(), coachKeys = new Set<string>();
    for (const row of playerRows) {
      if (!pushUuid(row.id) || !pushUuid(row.football_player_id) || playerIds.has(row.id) || playerKeys.has(row.football_player_id)
        || row.fixture_id !== fixtureId || row.competition_id !== competitionId || row.season_id !== seasonId
        || (row.club_id !== homeClubId && row.club_id !== awayClubId) || row.scoring_version !== "player_scoring_v4"
        || row.settlement_status !== "final" || !pushTimestamp(row.source_synced_at, instant)) return { ok: false, reason: "private-player-settlement-conflict" };
      playerIds.add(row.id); playerKeys.add(row.football_player_id);
      players.push(Object.freeze({ id: row.id, playerId: row.football_player_id, clubId: String(row.club_id), sourceSyncedAt: row.source_synced_at }));
    }
    for (const row of coachRows) {
      // Historical settlement context is authoritative, not a contract's current club.
      const clubId = row.fixture_context === "home" ? homeClubId : row.fixture_context === "away" ? awayClubId : null;
      if (!pushUuid(row.id) || !pushUuid(row.contract_id) || coachIds.has(row.id) || coachKeys.has(row.contract_id)
        || row.fixture_id !== fixtureId || row.scoring_version !== "coach_scoring_v2" || row.settlement_status !== "final"
        || row.home_score !== data.score.home || row.away_score !== data.score.away || !clubId
        || !pushTimestamp(row.provider_source_updated_at, instant) || !pushTimestamp(row.settled_at, instant)) return { ok: false, reason: "private-coach-settlement-conflict" };
      coachIds.add(row.id); coachKeys.add(row.contract_id);
      coaches.push(Object.freeze({ id: row.id, contractId: row.contract_id, clubId, sourceUpdatedAt: row.provider_source_updated_at, settledAt: row.settled_at }));
    }
    const keys = Object.keys(data.sourceRevisionManifest);
    const required = [`fixture-provider:${providerFixtureId}`, `fixture:${fixtureId}`, `competition:${competitionId}`, `season:${seasonId}`, `round:${roundId}`, `club:${homeClubId}`, `club:${awayClubId}`];
    if (required.some(key => !Object.hasOwn(data.sourceRevisionManifest, key))) return { ok: false, reason: "private-revision-scope-conflict" };
    const end = await step(() => readTouchlineSocialSourceRevisionCheckpoint(keys));
    if (!end || end.clockRevision !== start.clockRevision || end.checksum !== data.sourceRevisionChecksum
      || Object.keys(end.manifest).length !== keys.length || keys.some(key => end.manifest[key] !== data.sourceRevisionManifest[key])) {
      return { ok: false, reason: "source-revision-changed-during-read" };
    }
    return { ok: true, data, evidence: Object.freeze({ fixtureId, providerFixtureId, competitionId, competitionProviderId: COMPETITION_PROVIDER_ID,
      seasonId, seasonProviderId: s.provider_season_id, roundId, homeClubId, awayClubId,
      homeProviderTeamId: String(home.provider_team_id), awayProviderTeamId: String(away.provider_team_id),
      clockRevision: end.clockRevision, capturedAt: data.capturedAt, fixtureUpdatedAt: f.source_updated_at,
      players: Object.freeze(players), coaches: Object.freeze(coaches) }) };
  } catch {
    return { ok: false, reason: expired ? "private-read-timeout" : "private-source-unavailable" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
