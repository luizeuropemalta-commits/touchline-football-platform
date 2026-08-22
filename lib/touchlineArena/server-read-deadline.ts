/**
 * A server page must not keep the App Router's global loading boundary open
 * indefinitely when an upstream read stalls. Callers choose a fail-closed
 * fallback and never receive partial data from this helper.
 */
export function resolveServerReadWithin<T>(
  read: PromiseLike<T>,
  fallback: T,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    void Promise.resolve(read).then(
      (value) => resolve(value),
      () => resolve(fallback),
    ).finally(() => clearTimeout(timer));
  });
}
