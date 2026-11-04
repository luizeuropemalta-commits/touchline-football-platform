import { createTouchlineSharedCoalescer } from './live-presentation-coalescer.ts';

export const TOUCHLINE_CURRENT_RANKING_CACHE_MS = 5_000;
export type CurrentRankingCacheEntry<T> = Readonly<{
  version: 1; key: string; completedAt: number; expiresAt: number; value: T;
}>;

/** Strict public-data TTL over a cache that may return stale-while-revalidate.
 * Stale/error never serves last-good; one fresh attempt is awaited instead. */
export function createTouchlineCurrentRankingCache<T>(input: {
  readCached: (key: string, fresh: () => Promise<CurrentRankingCacheEntry<T>>) => Promise<unknown>;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  type Slot = { users: number;
    read: ReturnType<typeof createTouchlineSharedCoalescer<T>>;
    fresh: ReturnType<typeof createTouchlineSharedCoalescer<CurrentRankingCacheEntry<T>>> };
  const slots = new Map<string, Slot>();
  const acquire = (key: string) => {
    let slot = slots.get(key);
    if (!slot) {
      if (slots.size >= 32) throw new Error('current-cache-capacity');
      slot = { users: 0, read: createTouchlineSharedCoalescer<T>({ ttlMs: 0 }),
        fresh: createTouchlineSharedCoalescer<CurrentRankingCacheEntry<T>>({ ttlMs: 0 }) };
      slots.set(key, slot);
    }
    slot.users++;
    return slot;
  };
  const release = (key: string, slot: Slot) => {
    if (--slot.users === 0 && slots.get(key) === slot) slots.delete(key);
  };
  return {
    async load(key: string, readFresh: () => Promise<T>, validate: (value: unknown) => value is T): Promise<T> {
      if (typeof key !== 'string' || key.length !== 64 || !/^[0-9a-f]{64}$/.test(key)) throw new Error('invalid-current-cache-key');
      const valid = (value: unknown): value is CurrentRankingCacheEntry<T> => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const entry = value as CurrentRankingCacheEntry<T>;
        const sampled = now();
        return entry.version === 1 && entry.key === key && Number.isSafeInteger(sampled)
          && Number.isSafeInteger(entry.completedAt) && entry.completedAt >= 0 && entry.completedAt <= sampled
          && entry.expiresAt === entry.completedAt + TOUCHLINE_CURRENT_RANKING_CACHE_MS
          && entry.expiresAt > sampled && validate(entry.value);
      };
      const active = acquire(key);
      try {
        return await active.read.load(async () => {
          // The same promise is retained by Next's background callback and by
          // this foreground fallback, including rejection: no retry loop.
          let freshPromise: Promise<CurrentRankingCacheEntry<T>> | null = null;
          const fresh = () => freshPromise ??= (async () => {
            // Acquire at invocation, also if Next defers its callback until
            // after the cache-hit caller has returned.
            const freshSlot = acquire(key);
            try {
              return await freshSlot.fresh.load(async () => {
                const value = await readFresh();
                const completedAt = now();
                if (!Number.isSafeInteger(completedAt) || completedAt < 0 || !validate(value)) throw new Error('invalid-current-cache-read');
                return { version: 1, key, completedAt,
                  expiresAt: completedAt + TOUCHLINE_CURRENT_RANKING_CACHE_MS, value };
              });
            } finally { release(key, freshSlot); }
          })();
          let cached: unknown;
          try { cached = await input.readCached(key, fresh); } catch { cached = null; }
          if (valid(cached) && !freshPromise) return cached.value;
          const renewed = await fresh();
          if (!valid(renewed)) throw new Error('expired-current-cache-read');
          return renewed.value;
        });
      } finally { release(key, active); }
    },
  };
}
