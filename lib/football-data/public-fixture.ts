import type { TouchlineFixture, TouchlineTeam } from "./types";

/**
 * Browser-facing fixture contract. Provider identity remains server metadata;
 * applications identify a football fixture only through its stable TouchLine
 * fixture key and expose TouchLine verification timestamps to the user.
 */
export type TouchlinePublicTeam = {
  id: string;
  providerId: string;
  name: string;
  shortCode?: string;
  logoUrl?: string;
};

export type TouchlinePublicVenue = {
  id: string;
  name: string;
  capacity?: number;
  homeClubName: string;
  imageUrl: string;
  photoCredit: {
    label: string;
    sourceUrl: string;
    licenseLabel: string;
    licenseUrl: string;
  };
};

export type TouchlinePublicFixture = {
  id: string;
  providerId: string;
  name?: string;
  startsAt?: string;
  status?: string;
  competitionId?: string;
  seasonId?: string;
  roundId?: string;
  roundName?: string;
  homeTeam?: TouchlinePublicTeam;
  awayTeam?: TouchlinePublicTeam;
  venue?: TouchlinePublicVenue;
  homeScore?: number;
  awayScore?: number;
  providerStateId?: string;
  liveMinute?: number;
  liveSecond?: number;
  livePeriod?: string;
  eventsCount?: number;
  providerUpdatedAt?: string;
  verifiedAt?: string;
};

function toPublicTeam(team?: TouchlineTeam): TouchlinePublicTeam | undefined {
  if (!team) return undefined;
  return {
    // IDs are stable TouchLine references in this public transport contract.
    // Provider ownership and raw source details never reach the browser.
    id: team.providerId,
    providerId: team.providerId,
    name: team.name,
    shortCode: team.shortCode,
    logoUrl: team.logoUrl,
  };
}

export function toPublicTouchlineFixture(fixture: TouchlineFixture): TouchlinePublicFixture {
  return {
    id: fixture.providerId,
    providerId: fixture.providerId,
    name: fixture.name,
    startsAt: fixture.startsAt,
    status: fixture.status,
    competitionId: fixture.competitionId,
    seasonId: fixture.seasonId,
    roundId: fixture.roundId,
    roundName: fixture.roundName,
    homeTeam: toPublicTeam(fixture.homeTeam),
    awayTeam: toPublicTeam(fixture.awayTeam),
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    providerStateId: fixture.providerStateId,
    liveMinute: fixture.liveMinute,
    liveSecond: fixture.liveSecond,
    livePeriod: fixture.livePeriod,
    eventsCount: fixture.eventsCount,
    providerUpdatedAt: fixture.providerUpdatedAt,
    verifiedAt: fixture.source.lastSyncedAt,
  };
}

export function toPublicTouchlineFixtures(fixtures: TouchlineFixture[]) {
  return fixtures.map(toPublicTouchlineFixture);
}
