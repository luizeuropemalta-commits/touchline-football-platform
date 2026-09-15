import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { readTouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";
import { buildStudioFullTimePublishedSourceProof, type StudioFullTimeIdentityGraph } from "@/lib/touchlineArena/social-studio-full-time-source";
import type { StudioPublishedSourceReader } from "@/lib/touchlineArena/social-studio-source-gate";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function exactRows<T>(data: T[] | null, expectedIds: readonly string[], id: (row: T) => unknown) {
  if (!Array.isArray(data) || data.length !== expectedIds.length) return null;
  const expected = [...expectedIds].sort();
  const actual = data.map((row) => String(id(row) ?? "").toLowerCase()).sort();
  return actual.every((value, index) => UUID.test(value) && value === expected[index]) ? data : null;
}

function sourceKeys(graph: StudioFullTimeIdentityGraph) {
  return [
    `fixture-provider:${graph.fixture.providerId}`,
    `fixture:${graph.fixture.id}`,
    `competition:${graph.competition.id}`,
    `season:${graph.season.id}`,
    `round:${graph.fixture.roundId}`,
    `club:${graph.fixture.homeClubId}`,
    `club:${graph.fixture.awayClubId}`,
    ...graph.players.map((row) => `player:${row.id}`),
  ];
}

/**
 * Fresh, read-only source authority for the exact FULL_TIME Studio candidate.
 * All additional identity/publication reads are enclosed by the global source
 * revision clock, while the canonical final-score reader performs its own
 * fixture/scoring consistency proof. Any ambiguity returns null.
 */
export const readStudioPublishedFullTimeSource: StudioPublishedSourceReader = async ({
  media,
  snapshot,
  now: _now,
}) => {
  if (media.artId !== "FULL_TIME" || media.provenance.fixtureIds.length !== 1
    || media.provenance.teamIds.length !== 2 || media.provenance.playerIds.length !== 1) return null;
  const sourceReadStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  if (!sourceReadStart) return null;
  const facts = (snapshot.factualData as Record<string, unknown> | undefined)?.fullTime;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const fixture = (facts as Record<string, unknown>).fixture;
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) return null;
  const providerFixtureId = String((fixture as Record<string, unknown>).providerFixtureId ?? "").trim();
  const finalResult = await readTouchlineSocialFinalScoreDraft(providerFixtureId);
  if (!finalResult.ok) return null;
  const admin = createAdminClient();
  if (!admin) return null;

  const competitionId = media.provenance.competitionId;
  const seasonId = media.provenance.seasonId;
  const fixtureId = media.provenance.fixtureIds[0];
  const teamIds = media.provenance.teamIds;
  const playerIds = media.provenance.playerIds;
  const [competitionResult, seasonResult, fixtureResult, clubsResult, playersResult,
    membershipsResult, publicationsResult] = await Promise.all([
    admin.from("football_competitions")
      .select("id,provider_competition_id")
      .eq("provider", "sportmonks").eq("id", competitionId).maybeSingle(),
    admin.from("football_seasons")
      .select("id,provider_season_id,competition_id")
      .eq("provider", "sportmonks").eq("id", seasonId).maybeSingle(),
    admin.from("football_fixtures")
      .select("id,provider_fixture_id,competition_id,season_id,round_id,home_club_id,away_club_id,status,home_score,away_score")
      .eq("provider", "sportmonks").eq("id", fixtureId).maybeSingle(),
    admin.from("football_clubs")
      .select("id,provider_team_id").eq("provider", "sportmonks").in("id", teamIds),
    admin.from("football_players")
      .select("id,provider_player_id,current_club_id").eq("provider", "sportmonks").in("id", playerIds),
    admin.from("football_squad_members")
      .select("id,player_id,club_id,competition_id").eq("provider", "sportmonks")
      .eq("competition_id", competitionId).eq("status", "active").in("player_id", playerIds),
    admin.from("touchline_card_publications")
      .select("player_id,current_membership_id,competition_id").eq("publication_status", "published")
      .eq("competition_id", competitionId).in("player_id", playerIds),
  ]);
  if (competitionResult.error || seasonResult.error || fixtureResult.error || clubsResult.error
    || playersResult.error || membershipsResult.error || publicationsResult.error
    || !competitionResult.data || !seasonResult.data || !fixtureResult.data) return null;
  const clubs = exactRows(clubsResult.data, teamIds, (row) => row.id);
  const players = exactRows(playersResult.data, playerIds, (row) => row.id);
  const memberships = exactRows(membershipsResult.data, playerIds, (row) => row.player_id);
  const publications = exactRows(publicationsResult.data, playerIds, (row) => row.player_id);
  if (!clubs || !players || !memberships || !publications) return null;

  const graph: StudioFullTimeIdentityGraph = {
    competition: {
      id: String(competitionResult.data.id).toLowerCase(),
      providerId: String(competitionResult.data.provider_competition_id),
    },
    season: {
      id: String(seasonResult.data.id).toLowerCase(),
      providerId: String(seasonResult.data.provider_season_id),
      competitionId: String(seasonResult.data.competition_id ?? "").toLowerCase(),
    },
    fixture: {
      id: String(fixtureResult.data.id).toLowerCase(),
      providerId: String(fixtureResult.data.provider_fixture_id),
      competitionId: String(fixtureResult.data.competition_id ?? "").toLowerCase(),
      seasonId: String(fixtureResult.data.season_id ?? "").toLowerCase(),
      roundId: String(fixtureResult.data.round_id ?? "").toLowerCase(),
      homeClubId: String(fixtureResult.data.home_club_id ?? "").toLowerCase(),
      awayClubId: String(fixtureResult.data.away_club_id ?? "").toLowerCase(),
      status: String(fixtureResult.data.status ?? ""),
      homeScore: Number(fixtureResult.data.home_score),
      awayScore: Number(fixtureResult.data.away_score),
    },
    clubs: clubs.map((row) => ({
      id: String(row.id).toLowerCase(),
      providerId: String(row.provider_team_id),
    })),
    players: players.map((row) => ({
      id: String(row.id).toLowerCase(),
      providerId: String(row.provider_player_id),
      currentClubId: String(row.current_club_id ?? "").toLowerCase(),
    })),
    activeMemberships: memberships.map((row) => ({
      id: String(row.id).toLowerCase(),
      playerId: String(row.player_id).toLowerCase(),
      clubId: String(row.club_id).toLowerCase(),
      competitionId: String(row.competition_id ?? "").toLowerCase(),
    })),
    publishedCards: publications.map((row) => ({
      playerId: String(row.player_id).toLowerCase(),
      membershipId: String(row.current_membership_id ?? "").toLowerCase(),
      competitionId: String(row.competition_id ?? "").toLowerCase(),
    })),
  };
  if (![graph.fixture.roundId, ...graph.activeMemberships.map((row) => row.id)]
    .every((value) => UUID.test(value))) return null;
  const sourceReadEnd = await readTouchlineSocialSourceRevisionCheckpoint(sourceKeys(graph));
  if (!sourceReadEnd || sourceReadEnd.clockRevision !== sourceReadStart.clockRevision
    || sourceReadEnd.checksum !== finalResult.data.sourceRevisionChecksum) return null;
  const completedAt = Date.now();
  return buildStudioFullTimePublishedSourceProof({
    media,
    snapshot,
    finalDraft: finalResult.data,
    graph,
    now: completedAt,
  });
};
