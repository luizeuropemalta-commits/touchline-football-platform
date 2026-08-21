import { withFootballDataCache } from "@/lib/football-data/cache";
import { estimateFantasyEventPoints } from "@/lib/football-data/fantasy-scoring";
import {
  asNumber,
  asString,
  footballDataFetchJson,
  footballDataHttpResponseCanBeCached,
  footballDataTimeoutMs,
  providerId,
  resultError,
  resultOk,
  type FootballDataHttpResponse,
  type FootballDataTimeoutProfile,
} from "@/lib/football-data/http";
import { parseSportmonksStatisticValue } from "@/lib/football-data/sportmonks-statistics";
import { mapSportmonksFixtureBallCoordinates } from "@/lib/football-data/sportmonks-ball-coordinates";
import {
  SPORTMONKS_INPLAY_LIVESCORES_PATH,
  SPORTMONKS_LATEST_LIVESCORES_PATH,
  classifySportmonksLineupRole,
  selectSportmonksParticipantScore,
} from "@/lib/football-data/sportmonks-live";
import {
  mapSportmonksTransfer,
  sortSportmonksTransfersNewestFirst,
} from "@/lib/football-data/sportmonks-transfers";
import type {
  FixturesBetweenParams,
  FixturesByDateParams,
  FootballDataCacheBucket,
  FootballDataProvider,
  FootballDataResult,
  FootballRateLimitStatus,
  SearchPlayersParams,
  StandingsParams,
  StatsParams,
  TouchlineBallCoordinate,
  TouchlineCoach,
  TouchlineCompetition,
  TouchlineFantasyEvent,
  TouchlineFantasyFixtureFeed,
  TouchlineFantasyFormation,
  TouchlineFantasyLineupMember,
  TouchlineFantasySidelinedPlayer,
  TouchlineFixture,
  TouchlinePlayer,
  TouchlineProviderCapabilities,
  TouchlineProviderCapability,
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
  pagination?: {
    count?: number;
    per_page?: number;
    current_page?: number;
    next_page?: string | null;
    has_more?: boolean;
  };
  rate_limit?: {
    resets_in_seconds?: number;
    remaining?: number;
    requested_entity?: string;
  };
};

type SportmonksEntity = Record<string, unknown>;
type SportmonksRequestResult<T> =
  | { configured: false }
  | {
      configured: true;
      value: FootballDataHttpResponse<SportmonksEnvelope<T>>;
      cached: boolean;
    };

type SportmonksPaginationOptions = {
  bucket: FootballDataCacheBucket;
  timeoutProfile?: FootballDataTimeoutProfile;
  perPage: number;
  maxPages: number;
  maxItems: number;
};

const SPORTMONKS_MAX_PAGE_SIZE = 50;
const SPORTMONKS_ABSOLUTE_MAX_PAGES = 10;
const SPORTMONKS_ABSOLUTE_MAX_ITEMS = 500;

function relationItems(value: unknown): SportmonksEntity[] {
  if (Array.isArray(value)) return value.filter((item): item is SportmonksEntity => Boolean(item) && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as SportmonksEntity;
  return Array.isArray(record.data)
    ? record.data.filter((item): item is SportmonksEntity => Boolean(item) && typeof item === "object")
    : [];
}

function playerMetadataValue(raw: SportmonksEntity, pattern: RegExp) {
  const match = relationItems(raw.metadata).find((item) => {
    const name = asString(item.name) ?? asString(item.key) ?? asString((item.type as SportmonksEntity | undefined)?.name) ?? "";
    return pattern.test(name.toLowerCase());
  });
  if (!match) return undefined;
  const values = match.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    return asString((values as SportmonksEntity).value) ?? asString((values as SportmonksEntity).name);
  }
  return asString(values) ?? asString(match.value);
}

function earliestFetchedAt(first: string, second?: string) {
  return second && second < first ? second : first;
}

/**
 * Sportmonks supplies `starting_at` without an offset and, when available,
 * `starting_at_timestamp` in UTC seconds. Prefer the latter so a server or
 * browser timezone can never move a fixture into the wrong TouchLine round.
 */
function sportmonksFixtureStartAt(raw: SportmonksEntity) {
  const seconds = asNumber(raw.starting_at_timestamp);
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1_000).toISOString();
  }
  return asString(raw.starting_at);
}

export class SportmonksFootballProvider implements FootballDataProvider {
  readonly name = "sportmonks" as const;

  private token() {
    return process.env.SPORTMONKS_API_TOKEN;
  }

  private baseUrl() {
    return process.env.SPORTMONKS_BASE_URL ?? "https://api.sportmonks.com/v3/football";
  }

  private rootBaseUrl() {
    return process.env.SPORTMONKS_ROOT_BASE_URL ?? this.baseUrl().replace(/\/football\/?$/, "");
  }

  private notConfigured<T>(): FootballDataResult<T> {
    return resultError(
      this.name,
      "not_configured",
      "Sportmonks is not configured. Add SPORTMONKS_API_TOKEN on the server to enable Sportmonks.",
    );
  }

  private providerFailure<T>(
    response: FootballDataHttpResponse<SportmonksEnvelope<unknown>>,
    fallbackMessage: string,
  ): FootballDataResult<T> {
    const status = response.status || undefined;
    const rateLimit = response.data?.rate_limit;
    const providerMessage = asString(response.data?.message);

    let code: "provider_error" | "not_found" | "invalid_request" | "rate_limited" = "provider_error";
    if (status === 404) code = "not_found";
    else if (status === 400 || status === 422) code = "invalid_request";
    else if (status === 429) code = "rate_limited";

    let message = providerMessage ?? response.error ?? fallbackMessage;
    if (status === 401) {
      message = "Sportmonks authentication failed. Verify the server API token.";
    } else if (status === 403) {
      message = "Sportmonks denied this resource. Verify the subscribed league and feature entitlement.";
    } else if (status === 429) {
      message = "Sportmonks request limit reached. TouchLine will keep the last verified snapshot and retry after reset.";
    } else if (response.status === 0 && /timed out/i.test(response.error ?? "")) {
      message = "Sportmonks timed out. TouchLine will keep the last verified snapshot instead of caching this failure.";
    }

    return resultError(this.name, code, message, status, {
      retryAfterSeconds: asNumber(rateLimit?.resets_in_seconds),
      remaining: asNumber(rateLimit?.remaining),
      requestedEntity: asString(rateLimit?.requested_entity),
    });
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    bucket: "static" | "daily" | "live" | "historical" = "daily",
    timeoutProfile: FootballDataTimeoutProfile = bucket === "live" ? "live" : "background",
  ): Promise<SportmonksRequestResult<T>> {
    const token = this.token();
    if (!token) return { configured: false as const };

    const cachedResponse = await withFootballDataCache(
      bucket,
      ["sportmonks", path, JSON.stringify(params)],
      async () => {
        const baseUrl = path.startsWith("/my/") ? this.rootBaseUrl() : this.baseUrl();
        const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
        url.searchParams.set("api_token", token);
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
        });

        return footballDataFetchJson<SportmonksEnvelope<T>>(url, {
          provider: this.name,
          timeoutMs: footballDataTimeoutMs(timeoutProfile),
        });
      },
      undefined,
      footballDataHttpResponseCanBeCached,
    );

    return { configured: true as const, ...cachedResponse };
  }

  private async paginatedRequest<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    options: SportmonksPaginationOptions,
  ): Promise<SportmonksRequestResult<T[]>> {
    const maxPages = Math.min(
      SPORTMONKS_ABSOLUTE_MAX_PAGES,
      Math.max(1, Math.trunc(options.maxPages)),
    );
    const maxItems = Math.min(
      SPORTMONKS_ABSOLUTE_MAX_ITEMS,
      Math.max(1, Math.trunc(options.maxItems)),
    );
    const perPage = Math.min(
      SPORTMONKS_MAX_PAGE_SIZE,
      maxItems,
      Math.max(1, Math.trunc(options.perPage)),
    );
    const items: T[] = [];
    const reportedPages = new Set<number>();
    let page = 1;
    let allCached = true;
    let fetchedAt: string | undefined;
    let finalRequest: Extract<SportmonksRequestResult<T[]>, { configured: true }> | undefined;

    while (page <= maxPages && items.length < maxItems) {
      const request = await this.request<T[]>(
        path,
        { ...params, per_page: perPage, page },
        options.bucket,
        options.timeoutProfile ?? (options.bucket === "live" ? "live" : "background"),
      );
      if (!request.configured || !request.value.ok) return request;

      finalRequest = request;
      allCached = allCached && request.cached;
      fetchedAt = fetchedAt
        ? earliestFetchedAt(fetchedAt, request.value.fetchedAt)
        : request.value.fetchedAt;

      const pagination = request.value.data?.pagination;
      const reportedPage = asNumber(pagination?.current_page);
      if (reportedPage !== undefined && reportedPages.has(reportedPage)) break;
      if (reportedPage !== undefined) reportedPages.add(reportedPage);

      const pageItems = request.value.data?.data ?? [];
      const remaining = maxItems - items.length;
      items.push(...pageItems.slice(0, remaining));

      if (pagination?.has_more !== true || pageItems.length === 0 || items.length >= maxItems) break;
      page += 1;
    }

    const completedRequest = finalRequest!;
    return {
      configured: true,
      cached: allCached,
      value: {
        ...completedRequest.value,
        data: {
          ...(completedRequest.value.data ?? {}),
          data: items,
        },
        fetchedAt: fetchedAt ?? completedRequest.value.fetchedAt,
      },
    };
  }

  async searchPlayers(params: SearchPlayersParams): Promise<FootballDataResult<TouchlinePlayer[]>> {
    if (!params.query.trim()) return resultOk(this.name, []);
    const requestedLimit = Number.isFinite(params.limit)
      ? Math.min(100, Math.max(1, Math.trunc(params.limit!)))
      : 20;
    const request = await this.paginatedRequest<SportmonksEntity>(`/players/search/${encodeURIComponent(params.query)}`, {
      include: "country;nationality;position;teams",
    }, {
      bucket: "daily",
      perPage: Math.min(SPORTMONKS_MAX_PAGE_SIZE, requestedLimit),
      maxPages: 2,
      maxItems: requestedLimit,
    });
    if (!request.configured) return this.notConfigured<TouchlinePlayer[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlinePlayer[]>(value, "Sportmonks player search failed.");
    const players = (value.data?.data ?? []).map((item) => this.mapPlayer(item)).filter((player): player is TouchlinePlayer => Boolean(player));
    return resultOk(this.name, players, value.data, cached, value.fetchedAt);
  }

  async getPlayerById(id: string): Promise<FootballDataResult<TouchlinePlayer | null>> {
    const request = await this.request<SportmonksEntity>(`/players/${id}`, {
      include: "country;nationality;position;detailedPosition;teams;metadata",
    });
    if (!request.configured) return this.notConfigured<TouchlinePlayer | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlinePlayer | null>(value, "Sportmonks player lookup failed.");
    return resultOk(this.name, this.mapPlayer(value.data?.data) ?? null, value.data, cached, value.fetchedAt);
  }

  async getTeamById(id: string): Promise<FootballDataResult<TouchlineTeam | null>> {
    const request = await this.request<SportmonksEntity>(`/teams/${id}`, {
      include: "country;venue",
    }, "static");
    if (!request.configured) return this.notConfigured<TouchlineTeam | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineTeam | null>(value, "Sportmonks team lookup failed.");
    return resultOk(this.name, this.mapTeam(value.data?.data) ?? null, value.data, cached, value.fetchedAt);
  }

  async getCoachById(id: string): Promise<FootballDataResult<TouchlineCoach | null>> {
    const request = await this.request<SportmonksEntity>(`/coaches/${id}`, {
      include: "country;teams",
    }, "static");
    if (!request.configured) return this.notConfigured<TouchlineCoach | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineCoach | null>(value, "Sportmonks coach lookup failed.");
    return resultOk(this.name, this.mapCoach(value.data?.data) ?? null, value.data, cached, value.fetchedAt);
  }

  async getCompetitionById(id: string): Promise<FootballDataResult<TouchlineCompetition | null>> {
    // This endpoint is available to the active Sportmonks subscription without
    // optional relationship includes. The canonical store already owns the
    // enriched competition fields when they are available elsewhere.
    const request = await this.request<SportmonksEntity>(`/leagues/${id}`, {}, "static");
    if (!request.configured) return this.notConfigured<TouchlineCompetition | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineCompetition | null>(value, "Sportmonks competition lookup failed.");
    return resultOk(this.name, value.data?.data ? this.mapCompetition(value.data.data) : null, value.data, cached, value.fetchedAt);
  }

  async getSeasonById(id: string): Promise<FootballDataResult<TouchlineSeason | null>> {
    const request = await this.request<SportmonksEntity>(`/seasons/${id}`, {}, "static");
    if (!request.configured) return this.notConfigured<TouchlineSeason | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineSeason | null>(value, "Sportmonks season lookup failed.");
    return resultOk(this.name, value.data?.data ? this.mapSeason(value.data.data) : null, value.data, cached, value.fetchedAt);
  }

  async getFixtureById(id: string): Promise<FootballDataResult<TouchlineFixture | null>> {
    const request = await this.request<SportmonksEntity>(`/fixtures/${id}`, {
      include: "participants;scores;league;season;round;state",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFixture | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFixture | null>(value, "Sportmonks fixture lookup failed.");
    return resultOk(this.name, this.mapFixture(value.data?.data) ?? null, value.data, cached, value.fetchedAt);
  }

  async getFixturesByDate(params: FixturesByDateParams): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.paginatedRequest<SportmonksEntity>(`/fixtures/date/${params.date}`, {
      include: "participants;scores;league;season;round;state",
      timezone: params.timezone,
    }, {
      bucket: "live",
      perPage: 50,
      maxPages: 2,
      maxItems: 100,
    });
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFixture[]>(value, "Sportmonks fixtures by date failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapFixture(item)).filter(Boolean) as TouchlineFixture[], value.data, cached, value.fetchedAt);
  }

  async getFixturesBetween(params: FixturesBetweenParams): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.paginatedRequest<SportmonksEntity>(
      `/fixtures/between/${encodeURIComponent(params.fromDate)}/${encodeURIComponent(params.throughDate)}`,
      {
        // Sportmonks applies this scope before pagination. Do not replace it
        // with a client-side competition filter: that would make a fixture
        // disappear whenever a busy day exceeds a global page cap.
        filters: `fixtureLeagues:${params.competitionId}`,
        include: "participants;scores;league;season;round;state",
        timezone: params.timezone,
      },
      {
        bucket: "live",
        perPage: SPORTMONKS_MAX_PAGE_SIZE,
        maxPages: SPORTMONKS_ABSOLUTE_MAX_PAGES,
        maxItems: SPORTMONKS_ABSOLUTE_MAX_ITEMS,
      },
    );
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFixture[]>(value, "Sportmonks fixture window lookup failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapFixture(item)).filter(Boolean) as TouchlineFixture[], value.data, cached, value.fetchedAt);
  }

  async getLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.request<SportmonksEntity[]>(SPORTMONKS_INPLAY_LIVESCORES_PATH, {
      include: "participants;scores;league;season;round;state",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFixture[]>(value, "Sportmonks livescores failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapFixture(item)).filter(Boolean) as TouchlineFixture[], value.data, cached, value.fetchedAt);
  }

  async getLatestLiveScores(): Promise<FootballDataResult<TouchlineFixture[]>> {
    const request = await this.request<SportmonksEntity[]>(SPORTMONKS_LATEST_LIVESCORES_PATH, {
      include: "participants;scores;league;season;round;state",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFixture[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFixture[]>(value, "Sportmonks latest livescores failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapFixture(item)).filter(Boolean) as TouchlineFixture[], value.data, cached, value.fetchedAt);
  }

  async getStandings(params: StandingsParams): Promise<FootballDataResult<TouchlineStandingRow[]>> {
    if (!params.seasonId) return resultError(this.name, "invalid_request", "Sportmonks standings require seasonId.");
    const request = await this.request<SportmonksEntity[]>(`/standings/seasons/${params.seasonId}`, {
      include: "participant",
    }, "daily");
    if (!request.configured) return this.notConfigured<TouchlineStandingRow[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineStandingRow[]>(value, "Sportmonks standings failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((row) => this.mapStanding(row)), value.data, cached, value.fetchedAt);
  }

  async getTransfers(params: TransfersParams): Promise<FootballDataResult<TouchlineTransfer[]>> {
    if (!params.playerId && !params.teamId) {
      return resultError(this.name, "invalid_request", "Sportmonks transfers require playerId or teamId.");
    }
    const path = params.playerId
      ? `/transfers/players/${encodeURIComponent(params.playerId)}`
      : `/transfers/teams/${encodeURIComponent(params.teamId!)}`;
    const request = await this.paginatedRequest<SportmonksEntity>(path, {
      include: "player;type;fromTeam;toTeam",
      order: "desc",
    }, {
      bucket: "historical",
      perPage: 50,
      maxPages: 2,
      maxItems: 100,
    });
    if (!request.configured) return this.notConfigured<TouchlineTransfer[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineTransfer[]>(value, "Sportmonks transfers failed.");
    const transfers = sortSportmonksTransfersNewestFirst((value.data?.data ?? [])
      .map((item) => mapSportmonksTransfer(item))
      .filter((transfer): transfer is TouchlineTransfer => Boolean(transfer)));
    return resultOk(this.name, transfers, value.data, cached, value.fetchedAt);
  }

  async getSeasons(competitionId?: string): Promise<FootballDataResult<TouchlineSeason[]>> {
    const request = await this.paginatedRequest<SportmonksEntity>(competitionId ? `/seasons/leagues/${competitionId}` : "/seasons", {}, {
      bucket: "static",
      perPage: 50,
      maxPages: 4,
      maxItems: 200,
    });
    if (!request.configured) return this.notConfigured<TouchlineSeason[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineSeason[]>(value, "Sportmonks seasons failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapSeason(item)), value.data, cached, value.fetchedAt);
  }

  async getCompetitions(): Promise<FootballDataResult<TouchlineCompetition[]>> {
    const request = await this.paginatedRequest<SportmonksEntity>("/leagues", {
      include: "country",
    }, {
      bucket: "static",
      perPage: 50,
      maxPages: 4,
      maxItems: 200,
    });
    if (!request.configured) return this.notConfigured<TouchlineCompetition[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineCompetition[]>(value, "Sportmonks competitions failed.");
    return resultOk(this.name, (value.data?.data ?? []).map((item) => this.mapCompetition(item)), value.data, cached, value.fetchedAt);
  }

  async getSquad(teamId: string): Promise<FootballDataResult<TouchlineSquadMember[]>> {
    const [request, extendedRequest] = await Promise.all([
      this.request<SportmonksEntity[]>(`/squads/teams/${teamId}`, {
        include: "player;player.position;player.detailedPosition;position;detailedPosition",
      }, "daily", "interactive"),
      this.request<SportmonksEntity[]>(`/squads/teams/${teamId}/extended`, {
        include: "country;nationality;position;detailedPosition",
      }, "daily", "interactive"),
    ]);
    if (!request.configured) return this.notConfigured<TouchlineSquadMember[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineSquadMember[]>(value, "Sportmonks squad failed.");

    const extendedPlayersById = new Map<string, SportmonksEntity>();
    if (extendedRequest.configured && extendedRequest.value.ok) {
      for (const item of extendedRequest.value.data?.data ?? []) {
        // The documented extended endpoint may return either a player object
        // or a squad-member object containing `player_id`/`player`. Index the
        // canonical player identity in both shapes; indexing only `item.id`
        // silently dropped nationality when that id was the squad-member id.
        const nestedPlayer = this.relationEntity(item, "player") ?? (item.player as SportmonksEntity | undefined);
        const extendedPlayer: SportmonksEntity = nestedPlayer
          ? this.mergePlayerRaw(nestedPlayer, item) ?? nestedPlayer
          : item;
        const playerId = asString(nestedPlayer?.id) ?? asString(item.player_id) ?? asString(item.id);
        if (playerId) extendedPlayersById.set(playerId, extendedPlayer);
      }
    }

    const members: TouchlineSquadMember[] = (value.data?.data ?? []).flatMap((item) => {
      const playerRaw = this.relationEntity(item, "player") ?? (item.player as SportmonksEntity | undefined);
      const playerId = asString(playerRaw?.id);
      const extendedPlayerRaw = playerId ? extendedPlayersById.get(playerId) : undefined;
      const mergedPlayerRaw = this.mergePlayerRaw(playerRaw, extendedPlayerRaw);
      const player = this.mapPlayer(mergedPlayerRaw);
      if (!player) return [];
      const positionRaw = this.relationEntity(item, "position") ?? (item.position as SportmonksEntity | undefined);
      const detailedPositionRaw = this.relationEntity(item, "detailedPosition") ?? (item.detailedPosition as SportmonksEntity | undefined);
      return [{
        player,
        jerseyNumber: asNumber(item.jersey_number),
        // Squad construction needs the provider's exact position (RB, LB,
        // centre-back, defensive midfield, etc.). The broad parent position
        // remains available in raw data, but must not erase this detail.
        position: asString(detailedPositionRaw?.name) ?? asString(positionRaw?.name),
        raw: { ...item, player: mergedPlayerRaw },
      }];
    });
    const fetchedAt = earliestFetchedAt(
      value.fetchedAt,
      extendedRequest.configured && extendedRequest.value.ok
        ? extendedRequest.value.fetchedAt
        : undefined,
    );
    return resultOk(
      this.name,
      members,
      { squad: value.data, extendedSquad: extendedRequest.configured ? extendedRequest.value.data : null },
      Boolean(cached && extendedRequest.configured && extendedRequest.cached),
      fetchedAt,
    );
  }

  async getPlayerStats(params: StatsParams): Promise<FootballDataResult<Record<string, unknown>>> {
    if (!params.playerId) return resultError(this.name, "invalid_request", "playerId is required for Sportmonks player stats.");
    const request = await this.request<SportmonksEntity>(`/players/${encodeURIComponent(params.playerId)}`, {
      include: "statistics.details.type",
      filters: params.seasonId ? `playerStatisticSeasons:${params.seasonId}` : undefined,
    }, "daily");
    if (!request.configured) return this.notConfigured<Record<string, unknown>>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<Record<string, unknown>>(value, "Sportmonks player statistics failed.");

    const raw = value.data?.data;
    const statistics = this.relationArray(raw, "statistics").map((statistic) => ({
      id: asString(statistic.id),
      seasonId: asString(statistic.season_id),
      participantId: asString(statistic.participant_id),
      details: this.mapStatisticDetails(statistic),
    }));

    return resultOk(this.name, {
      playerId: params.playerId,
      seasonId: params.seasonId,
      statistics,
      fetchedAt: value.fetchedAt,
    }, value.data, cached, value.fetchedAt);
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
    if (!value.ok) return this.providerFailure<FootballRateLimitStatus>(value, "Sportmonks rate limit validation failed.");
    const rateLimit = value.data?.rate_limit;
    const resetSeconds = asNumber(rateLimit?.resets_in_seconds);
    return resultOk(this.name, {
      configured: true,
      limit: asNumber(value.headers.get("x-ratelimit-limit")),
      remaining: asNumber(rateLimit?.remaining) ?? asNumber(value.headers.get("x-ratelimit-remaining")),
      resetAt: resetSeconds === undefined
        ? undefined
        : new Date(Date.now() + resetSeconds * 1000).toISOString(),
      providerMessage: value.data?.message ?? "Sportmonks token accepted.",
    }, value.data, cached, value.fetchedAt);
  }

  async getFixtureBallCoordinates(fixtureId: string): Promise<FootballDataResult<TouchlineBallCoordinate[]>> {
    const normalizedFixtureId = fixtureId.trim();
    if (!normalizedFixtureId) {
      return resultError(this.name, "invalid_request", "fixtureId is required for Sportmonks ball coordinates.");
    }

    const request = await this.request<SportmonksEntity>(
      `/fixtures/${encodeURIComponent(normalizedFixtureId)}`,
      { include: "ballCoordinates" },
      "live",
    );
    if (!request.configured) return this.notConfigured<TouchlineBallCoordinate[]>();

    const { value, cached } = request;
    if (!value.ok) {
      return this.providerFailure<TouchlineBallCoordinate[]>(value, "Sportmonks ball coordinates failed.");
    }

    return resultOk(
      this.name,
      mapSportmonksFixtureBallCoordinates(value.data?.data, normalizedFixtureId),
      value.data,
      cached,
      value.fetchedAt,
    );
  }

  async getFixtureFantasyFeed(fixtureId: string): Promise<FootballDataResult<TouchlineFantasyFixtureFeed | null>> {
    if (!fixtureId.trim()) return resultError(this.name, "invalid_request", "fixtureId is required for fantasy fixture feed.");
    const request = await this.request<SportmonksEntity>(`/fixtures/${encodeURIComponent(fixtureId)}`, {
      include: "participants;scores;league;season;round;state;lineups.player;lineups.position;lineups.details.type;formations;sidelined.sideline;sidelined.player;events.type;events.player;events.relatedPlayer",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFantasyFixtureFeed | null>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFantasyFixtureFeed | null>(value, "Sportmonks fantasy fixture feed failed.");

    const raw = value.data?.data;
    const fixture = this.mapFixture(raw);
    if (!fixture) return resultOk(this.name, null, value.data, cached, value.fetchedAt);

    const feed: TouchlineFantasyFixtureFeed = {
      fixture,
      lineups: this.mapLineups(raw, fixture.providerId),
      formations: this.mapFormations(raw, fixture.providerId),
      sidelined: this.mapSidelined(raw, fixture.providerId),
      events: this.mapEvents(raw, fixture.providerId),
      fetchedAt: value.fetchedAt,
      mediaPolicy: {
        officialMediaExposed: false,
        note: "SportMonks media paths are intentionally not exposed in fantasy endpoints. TouchLine uses approved first-party visual assets.",
      },
    };

    return resultOk(this.name, feed, value.data, cached, value.fetchedAt);
  }

  async getLiveFantasyEvents(fixtureId?: string): Promise<FootballDataResult<TouchlineFantasyEvent[]>> {
    if (fixtureId?.trim()) {
      const request = await this.request<SportmonksEntity>(`/fixtures/${encodeURIComponent(fixtureId)}`, {
        include: "events.type;events.player;events.relatedPlayer",
      }, "live");
      if (!request.configured) return this.notConfigured<TouchlineFantasyEvent[]>();
      const { value, cached } = request;
      if (!value.ok) return this.providerFailure<TouchlineFantasyEvent[]>(value, "Sportmonks fixture events failed.");
      return resultOk(this.name, this.mapEvents(value.data?.data, fixtureId), value.data, cached, value.fetchedAt);
    }

    const request = await this.request<SportmonksEntity[]>(SPORTMONKS_INPLAY_LIVESCORES_PATH, {
      include: "events.type;events.player;events.relatedPlayer",
    }, "live");
    if (!request.configured) return this.notConfigured<TouchlineFantasyEvent[]>();
    const { value, cached } = request;
    if (!value.ok) return this.providerFailure<TouchlineFantasyEvent[]>(value, "Sportmonks live fantasy events failed.");
    const events = (value.data?.data ?? []).flatMap((fixture) => this.mapEvents(fixture, asString(fixture.id)));
    return resultOk(this.name, events, value.data, cached, value.fetchedAt);
  }

  async getSubscriptionCapabilities(): Promise<FootballDataResult<TouchlineProviderCapabilities>> {
    const resourcesRequest = await this.request<SportmonksEntity[]>("/my/resources", {}, "static");
    if (!resourcesRequest.configured) return this.notConfigured<TouchlineProviderCapabilities>();
    if (!resourcesRequest.value.ok) {
      return this.providerFailure<TouchlineProviderCapabilities>(resourcesRequest.value, "Sportmonks resources lookup failed.");
    }

    const enrichmentsRequest = await this.request<SportmonksEntity[]>("/my/enrichments", {}, "static");
    if (!enrichmentsRequest.configured) return this.notConfigured<TouchlineProviderCapabilities>();
    if (!enrichmentsRequest.value.ok) {
      return this.providerFailure<TouchlineProviderCapabilities>(enrichmentsRequest.value, "Sportmonks enrichments lookup failed.");
    }

    const fetchedAt = earliestFetchedAt(
      resourcesRequest.value.fetchedAt,
      enrichmentsRequest.value.fetchedAt,
    );
    const capabilities: TouchlineProviderCapabilities = {
      provider: this.name,
      resources: this.mapCapabilities(resourcesRequest.value.data?.data ?? []),
      enrichments: this.mapCapabilities(enrichmentsRequest.value.data?.data ?? []),
      fetchedAt,
    };

    return resultOk(this.name, capabilities, {
      resources: resourcesRequest.value.data,
      enrichments: enrichmentsRequest.value.data,
    }, Boolean(resourcesRequest.cached && enrichmentsRequest.cached), fetchedAt);
  }

  private mapPlayer(raw?: SportmonksEntity): TouchlinePlayer | null {
    if (!raw?.id) return null;
    const id = String(raw.id);
    const name = (asString(raw.display_name) ?? asString(raw.name) ?? [asString(raw.firstname), asString(raw.lastname)].filter(Boolean).join(" ")) || `Player ${id}`;
    const country = this.relationEntity(raw, "nationality") ?? (raw.nationality as SportmonksEntity | undefined);
    const fallbackCountry = this.relationEntity(raw, "country") ?? (raw.country as SportmonksEntity | undefined);
    const position =
      this.relationEntity(raw, "detailedPosition") ??
      this.relationEntity(raw, "position") ??
      (raw.detailedPosition as SportmonksEntity | undefined) ??
      (raw.position as SportmonksEntity | undefined);
    const teams = this.relationArray(raw, "teams");
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
      preferredFoot:
        asString(raw.preferred_foot) ??
        asString(raw.foot) ??
        playerMetadataValue(raw, /preferred.?foot|dominant.?foot|foot/),
      currentTeamId: asString(currentTeam?.id),
      currentTeamName: asString(currentTeam?.name),
      marketValue: asNumber(raw.market_value) ?? asNumber(raw.market_value_eur) ?? asNumber(raw.marketValue),
      marketValueCurrency: asString(raw.market_value_currency) ?? asString(raw.currency),
      contractUntil:
        asString(raw.contract_until) ??
        asString(raw.contract_expiry) ??
        playerMetadataValue(raw, /contract.*(end|until|expiry)/),
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
    const teams = relationItems(raw.teams);
    const currentTeam = teams.find((team) => {
      const pivot = team.pivot as SportmonksEntity | undefined;
      return pivot?.active === true;
    }) ?? teams.find((team) => {
      const pivot = team.pivot as SportmonksEntity | undefined;
      return Boolean(pivot) && !asString(pivot?.end);
    }) ?? teams[0];
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
      teamId: asString(raw.team_id) ?? asString(currentTeam?.id),
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
      startsAt: sportmonksFixtureStartAt(raw),
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
    const round = this.relationEntity(raw, "round");
    return {
      id: providerId(this.name, id),
      providerId: id,
      provider: this.name,
      name: asString(raw.name),
      startsAt: sportmonksFixtureStartAt(raw),
      status: asString((raw.state as SportmonksEntity | undefined)?.name) ?? asString(raw.state_id),
      competitionId: asString(raw.league_id),
      seasonId: asString(raw.season_id),
      roundId: asString(raw.round_id) ?? asString(round?.id),
      roundName: asString(round?.name),
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
    return selectSportmonksParticipantScore(scores, location);
  }

  private relationArray(raw: SportmonksEntity | undefined, key: string): SportmonksEntity[] {
    const value = raw?.[key];
    if (Array.isArray(value)) return value as SportmonksEntity[];
    if (value && typeof value === "object" && Array.isArray((value as SportmonksEntity).data)) {
      return (value as { data: SportmonksEntity[] }).data;
    }
    return [];
  }

  private relationEntity(raw: SportmonksEntity | undefined, key: string): SportmonksEntity | undefined {
    const value = raw?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const data = (value as SportmonksEntity).data;
      if (data && typeof data === "object" && !Array.isArray(data)) return data as SportmonksEntity;
      return value as SportmonksEntity;
    }
    return undefined;
  }

  private mergePlayerRaw(primary?: SportmonksEntity, extended?: SportmonksEntity) {
    if (!primary) return extended;
    if (!extended) return primary;
    const primaryNationality = this.relationEntity(primary, "nationality");
    const primaryCountry = this.relationEntity(primary, "country");
    return {
      ...extended,
      ...primary,
      // Prefer the primary relation only when it carries a usable country
      // name. A sparse primary squad row commonly contains an empty relation
      // that would otherwise mask the extended endpoint's canonical data.
      country: asString(primaryCountry?.name) ? primary.country : extended.country ?? primary.country,
      nationality: asString(primaryNationality?.name) ? primary.nationality : extended.nationality ?? primary.nationality,
      country_id: asString(primary.country_id)
        ?? asString(primary.nationality_id)
        ?? asString(extended.country_id)
        ?? asString(extended.nationality_id),
      nationality_id: asString(primary.nationality_id)
        ?? asString(primary.country_id)
        ?? asString(extended.nationality_id)
        ?? asString(extended.country_id),
      position: primary.position ?? extended.position,
      detailedPosition: primary.detailedPosition ?? extended.detailedPosition,
      position_id: asString(primary.position_id) ?? asString(extended.position_id),
      detailed_position_id: asString(primary.detailed_position_id) ?? asString(extended.detailed_position_id),
      market_value: primary.market_value ?? extended.market_value,
      market_value_eur: primary.market_value_eur ?? extended.market_value_eur,
      marketValue: primary.marketValue ?? extended.marketValue,
    };
  }

  private participantNameById(raw: SportmonksEntity | undefined, id?: string) {
    if (!id) return undefined;
    return asString(this.relationArray(raw, "participants").find((team) => asString(team.id) === id)?.name);
  }

  private mapLineups(raw: SportmonksEntity | undefined, fixtureId: string): TouchlineFantasyLineupMember[] {
    return this.relationArray(raw, "lineups").flatMap((item, index) => {
      const id = asString(item.id) ?? `${fixtureId}-${index}`;
      const player = this.relationEntity(item, "player") ?? (item.player as SportmonksEntity | undefined);
      const position = this.relationEntity(item, "position") ?? (item.position as SportmonksEntity | undefined);
      const teamId = asString(item.team_id) ?? asString(item.participant_id);
      const { isStarter, isSubstitute } = classifySportmonksLineupRole(item);
      const playerName =
        asString(item.player_name) ??
        asString(player?.display_name) ??
        asString(player?.name) ??
        [asString(player?.firstname), asString(player?.lastname)].filter(Boolean).join(" ");

      if (!playerName) return [];

      return [{
        id: providerId(this.name, id),
        providerId: id,
        provider: this.name,
        fixtureId,
        teamId,
        teamName: asString((item.team as SportmonksEntity | undefined)?.name) ?? this.participantNameById(raw, teamId),
        playerId: asString(item.player_id) ?? asString(player?.id),
        playerName,
        jerseyNumber: asNumber(item.jersey_number),
        position: asString(item.position_name) ?? asString(position?.name) ?? asString(player?.position_name),
        positionId: asString(item.position_id) ?? asString(position?.id),
        formationPosition: asString(item.formation_position) ?? asString(item.formation_field) ?? asString(item.grid),
        x: asNumber(item.x),
        y: asNumber(item.y),
        isStarter,
        isSubstitute,
        isCaptain: Boolean(item.captain) || Boolean(item.is_captain),
        statistics: this.mapStatisticDetails(item),
        raw: item,
      }];
    });
  }

  private mapStatisticDetails(raw: SportmonksEntity | undefined) {
    return this.relationArray(raw, "details").flatMap((detail) => {
      const type = this.relationEntity(detail, "type") ?? (detail.type as SportmonksEntity | undefined);
      const typeId = asString(detail.type_id) ?? asString(type?.id);
      if (!typeId) return [];
      const value = parseSportmonksStatisticValue(detail.value);

      return [{
        typeId,
        code: asString(type?.code) ?? asString(detail.code),
        name: asString(type?.name) ?? asString(detail.name),
        value,
      }];
    });
  }

  private mapFormations(raw: SportmonksEntity | undefined, fixtureId: string): TouchlineFantasyFormation[] {
    return this.relationArray(raw, "formations").map((item, index) => {
      const id = asString(item.id) ?? `${fixtureId}-formation-${index}`;
      const teamId = asString(item.team_id) ?? asString(item.participant_id);
      return {
        id: providerId(this.name, id),
        providerId: id,
        provider: this.name,
        fixtureId,
        teamId,
        teamName: asString((item.team as SportmonksEntity | undefined)?.name) ?? this.participantNameById(raw, teamId),
        formation: asString(item.formation) ?? asString(item.name),
        raw: item,
      };
    });
  }

  private mapSidelined(raw: SportmonksEntity | undefined, fixtureId: string): TouchlineFantasySidelinedPlayer[] {
    return this.relationArray(raw, "sidelined").map((item, index) => {
      const id = asString(item.id) ?? `${fixtureId}-sidelined-${index}`;
      const player = this.relationEntity(item, "player") ?? (item.player as SportmonksEntity | undefined);
      const sideline = this.relationEntity(item, "sideline") ?? (item.sideline as SportmonksEntity | undefined);
      const teamId = asString(item.team_id) ?? asString(item.participant_id);
      return {
        id: providerId(this.name, id),
        providerId: id,
        provider: this.name,
        fixtureId,
        teamId,
        teamName: this.participantNameById(raw, teamId),
        playerId: asString(item.player_id) ?? asString(player?.id),
        playerName: asString(player?.display_name) ?? asString(player?.name) ?? asString(item.player_name),
        reason: asString(item.reason) ?? asString(sideline?.name) ?? asString(item.description),
        category: asString(item.category) ?? asString(item.type),
        raw: item,
      };
    });
  }

  private mapEvents(raw: SportmonksEntity | undefined, fixtureId?: string): TouchlineFantasyEvent[] {
    const resolvedFixtureId = fixtureId ?? asString(raw?.id);
    return this.relationArray(raw, "events").map((item, index) => {
      const id = asString(item.id) ?? `${resolvedFixtureId ?? "live"}-event-${index}`;
      const player = this.relationEntity(item, "player") ?? (item.player as SportmonksEntity | undefined);
      const relatedPlayer = this.relationEntity(item, "relatedPlayer") ?? this.relationEntity(item, "related_player");
      const type = asString((item.type as SportmonksEntity | undefined)?.name) ?? asString(item.type_name) ?? asString(item.event_type) ?? asString(item.type);
      return {
        id: providerId(this.name, id),
        providerId: id,
        provider: this.name,
        fixtureId: resolvedFixtureId,
        teamId: asString(item.team_id) ?? asString(item.participant_id),
        playerId: asString(item.player_id) ?? asString(player?.id),
        playerName: asString(player?.display_name) ?? asString(player?.name) ?? asString(item.player_name),
        relatedPlayerId: asString(item.related_player_id) ?? asString(relatedPlayer?.id),
        relatedPlayerName: asString(relatedPlayer?.display_name) ?? asString(relatedPlayer?.name),
        type,
        minute: asNumber(item.minute),
        extraMinute: asNumber(item.extra_minute),
        fantasyPoints: estimateFantasyEventPoints(type),
        raw: item,
      };
    });
  }

  private mapCapabilities(items: SportmonksEntity[]): TouchlineProviderCapability[] {
    return items.map((item, index) => {
      const id = asString(item.id) ?? asString(item.name) ?? `capability-${index}`;
      return {
        id,
        name: asString(item.name) ?? asString(item.display_name) ?? asString(item.description) ?? asString(item.entity),
        endpoint: asString(item.endpoint) ?? asString(item.path),
        available: item.available === undefined ? undefined : Boolean(item.available),
        raw: item,
      };
    });
  }
}
