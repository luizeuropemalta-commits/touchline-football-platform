import { createAccountLocaleHost } from "./account-locale-host.ts";

type HostOptions = Parameters<typeof createAccountLocaleHost>[0];
type Options = HostOptions & {
  observeIdentity: (callback: (accountId: string | null) => void) => () => void;
  onIdentityChange: () => void;
  timeoutMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** Start only in a mounted effect and cleanup that exact instance. Identity
 * observation is an invalidation signal, not authentication authority. A timeout
 * or cleanup never means a server write was rolled back; recovery starts with a
 * new trusted context and authenticated read, never an automatic PUT retry.
 */
export function startAccountLocaleBrowser({ context, request, apply, restore, onChange,
  draftLocalesEnabled = false,
  observeIdentity, onIdentityChange, timeoutMs = 15_000,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: Options) {
  let stopped = false;
  let identityChanged = false;
  let unsubscribe: (() => void) | undefined;
  const cancellations = new Set<() => void>();
  const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000;

  const boundedRequest: HostOptions["request"] = (input, init) => new Promise((resolve, reject) => {
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
    const timer = setTimer(() => finish(new Error("Locale request timed out")), deadline);
    void (async () => {
      try {
        const response = await request(input, { ...init, signal: transport.signal });
        if (finished) return;
        if (!response.ok) { finish(undefined, response); return; }
        // Consume the full receipt within the same deadline as the request.
        const body: unknown = await response.json();
        if (finished) return;
        finish(undefined, new Response(JSON.stringify(body), {
          status: response.status, headers: { "Content-Type": "application/json" },
        }));
      } catch {
        finish(new Error("Locale response unavailable"));
      }
    })();
  });
  const host = createAccountLocaleHost({ context, request: boundedRequest, apply, onChange, draftLocalesEnabled,
    restore: locale => { if (!stopped && !identityChanged) restore?.(locale); },
  });
  const expectedIdentity = context.mode === "account" ? context.accountId : null;
  function invalidate() {
    host.invalidate();
    for (const cancel of cancellations) cancel();
  }
  function cleanup() {
    if (stopped) return;
    stopped = true;
    invalidate();
    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();
  }
  if (context.mode === "account" || context.mode === "guest") {
    try {
      unsubscribe = observeIdentity(identity => {
        if (stopped || identityChanged || identity === expectedIdentity) return;
        identityChanged = true;
        invalidate();
        onIdentityChange();
      });
    } catch {
      invalidate();
    }
  }
  void host.load();
  return { ...host, invalidate, dispose: cleanup, cleanup };
}
