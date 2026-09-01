import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readPublicCompetitionFixtureByProviderId } from "@/lib/football-data/fixture-schedule-store";
import { loadTouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table-server";
import {
  readPublicPremierSquad,
  publicPremierSquadPlayerToCard,
  type PublicPremierSquadPayload,
} from "@/lib/football-data/public-premier-squad-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TOUCHLINE_ENGLAND_CLUBS, type TouchLineClubVisual } from "@/lib/touchlineArena/demo-data";
import type { TouchlinePublishedRankingSnapshot } from "@/lib/touchlineArena/card-ranking-pipeline";
import { parseTouchlineActiveRankingState, TOUCHLINE_ENGLAND_LEAGUE_KEY } from "@/lib/touchlineArena/card-ranking-live";
import { resolveTouchlineFixtureVenue } from "@/lib/touchlineArena/stadium-catalog";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { buildTouchlineMatchPreviewCaption } from "@/lib/touchlineArena/social-match-preview-caption";
import {
  selectTouchlineMatchPreviewSides,
  type TouchlineMatchPreviewSide,
} from "@/lib/touchlineArena/social-match-preview-contract";
import { checksumTouchlineMatchPreviewRenderSource } from "@/lib/touchlineArena/social-match-preview-render-source";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMPETITION_PROVIDER_ID = "8";
const PREVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const SOURCE_VERSION = "touchline-match-preview-feed-v1";
export const TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION = "touchline-match-preview-feed-v1";

type Admin = SupabaseClient;

export type TouchlineSocialMatchPreviewDraft = Readonly<{
  sourceProvenance: "PERSISTED_VERIFIED_MATCH_PREVIEW";
  fixtureId: string;
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
  ranking: Readonly<{
    snapshotId: string;
    publishedAt: string;
    scoringVersion: "player_scoring_v3";
    coverageStatus: "complete" | "complete_for_scoring";
  }>;
  tableAsOf: string;
  home: TouchlineMatchPreviewSide;
  away: TouchlineMatchPreviewSide;
}>;

export type TouchlineSocialMatchPreviewDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialMatchPreviewDraft }>
  | Readonly<{ ok: false; reason: string }>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown) {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function clubForTeamId(teamId: string): TouchLineClubVisual | null {
  const matches = TOUCHLINE_ENGLAND_CLUBS.filter((club) => club.teamId === teamId);
  return matches.length === 1 && matches[0].logoUrl ? matches[0] : null;
}

async function readActivePublishedRanking(admin: Admin) {
  const active = await admin
    .from("touchline_card_ranking_active_snapshots")
    .select("snapshot_id")
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  const snapshotId = text(active.data?.snapshot_id);
  if (active.error || !snapshotId) return null;
  const record = await admin
    .from("touchline_card_ranking_snapshots")
    .select("snapshot_id,league_key,season_id,round_id,source,status,published_at,price_table_version,expected_player_count,actual_player_count,scoring_version,coverage_status,fixture_ids,expected_fixture_ids,total_score_points,ranking_payload")
    .eq("snapshot_id", snapshotId)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  if (record.error || !record.data) return null;
  const row = record.data as Record<string, unknown>;
  const payload = row.ranking_payload as TouchlinePublishedRankingSnapshot | null;
  const players = Array.isArray(payload?.players) ? payload.players : [];
  const parsed = parseTouchlineActiveRankingState({
    phase: "ranked",
    leagueKey: row.league_key,
    snapshotId: row.snapshot_id,
    roundId: row.round_id,
    publishedAt: row.published_at,
    priceTableVersion: row.price_table_version,
    scoringVersion: row.scoring_version,
    coverageStatus: row.coverage_status,
    seasonId: row.season_id,
    fixtureIds: row.fixture_ids,
    expectedFixtureIds: row.expected_fixture_ids,
    totalScorePoints: row.total_score_points,
    players: players.map((player) => ({
      playerId: player.playerId,
      providerPlayerId: player.providerPlayerId,
      positionGroup: player.positionGroup,
      positionRank: player.positionRank,
      groupSize: player.groupSize,
      totalRating: player.totalRating,
      tierKey: player.tierKey,
      priceTc: player.priceTc,
    })),
  });
  if (!parsed || parsed.phase !== "ranked"
    || row.source !== "sportmonks-audited"
    || row.status !== "published"
    || row.scoring_version !== "player_scoring_v3"
    || players.length !== Number(row.expected_player_count)
    || players.length !== Number(row.actual_player_count)
    || players.some((player) => (
      !UUID.test(player.playerId)
      || !NUMERIC_ID.test(String(player.providerPlayerId ?? ""))
      || !player.name?.trim()
      || !player.clubName?.trim()
      || (player.totalRating !== null && !Number.isFinite(player.totalRating))
    ))) return null;
  return {
    snapshotId: parsed.snapshotId!,
    seasonId: parsed.seasonId!,
    publishedAt: parsed.publishedAt!,
    scoringVersion: parsed.scoringVersion as "player_scoring_v3",
    coverageStatus: parsed.coverageStatus!,
    players,
  } as const;
}

function kickOffLabel(startsAt: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Malta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt)).replace(",", " ·");
}

/**
 * Read-only 041 source. It uses persisted QA data only, never a provider call,
 * caller-supplied player selection, XI/bench/formation or a write path.
 */
export async function readTouchlineSocialMatchPreviewDraft(input: Readonly<{
  fixtureId: string;
  now?: number;
}>): Promise<TouchlineSocialMatchPreviewDraftResult> {
  const fixtureId = input.fixtureId.trim();
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "invalid-fixture-id" };
  const sourceReadStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  if (!sourceReadStart) return { ok: false, reason: "source-revision-unavailable" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "qa-read-model-unavailable" };

  const [fixture, table, ranking] = await Promise.all([
    readPublicCompetitionFixtureByProviderId(fixtureId, { providedAdmin: admin }),
    loadTouchlineOfficialLeagueTable({ providedAdmin: admin }),
    readActivePublishedRanking(admin),
  ]);
  if (!fixture || fixture.competitionId !== COMPETITION_PROVIDER_ID
    || touchlineFixtureState(fixture, now) !== "upcoming") {
    return { ok: false, reason: "canonical-scheduled-fixture-unavailable" };
  }
  const startsAt = timestamp(fixture.startsAt);
  const startsAtMs = startsAt ? Date.parse(startsAt) : NaN;
  if (!startsAt || startsAtMs <= now || startsAtMs - now > PREVIEW_WINDOW_MS) {
    return { ok: false, reason: "match-preview-window-closed" };
  }
  const homeTeamId = text(fixture.homeTeam?.providerId);
  const awayTeamId = text(fixture.awayTeam?.providerId);
  const homeClub = homeTeamId ? clubForTeamId(homeTeamId) : null;
  const awayClub = awayTeamId ? clubForTeamId(awayTeamId) : null;
  if (!homeTeamId || !awayTeamId || !homeClub || !awayClub || homeTeamId === awayTeamId) {
    return { ok: false, reason: "canonical-club-identity-unavailable" };
  }
  const venue = resolveTouchlineFixtureVenue(fixture);
  const gameweekMatch = String(fixture.roundName ?? "").match(/\d+/);
  const gameweekNumber = gameweekMatch ? Number(gameweekMatch[0]) : NaN;
  if (!venue?.name || !venue.interiorImageUrl || !Number.isInteger(gameweekNumber) || gameweekNumber < 1) {
    return { ok: false, reason: "verified-match-context-unavailable" };
  }
  if (table.state !== "ready" || table.rows.length !== 20 || !table.asOf
    || table.competitionProviderId !== COMPETITION_PROVIDER_ID || !table.season) {
    return { ok: false, reason: "official-table-unavailable" };
  }
  if (!ranking || ranking.seasonId !== table.season.id) {
    return { ok: false, reason: "active-ranking-unavailable" };
  }

  const canonicalFixtureResult = await admin
    .from("football_fixtures")
    .select("id,competition_id,season_id,round_id,home_club_id,away_club_id,source_updated_at")
    .eq("provider", "sportmonks")
    .eq("provider_fixture_id", fixtureId)
    .maybeSingle();
  const canonicalFixture = canonicalFixtureResult.data;
  if (canonicalFixtureResult.error || !canonicalFixture
    || ![canonicalFixture.id, canonicalFixture.competition_id, canonicalFixture.season_id,
      canonicalFixture.round_id, canonicalFixture.home_club_id, canonicalFixture.away_club_id]
      .every((value) => UUID.test(String(value ?? "")))
    || String(canonicalFixture.season_id) !== ranking.seasonId) {
    return { ok: false, reason: "canonical-fixture-revision-unavailable" };
  }

  const [homeSquadResult, awaySquadResult, membershipDependenciesResult] = await Promise.all([
    readPublicPremierSquad(homeTeamId, { providedAdmin: admin }),
    readPublicPremierSquad(awayTeamId, { providedAdmin: admin }),
    admin
      .from("football_squad_members")
      .select("player_id,club_id")
      .eq("provider", "sportmonks")
      .eq("competition_id", String(canonicalFixture.competition_id))
      .eq("status", "active")
      .in("club_id", [
        String(canonicalFixture.home_club_id),
        String(canonicalFixture.away_club_id),
      ])
      // Nine non-player keys are also present in the source manifest. Read one
      // row beyond its 119-player capacity so an unexpectedly broad current
      // roster fails closed instead of being silently truncated.
      .limit(120),
  ]);
  if (homeSquadResult.status !== 200 || homeSquadResult.body.ok === false
    || awaySquadResult.status !== 200 || awaySquadResult.body.ok === false) {
    return { ok: false, reason: "canonical-public-squad-unavailable" };
  }
  const dependencyMemberships = membershipDependenciesResult.data;
  const canonicalClubIds = new Set([
    String(canonicalFixture.home_club_id).toLowerCase(),
    String(canonicalFixture.away_club_id).toLowerCase(),
  ]);
  if (membershipDependenciesResult.error || !Array.isArray(dependencyMemberships)
    || dependencyMemberships.length === 0 || dependencyMemberships.length > 119
    || dependencyMemberships.some((membership) => (
      !UUID.test(String(membership.player_id ?? ""))
      || !canonicalClubIds.has(String(membership.club_id ?? "").toLowerCase())
    ))) {
    return { ok: false, reason: "canonical-squad-dependency-unavailable" };
  }
  // The manifest must include every active canonical membership, not only the
  // players that the public DTO can currently project. This closes the review
  // race where fixing an already-associated player's canonical identity could
  // make that player the leader without invalidating the previously rendered
  // draft.
  const dependencyPlayerIds = dependencyMemberships.map((membership) => (
    String(membership.player_id).toLowerCase()
  ));
  const dependencyPlayerIdSet = new Set(dependencyPlayerIds);
  if (dependencyPlayerIdSet.size !== dependencyPlayerIds.length) {
    return { ok: false, reason: "canonical-squad-dependency-unavailable" };
  }
  const ratingByCanonicalId = new Map(ranking.players.flatMap((player) => (
    player.totalRating === null ? [] : [[player.playerId.toLowerCase(), player.totalRating] as const]
  )));
  const toCards = (club: TouchLineClubVisual, squad: PublicPremierSquadPayload) => (
    squad.rosterPlayers
      .map((player) => publicPremierSquadPlayerToCard(player, club.name))
      .map((card) => ({
        ...card,
        seasonTotalRating: ratingByCanonicalId.get(String(card.canonicalPlayerId ?? "").toLowerCase()) ?? null,
      }))
  );
  const homeCards = toCards(homeClub, homeSquadResult.body as PublicPremierSquadPayload);
  const awayCards = toCards(awayClub, awaySquadResult.body as PublicPremierSquadPayload);
  const projectedPlayerIds = [...homeCards, ...awayCards].map((card) => (
    String(card.canonicalPlayerId ?? "").toLowerCase()
  ));
  if (projectedPlayerIds.some((playerId) => !UUID.test(playerId))
    || new Set(projectedPlayerIds).size !== projectedPlayerIds.length
    || projectedPlayerIds.some((playerId) => !dependencyPlayerIdSet.has(playerId))) {
    return { ok: false, reason: "canonical-squad-dependency-unavailable" };
  }
  const sides = selectTouchlineMatchPreviewSides({
    homeClub,
    awayClub,
    homeSquad: homeCards,
    awaySquad: awayCards,
    tableRows: table.rows.flatMap((row) => (
      row.sportsRank && row.displayPosition
        ? [{ providerTeamId: row.team.providerTeamId, sportsRank: row.sportsRank,
          displayPosition: row.displayPosition, isTied: row.isTied, played: row.played,
          goalDifference: row.goalDifference, points: row.points }]
        : []
    )),
    rankingPlayers: ranking.players,
  });
  if (!sides) return { ok: false, reason: "published-club-leaders-unavailable" };

  const caption = buildTouchlineMatchPreviewCaption({
    homeName: sides.home.club.name,
    awayName: sides.away.club.name,
    homePosition: sides.home.table.displayPosition,
    awayPosition: sides.away.table.displayPosition,
    homeLeaderName: sides.home.leader.card.name,
    awayLeaderName: sides.away.leader.card.name,
    homeTotalRating: sides.home.leader.totalRating,
    awayTotalRating: sides.away.leader.totalRating,
    venueName: venue.name,
    gameweekNumber,
    kickOffLabel: kickOffLabel(startsAt),
  });
  if (!caption.ok) return { ok: false, reason: `caption-${caption.reason.toLowerCase()}` };

  const sourceSnapshotAt = [timestamp(canonicalFixture.source_updated_at), table.asOf, ranking.publishedAt]
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (!sourceSnapshotAt) return { ok: false, reason: "source-timestamp-unavailable" };

  const baseSource = {
    sourceProvenance: "PERSISTED_VERIFIED_MATCH_PREVIEW" as const,
    fixtureId,
    sourceSnapshotAt,
    startsAt,
    status: fixture.status ?? "",
    seasonProviderId: String(fixture.seasonId ?? ""),
    gameweekNumber,
    venue: { name: venue.name, interiorImageUrl: venue.interiorImageUrl },
    caption: caption.caption,
    sourceVersion: SOURCE_VERSION,
    ranking: {
      snapshotId: ranking.snapshotId,
      publishedAt: ranking.publishedAt,
      scoringVersion: ranking.scoringVersion,
      coverageStatus: ranking.coverageStatus,
    },
    tableAsOf: table.asOf,
    home: sides.home,
    away: sides.away,
  } as const;
  const sourceChecksum = checksumTouchlineMatchPreviewRenderSource(baseSource);
  if (!SHA256.test(sourceChecksum)) return { ok: false, reason: "source-checksum-invalid" };
  const sourceKeys = [
    `fixture-provider:${fixtureId}`,
    `fixture:${String(canonicalFixture.id).toLowerCase()}`,
    `competition:${String(canonicalFixture.competition_id).toLowerCase()}`,
    `season:${String(canonicalFixture.season_id).toLowerCase()}`,
    `league-table:${String(canonicalFixture.competition_id).toLowerCase()}`,
    `round:${String(canonicalFixture.round_id).toLowerCase()}`,
    `club:${String(canonicalFixture.home_club_id).toLowerCase()}`,
    `club:${String(canonicalFixture.away_club_id).toLowerCase()}`,
    ...dependencyPlayerIds.map((playerId) => `player:${playerId}`),
    "card-ranking:touchline-england",
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
