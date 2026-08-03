import type {
  TouchlineFantasyEvent,
  TouchlineFantasyFixtureFeed,
  TouchlineFantasyFormation,
  TouchlineFantasyLineupMember,
  TouchlineFantasySidelinedPlayer,
  TouchlineFixture,
  TouchlineTeam,
} from "./types";

function sanitizeTeam(team?: TouchlineTeam): TouchlineTeam | undefined {
  if (!team) return undefined;
  const rest = { ...team };
  delete rest.logoUrl;
  return {
    ...rest,
    source: {
      provider: team.source.provider,
      providerId: team.source.providerId,
      externalUrl: team.source.externalUrl,
      lastSyncedAt: team.source.lastSyncedAt,
    },
  };
}

function sanitizeFixture(fixture: TouchlineFixture): TouchlineFixture {
  const { source, ...rest } = fixture;
  return {
    ...rest,
    homeTeam: sanitizeTeam(fixture.homeTeam),
    awayTeam: sanitizeTeam(fixture.awayTeam),
    source: {
      provider: source.provider,
      providerId: source.providerId,
      externalUrl: source.externalUrl,
      lastSyncedAt: source.lastSyncedAt,
    },
  };
}

function stripLineupRaw(member: TouchlineFantasyLineupMember): TouchlineFantasyLineupMember {
  const rest = { ...member };
  delete rest.raw;
  return rest;
}

function stripFormationRaw(formation: TouchlineFantasyFormation): TouchlineFantasyFormation {
  const rest = { ...formation };
  delete rest.raw;
  return rest;
}

function stripSidelinedRaw(player: TouchlineFantasySidelinedPlayer): TouchlineFantasySidelinedPlayer {
  const rest = { ...player };
  delete rest.raw;
  return rest;
}

function stripEventRaw(event: TouchlineFantasyEvent): TouchlineFantasyEvent {
  const rest = { ...event };
  delete rest.raw;
  return rest;
}

export function sanitizeFantasyFixtureFeedForClient(feed: TouchlineFantasyFixtureFeed): TouchlineFantasyFixtureFeed {
  return {
    fixture: sanitizeFixture(feed.fixture),
    lineups: feed.lineups.map(stripLineupRaw),
    formations: feed.formations.map(stripFormationRaw),
    sidelined: feed.sidelined.map(stripSidelinedRaw),
    events: feed.events.map(stripEventRaw),
    fetchedAt: feed.fetchedAt,
    mediaPolicy: feed.mediaPolicy,
  };
}
