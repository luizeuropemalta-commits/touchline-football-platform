declare const controlBrand: unique symbol;
export type AvatarControlScope = Readonly<{ [controlBrand]: true }>;

/** A separate control lane: one request, zero queue. Native image work cannot
 * consume it. Closing stops new work but retains capacity until every ORIGINAL
 * tracked auth/RPC promise settles, not until its caller's timeout race settles.
 * Process-local only; SQL remains the cross-worker authority. */
export function createClubOwnerAvatarControlAdmission() {
  let active: AvatarControlScope | null = null;
  const states = new WeakMap<AvatarControlScope, { closed: boolean; children: number }>();
  const state = (scope: AvatarControlScope) => {
    const result = states.get(scope); if (!result) throw Error("AVATAR_CONTROL_SCOPE_INVALID"); return result;
  };
  const assertOpen = (scope: AvatarControlScope) => {
    if (active !== scope || state(scope).closed) throw Error("AVATAR_CONTROL_SCOPE_CLOSED");
  };
  const release = (scope: AvatarControlScope) => {
    const value = state(scope); if (value.closed && value.children === 0 && active === scope) active = null;
  };
  return Object.freeze({
    tryAcquire() {
      if (active) return null;
      const scope = Object.freeze({}) as AvatarControlScope;
      states.set(scope, { closed: false, children: 0 }); active = scope; return scope;
    },
    assertOpen,
    close(scope: AvatarControlScope) { state(scope).closed = true; release(scope); },
    async track<T>(scope: AvatarControlScope, work: () => PromiseLike<T>): Promise<T> {
      assertOpen(scope); const value = state(scope); value.children++;
      try { return await work(); } finally { value.children--; release(scope); }
    },
  });
}
const SLOT = Symbol.for("touchline.club-owner-avatar.control-admission.v1");
export function getClubOwnerAvatarControlAdmission() {
  const runtime = globalThis as typeof globalThis & { [SLOT]?: ReturnType<typeof createClubOwnerAvatarControlAdmission> };
  if (!Object.hasOwn(runtime, SLOT)) Object.defineProperty(runtime, SLOT, { value: createClubOwnerAvatarControlAdmission() });
  return runtime[SLOT]!;
}
