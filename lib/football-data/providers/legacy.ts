import { getApiFootballSeason } from "@/lib/market-data/season";
import { withFootballDataCache } from "@/lib/football-data/cache";
import { asNumber, asString, footballDataFetchJson, providerId, resultError, resultOk } from "@/lib/football-data/http";
import type {
  FixturesByDateParams,
  FootballDataProvider,
  FootballDataResult,
  FootballRateLimitStatus,
  SearchPlayersParams,
  StandingsParams,
  StatsParams,
  TouchlineCoach,
  TouchlineCompetition,
  TouchlineFixture,
  TouchlinePlayer,
  TouchlineSeason,
  TouchlineSquadMember,
  TouchlineStandingRow,
  TouchlineTeam,
  TouchlineTransfer,
  TransfersParams,
} from "@/lib/football-data/types";

type ApiFootballEnvelope<T> = {
  response?: T;
  results?: number;
  errors?: unknown;
};

type ApiFootballPlayerItem = {
  player?: {
    id?: number;
    name?: string;
    firstname?: string;
    lastname?: string;
    age?: number;
    birth?: { date?: string; country?: string };
    nationality?: string;
    height?: string;
    weight?: string;
    photo?: string;
  };
  statistics?: Array<{
    team?: { id?: number; name?: string; logo?: string };
    games?: { position?: string };
  }>;
};

type ApiFootballTeamItem = {
  team?: { id?: number; name?: string; code?: string; country?: string; founded?: number; logo?: string };
  venue?: { id?: number };
};

export class LegacyFootballProvider implements FootballDataProvider {
  readonly name = "legacy" as const;

  private apiKey() {
    return process.env.API_FOOTBALL_KEY ?? process.env.APISPORTS_KEY;
  }

  private baseUrl() {
    return process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  }

  private season() {
    return getApiFootballSeason(process.env.API_FOOTBALL_SEASON);
  }

  private notConfigured<T>(): FootballDataResult<T> {
    return resultError(
      this.name,
      "not_configured",
      "Legacy API-Football provider is not configured. Add API_FOOTBALL_KEY to enable it.",
    );
  }

  private async request<T>(path: string, params: Record<string, string | number | undefined> = {}) {
    const apiKey = this.apiKey();
    if (!apiKey) return { configured: false as const };

    const url = new URL(path, this.baseUrl());
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });

    const response = await footballDataFetchJson<ApiFootballEnvelope<T>>(url, {
      provider: this.name,
      headers: { "x-apisports-key": apiKey },
    });

    return { configured: true as const, response };
  }

  async searchPlayers(params: SearchPlayersParams): Promise<FootballDataResult<TouchlinePlayer[]>> {
    if (!params.query.trim()) return resultOk(this.name, []);

    const { value, cached } = await withFootballDataCache("daily", ["legacy", "searchPlayers", params.query, params.seasonId], async () => {
      const request = await this.request<ApiFootballPlayerItem[]>("/players", {
        search: params.query,
        season: params.seasonId ?? this.season(),
      });
      if (!request.configured) return this.notConfigured<TouchlinePlayer[]>();
      if (!request.response.ok) {
        return resultError(this.name, "provider_error", request.response.error ?? "API-Football player search failed.", request.response.status);
      }
      const players = (request.response.data?.response ?? [])
        .map((item) => this.mapPlayer(item))
        .filter((player): player is TouchlinePlayer => Boolean(player))
        .slice(0, params.limit ?? 20);
      return resultOk(this.name, players, request.response.data);
    });

    return value.ok ? { ...value, cached } : value;
  }

  async getPlayerById(id: string): Promise<FootballDataResult<TouchlinePlayer | null>> {
    const request = await this.request<ApiFootballPlayerItem[]>("/players", { id, season: this.season() });
    if (!request.configured) return this.notConfigured<TouchlinePlayer | null>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football player lookup failed.", request.response.status);
    return resultOk(this.name, this.mapPlayer(request.response.data?.response?.[0]) ?? null, request.response.data);
  }

  async getTeamById(id: string): Promise<FootballDataResult<TouchlineTeam | null>> {
    const request = await this.request<ApiFootballTeamItem[]>("/teams", { id });
    if (!request.configured) return this.notConfigured<TouchlineTeam | null>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football team lookup failed.", request.response.status);
    return resultOk(this.name, this.mapTeam(request.response.data?.response?.[0]) ?? null, request.response.data);
  }

  async getCoachById(id: string): Promise<FootballDataResult<TouchlineCoach | null>> {
    const request = await this.request<Array<{ id?: number; name?: string; firstname?: string; lastname?: string; photo?: string; birth?: { date?: string; country?: string } }>>("/coachs", { id });
    if (!request.configured) return this.notConfigured<TouchlineCoach | null>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football coach lookup failed.", request.response.status);
    const coach = request.response.data?.response?.[0];
    if (!coach?.id) return resultOk(this.name, null, request.response.data);
    const coachName = (coach.name ?? [coach.firstname, coach.lastname].filter(Boolean).join(" ")) || `Coach ${coach.id}`;
    return resultOk(this.name, {
      id: providerId(this.name, coach.id),
      providerId: String(coach.id),
      provider: this.name,
      name: coachName,
      displayName: coachName,
      photoUrl: coach.photo,
      dateOfBirth: coach.birth?.date,
      nationality: coach.birth?.country,
      source: { provider: this.name, providerId: String(coach.id), raw: coach },
    }, request.response.data);
  }

  async getCompetitionById(id: string): Promise<FootballDataResult<TouchlineCompetition | null>> {
    const request = await this.request<Array<{ league?: { id?: number; name?: string; type?: string; logo?: string }; country?: { name?: string } }>>("/leagues", { id });
    if (!request.configured) return this.notConfigured<TouchlineCompetition | null>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football competition lookup failed.", request.response.status);
    const competition = request.response.data?.response?.[0];
    if (!competition?.league?.id) return resultOk(this.name, null, request.response.data);
    return resultOk(this.name, {
      id: providerId(this.name, competition.league.id),
      providerId: String(competition.league.id),
      provider: this.name,
      name: competition.league.name ?? `Competition ${competition.league.id}`,
      type: competition.league.type,
      logoUrl: competition.league.logo,
      country: competition.country?.name,
      source: { provider: this.name, providerId: String(competition.league.id), raw: competition },
    }, request.response.data);
  }

  async getFixtureById(id: string): Promise<FootballDataResult<TouchlineFixture | null>> {
    const request = await this.request<unknown[]>("/fixtures", { id });
    if (!request.configured) return this.notConfigured<TouchlineFixture | null>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football fixture lookup failed.", request.response.status);
    return resultOk(this.name, this.mapFixture(request.response.data?.response?.[0]) ?? null, request.response.data);
  }

  async getFixturesByDate(params: FixturesByDateParams): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.request<unknown[]>("/fixtures", { date: params.date, timezone: params.timezone });
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football fixtures by date failed.", request.response.status);
    return resultOk(this.name, (request.response.data?.response ?? []).map((fixture) => this.mapFixture(fixture)).filter(Boolean) as TouchlineFixture[], request.response.data);
  }

  async getLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.request<unknown[]>("/fixtures", { live: "all" });
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football live scores failed.", request.response.status);
    return resultOk(this.name, (request.response.data?.response ?? []).map((fixture) => this.mapFixture(fixture)).filter(Boolean) as TouchlineFixture[], request.response.data);
  }

  async getStandings(params: StandingsParams): Promise<FootballDataResult<TouchlineStandingRow[]>> {
    if (!params.competitionId || !params.seasonId) {
      return resultError(this.name, "invalid_request", "Legacy standings require competitionId and seasonId.");
    }
    const request = await this.request<unknown[]>("/standings", { league: params.competitionId, season: params.seasonId });
    if (!request.configured) return this.notConfigured<TouchlineStandingRow[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football standings failed.", request.response.status);
    return resultOk(this.name, this.mapStandings(request.response.data?.response), request.response.data);
  }

  async getTransfers(params: TransfersParams): Promise<FootballDataResult<TouchlineTransfer[]>> {
    const request = await this.request<unknown[]>("/transfers", { player: params.playerId, team: params.teamId });
    if (!request.configured) return this.notConfigured<TouchlineTransfer[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football transfers failed.", request.response.status);
    return resultOk(this.name, [], request.response.data);
  }

  async getSeasons(competitionId?: string): Promise<FootballDataResult<TouchlineSeason[]>> {
    const request = await this.request<Array<{ year?: number; start?: string; end?: string; current?: boolean }>>("/leagues/seasons", competitionId ? { league: competitionId } : {});
    if (!request.configured) return this.notConfigured<TouchlineSeason[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football seasons failed.", request.response.status);
    const seasons = (request.response.data?.response ?? []).map((season) => ({
      id: providerId(this.name, season.year),
      providerId: String(season.year ?? ""),
      provider: this.name,
      name: String(season.year ?? "Season"),
      competitionId,
      startsAt: season.start,
      endsAt: season.end,
      isCurrent: season.current,
      source: { provider: this.name, providerId: String(season.year ?? ""), raw: season },
    }));
    return resultOk(this.name, seasons, request.response.data);
  }

  async getCompetitions(): Promise<FootballDataResult<TouchlineCompetition[]>> {
    const request = await this.request<Array<{ league?: { id?: number; name?: string; type?: string; logo?: string }; country?: { name?: string } }>>("/leagues");
    if (!request.configured) return this.notConfigured<TouchlineCompetition[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football competitions failed.", request.response.status);
    const competitions = (request.response.data?.response ?? []).map((item) => ({
      id: providerId(this.name, item.league?.id),
      providerId: String(item.league?.id ?? ""),
      provider: this.name,
      name: item.league?.name ?? "Competition",
      type: item.league?.type,
      logoUrl: item.league?.logo,
      country: item.country?.name,
      source: { provider: this.name, providerId: String(item.league?.id ?? ""), raw: item },
    }));
    return resultOk(this.name, competitions, request.response.data);
  }

  async getSquad(teamId: string): Promise<FootballDataResult<TouchlineSquadMember[]>> {
    const request = await this.request<Array<{ players?: unknown[] }>>("/players/squads", { team: teamId });
    if (!request.configured) return this.notConfigured<TouchlineSquadMember[]>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football squad failed.", request.response.status);
    return resultOk(this.name, [], request.response.data);
  }

  async getPlayerStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    if (!params.playerId) return resultError(this.name, "invalid_request", "playerId is required for player stats.");
    const request = await this.request<unknown[]>("/players", { id: params.playerId, season: params.seasonId ?? this.season() });
    if (!request.configured) return this.notConfigured<Record<string, unknown>>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football player stats failed.", request.response.status);
    return resultOk(this.name, { response: request.response.data?.response ?? [] }, request.response.data);
  }

  async getTeamStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    if (!params.teamId || !params.seasonId) return resultError(this.name, "invalid_request", "teamId and seasonId are required for team stats.");
    const request = await this.request<unknown[]>("/teams/statistics", { team: params.teamId, season: params.seasonId });
    if (!request.configured) return this.notConfigured<Record<string, unknown>>();
    if (!request.response.ok) return resultError(this.name, "provider_error", request.response.error ?? "API-Football team stats failed.", request.response.status);
    return resultOk(this.name, { response: request.response.data?.response ?? [] }, request.response.data);
  }

  async getRateLimitStatus(): Promise<FootballDataResult<FootballRateLimitStatus>> {
    const apiKey = this.apiKey();
    if (!apiKey) return this.notConfigured<FootballRateLimitStatus>();
    const request = await this.request<Record<string, unknown>>("/status");
    if (!request.configured) return this.notConfigured<FootballRateLimitStatus>();
    return resultOk(this.name, {
      configured: true,
      limit: asNumber(request.response.headers.get("x-ratelimit-requests-limit")),
      remaining: asNumber(request.response.headers.get("x-ratelimit-requests-remaining")),
      providerMessage: request.response.ok ? "API-Football key is configured." : request.response.error,
    }, request.response.data);
  }

  private mapPlayer(item?: ApiFootballPlayerItem): TouchlinePlayer | null {
    const player = item?.player;
    if (!player?.id) return null;
    const primaryStats = item?.statistics?.[0];
    const name = (player.name ?? [player.firstname, player.lastname].filter(Boolean).join(" ")) || `Player ${player.id}`;

    return {
      id: providerId(this.name, player.id),
      providerId: String(player.id),
      provider: this.name,
      name,
      displayName: name,
      firstName: player.firstname,
      lastName: player.lastname,
      photoUrl: player.photo,
      dateOfBirth: player.birth?.date,
      age: player.age,
      nationality: player.nationality ?? player.birth?.country,
      position: primaryStats?.games?.position,
      height: player.height,
      weight: player.weight,
      currentTeamId: asString(primaryStats?.team?.id),
      currentTeamName: primaryStats?.team?.name,
      source: { provider: this.name, providerId: String(player.id), raw: item },
    };
  }

  private mapTeam(item?: ApiFootballTeamItem): TouchlineTeam | null {
    const team = item?.team;
    if (!team?.id) return null;
    return {
      id: providerId(this.name, team.id),
      providerId: String(team.id),
      provider: this.name,
      name: team.name ?? `Team ${team.id}`,
      shortCode: team.code,
      logoUrl: team.logo,
      country: team.country,
      founded: team.founded,
      venueId: asString(item?.venue?.id),
      source: { provider: this.name, providerId: String(team.id), raw: item },
    };
  }

  private mapFixture(raw: unknown): TouchlineFixture | null {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as {
      fixture?: { id?: number; date?: string; status?: { long?: string; short?: string } };
      league?: { id?: number; season?: number };
      teams?: { home?: { id?: number; name?: string; logo?: string }; away?: { id?: number; name?: string; logo?: string } };
      goals?: { home?: number; away?: number };
    };
    const id = item.fixture?.id;
    if (!id) return null;
    return {
      id: providerId(this.name, id),
      providerId: String(id),
      provider: this.name,
      startsAt: item.fixture?.date,
      status: item.fixture?.status?.long ?? item.fixture?.status?.short,
      competitionId: asString(item.league?.id),
      seasonId: asString(item.league?.season),
      homeTeam: item.teams?.home?.id ? this.mapTeam({ team: { ...item.teams.home } }) ?? undefined : undefined,
      awayTeam: item.teams?.away?.id ? this.mapTeam({ team: { ...item.teams.away } }) ?? undefined : undefined,
      homeScore: item.goals?.home,
      awayScore: item.goals?.away,
      source: { provider: this.name, providerId: String(id), raw },
    };
  }

  private mapStandings(raw: unknown): TouchlineStandingRow[] {
    const leagues = Array.isArray(raw) ? raw : [];
    const first = leagues[0] as { league?: { standings?: unknown[][] } } | undefined;
    const rows = first?.league?.standings?.[0] ?? [];
    return rows.map((row) => {
      const item = row as { rank?: number; team?: { id?: number; name?: string }; all?: { played?: number; win?: number; draw?: number; lose?: number }; points?: number };
      return {
        position: item.rank,
        teamId: asString(item.team?.id),
        teamName: item.team?.name,
        played: item.all?.played,
        won: item.all?.win,
        drawn: item.all?.draw,
        lost: item.all?.lose,
        points: item.points,
        raw: row,
      };
    });
  }
}
