export type TouchlineSharedCoalescer<T> = Readonly<{
  load: (loader: () => Promise<T>) => Promise<T>;
  clear: () => void;
}>;

/**
 * One process-wide value and one in-flight promise own this public read. There
 * is deliberately no caller-supplied key, so query strings, cookies and route
 * variants cannot multiply backend work.
 */
export function createTouchlineSharedCoalescer<T>(options: {
  ttlMs: number;
  now?: () => number;
  shouldCache?: (value: T) => boolean;
}): TouchlineSharedCoalescer<T> {
  const ttlMs = Math.max(0, Math.trunc(options.ttlMs));
  const now = options.now ?? Date.now;
  const shouldCache = options.shouldCache ?? (() => true);
  let cached: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    async load(loader) {
      const current = now();
      if (cached && cached.expiresAt > current) return cached.value;
      if (inFlight) return inFlight;

      const pending = Promise.resolve().then(loader);
      inFlight = pending;
      try {
        const value = await pending;
        if (ttlMs > 0 && shouldCache(value)) cached = { value, expiresAt: now() + ttlMs };
        else cached = null;
        return value;
      } catch (error) {
        // A transient database or runtime error must never poison the shared
        // value. The next request is allowed to retry immediately.
        cached = null;
        throw error;
      } finally {
        if (inFlight === pending) inFlight = null;
      }
    },
    clear() {
      cached = null;
      inFlight = null;
    },
  };
}
