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

export async function fetchExternalMarketPlayer(params: {
  provider: string;
  providerPlayerId: string;
  profileUrl?: string | null;
}): Promise<MarketSyncResult> {
  return {
    ok: false,
    reason: `External market sync for provider "${params.provider}" is disabled. Sportmonks is the only active football data API provider; normalized football data should flow through lib/football-data.`,
  };
}
