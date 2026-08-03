import { SportmonksFootballProvider } from "@/lib/football-data/providers/sportmonks";
import { resultError } from "@/lib/football-data/http";
import type {
  FixturesByDateParams,
  FootballDataProvider,
  FootballDataResult,
  FootballDataProviderName,
  FootballRateLimitStatus,
  SearchPlayersParams,
  StandingsParams,
  StatsParams,
  TouchlineBallCoordinate,
  TouchlineCoach,
  TouchlineCompetition,
  TouchlineFantasyEvent,
  TouchlineFantasyFixtureFeed,
  TouchlineFixture,
  TouchlinePlayer,
  TouchlineProviderCapabilities,
  TouchlineSeason,
  TouchlineSquadMember,
  TouchlineStandingRow,
  TouchlineTeam,
  TouchlineTransfer,
  TransfersParams,
} from "@/lib/football-data/types";

let cachedProvider: FootballDataProvider | null = null;

export function getConfiguredFootballDataProviderName(): FootballDataProviderName {
  const configured = (process.env.FOOTBALL_DATA_PROVIDER ?? "sportmonks").trim().toLowerCase();

  if (configured === "sportmonks") return "sportmonks";
  if (configured === "opta") return "opta";
  if (configured === "sportradar") return "sportradar";
  if (configured === "statsperform" || configured === "stats-perform") return "statsperform";

  return "sportmonks";
}

export function createFootballDataProvider(name: FootballDataProviderName = getConfiguredFootballDataProviderName()): FootballDataProvider {
  if (name === "sportmonks") return new SportmonksFootballProvider();

  return new PlaceholderFootballProvider(name);
}

export function getFootballDataProvider() {
  cachedProvider ??= createFootballDataProvider();
  return cachedProvider;
}

export function resetFootballDataProviderForTests() {
  cachedProvider = null;
}

class PlaceholderFootballProvider implements FootballDataProvider {
  constructor(readonly name: FootballDataProviderName) {}

  private unsupported<T>(): Promise<FootballDataResult<T>> {
    return Promise.resolve(
      resultError(this.name, "unsupported", `${this.name} adapter is reserved for a future enterprise provider migration.`),
    );
  }

  searchPlayers(_params: SearchPlayersParams): Promise<FootballDataResult<TouchlinePlayer[]>> {
    return this.unsupported<TouchlinePlayer[]>();
  }

  getPlayerById(_id: string): Promise<FootballDataResult<TouchlinePlayer | null>> {
    return this.unsupported<TouchlinePlayer | null>();
  }

  getTeamById(_id: string): Promise<FootballDataResult<TouchlineTeam | null>> {
    return this.unsupported<TouchlineTeam | null>();
  }

  getCoachById(_id: string): Promise<FootballDataResult<TouchlineCoach | null>> {
    return this.unsupported<TouchlineCoach | null>();
  }

  getCompetitionById(_id: string): Promise<FootballDataResult<TouchlineCompetition | null>> {
    return this.unsupported<TouchlineCompetition | null>();
  }

  getSeasonById(_id: string): Promise<FootballDataResult<TouchlineSeason | null>> {
    return this.unsupported<TouchlineSeason | null>();
  }

  getFixtureById(_id: string): Promise<FootballDataResult<TouchlineFixture | null>> {
    return this.unsupported<TouchlineFixture | null>();
  }

  getFixturesByDate(_params: FixturesByDateParams): Promise<FootballDataResult<TouchlineFixture[]>> {
    return this.unsupported<TouchlineFixture[]>();
  }

  getLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>> {
    return this.unsupported<TouchlineFixture[]>();
  }

  getLatestLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>> {
    return this.unsupported<TouchlineFixture[]>();
  }

  getStandings(_params: StandingsParams): Promise<FootballDataResult<TouchlineStandingRow[]>> {
    return this.unsupported<TouchlineStandingRow[]>();
  }

  getTransfers(_params: TransfersParams): Promise<FootballDataResult<TouchlineTransfer[]>> {
    return this.unsupported<TouchlineTransfer[]>();
  }

  getSeasons(_competitionId?: string): Promise<FootballDataResult<TouchlineSeason[]>> {
    return this.unsupported<TouchlineSeason[]>();
  }

  getCompetitions(): Promise<FootballDataResult<TouchlineCompetition[]>> {
    return this.unsupported<TouchlineCompetition[]>();
  }

  getSquad(_teamId: string): Promise<FootballDataResult<TouchlineSquadMember[]>> {
    return this.unsupported<TouchlineSquadMember[]>();
  }

  getPlayerStats(_params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    return this.unsupported<Record<string, unknown>>();
  }

  getTeamStats(_params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    return this.unsupported<Record<string, unknown>>();
  }

  getRateLimitStatus(): Promise<FootballDataResult<FootballRateLimitStatus>> {
    return this.unsupported<FootballRateLimitStatus>();
  }

  getFixtureBallCoordinates(_fixtureId: string): Promise<FootballDataResult<TouchlineBallCoordinate[]>> {
    return this.unsupported<TouchlineBallCoordinate[]>();
  }

  getFixtureFantasyFeed(_fixtureId: string): Promise<FootballDataResult<TouchlineFantasyFixtureFeed | null>> {
    return this.unsupported<TouchlineFantasyFixtureFeed | null>();
  }

  getLiveFantasyEvents(_fixtureId?: string): Promise<FootballDataResult<TouchlineFantasyEvent[]>> {
    return this.unsupported<TouchlineFantasyEvent[]>();
  }

  getSubscriptionCapabilities(): Promise<FootballDataResult<TouchlineProviderCapabilities>> {
    return this.unsupported<TouchlineProviderCapabilities>();
  }
}
