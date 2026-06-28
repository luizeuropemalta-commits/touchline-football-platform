import { buildTouchlineSyncSummary } from "@/lib/sync/touchline-entity-sync";

export type PlayerCardSyncInput = {
  id?: string | null;
  name: string;
  lastProviderSyncAt?: string | null;
  lastMarketSyncAt?: string | null;
  marketValueSource?: string | null;
};

export function buildPlayerCardSyncSummary(input: PlayerCardSyncInput) {
  return buildTouchlineSyncSummary({
    entityType: "player",
    id: input.id,
    name: input.name,
    lastProviderSyncAt: input.lastProviderSyncAt,
    lastMarketSyncAt: input.lastMarketSyncAt,
    marketValueSource: input.marketValueSource,
  });
}
