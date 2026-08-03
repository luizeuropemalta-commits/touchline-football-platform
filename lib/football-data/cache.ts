import type { FootballDataCacheBucket } from "@/lib/football-data/types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlightLoads = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_SECONDS: Record<FootballDataCacheBucket, number> = {
  static: 60 * 60 * 24 * 30,
  daily: 60 * 60 * 24,
  live: 15,
  historical: 60 * 60 * 24 * 7,
};

export function footballDataCacheTtlSeconds(bucket: FootballDataCacheBucket) {
  const envName = `FOOTBALL_DATA_CACHE_TTL_${bucket.toUpperCase()}_SECONDS`;
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_SECONDS[bucket];
}

export function footballDataCacheKey(parts: Array<string | number | boolean | undefined | null>) {
  return parts
    .map((part) => String(part ?? ""))
    .join(":")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function footballDataCacheMaxEntries() {
  const configured = Number(process.env.FOOTBALL_DATA_CACHE_MAX_ENTRIES);
  return Number.isInteger(configured) && configured > 0 ? configured : 500;
}

function pruneFootballDataCache(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  const maxEntries = footballDataCacheMaxEntries();
  while (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    cache.delete(oldestKey);
  }
}

export async function withFootballDataCache<T>(
  bucket: FootballDataCacheBucket,
  keyParts: Array<string | number | boolean | undefined | null>,
  loader: () => Promise<T>,
  ttlSeconds = footballDataCacheTtlSeconds(bucket),
  shouldCache: (value: T) => boolean = () => true,
): Promise<{ value: T; cached: boolean }> {
  const key = `${bucket}:${footballDataCacheKey(keyParts)}`;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return { value: existing.value, cached: true };
  }

  const existingLoad = inFlightLoads.get(key) as Promise<T> | undefined;
  if (existingLoad) return { value: await existingLoad, cached: true };

  const load = loader();
  inFlightLoads.set(key, load);

  let value: T;
  try {
    value = await load;
  } finally {
    inFlightLoads.delete(key);
  }

  if (shouldCache(value)) {
    const createdAt = Date.now();
    pruneFootballDataCache(createdAt);
    cache.set(key, {
      value,
      createdAt,
      expiresAt: createdAt + ttlSeconds * 1000,
    });
  } else {
    cache.delete(key);
  }

  return { value, cached: false };
}

export function clearFootballDataCache() {
  cache.clear();
  inFlightLoads.clear();
}

export function footballDataCacheSnapshot() {
  const now = Date.now();
  return {
    size: cache.size,
    inFlight: inFlightLoads.size,
    entries: Array.from(cache.entries()).map(([key, entry]) => ({
      key,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      expired: entry.expiresAt <= now,
    })),
  };
}
