export type FootballDataProviderName =
  | "legacy"
  | "api-football"
  | "sportmonks"
  | "opta"
  | "sportradar"
  | "statsperform";

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
  position?: string;
  positionId?: string;
  height?: string;
  weight?: string;
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
  homeTeam?: TouchlineTeam;
  awayTeam?: TouchlineTeam;
  homeScore?: number;
  awayScore?: number;
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
  position?: string;
  raw?: unknown;
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
  getFixtureById(id: string): Promise<FootballDataResult<TouchlineFixture | null>>;
  getFixturesByDate(params: FixturesByDateParams): Promise<FootballDataResult<TouchlineFixture[]>>;
  getLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>>;
  getStandings(params: StandingsParams): Promise<FootballDataResult<TouchlineStandingRow[]>>;
  getTransfers(params: TransfersParams): Promise<FootballDataResult<TouchlineTransfer[]>>;
  getSeasons(competitionId?: string): Promise<FootballDataResult<TouchlineSeason[]>>;
  getCompetitions(): Promise<FootballDataResult<TouchlineCompetition[]>>;
  getSquad(teamId: string): Promise<FootballDataResult<TouchlineSquadMember[]>>;
  getPlayerStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>>;
  getTeamStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>>;
  getRateLimitStatus(): Promise<FootballDataResult<FootballRateLimitStatus>>;
}
