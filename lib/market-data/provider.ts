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

export async function fetchExternalMarketPlayer(params: {
  provider: string;
  providerPlayerId: string;
  profileUrl?: string | null;
}): Promise<MarketSyncResult> {
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
