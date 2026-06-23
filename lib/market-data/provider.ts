import { getApiFootballSeason } from "@/lib/market-data/season";

export type ExternalMarketPlayer = {
  provider: string;
  providerPlayerId: string;
  providerProfileUrl?: string;
  marketValue?: number;
  currency?: string;
  currentClub?: string;
  contractUntil?: string;
  sourceUpdatedAt?: string;
  rawPayload?: Record<string, unknown>;
};

export type MarketSyncResult =
  | { ok: true; player: ExternalMarketPlayer }
  | { ok: false; reason: string };

type ProviderResponse = {
  marketValue?: number;
  currency?: string;
  currentClub?: string;
  contractUntil?: string;
  sourceUpdatedAt?: string;
  profileUrl?: string;
  [key: string]: unknown;
};

type ApiFootballPlayerResponse = {
  response?: Array<{
    player?: {
      id?: number;
      name?: string;
      firstname?: string;
      lastname?: string;
      age?: number;
      birth?: { date?: string; place?: string; country?: string };
      nationality?: string;
      height?: string;
      weight?: string;
      injured?: boolean;
      photo?: string;
    };
    statistics?: Array<{
      team?: { id?: number; name?: string; logo?: string };
      league?: { id?: number; name?: string; country?: string; season?: number };
      games?: { appearences?: number; position?: string; rating?: string };
      goals?: { total?: number; assists?: number };
    }>;
  }>;
  [key: string]: unknown;
};

export async function fetchExternalMarketPlayer(params: {
  provider: string;
  providerPlayerId: string;
  profileUrl?: string | null;
}): Promise<MarketSyncResult> {
  if (isApiFootballProvider(params.provider)) {
    return fetchApiFootballPlayer(params);
  }

  const endpoint = process.env.FOOTBALL_MARKET_DATA_API_URL;
  const apiKey = process.env.FOOTBALL_MARKET_DATA_API_KEY;

  if (!endpoint || !apiKey) {
    return {
      ok: false,
      reason:
        "No authorized football market data API is configured. Add FOOTBALL_MARKET_DATA_API_URL and FOOTBALL_MARKET_DATA_API_KEY to enable automatic sync.",
    };
  }

  const url = new URL(endpoint);
  url.searchParams.set("provider", params.provider);
  url.searchParams.set("playerId", params.providerPlayerId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return { ok: false, reason: `Provider request failed with status ${response.status}` };
  }

  const data = (await response.json()) as ProviderResponse;

  return {
    ok: true,
    player: {
      provider: params.provider,
      providerPlayerId: params.providerPlayerId,
      providerProfileUrl: data.profileUrl ?? params.profileUrl ?? undefined,
      marketValue: data.marketValue,
      currency: data.currency ?? "EUR",
      currentClub: data.currentClub,
      contractUntil: data.contractUntil,
      sourceUpdatedAt: data.sourceUpdatedAt,
      rawPayload: data,
    },
  };
}

function isApiFootballProvider(provider: string) {
  return ["api-football", "api_football", "apisports", "api-sports"].includes(provider.toLowerCase());
}

async function fetchApiFootballPlayer(params: {
  provider: string;
  providerPlayerId: string;
  profileUrl?: string | null;
}): Promise<MarketSyncResult> {
  const apiKey = process.env.API_FOOTBALL_KEY ?? process.env.APISPORTS_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  const season = getApiFootballSeason(process.env.API_FOOTBALL_SEASON);

  if (!apiKey) {
    return {
      ok: false,
      reason: "API-Football is not configured. Add API_FOOTBALL_KEY in Vercel to enable optional football data sync.",
    };
  }

  const url = new URL("/players", baseUrl);
  url.searchParams.set("id", params.providerPlayerId);
  url.searchParams.set("season", season);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return { ok: false, reason: `API-Football request failed with status ${response.status}` };
  }

  const data = (await response.json()) as ApiFootballPlayerResponse;
  const first = data.response?.[0];
  const primaryStats = first?.statistics?.[0];

  if (!first?.player) {
    return { ok: false, reason: `API-Football returned no player for ID ${params.providerPlayerId}` };
  }

  return {
    ok: true,
    player: {
      provider: "API-Football",
      providerPlayerId: params.providerPlayerId,
      providerProfileUrl: params.profileUrl ?? undefined,
      currency: "EUR",
      currentClub: primaryStats?.team?.name,
      sourceUpdatedAt: new Date().toISOString(),
      rawPayload: {
        source: "api-football",
        season,
        player: first.player,
        primaryStats,
        fullResponse: data,
        note: "API-Football free tier provides player/statistical data. Market values may require a premium/licensed provider.",
      },
    },
  };
}
