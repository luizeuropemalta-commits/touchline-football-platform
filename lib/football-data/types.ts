export type FootballDataProviderName = "sportmonks";

export type FootballDataCacheBucket = "static" | "daily" | "live" | "historical";

export type FootballDataErrorCode =
  | "not_configured"
  | "unsupported"
  | "provider_error"
  | "not_found"
  | "invalid_request"
  | "rate_limited";

export type FootballDataError = {
  code: FootballDataErrorCode;
  message: string;
  provider: FootballDataProviderName;
  status?: number;
  retryAfterSeconds?: number;
  remaining?: number;
  requestedEntity?: string;
};

export type FootballDataResult<T> =
  | {
      ok: true;
      data: T;
      provider: FootballDataProviderName;
      cached?: boolean;
      fetchedAt: string;
      raw?: unknown;
    }
  | {
      ok: false;
      error: FootballDataError;
      provider: FootballDataProviderName;
      fetchedAt: string;
    };

export type FootballDataSourceRef = {
  provider: FootballDataProviderName;
  providerId: string;
  externalUrl?: string;
  raw?: unknown;
  lastSyncedAt?: string;
};

export type TouchlinePlayer = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  name: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  age?: number;
  nationality?: string;
  countryId?: string;
  /** Provider broad parent role (Goalkeeper, Defender, Midfielder, Attacker). */
  broadPosition?: string;
  broadPositionId?: string;
  /** Provider-authored exact role used by TouchLine position quotas. */
  detailedPosition?: string;
  detailedPositionId?: string;
  position?: string;
  positionId?: string;
  height?: string;
  weight?: string;
  preferredFoot?: string;
  currentTeamId?: string;
  currentTeamName?: string;
  marketValue?: number;
  marketValueCurrency?: string;
  contractUntil?: string;
  source: FootballDataSourceRef;
};

export type TouchlineTeam = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  name: string;
  shortCode?: string;
  logoUrl?: string;
  country?: string;
  countryId?: string;
  founded?: number;
  venueId?: string;
  source: FootballDataSourceRef;
};

export type TouchlineCoach = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  name: string;
  displayName: string;
  photoUrl?: string;
  dateOfBirth?: string;
  nationality?: string;
  countryId?: string;
  teamId?: string;
  source: FootballDataSourceRef;
};

export type TouchlineCompetition = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  name: string;
  type?: string;
  logoUrl?: string;
  country?: string;
  countryId?: string;
  source: FootballDataSourceRef;
};

export type TouchlineSeason = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  name: string;
  competitionId?: string;
  startsAt?: string;
  endsAt?: string;
  isCurrent?: boolean;
  source: FootballDataSourceRef;
};

export type TouchlineFixture = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  name?: string;
  startsAt?: string;
  status?: string;
  competitionId?: string;
  seasonId?: string;
  roundId?: string;
  roundName?: string;
  homeTeam?: TouchlineTeam;
  awayTeam?: TouchlineTeam;
  homeScore?: number;
  awayScore?: number;
  providerStateId?: string;
  liveMinute?: number;
  liveSecond?: number;
  livePeriod?: string;
  eventsCount?: number;
  providerUpdatedAt?: string;
  source: FootballDataSourceRef;
};

export type TouchlineTransfer = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  playerId?: string;
  playerName?: string;
  fromTeamId?: string;
  fromTeamName?: string;
  toTeamId?: string;
  toTeamName?: string;
  date?: string;
  type?: string;
  amount?: number;
  currency?: string;
  source: FootballDataSourceRef;
};

export type TouchlineStandingRow = {
  position?: number;
  teamId?: string;
  teamName?: string;
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  points?: number;
  raw?: unknown;
};

export type TouchlineSquadMember = {
  player: TouchlinePlayer;
  jerseyNumber?: number;
  broadPosition?: string;
  broadPositionId?: string;
  detailedPosition?: string;
  detailedPositionId?: string;
  position?: string;
  raw?: unknown;
};

export type TouchlineBallCoordinate = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  fixtureId: string;
  periodId: string;
  timer: string;
  x: number;
  y: number;
  /** Provider-authored timestamp, when supplied; never inferred from kickoff. */
  sourceTimestamp?: string;
};

export type TouchlineFantasyLineupMember = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
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
  statistics: TouchlineFantasyPlayerStatistic[];
  raw?: unknown;
};

export type TouchlineFantasyPlayerStatistic = {
  typeId: string;
  code?: string;
  name?: string;
  value?: number | string;
};

export type TouchlineFantasyFormation = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  fixtureId: string;
  teamId?: string;
  teamName?: string;
  formation?: string;
  raw?: unknown;
};

export type TouchlineFantasySidelinedPlayer = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  fixtureId: string;
  teamId?: string;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  reason?: string;
  category?: string;
  raw?: unknown;
};

export type TouchlineFantasyEvent = {
  id: string;
  providerId: string;
  provider: FootballDataProviderName;
  fixtureId?: string;
  teamId?: string;
  playerId?: string;
  playerName?: string;
  relatedPlayerId?: string;
  relatedPlayerName?: string;
  type?: string;
  minute?: number;
  extraMinute?: number;
  sortOrder?: number;
  result?: string;
  info?: string;
  addition?: string;
  status?: "recorded" | "rescinded";
  fantasyPoints?: number;
  raw?: unknown;
};

export type TouchlineProviderCapability = {
  id: string;
  name?: string;
  endpoint?: string;
  available?: boolean;
  raw?: unknown;
};

export type TouchlineProviderCapabilities = {
  provider: FootballDataProviderName;
  resources: TouchlineProviderCapability[];
  enrichments: TouchlineProviderCapability[];
  fetchedAt: string;
};

export type TouchlineFantasyFixtureFeed = {
  fixture: TouchlineFixture;
  lineups: TouchlineFantasyLineupMember[];
  formations: TouchlineFantasyFormation[];
  sidelined: TouchlineFantasySidelinedPlayer[];
  events: TouchlineFantasyEvent[];
  fetchedAt: string;
  mediaPolicy: {
    officialMediaExposed: false;
    note: string;
  };
};

export type FootballRateLimitStatus = {
  configured: boolean;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  providerMessage?: string;
};

export type SearchPlayersParams = {
  query: string;
  seasonId?: string;
  limit?: number;
};

export type FixturesByDateParams = {
  date: string;
  timezone?: string;
};

/**
 * A provider-scoped fixture window. `competitionId` is deliberately part of
 * the request contract so callers never have to paginate the whole football
 * calendar and filter a competition only after the response has been capped.
 */
export type FixturesBetweenParams = {
  fromDate: string;
  throughDate: string;
  competitionId: string;
  timezone?: string;
};

export type StandingsParams = {
  seasonId?: string;
  competitionId?: string;
};

export type TransfersParams = {
  playerId?: string;
  teamId?: string;
};

export type StatsParams = {
  playerId?: string;
  teamId?: string;
  seasonId?: string;
};

export interface FootballDataProvider {
  readonly name: FootballDataProviderName;

  searchPlayers(params: SearchPlayersParams): Promise<FootballDataResult<TouchlinePlayer[]>>;
  getPlayerById(id: string): Promise<FootballDataResult<TouchlinePlayer | null>>;
  getTeamById(id: string): Promise<FootballDataResult<TouchlineTeam | null>>;
  getCoachById(id: string): Promise<FootballDataResult<TouchlineCoach | null>>;
  getCompetitionById(id: string): Promise<FootballDataResult<TouchlineCompetition | null>>;
  getSeasonById(id: string): Promise<FootballDataResult<TouchlineSeason | null>>;
  getFixtureById(id: string): Promise<FootballDataResult<TouchlineFixture | null>>;
  getFixturesByDate(params: FixturesByDateParams): Promise<FootballDataResult<TouchlineFixture[]>>;
  getFixturesBetween(params: FixturesBetweenParams): Promise<FootballDataResult<TouchlineFixture[]>>;
  getLiveScores(params?: { competitionId?: string }): Promise<FootballDataResult<TouchlineFixture[]>>;
  getLatestLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>>;
  getStandings(params: StandingsParams): Promise<FootballDataResult<TouchlineStandingRow[]>>;
  getTransfers(params: TransfersParams): Promise<FootballDataResult<TouchlineTransfer[]>>;
  getSeasons(competitionId?: string): Promise<FootballDataResult<TouchlineSeason[]>>;
  getCompetitions(): Promise<FootballDataResult<TouchlineCompetition[]>>;
  getSquad(teamId: string): Promise<FootballDataResult<TouchlineSquadMember[]>>;
  getPlayerStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>>;
  getTeamStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>>;
  getRateLimitStatus(): Promise<FootballDataResult<FootballRateLimitStatus>>;
  getFixtureBallCoordinates(fixtureId: string): Promise<FootballDataResult<TouchlineBallCoordinate[]>>;
  getFixtureFantasyFeed(fixtureId: string): Promise<FootballDataResult<TouchlineFantasyFixtureFeed | null>>;
  getLiveFantasyEvents(fixtureId?: string): Promise<FootballDataResult<TouchlineFantasyEvent[]>>;
  getSubscriptionCapabilities(): Promise<FootballDataResult<TouchlineProviderCapabilities>>;
}
