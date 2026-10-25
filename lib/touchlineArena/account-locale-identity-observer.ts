type Identity = string | null | undefined;
type Options = {
  subscribe: (callback: (event: string, session: unknown) => void) => () => void;
  readUser: () => Promise<unknown>;
  onIdentity: (identity: Identity) => void;
  timeoutMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function userIdentity(value: unknown): string | undefined {
  if (!record(value)) return undefined;
  const id = value.id;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
}

/** SDK token-only sessions may contain an unreadable user proxy. Unknown is
 * not signed out. Fence immediately, then verify outside the auth callback.
 * The deadline bounds waiting; late SDK responses cannot revive this observer. */
export function startAccountLocaleIdentityObserver({ subscribe, readUser, onIdentity,
  timeoutMs = 8_000, setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: Options) {
  let active = true;
  let generation = 0;
  let deferred: unknown;
  let deadline: unknown;
  const clearPending = () => {
    if (deferred !== undefined) clearTimer(deferred);
    if (deadline !== undefined) clearTimer(deadline);
    deferred = deadline = undefined;
  };
  const unsubscribe = subscribe((_event, session) => {
    if (!active) return;
    const epoch = ++generation;
    clearPending();
    if (session === null) { onIdentity(null); return; }
    let identity: string | undefined;
    try { identity = record(session) ? userIdentity(session.user) : undefined; } catch { /* unavailable user proxy */ }
    if (identity !== undefined) { onIdentity(identity); return; }
    onIdentity(undefined);
    deferred = setTimer(() => {
      deferred = undefined;
      if (!active || epoch !== generation) return;
      deadline = setTimer(() => {
        deadline = undefined;
        if (active && epoch === generation) generation++;
      }, timeoutMs);
      void (async () => {
        try {
          const result = await readUser();
          if (!active || epoch !== generation) return;
          clearPending();
          if (!record(result) || result.error !== null || !record(result.data)) return;
          const user = result.data.user;
          if (user === null) onIdentity(null);
          else {
            const verified = userIdentity(user);
            if (verified !== undefined) onIdentity(verified);
          }
        } catch {
          if (active && epoch === generation) clearPending();
          // Temporary failure stays unknown, never a fabricated sign-out.
        }
      })();
    }, 0);
  });
  return () => {
    if (!active) return;
    active = false;
    generation++;
    clearPending();
    unsubscribe();
  };
}
