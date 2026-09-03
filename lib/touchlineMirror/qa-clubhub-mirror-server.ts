import "server-only";

import { createHash } from "node:crypto";

import {
  TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
  TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
  type TouchlineOfficialLeagueTable,
} from "../football-data/official-league-table.ts";
import type { TouchlinePublicFixture } from "../football-data/public-fixture.ts";
import type { TouchlineClubSocialFeedPage } from "../touchlineArena/club-social-feed-server.ts";
import {
  fetchTouchlineQaClubHubMirror,
  resolveTouchlineClubHubDataSource,
  resolveTouchlineQaReadOrigin,
  type TouchlineQaClubHubMirrorDto,
  type TouchlineQaClubHubMirrorReadResult,
} from "./qa-clubhub-mirror.ts";

const PUBLIC_FEED_ID_NAMESPACE = "touchline:qa-clubhub-feed:v1:";

export function touchlineQaClubHubFeedPublicId(internalPostId: string) {
  return createHash("sha256")
    .update(`${PUBLIC_FEED_ID_NAMESPACE}${internalPostId}`)
    .digest("hex")
    .slice(0, 40);
}

export function canonicalFeedToMirrorFeed(
  teamId: string,
  feed: TouchlineClubSocialFeedPage,
): TouchlineQaClubHubMirrorDto["feed"] {
  if (feed.state !== "ready") return { state: feed.state, items: [] };
  const sourceItems = feed.items.slice(0, 6);
  if (sourceItems.some((item) => item.width !== 1080 || (item.height !== 1350 && item.height !== 1920))) {
    return { state: "unavailable", items: [] };
  }
  const items = sourceItems.map((item) => {
    const publicId = touchlineQaClubHubFeedPublicId(item.id);
    return {
      publicId,
      contentType: item.contentType,
      copy: item.copy,
      publishedAt: item.publishedAt,
      width: 1080 as const,
      height: item.height === 1350 ? 1350 as const : 1920 as const,
      imagePath: `/api/touchline-qa/read/clubhub/${teamId}/feed-art/${publicId}`,
    };
  });
  return items.length ? { state: "ready", items } : { state: "empty", items: [] };
}

function unavailableMirrorTable(reason: string): TouchlineOfficialLeagueTable {
  return {
    state: "unavailable",
    competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: null,
    asOf: null,
    coverage: {
      expectedClubs: TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
      mappedClubs: 0,
      fixturesInSeason: 0,
      completedFixtures: 0,
      liveFixtures: 0,
      duplicateFixtures: 0,
    },
    rows: [],
    reason,
  };
}

export function mirrorDtoToOfficialTable(dto: TouchlineQaClubHubMirrorDto): TouchlineOfficialLeagueTable {
  return {
    state: dto.leagueTable.state,
    competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: dto.leagueTable.season ? {
      // The provider season ID is already public football metadata. No QA
      // database UUID crosses the mirror boundary.
      id: dto.leagueTable.season.providerSeasonId,
      providerSeasonId: dto.leagueTable.season.providerSeasonId,
      name: dto.leagueTable.season.name,
      sourceUpdatedAt: dto.leagueTable.season.sourceUpdatedAt,
    } : null,
    asOf: dto.leagueTable.asOf,
    coverage: dto.leagueTable.coverage,
    rows: dto.leagueTable.rows.map((row) => ({
      sportsRank: row.sportsRank,
      isTied: row.isTied,
      displayPosition: row.displayPosition,
      team: {
        providerTeamId: row.team.teamId,
        name: row.team.name,
        shortCode: row.team.shortCode,
        slug: row.team.slug,
        logoUrl: row.team.logoUrl,
      },
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
      form: row.form,
      liveFixture: row.liveFixture ? {
        providerFixtureId: row.liveFixture.fixtureId,
        scoreFor: row.liveFixture.scoreFor,
        scoreAgainst: row.liveFixture.scoreAgainst,
        stale: row.liveFixture.stale,
      } : null,
    })),
    reason: null,
  };
}

export function mirrorDtoToPublicFixture(dto: TouchlineQaClubHubMirrorDto): TouchlinePublicFixture | null {
  const fixture = dto.nextFixture;
  if (!fixture) return null;
  return {
    id: fixture.fixtureId,
    providerId: fixture.fixtureId,
    startsAt: fixture.startsAt,
    ...(fixture.status === null ? {} : { status: fixture.status }),
    ...(fixture.roundName === null ? {} : { roundName: fixture.roundName }),
    homeTeam: {
      id: fixture.homeTeam.teamId,
      providerId: fixture.homeTeam.teamId,
      name: fixture.homeTeam.name,
      ...(fixture.homeTeam.shortCode === null ? {} : { shortCode: fixture.homeTeam.shortCode }),
      ...(fixture.homeTeam.logoUrl === null ? {} : { logoUrl: fixture.homeTeam.logoUrl }),
    },
    awayTeam: {
      id: fixture.awayTeam.teamId,
      providerId: fixture.awayTeam.teamId,
      name: fixture.awayTeam.name,
      ...(fixture.awayTeam.shortCode === null ? {} : { shortCode: fixture.awayTeam.shortCode }),
      ...(fixture.awayTeam.logoUrl === null ? {} : { logoUrl: fixture.awayTeam.logoUrl }),
    },
    ...(fixture.venue === null ? {} : { venue: {
      id: fixture.venue.id,
      name: fixture.venue.name,
      ...(fixture.venue.capacity === null ? {} : { capacity: fixture.venue.capacity }),
      homeClubName: fixture.venue.homeClubName,
      imageUrl: fixture.venue.imageUrl,
      ...(fixture.venue.interiorImageUrl === null ? {} : { interiorImageUrl: fixture.venue.interiorImageUrl }),
    } }),
    ...(fixture.homeScore === null ? {} : { homeScore: fixture.homeScore }),
    ...(fixture.awayScore === null ? {} : { awayScore: fixture.awayScore }),
    ...(fixture.verifiedAt === null ? {} : { verifiedAt: fixture.verifiedAt }),
  };
}

export function mirrorDtoToSocialFeed(
  dto: TouchlineQaClubHubMirrorDto,
  origin: string,
): TouchlineClubSocialFeedPage {
  return {
    state: dto.feed.state,
    items: dto.feed.items.map((item) => ({
      id: item.publicId,
      contentType: item.contentType,
      copy: item.copy,
      publishedAt: item.publishedAt,
      width: item.width,
      height: item.height,
      imageUrl: new URL(item.imagePath, origin).href,
    })),
    nextCursor: null,
  };
}

/** Local-only read of the whole bounded ClubHub mirror envelope. */
export async function loadTouchlineQaClubHubMirror(teamId: string): Promise<TouchlineQaClubHubMirrorReadResult> {
  if (resolveTouchlineClubHubDataSource() !== "qa-mirror") {
    return { state: "unavailable", reason: "configuration" };
  }
  const origin = resolveTouchlineQaReadOrigin(process.env.TOUCHLINE_QA_READ_ORIGIN);
  if (!origin) return { state: "unavailable", reason: "configuration" };
  return fetchTouchlineQaClubHubMirror({ teamId, origin });
}

/**
 * Local-only reader for the public QA mirror. It never calls Supabase or the
 * football provider and never falls back when QA is unavailable.
 */
export async function loadTouchlineQaMirroredLeagueTable(
  teamId: string,
  providedResult?: Promise<TouchlineQaClubHubMirrorReadResult>,
) {
  const result = providedResult ? await providedResult : await loadTouchlineQaClubHubMirror(teamId);
  return result.state === "ready"
    ? mirrorDtoToOfficialTable(result.data)
    : unavailableMirrorTable(`qa-mirror-${result.reason}`);
}

/**
 * Local-only feed projection for the public QA mirror. Artwork URLs always
 * point to the bounded QA proxy; signed storage URLs never reach the browser.
 */
export async function loadTouchlineQaMirroredSocialFeed(
  teamId: string,
  providedResult?: Promise<TouchlineQaClubHubMirrorReadResult>,
): Promise<TouchlineClubSocialFeedPage> {
  const origin = resolveTouchlineQaReadOrigin(process.env.TOUCHLINE_QA_READ_ORIGIN);
  if (!origin) return { state: "unavailable", items: [], nextCursor: null };
  const result = providedResult ? await providedResult : await loadTouchlineQaClubHubMirror(teamId);
  return result.state === "ready"
    ? mirrorDtoToSocialFeed(result.data, origin)
    : { state: "unavailable", items: [], nextCursor: null };
}
