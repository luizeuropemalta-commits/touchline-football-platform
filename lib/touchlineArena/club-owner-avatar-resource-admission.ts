declare const scopeBrand: unique symbol;
export type ClubOwnerAvatarResourceScope = Readonly<{ [scopeBrand]: true }>;
export type ClubOwnerAvatarResourceAdmission = Readonly<{
  tryAcquire: () => ClubOwnerAvatarResourceScope | null;
  assertOpen: (scope: ClubOwnerAvatarResourceScope) => void;
  close: (scope: ClubOwnerAvatarResourceScope) => void;
  runNative: <T>(scope: ClubOwnerAvatarResourceScope, work: () => PromiseLike<T> | T) => Promise<T>;
}>;

/** One admitted request, one native job, no waiting queue. Scopes carry no actor,
 * credentials or authorization; only their creating manager recognizes them.
 * close() is idempotent and cannot release a still-running native child. There
 * is intentionally no timeout-based release or process-wide Sharp tuning.
 */
export function createClubOwnerAvatarResourceAdmission(): ClubOwnerAvatarResourceAdmission {
  const scopes = new WeakMap<ClubOwnerAvatarResourceScope, { closed: boolean; children: number }>();
  let active: ClubOwnerAvatarResourceScope | null = null, nativeBusy = false;
  const stateFor = (scope: ClubOwnerAvatarResourceScope) => {
    const state = scopes.get(scope);
    if (!state) throw Error("AVATAR_RESOURCE_SCOPE_INVALID");
    return state;
  };
  const assertOpen = (scope: ClubOwnerAvatarResourceScope) => {
    if (stateFor(scope).closed || active !== scope) throw Error("AVATAR_RESOURCE_SCOPE_CLOSED");
  };
  const releaseIfFinished = (scope: ClubOwnerAvatarResourceScope) => {
    const state = stateFor(scope);
    if (state.closed && state.children === 0 && active === scope) active = null;
  };
  return Object.freeze({
    tryAcquire() {
      if (active !== null) return null;
      const scope = Object.freeze({}) as ClubOwnerAvatarResourceScope;
      scopes.set(scope, { closed: false, children: 0 }); active = scope;
      return scope;
    },
    assertOpen,
    close(scope) { stateFor(scope).closed = true; releaseIfFinished(scope); },
    async runNative<T>(scope: ClubOwnerAvatarResourceScope, work: () => PromiseLike<T> | T): Promise<T> {
      assertOpen(scope);
      if (nativeBusy) throw Error("AVATAR_RESOURCE_BUSY");
      const state = stateFor(scope); nativeBusy = true; state.children++;
      try {
        // Invoke synchronously: callers snapshot bytes only after admission,
        // before their first await. Await the ORIGINAL job, never its race.
        return await work();
      } finally {
        state.children--; nativeBusy = false; releaseIfFinished(scope);
      }
    },
  });
}

const PROCESS_SLOT = Symbol.for("touchline.club-owner-avatar.resource-admission.v1");
/** Shared across factories/module copies in this JS runtime. Not a distributed
 * limit: workers/replicas and unrelated Sharp work remain outside its scope.
 * A native job that never settles holds the slot until supervised restart.
 * This does not bound RSS, hosted ingress prebuffering or transport teardown.
 */
export function getClubOwnerAvatarResourceAdmission(): ClubOwnerAvatarResourceAdmission {
  const runtime = globalThis as typeof globalThis & { [PROCESS_SLOT]?: ClubOwnerAvatarResourceAdmission };
  if (!Object.hasOwn(runtime, PROCESS_SLOT)) Object.defineProperty(runtime, PROCESS_SLOT, { value: createClubOwnerAvatarResourceAdmission() });
  return runtime[PROCESS_SLOT]!;
}
