import type { FootballDataCacheBucket } from "@/lib/football-data/types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

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

export async function withFootballDataCache<T>(
  bucket: FootballDataCacheBucket,
  keyParts: Array<string | number | boolean | undefined | null>,
  loader: () => Promise<T>,
  ttlSeconds = footballDataCacheTtlSeconds(bucket),
): Promise<{ value: T; cached: boolean }> {
  const key = `${bucket}:${footballDataCacheKey(keyParts)}`;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return { value: existing.value, cached: true };
  }

  const value = await loader();
  cache.set(key, {
    value,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
  });

  return { value, cached: false };
}

export function clearFootballDataCache() {
  cache.clear();
}

export function footballDataCacheSnapshot() {
  const now = Date.now();
  return {
    size: cache.size,
    entries: Array.from(cache.entries()).map(([key, entry]) => ({
      key,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      expired: entry.expiresAt <= now,
    })),
  };
}
