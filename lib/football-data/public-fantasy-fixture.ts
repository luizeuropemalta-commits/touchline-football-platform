import type {
  TouchlineFantasyEvent,
  TouchlineFantasyFixtureFeed,
  TouchlineFantasyFormation,
  TouchlineFantasyLineupMember,
  TouchlineFantasyPlayerStatistic,
  TouchlineFantasySidelinedPlayer,
  TouchlineTeam,
} from "./types";

export type TouchlinePublicFantasyStatistic = Readonly<{
  typeId: string;
  code?: string;
  name?: string;
  value?: number | string;
}>;

export type TouchlinePublicFantasyTeam = Readonly<{
  id: string;
  name: string;
  shortCode?: string;
}>;

export type TouchlinePublicFantasyFixture = Readonly<{
  id: string;
  name?: string;
  startsAt?: string;
  status?: string;
  competitionId?: string;
  seasonId?: string;
  homeTeam?: TouchlinePublicFantasyTeam;
  awayTeam?: TouchlinePublicFantasyTeam;
  homeScore?: number;
  awayScore?: number;
  verifiedAt?: string;
}>;

export type TouchlinePublicFantasyLineupMember = Readonly<{
  id: string;
  fixtureId: string;
  teamId?: string;
  teamName?: string;
  playerId?: string;
  playerName: string;
  jerseyNumber?: number;
  position?: string;
  positionId?: string;
  formationPosition?: string;
  x?: number;
  y?: number;
  isStarter?: boolean;
  isSubstitute?: boolean;
  isCaptain?: boolean;
  statistics: TouchlinePublicFantasyStatistic[];
}>;

export type TouchlinePublicFantasyFormation = Readonly<{
  id: string;
  fixtureId: string;
  teamId?: string;
  teamName?: string;
  formation?: string;
}>;

export type TouchlinePublicFantasySidelinedPlayer = Readonly<{
  id: string;
  fixtureId: string;
  teamId?: string;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  reason?: string;
  category?: string;
}>;

export type TouchlinePublicFantasyEvent = Readonly<{
  id: string;
  fixtureId?: string;
  teamId?: string;
  playerId?: string;
  playerName?: string;
  relatedPlayerId?: string;
  relatedPlayerName?: string;
  type?: string;
  minute?: number;
  extraMinute?: number;
  fantasyPoints?: number;
}>;

export type TouchlinePublicPlayerPointContribution = Readonly<{
  providerEventId: string;
  role: "primary" | "assist";
  eventType: string;
  minute: number | null;
  points: number;
}>;

/**
 * Small, explicit allowlist of verified match statistics a card can display.
 * A missing field stays absent: it must never become a fabricated zero.
 */
export type TouchlinePublicFixtureCardStatistics = Readonly<{
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheets?: number;
  saves?: number;
  goalsConceded?: number;
}>;

export type TouchlinePublicFixturePlayerStatistics = Readonly<{
  playerId: string;
  playerName: string;
  teamId?: string;
  appearanceStatus: "started" | "substitute" | "unused" | "absent" | "unavailable";
  minutes: number | null;
  rating: number | null;
  touchlinePoints: number | null;
  settlementStatus: "provisional" | "final" | "unavailable";
  contributions: TouchlinePublicPlayerPointContribution[];
  statistics: TouchlinePublicFixtureCardStatistics;
}>;

export type TouchlinePublicFantasyFixtureFeed = Readonly<{
  fixture: TouchlinePublicFantasyFixture;
  lineups: TouchlinePublicFantasyLineupMember[];
  formations: TouchlinePublicFantasyFormation[];
  sidelined: TouchlinePublicFantasySidelinedPlayer[];
  events: TouchlinePublicFantasyEvent[];
  capturedAt: string;
}>;

export type TouchlinePublicFantasyFixtureMatchDetail = TouchlinePublicFantasyFixtureFeed & Readonly<{
  playerStatistics: TouchlinePublicFixturePlayerStatistics[];
  lineupAvailableAt: string | null;
}>;

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function publicStatistic(statistic: TouchlineFantasyPlayerStatistic): TouchlinePublicFantasyStatistic | null {
  const typeId = nonEmptyString(statistic.typeId);
  if (!typeId) return null;
  const value = typeof statistic.value === "number" && Number.isFinite(statistic.value)
    ? statistic.value
    : nonEmptyString(statistic.value);
  return {
    typeId,
    code: nonEmptyString(statistic.code),
    name: nonEmptyString(statistic.name),
    ...(value === undefined ? {} : { value }),
  };
}

function publicTeam(team?: TouchlineTeam): TouchlinePublicFantasyTeam | undefined {
  if (!team) return undefined;
  const id = nonEmptyString(team.providerId);
  const name = nonEmptyString(team.name);
  if (!id || !name) return undefined;
  return { id, name, shortCode: nonEmptyString(team.shortCode) };
}

function publicLineup(member: TouchlineFantasyLineupMember): TouchlinePublicFantasyLineupMember | null {
  const id = nonEmptyString(member.providerId);
  const fixtureId = nonEmptyString(member.fixtureId);
  const playerName = nonEmptyString(member.playerName);
  if (!id || !fixtureId || !playerName) return null;
  return {
    id,
    fixtureId,
    teamId: nonEmptyString(member.teamId),
    teamName: nonEmptyString(member.teamName),
    playerId: nonEmptyString(member.playerId),
    playerName,
    jerseyNumber: finiteNumber(member.jerseyNumber),
    position: nonEmptyString(member.position),
    positionId: nonEmptyString(member.positionId),
    formationPosition: nonEmptyString(member.formationPosition),
    x: finiteNumber(member.x),
    y: finiteNumber(member.y),
    isStarter: member.isStarter === true ? true : undefined,
    isSubstitute: member.isSubstitute === true ? true : undefined,
    isCaptain: member.isCaptain === true ? true : undefined,
    statistics: Array.isArray(member.statistics)
      ? member.statistics.map(publicStatistic).filter((statistic): statistic is TouchlinePublicFantasyStatistic => Boolean(statistic))
      : [],
  };
}

function publicFormation(item: TouchlineFantasyFormation): TouchlinePublicFantasyFormation | null {
  const id = nonEmptyString(item.providerId);
  const fixtureId = nonEmptyString(item.fixtureId);
  if (!id || !fixtureId) return null;
  return {
    id,
    fixtureId,
    teamId: nonEmptyString(item.teamId),
    teamName: nonEmptyString(item.teamName),
    formation: nonEmptyString(item.formation),
  };
}

function publicSidelined(item: TouchlineFantasySidelinedPlayer): TouchlinePublicFantasySidelinedPlayer | null {
  const id = nonEmptyString(item.providerId);
  const fixtureId = nonEmptyString(item.fixtureId);
  if (!id || !fixtureId) return null;
  return {
    id,
    fixtureId,
    teamId: nonEmptyString(item.teamId),
    teamName: nonEmptyString(item.teamName),
    playerId: nonEmptyString(item.playerId),
    playerName: nonEmptyString(item.playerName),
    reason: nonEmptyString(item.reason),
    category: nonEmptyString(item.category),
  };
}

function publicEvent(item: TouchlineFantasyEvent): TouchlinePublicFantasyEvent | null {
  const id = nonEmptyString(item.providerId);
  if (!id) return null;
  return {
    id,
    fixtureId: nonEmptyString(item.fixtureId),
    teamId: nonEmptyString(item.teamId),
    playerId: nonEmptyString(item.playerId),
    playerName: nonEmptyString(item.playerName),
    relatedPlayerId: nonEmptyString(item.relatedPlayerId),
    relatedPlayerName: nonEmptyString(item.relatedPlayerName),
    type: nonEmptyString(item.type),
    minute: finiteNumber(item.minute),
    extraMinute: finiteNumber(item.extraMinute),
    fantasyPoints: finiteNumber(item.fantasyPoints),
  };
}

/**
 * Explicit public transport allowlist. Stable numeric references remain
 * TouchLine identifiers; provider-labelled metadata, raw payloads, media and
 * source URLs never cross this boundary.
 */
export function toPublicFantasyFixtureFeed(
  feed: TouchlineFantasyFixtureFeed,
): TouchlinePublicFantasyFixtureFeed | null {
  const fixtureId = nonEmptyString(feed.fixture.providerId);
  const capturedAt = nonEmptyString(feed.fetchedAt);
  if (!fixtureId || !capturedAt || !Number.isFinite(Date.parse(capturedAt))) return null;

  return {
    fixture: {
      id: fixtureId,
      name: nonEmptyString(feed.fixture.name),
      startsAt: nonEmptyString(feed.fixture.startsAt),
      status: nonEmptyString(feed.fixture.status),
      competitionId: nonEmptyString(feed.fixture.competitionId),
      seasonId: nonEmptyString(feed.fixture.seasonId),
      homeTeam: publicTeam(feed.fixture.homeTeam),
      awayTeam: publicTeam(feed.fixture.awayTeam),
      homeScore: finiteNumber(feed.fixture.homeScore),
      awayScore: finiteNumber(feed.fixture.awayScore),
      verifiedAt: nonEmptyString(feed.fixture.source.lastSyncedAt) ?? capturedAt,
    },
    lineups: feed.lineups.map(publicLineup).filter((item): item is TouchlinePublicFantasyLineupMember => Boolean(item)),
    formations: feed.formations.map(publicFormation).filter((item): item is TouchlinePublicFantasyFormation => Boolean(item)),
    sidelined: feed.sidelined.map(publicSidelined).filter((item): item is TouchlinePublicFantasySidelinedPlayer => Boolean(item)),
    events: feed.events.map(publicEvent).filter((item): item is TouchlinePublicFantasyEvent => Boolean(item)),
    capturedAt,
  };
}
