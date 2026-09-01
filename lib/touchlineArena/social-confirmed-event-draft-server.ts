import "server-only";

import { readPublicCompetitionFixtureByProviderId } from "@/lib/football-data/fixture-schedule-store";
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
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import { resolveTouchlineFixtureVenue } from "@/lib/touchlineArena/stadium-catalog";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { buildTouchlineConfirmedEventCaption } from "@/lib/touchlineArena/social-confirmed-event-caption";
import {
  classifyTouchlineConfirmedMatchEvent,
  parseTouchlineEventScore,
  touchlineConfirmedEventContentType,
  type TouchlineConfirmedEventKind,
} from "@/lib/touchlineArena/social-confirmed-event-contract";
import {
  checksumTouchlineConfirmedEventFact,
  checksumTouchlineConfirmedEventRenderSource,
} from "@/lib/touchlineArena/social-confirmed-event-render-source";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMPETITION_PROVIDER_ID = "8";
const SOURCE_VERSION = "touchline-confirmed-event-v1";
export const TOUCHLINE_GOAL_CONFIRMED_TEMPLATE_VERSION = "touchline-goal-confirmed-story-v1";
export const TOUCHLINE_RED_CARD_CONFIRMED_TEMPLATE_VERSION = "touchline-red-card-confirmed-story-v1";

type EventRow = Readonly<{
  provider_event_id?: unknown;
  provider_sort_order?: unknown;
  minute?: unknown;
  extra_minute?: unknown;
  provider_team_id?: unknown;
  provider_player_id?: unknown;
  football_player_id?: unknown;
  player_name?: unknown;
  event_type?: unknown;
  result?: unknown;
  info?: unknown;
  addition?: unknown;
  event_status?: unknown;
  source_synced_at?: unknown;
}>;

type Score = Readonly<{ home: number; away: number }>;

export type TouchlineSocialConfirmedEventDraft = Readonly<{
  sourceProvenance: "PERSISTED_VERIFIED_CONFIRMED_EVENT";
  contentType: "GOAL_CONFIRMED" | "RED_CARD_CONFIRMED";
  fixtureId: string;
  eventId: string;
  capturedAt: string;
  firstObservedAt: string;
  confirmedAt: string;
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
  score: Score;
  event: Readonly<{
    kind: TouchlineConfirmedEventKind;
    scoringTeamId: string | null;
    playerTeamId: string;
    playerProviderId: string;
    playerName: string;
    minute: number;
    extraMinute: number | null;
  }>;
  playerCard: ClubOwnerSquadCard;
  totalRating: number;
  matchRating: number | null;
  touchlinePoints: number;
}>;

export type TouchlineSocialConfirmedEventDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialConfirmedEventDraft }>
  | Readonly<{ ok: false; reason: string }>;

function timestamp(value: unknown) {
  const candidate = String(value ?? "").trim();
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clubForTeamId(teamId: string) {
  const clubs = TOUCHLINE_ENGLAND_CLUBS.filter((club) => club.teamId === teamId && club.logoUrl);
  return clubs.length === 1
    ? clubs[0] as TouchLineClubVisual & Readonly<{ logoUrl: string }>
    : null;
}

function scoreDelta(previous: Score, current: Score) {
  const home = current.home - previous.home;
  const away = current.away - previous.away;
  if ((home === 1 && away === 0) || (home === 0 && away === 1)) return { home, away };
  return null;
}

function eventContributionPresent(value: unknown, eventId: string, kind: TouchlineConfirmedEventKind) {
  if (!Array.isArray(value)) return false;
  const expectedRule = kind === "red-card" || kind === "second-yellow-red"
    ? "red-card"
    : kind === "own-goal" ? "own-goal" : "goal";
  return value.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as Record<string, unknown>;
    return String(row.providerEventId ?? "") === eventId
      && String(row.ruleCode ?? "") === expectedRule
      && Number.isFinite(Number(row.points));
  });
}

/**
 * Server-only, persisted-source reader for one event Story. It never contacts
 * the upstream provider. The canonical event must be recorded, semantically
 * stable in the 043 attestation table, score-reconciled (for goals), linked to
 * a published card and reflected by the current player_scoring_v3 settlement.
 */
export async function readTouchlineSocialConfirmedEventDraft(
  fixtureIdInput: string,
  eventIdInput: string,
): Promise<TouchlineSocialConfirmedEventDraftResult> {
  const fixtureId = fixtureIdInput.trim();
  const eventId = eventIdInput.trim();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "invalid-fixture-id" };
  if (!NUMERIC_ID.test(eventId)) return { ok: false, reason: "invalid-event-id" };
  const sourceReadStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  if (!sourceReadStart) return { ok: false, reason: "source-revision-unavailable" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "qa-read-model-unavailable" };

  const [fixture, canonicalResult] = await Promise.all([
    readPublicCompetitionFixtureByProviderId(fixtureId, { providedAdmin: admin }),
    admin.from("football_fixtures")
      .select("id,competition_id,season_id,round_id,home_club_id,away_club_id,starts_at,status,home_score,away_score,source_updated_at")
      .eq("provider", "sportmonks").eq("provider_fixture_id", fixtureId).maybeSingle(),
  ]);
  const canonical = canonicalResult.data;
  if (!fixture || fixture.competitionId !== COMPETITION_PROVIDER_ID || canonicalResult.error || !canonical
    || ![canonical.id, canonical.competition_id, canonical.season_id, canonical.round_id,
      canonical.home_club_id, canonical.away_club_id].every((value) => UUID.test(String(value ?? "")))) {
    return { ok: false, reason: "canonical-fixture-unavailable" };
  }
  const startsAt = timestamp(fixture.startsAt);
  const homeTeamId = String(fixture.homeTeam?.providerId ?? "");
  const awayTeamId = String(fixture.awayTeam?.providerId ?? "");
  const home = clubForTeamId(homeTeamId);
  const away = clubForTeamId(awayTeamId);
  const gameweek = String(fixture.roundName ?? "").match(/\d+/);
  const gameweekNumber = gameweek ? Number(gameweek[0]) : NaN;
  const venue = resolveTouchlineFixtureVenue(fixture);
  if (!startsAt || !home || !away || homeTeamId === awayTeamId
    || touchlineFixtureState({ startsAt, status: fixture.status ?? undefined }) !== "live"
    || !Number.isSafeInteger(gameweekNumber) || gameweekNumber < 1
    || !venue?.name || !venue.interiorImageUrl) {
    return { ok: false, reason: "verified-match-context-unavailable" };
  }

  const eventsResult = await admin.from("football_fixture_events")
    .select("provider_event_id,provider_sort_order,minute,extra_minute,provider_team_id,provider_player_id,football_player_id,player_name,event_type,result,info,addition,event_status,source_synced_at")
    .eq("fixture_id", String(canonical.id)).eq("provider", "sportmonks")
    .order("provider_sort_order", { ascending: true });
  if (eventsResult.error || !Array.isArray(eventsResult.data)) {
    return { ok: false, reason: "canonical-events-unavailable" };
  }
  const events = eventsResult.data as EventRow[];
  const matches = events.filter((row) => String(row.provider_event_id ?? "") === eventId);
  if (matches.length !== 1) return { ok: false, reason: "canonical-event-identity-conflict" };
  const row = matches[0];
  const kind = classifyTouchlineConfirmedMatchEvent({
    type: String(row.event_type ?? ""), status: String(row.event_status ?? ""),
    info: row.info === null ? null : String(row.info ?? ""),
    addition: row.addition === null ? null : String(row.addition ?? ""),
  });
  if (!kind) return { ok: false, reason: "event-status-not-confirmed" };
  const contentType = touchlineConfirmedEventContentType(kind);
  const rawMinute = integer(row.minute);
  const rawExtraMinute = row.extra_minute === null ? null : integer(row.extra_minute);
  if (rawMinute === null || (row.extra_minute !== null && rawExtraMinute === null)) {
    return { ok: false, reason: "confirmed-event-minute-invalid" };
  }
  const eventFactChecksum = checksumTouchlineConfirmedEventFact({
    fixtureId, eventId, eventKind: kind, result: row.result === null ? null : String(row.result ?? ""),
    teamId: String(row.provider_team_id ?? ""), playerId: String(row.provider_player_id ?? ""),
    minute: rawMinute, extraMinute: rawExtraMinute,
  });
  const observation = await admin.from("touchline_social_confirmed_event_observations")
    .select("event_fact_checksum,first_observed_at,last_observed_at,confirmed_at,stable_observation_count,confirmation_state")
    .eq("fixture_provider_id", fixtureId).eq("event_provider_id", eventId).maybeSingle();
  const firstObservedAt = timestamp(observation.data?.first_observed_at);
  const confirmedAt = timestamp(observation.data?.confirmed_at);
  if (observation.error || !observation.data || observation.data.confirmation_state !== "CONFIRMED"
    || Number(observation.data.stable_observation_count) < 2 || !firstObservedAt || !confirmedAt
    || observation.data.event_fact_checksum !== eventFactChecksum) {
    return { ok: false, reason: "event-fact-not-stable" };
  }

  const playerId = String(row.football_player_id ?? "");
  const playerProviderId = String(row.provider_player_id ?? "");
  const playerTeamId = String(row.provider_team_id ?? "");
  const playerName = String(row.player_name ?? "").trim();
  const minute = integer(row.minute);
  const extraMinute = row.extra_minute === null ? null : integer(row.extra_minute);
  if (!UUID.test(playerId) || !NUMERIC_ID.test(playerProviderId)
    || (playerTeamId !== homeTeamId && playerTeamId !== awayTeamId) || !playerName
    || minute === null || (row.extra_minute !== null && extraMinute === null)) {
    return { ok: false, reason: "confirmed-event-player-unavailable" };
  }

  let score: Score;
  let scoringTeamId: string | null = null;
  if (contentType === "GOAL_CONFIRMED") {
    const current = parseTouchlineEventScore(String(row.result ?? ""));
    const eventIndex = events.indexOf(row);
    const previousGoal = events.slice(0, eventIndex).reverse().find((candidate) => (
      classifyTouchlineConfirmedMatchEvent({
        type: String(candidate.event_type ?? ""), status: String(candidate.event_status ?? ""),
        info: candidate.info === null ? null : String(candidate.info ?? ""),
        addition: candidate.addition === null ? null : String(candidate.addition ?? ""),
      }) === "goal"
      || ["own-goal", "penalty"].includes(classifyTouchlineConfirmedMatchEvent({
        type: String(candidate.event_type ?? ""), status: String(candidate.event_status ?? ""),
        info: candidate.info === null ? null : String(candidate.info ?? ""),
        addition: candidate.addition === null ? null : String(candidate.addition ?? ""),
      }) ?? "")
    ));
    const previous = previousGoal ? parseTouchlineEventScore(String(previousGoal.result ?? "")) : { home: 0, away: 0 };
    const delta = current && previous ? scoreDelta(previous, current) : null;
    if (!current || !delta) return { ok: false, reason: "event-score-conflict" };
    score = current;
    scoringTeamId = delta.home === 1 ? homeTeamId : awayTeamId;
    if (kind !== "own-goal" && scoringTeamId !== playerTeamId) {
      return { ok: false, reason: "event-score-conflict" };
    }
  } else {
    const eventIndex = events.indexOf(row);
    const previousGoal = events.slice(0, eventIndex).reverse().find((candidate) => {
      const candidateKind = classifyTouchlineConfirmedMatchEvent({
        type: String(candidate.event_type ?? ""), status: String(candidate.event_status ?? ""),
        info: candidate.info === null ? null : String(candidate.info ?? ""),
        addition: candidate.addition === null ? null : String(candidate.addition ?? ""),
      });
      return candidateKind === "goal" || candidateKind === "own-goal" || candidateKind === "penalty";
    });
    const eventScore = previousGoal ? parseTouchlineEventScore(String(previousGoal.result ?? "")) : { home: 0, away: 0 };
    if (!eventScore) return { ok: false, reason: "event-score-conflict" };
    score = eventScore;
  }

  const [settlementResult, squadResult] = await Promise.all([
    admin.from("touchline_player_fixture_score_settlements")
      .select("rating,touchline_points,touchline_points_breakdown,settlement_status,source_synced_at")
      .eq("fixture_id", String(canonical.id)).eq("football_player_id", playerId)
      .eq("scoring_version", "player_scoring_v3").maybeSingle(),
    readPublicPremierSquad(playerTeamId, { providedAdmin: admin }),
  ]);
  const settlement = settlementResult.data;
  if (settlementResult.error || !settlement
    || !["provisional", "final"].includes(String(settlement.settlement_status ?? ""))
    || finite(settlement.touchline_points) === null
    || !eventContributionPresent(settlement.touchline_points_breakdown, eventId, kind)) {
    return { ok: false, reason: "player-scoring-v3-event-not-current" };
  }
  if (squadResult.status !== 200 || squadResult.body.ok === false) {
    return { ok: false, reason: "confirmed-event-card-squad-unavailable" };
  }
  const team = playerTeamId === homeTeamId ? home : away;
  const cards = (squadResult.body.rosterPlayers ?? squadResult.body.players)
    .filter((player) => player.providerId === playerProviderId && player.canonicalPlayerId === playerId)
    .map((player) => publicPremierSquadPlayerToCard(player, team.name));
  if (cards.length !== 1 || !cards[0].editorialCard || !cards[0].cardTier) {
    return { ok: false, reason: "confirmed-event-card-unpublished" };
  }
  const seasonPoints = await readPublicSeasonPlayerPoints([playerId], {
    competitionId: String(canonical.competition_id), seasonId: String(canonical.season_id), providedAdmin: admin,
  });
  const decorated = applyTouchlineSeasonPoints(cards, seasonPoints)[0];
  if (!decorated || !Number.isFinite(decorated.seasonTotalRating)) {
    return { ok: false, reason: "confirmed-event-total-rating-unavailable" };
  }
  const matchRating = settlement.rating === null ? null : finite(settlement.rating);
  if (settlement.rating !== null && matchRating === null) {
    return { ok: false, reason: "confirmed-event-match-rating-invalid" };
  }
  const touchlinePoints = finite(settlement.touchline_points)!;
  const caption = buildTouchlineConfirmedEventCaption({
    contentType, homeName: home.name, awayName: away.name, score, playerName,
    minute, extraMinute, eventKind: kind, totalRating: decorated.seasonTotalRating!,
    matchRating, touchlinePoints, gameweekNumber,
  });
  if (!caption.ok) return { ok: false, reason: `caption-${caption.reason.toLowerCase()}` };

  const sourceSnapshotAt = [timestamp(row.source_synced_at), timestamp(settlement.source_synced_at),
    timestamp(canonical.source_updated_at), confirmedAt]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (!sourceSnapshotAt || Date.parse(sourceSnapshotAt) < Date.parse(firstObservedAt)) {
    return { ok: false, reason: "confirmed-event-source-timestamp-invalid" };
  }
  const baseSource = {
    sourceProvenance: "PERSISTED_VERIFIED_CONFIRMED_EVENT" as const,
    contentType, fixtureId, eventId, capturedAt: sourceSnapshotAt, firstObservedAt,
    confirmedAt, sourceSnapshotAt, startsAt, status: fixture.status ?? "LIVE",
    seasonProviderId: String(fixture.seasonId ?? ""), gameweekNumber,
    venue: { name: venue.name, interiorImageUrl: venue.interiorImageUrl },
    caption: caption.caption, sourceVersion: SOURCE_VERSION,
    home, away, score,
    event: { kind, scoringTeamId, playerTeamId, playerProviderId, playerName, minute, extraMinute },
    playerCard: decorated, totalRating: decorated.seasonTotalRating!, matchRating, touchlinePoints,
  } as const;
  const sourceChecksum = checksumTouchlineConfirmedEventRenderSource(baseSource);
  if (!SHA256.test(sourceChecksum)) return { ok: false, reason: "source-checksum-invalid" };
  const sourceKeys = [
    `fixture-provider:${fixtureId}`, `fixture-event:${eventId}`,
    `fixture:${String(canonical.id).toLowerCase()}`,
    `competition:${String(canonical.competition_id).toLowerCase()}`,
    `season:${String(canonical.season_id).toLowerCase()}`,
    `round:${String(canonical.round_id).toLowerCase()}`,
    `club:${String(canonical.home_club_id).toLowerCase()}`,
    `club:${String(canonical.away_club_id).toLowerCase()}`,
    `player:${playerId.toLowerCase()}`,
  ];
  const sourceReadEnd = await readTouchlineSocialSourceRevisionCheckpoint(sourceKeys);
  if (!sourceReadEnd || sourceReadEnd.clockRevision !== sourceReadStart.clockRevision) {
    return { ok: false, reason: "source-revision-changed-during-read" };
  }
  return { ok: true, data: {
    ...baseSource, sourceChecksum,
    sourceRevisionManifest: sourceReadEnd.manifest,
    sourceRevisionChecksum: sourceReadEnd.checksum,
  } };
}
