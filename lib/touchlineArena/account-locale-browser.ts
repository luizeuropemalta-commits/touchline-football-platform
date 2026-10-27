import { createAccountLocaleHost } from "./account-locale-host.ts";

class TransientLocaleReadError extends Error {}

type HostOptions = Parameters<typeof createAccountLocaleHost>[0];
type Options = HostOptions & {
  observeIdentity: (callback: (accountId: string | null | undefined) => void) => () => void;
  onIdentityChange: () => void;
  timeoutMs?: number;
  observeReadRecovery?: (callback: () => void) => () => void;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

function observeBrowserReadRecovery(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const page = typeof document === "undefined" ? undefined : document;
  const onVisible = () => { if (page?.visibilityState === "visible") callback(); };
  window.addEventListener("focus", callback);
  window.addEventListener("online", callback);
  page?.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("focus", callback);
    window.removeEventListener("online", callback);
    page?.removeEventListener("visibilitychange", onVisible);
  };
}

/** Start only in a mounted effect and cleanup that exact instance. Identity
 * observation is an invalidation signal, not authentication authority. A timeout
 * or cleanup never means a server write was rolled back; recovery starts with a
 * new trusted context and authenticated read, never an automatic PUT retry.
 */
export function startAccountLocaleBrowser({ context, request, apply, restore, onChange,
  draftLocalesEnabled = false,
  observeIdentity, onIdentityChange, timeoutMs = 15_000,
  observeReadRecovery = observeBrowserReadRecovery, now = () => performance.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: Options) {
  let stopped = false;
  let invalidated = false;
  let identityChanged = false;
  let identityUnknown = false;
  let attemptedWrite = false;
  let readGeneration = 0;
  let transientReadExhausted = false;
  let lastEventRecovery: number | undefined;
  let stopReadRecovery: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  const cancellations = new Set<() => void>();
  const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000;

  const requestOnce: HostOptions["request"] = (input, init) => new Promise((resolve, reject) => {
    if (init.method === "PUT") attemptedWrite = true;
    let finished = false;
    const transport = new AbortController();
    const finish = (error?: Error, response?: Response) => {
      if (finished) return;
      finished = true;
      clearTimer(timer);
      cancellations.delete(cancel);
      if (error) { transport.abort(); reject(error); }
      else resolve(response!);
    };
    const cancel = () => finish(new Error("Locale request no longer current"));
    cancellations.add(cancel);
    const timer = setTimer(() => finish(new TransientLocaleReadError("Locale request timed out")), deadline);
    void (async () => {
      try {
        const response = await request(input, { ...init, signal: transport.signal });
        if (finished) return;
        if (!response.ok) { finish(undefined, response); return; }
        // Consume the full receipt within the same deadline as the request.
        let body: unknown;
        try { body = await response.json(); }
        catch { finish(new Error("Locale receipt unavailable")); return; }
        if (finished) return;
        finish(undefined, new Response(JSON.stringify(body), {
          status: response.status, headers: { "Content-Type": "application/json" },
        }));
      } catch {
        finish(new TransientLocaleReadError("Locale response unavailable"));
      }
    })();
  });
  const readCurrent = () => !stopped && !invalidated && !identityChanged && !identityUnknown && !attemptedWrite;
  const waitForReadRecovery = (delay: number) => new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimer(timer); cancellations.delete(cancel); reject(new Error("Locale recovery no longer current")); };
    const timer = setTimer(() => { cancellations.delete(cancel); resolve(); }, delay);
    cancellations.add(cancel);
  });
  const boundedRequest: HostOptions["request"] = async (input, init) => {
    if (init.method !== "GET") return requestOnce(input, init);
    transientReadExhausted = false;
    const generation = readGeneration;
    const currentRead = () => generation === readGeneration && readCurrent();
    // At most three authenticated reads, each retaining its original deadline.
    // Only temporary transport/server failures qualify; malformed authority,
    // permission failures and rate limits are never retried here.
    for (let attempt = 0; ; attempt++) {
      if (!currentRead()) throw new Error("Locale read no longer current");
      let response: Response;
      try { response = await requestOnce(input, init); }
      catch (error) {
        if (!(error instanceof TransientLocaleReadError) || !currentRead()) throw error;
        if (attempt >= 2) { transientReadExhausted = true; throw error; }
        await waitForReadRecovery(attempt === 0 ? 1000 : 3000);
        continue;
      }
      if (![502, 503, 504].includes(response.status) || !currentRead()) return response;
      if (attempt >= 2) { transientReadExhausted = true; return response; }
      await waitForReadRecovery(attempt === 0 ? 1000 : 3000);
    }
  };
  const newHost = () => createAccountLocaleHost({ context, request: boundedRequest, apply, onChange, draftLocalesEnabled,
    restore: locale => { if (!stopped && !identityChanged && !identityUnknown) restore?.(locale); },
  });
  let host = newHost();
  const expectedIdentity = context.mode === "account" ? context.accountId : null;
  function fence() {
    transientReadExhausted = false;
    readGeneration++;
    host.invalidate();
    for (const cancel of cancellations) cancel();
  }
  function invalidate() {
    invalidated = true;
    fence();
  }
  function cleanup() {
    if (stopped) return;
    stopped = true;
    invalidate();
    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();
    stopReadRecovery?.();
    stopReadRecovery = undefined;
  }
  if (context.mode === "account" || context.mode === "guest") {
    try {
      unsubscribe = observeIdentity(identity => {
        if (stopped || invalidated || identityChanged) return;
        if (identity === undefined) {
          identityUnknown = true;
          fence();
          return;
        }
        if (identity === expectedIdentity) {
          // Only an independently resolved same-account identity can recover
          // an unknown observation. Never replay or implicitly reconcile PUT.
          if (identityUnknown && !attemptedWrite) {
            identityUnknown = false;
            host = newHost();
            onChange(host.getState());
            void host.load();
          }
          return;
        }
        identityChanged = true;
        invalidate();
        onIdentityChange();
      });
    } catch {
      invalidate();
    }
  }
  if (context.mode === "account" && !invalidated && !identityChanged) {
    // Event-driven read recovery only. No polling, writes, or retries of an
    // invalid authority receipt. A pending host and repeated events are inert.
    stopReadRecovery = observeReadRecovery(() => {
      if (!readCurrent() || !transientReadExhausted || host.getState() !== "blocked") return;
      let currentTime: number;
      try { currentTime = now(); } catch { return; }
      if (!Number.isFinite(currentTime)
        || (lastEventRecovery !== undefined && currentTime - lastEventRecovery < 30_000)) return;
      lastEventRecovery = currentTime;
      fence();
      host = newHost();
      onChange(host.getState());
      void host.load();
    });
  }
  void host.load();
  return { getState: () => host.getState(), load: () => host.load(), select: (locale: unknown) => host.select(locale),
    invalidate, dispose: cleanup, cleanup };
}
