import type { TouchlineEntityType } from "@/lib/avatar/avatar-normalization";

export type TouchlineDataFreshnessStatus = "fresh" | "stale" | "missing";

export type TouchlineEntitySyncInput = {
  entityType: TouchlineEntityType;
  id?: string | null;
  name: string;
  lastProviderSyncAt?: string | null;
  lastMarketSyncAt?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ageMs(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Date.now() - time;
}

export function getTouchlineDataFreshness(lastSyncAt?: string | null, staleAfterMs = DAY_MS): TouchlineDataFreshnessStatus {
  const age = ageMs(lastSyncAt);
  if (age === null) return "missing";
  return age > staleAfterMs ? "stale" : "fresh";
}

export function shouldRefreshTouchlineEntity(input: TouchlineEntitySyncInput) {
  return getTouchlineDataFreshness(input.lastProviderSyncAt) !== "fresh";
}

export function shouldRefreshTouchlineMarket(input: TouchlineEntitySyncInput & { marketValueSource?: string | null }) {
  if (input.marketValueSource === "unavailable_from_provider") return false;
  return getTouchlineDataFreshness(input.lastMarketSyncAt) !== "fresh";
}

export function buildTouchlineSyncSummary(input: TouchlineEntitySyncInput & { marketValueSource?: string | null }) {
  const dataFreshnessStatus = getTouchlineDataFreshness(input.lastProviderSyncAt);
  const marketFreshnessStatus = getTouchlineDataFreshness(input.lastMarketSyncAt);
  return {
    entityType: input.entityType,
    id: input.id ?? null,
    name: input.name,
    dataFreshnessStatus,
    marketFreshnessStatus,
    shouldRefreshIdentity: shouldRefreshTouchlineEntity(input),
    shouldRefreshMarket: shouldRefreshTouchlineMarket(input),
  };
}
