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

type SportmonksEnvelope<T> = {
  data?: T;
  message?: string;
  rate_limit?: {
    resets_in_seconds?: number;
    remaining?: number;
    requested_entity?: string;
  };
};

type SportmonksEntity = Record<string, unknown>;

export class SportmonksFootballProvider implements FootballDataProvider {
  readonly name = "sportmonks" as const;

  private token() {
    return process.env.SPORTMONKS_API_TOKEN;
  }

  private baseUrl() {
    return process.env.SPORTMONKS_BASE_URL ?? "https://api.sportmonks.com/v3/football";
  }

  private notConfigured<T>(): FootballDataResult<T> {
    return resultError(
      this.name,
      "not_configured",
      "Sportmonks is not configured. Add SPORTMONKS_API_TOKEN on the server to enable Sportmonks.",
    );
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    bucket: "static" | "daily" | "live" | "historical" = "daily",
  ) {
    const token = this.token();
    if (!token) return { configured: false as const };

    const cachedResponse = await withFootballDataCache(bucket, ["sportmonks", path, JSON.stringify(params)], async () => {
      const url = new URL(path.replace(/^\//, ""), `${this.baseUrl().replace(/\/$/, "")}/`);
      url.searchParams.set("api_token", token);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
      });

      const response = await footballDataFetchJson<SportmonksEnvelope<T>>(url, {
        provider: this.name,
        timeoutMs: bucket === "live" ? 8_000 : 15_000,
      });

      return response;
    });

    return { configured: true as const, ...cachedResponse };
  }

  async searchPlayers(params: SearchPlayersParams): Promise<FootballDataResult<TouchlinePlayer[]>> {
    if (!params.query.trim()) return resultOk(this.name, []);
    const request = await this.request<SportmonksEntity[]>(`/players/search/${encodeURIComponent(params.query)}`, {
      include: "country;nationality;position;teams",
      per_page: params.limit ?? 20,
    });
    if (!request.configured) return this.notConfigured<TouchlinePlayer[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks player search failed.", value.status);
    const players = (value.data?.data ?? []).map((item) => this.mapPlayer(item)).filter((player): player is TouchlinePlayer => Boolean(player));
    return resultOk(this.name, players, value.data, cached);
  }

  async getPlayerById(id: string): Promise<FootballDataResult<TouchlinePlayer | null>> {
    const request = await this.request<SportmonksEntity>(`/players/${id}`, {
      include: "country;nationality;position;teams;metadata",
    });
    if (!request.configured) return this.notConfigured<TouchlinePlayer | null>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks player lookup failed.", value.status);
    return resultOk(this.name, this.mapPlayer(value.data?.data) ?? null, value.data, cached);
  }

  async getTeamById(id: string): Promise<FootballDataResult<TouchlineTeam | null>> {
    const request = await this.request<SportmonksEntity>(`/teams/${id}`, {
      include: "country;venue",
    }, "static");
    if (!request.configured) return this.notConfigured<TouchlineTeam | null>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks team lookup failed.", value.status);
    return resultOk(this.name, this.mapTeam(value.data?.data) ?? null, value.data, cached);
  }

  async getCoachById(id: string): Promise<FootballDataResult<TouchlineCoach | null>> {
    const request = await this.request<SportmonksEntity>(`/coaches/${id}`, {
      include: "country;teams",
    }, "static");
    if (!request.configured) return this.notConfigured<TouchlineCoach | null>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks coach lookup failed.", value.status);
    return resultOk(this.name, this.mapCoach(value.data?.data) ?? null, value.data, cached);
  }

  async getCompetitionById(id: string): Promise<FootballDataResult<TouchlineCompetition | null>> {
    const request = await this.request<SportmonksEntity>(`/leagues/${id}`, {
      include: "country;currentSeason",
    }, "static");
    if (!request.configured) return this.notConfigured<TouchlineCompetition | null>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks competition lookup failed.", value.status);
    return resultOk(this.name, value.data?.data ? this.mapCompetition(value.data.data) : null, value.data, cached);
  }

  async getFixtureById(id: string): Promise<FootballDataResult<TouchlineFixture | null>> {
    const request = await this.request<SportmonksEntity>(`/fixtures/${id}`, {
      include: "participants;scores;league;season;state",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFixture | null>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks fixture lookup failed.", value.status);
    return resultOk(this.name, this.mapFixture(value.data?.data) ?? null, value.data, cached);
  }

  async getFixturesByDate(params: FixturesByDateParams): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.request<SportmonksEntity[]>(`/fixtures/date/${params.date}`, {
      include: "participants;scores;league;season;state",
      timezone: params.timezone,
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks fixtures by date failed.", value.status);
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapFixture(item)).filter(Boolean) as TouchlineFixture[], value.data, cached);
  }

  async getLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.request<SportmonksEntity[]>("/livescores/latest", {
      include: "participants;scores;league;season;state",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks livescores failed.", value.status);
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapFixture(item)).filter(Boolean) as TouchlineFixture[], value.data, cached);
  }

  async getStandings(params: StandingsParams): Promise<FootballDataResult<TouchlineStandingRow[]>> {
    if (!params.seasonId) return resultError(this.name, "invalid_request", "Sportmonks standings require seasonId.");
    const request = await this.request<SportmonksEntity[]>(`/standings/seasons/${params.seasonId}`, {
      include: "participant",
    }, "daily");
    if (!request.configured) return this.notConfigured<TouchlineStandingRow[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks standings failed.", value.status);
    return resultOk(this.name, (value.data?.data ?? []).map((row) => this.mapStanding(row)), value.data, cached);
  }

  async getTransfers(params: TransfersParams): Promise<FootballDataResult<TouchlineTransfer[]>> {
    if (!params.playerId && !params.teamId) {
      return resultError(this.name, "invalid_request", "Sportmonks transfers require playerId or teamId.");
    }
    return resultError(this.name, "unsupported", "Sportmonks transfer mapping is reserved for the next migration module.");
  }

  async getSeasons(competitionId?: string): Promise<FootballDataResult<TouchlineSeason[]>> {
    const request = await this.request<SportmonksEntity[]>(competitionId ? `/seasons/leagues/${competitionId}` : "/seasons", {}, "static");
    if (!request.configured) return this.notConfigured<TouchlineSeason[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks seasons failed.", value.status);
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapSeason(item)), value.data, cached);
  }

  async getCompetitions(): Promise<FootballDataResult<TouchlineCompetition[]>> {
    const request = await this.request<SportmonksEntity[]>("/leagues", {
      include: "country",
    }, "static");
    if (!request.configured) return this.notConfigured<TouchlineCompetition[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks competitions failed.", value.status);
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapCompetition(item)), value.data, cached);
  }

  async getSquad(teamId: string): Promise<FootballDataResult<TouchlineSquadMember[]>> {
    const request = await this.request<SportmonksEntity[]>(`/squads/teams/${teamId}`, {
      include: "player;position",
    }, "daily");
    if (!request.configured) return this.notConfigured<TouchlineSquadMember[]>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks squad failed.", value.status);
    const members: TouchlineSquadMember[] = (value.data?.data ?? []).flatMap((item) => {
      const playerRaw = item.player as SportmonksEntity | undefined;
      const player = this.mapPlayer(playerRaw);
      if (!player) return [];
      return [{
        player,
        jerseyNumber: asNumber(item.jersey_number),
        position: asString((item.position as SportmonksEntity | undefined)?.name),
        raw: item,
      }];
    });
    return resultOk(this.name, members, value.data, cached);
  }

  async getPlayerStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    if (!params.playerId) return resultError(this.name, "invalid_request", "playerId is required for Sportmonks player stats.");
    return resultError(this.name, "unsupported", "Sportmonks player stats mapping is reserved for the statistics migration module.");
  }

  async getTeamStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    if (!params.teamId) return resultError(this.name, "invalid_request", "teamId is required for Sportmonks team stats.");
    return resultError(this.name, "unsupported", "Sportmonks team stats mapping is reserved for the statistics migration module.");
  }

  async getRateLimitStatus(): Promise<FootballDataResult<FootballRateLimitStatus>> {
    if (!this.token()) return this.notConfigured<FootballRateLimitStatus>();
    const request = await this.request<SportmonksEntity[]>("/leagues", { per_page: 1 }, "live");
    if (!request.configured) return this.notConfigured<FootballRateLimitStatus>();
    const { value, cached } = request;
    if (!value.ok) return resultError(this.name, "provider_error", value.error ?? "Sportmonks rate limit validation failed.", value.status);
    return resultOk(this.name, {
      configured: true,
      limit: asNumber(value.headers.get("x-ratelimit-limit")),
      remaining: asNumber(value.headers.get("x-ratelimit-remaining")),
      providerMessage: value.data?.message ?? "Sportmonks token accepted.",
    }, value.data, cached);
  }

  private mapPlayer(raw?: SportmonksEntity): TouchlinePlayer | null {
    if (!raw?.id) return null;
    const id = String(raw.id);
    const name = (asString(raw.display_name) ?? asString(raw.name) ?? [asString(raw.firstname), asString(raw.lastname)].filter(Boolean).join(" ")) || `Player ${id}`;
    const country = raw.nationality as SportmonksEntity | undefined;
    const fallbackCountry = raw.country as SportmonksEntity | undefined;
    const position = raw.position as SportmonksEntity | undefined;
    const teams = Array.isArray(raw.teams) ? raw.teams as SportmonksEntity[] : [];
    const currentTeam = teams[0];

    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name,
      displayName: name,
      firstName: asString(raw.firstname),
      lastName: asString(raw.lastname),
      photoUrl: asString(raw.image_path),
      dateOfBirth: asString(raw.date_of_birth),
      age: asNumber(raw.age),
      nationality: asString(country?.name) ?? asString(fallbackCountry?.name),
      countryId: asString(raw.country_id) ?? asString(raw.nationality_id),
      position: asString(position?.name),
      positionId: asString(raw.position_id),
      height: asString(raw.height),
      weight: asString(raw.weight),
      currentTeamId: asString(currentTeam?.id),
      currentTeamName: asString(currentTeam?.name),
      source: { provider: this.name, providerId: id, raw },
    };
  }

  private mapTeam(raw?: SportmonksEntity): TouchlineTeam | null {
    if (!raw?.id) return null;
    const id = String(raw.id);
    const country = raw.country as SportmonksEntity | undefined;
    const venue = raw.venue as SportmonksEntity | undefined;
    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name: asString(raw.name) ?? `Team ${id}`,
      shortCode: asString(raw.short_code),
      logoUrl: asString(raw.image_path),
      country: asString(country?.name),
      countryId: asString(raw.country_id),
      founded: asNumber(raw.founded),
      venueId: asString(raw.venue_id) ?? asString(venue?.id),
      source: { provider: this.name, providerId: id, raw },
    };
  }

  private mapCoach(raw?: SportmonksEntity): TouchlineCoach | null {
    if (!raw?.id) return null;
    const id = String(raw.id);
    const name = (asString(raw.display_name) ?? asString(raw.name) ?? [asString(raw.firstname), asString(raw.lastname)].filter(Boolean).join(" ")) || `Coach ${id}`;
    const country = raw.country as SportmonksEntity | undefined;
    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name,
      displayName: name,
      photoUrl: asString(raw.image_path),
      dateOfBirth: asString(raw.date_of_birth),
      nationality: asString(country?.name),
      countryId: asString(raw.country_id),
      source: { provider: this.name, providerId: id, raw },
    };
  }

  private mapCompetition(raw: SportmonksEntity): TouchlineCompetition {
    const id = String(raw.id ?? "unknown");
    const country = raw.country as SportmonksEntity | undefined;
    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name: asString(raw.name) ?? `Competition ${id}`,
      type: asString(raw.type) ?? asString(raw.sub_type),
      logoUrl: asString(raw.image_path),
      country: asString(country?.name),
      countryId: asString(raw.country_id),
      source: { provider: this.name, providerId: id, raw },
    };
  }

  private mapSeason(raw: SportmonksEntity): TouchlineSeason {
    const id = String(raw.id ?? "unknown");
    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name: asString(raw.name) ?? `Season ${id}`,
      competitionId: asString(raw.league_id),
      startsAt: asString(raw.starting_at),
      endsAt: asString(raw.ending_at),
      isCurrent: Boolean(raw.is_current),
      source: { provider: this.name, providerId: id, raw },
    };
  }

  private mapFixture(raw?: SportmonksEntity): TouchlineFixture | null {
    if (!raw?.id) return null;
    const id = String(raw.id);
    const participants = Array.isArray(raw.participants) ? raw.participants as SportmonksEntity[] : [];
    const home = participants.find((team) => asString(team.meta && (team.meta as SportmonksEntity).location) === "home") ?? participants[0];
    const away = participants.find((team) => asString(team.meta && (team.meta as SportmonksEntity).location) === "away") ?? participants[1];
    const scores = Array.isArray(raw.scores) ? raw.scores as SportmonksEntity[] : [];
    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name: asString(raw.name),
      startsAt: asString(raw.starting_at),
      status: asString((raw.state as SportmonksEntity | undefined)?.name) ?? asString(raw.state_id),
      competitionId: asString(raw.league_id),
      seasonId: asString(raw.season_id),
      homeTeam: this.mapTeam(home) ?? undefined,
      awayTeam: this.mapTeam(away) ?? undefined,
      homeScore: this.extractScore(scores, "home"),
      awayScore: this.extractScore(scores, "away"),
      source: { provider: this.name, providerId: id, raw },
    };
  }

  private mapStanding(raw: SportmonksEntity): TouchlineStandingRow {
    const participant = raw.participant as SportmonksEntity | undefined;
    return {
      position: asNumber(raw.position),
      teamId: asString(raw.participant_id) ?? asString(participant?.id),
      teamName: asString(participant?.name),
      played: asNumber(raw.played),
      won: asNumber(raw.won),
      drawn: asNumber(raw.drawn),
      lost: asNumber(raw.lost),
      points: asNumber(raw.points),
      raw,
    };
  }

  private extractScore(scores: SportmonksEntity[], location: "home" | "away") {
    const score = scores.find((item) => asString((item.score as SportmonksEntity | undefined)?.participant) === location);
    return asNumber((score?.score as SportmonksEntity | undefined)?.goals);
  }
}
