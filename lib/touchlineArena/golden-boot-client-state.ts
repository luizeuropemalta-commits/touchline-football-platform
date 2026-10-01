import {
  advanceGoldenBootAuthority,
  createGoldenBootAuthorityState,
  expireGoldenBootAuthority,
  parseGoldenBootPublicAuthority,
  type GoldenBootAuthorityState,
} from "./golden-boot-public-authority";

const MAX_ROUND_TRIP_MS = 5_000;
const MAX_REMAINING_MS = 60_000;

export type GoldenBootClientState = Readonly<{
  authority: GoldenBootAuthorityState | null;
  clock: Readonly<{ serverNowMs: number; performanceMs: number }> | null;
  lastPerformanceMs: number | null;
  requestId: number;
  pending: Readonly<{ requestId: number; startedAtMs: number }> | null;
}>;

/** Fetch-only: no SSR seed, wall clock, persistence, timers or network side effects.
 * Keep the returned state between calls. Use performance.now() from one realm.
 * One request may be active; begin returns null instead of overlapping it. Pass
 * its returned ID to receive/fail. Tick before rendering and on an expiry timer;
 * revoke on visibility hidden/offline/unmount, even if a fetch is still pending.
 * A known canonical scope is fixed for this instance; an intentional season
 * transition requires a new instance, not a replayed response from another scope.
 */
export function createGoldenBootClientState(): GoldenBootClientState {
  return Object.freeze({ authority: null, clock: null, lastPerformanceMs: null,
    requestId: 0, pending: null });
}

function validPerformance(state: GoldenBootClientState, value: number): boolean {
  return Number.isFinite(value) && value >= 0
    && (state.lastPerformanceMs === null || value >= state.lastPerformanceMs);
}

function serverNow(state: GoldenBootClientState, performanceMs: number): number | null {
  if (!state.clock) return null;
  const value = Math.ceil(state.clock.serverNowMs + performanceMs - state.clock.performanceMs);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function revoke(state: GoldenBootClientState): GoldenBootClientState {
  return Object.freeze({ ...state, pending: null,
    authority: state.authority
      ? Object.freeze({ ...state.authority, current: null }) : null });
}

export function tickGoldenBootClient(
  state: GoldenBootClientState, performanceMs: number,
): GoldenBootClientState {
  if (!validPerformance(state, performanceMs)) return revoke(state);
  const now = serverNow(state, performanceMs);
  const next = Object.freeze({ ...state, lastPerformanceMs: performanceMs,
    authority: state.authority
      ? expireGoldenBootAuthority(state.authority, now ?? Number.NaN) : null });
  if ((state.clock && now === null)
      || (state.pending && performanceMs - state.pending.startedAtMs > MAX_ROUND_TRIP_MS)) {
    return revoke(next);
  }
  return next;
}

export function beginGoldenBootClientRequest(
  state: GoldenBootClientState, performanceMs: number,
): Readonly<{ state: GoldenBootClientState; requestId: number | null }> {
  const valid = validPerformance(state, performanceMs);
  const next = tickGoldenBootClient(state, performanceMs);
  if (!valid || next.pending || next.requestId >= Number.MAX_SAFE_INTEGER) {
    return { state: next, requestId: null };
  }
  const requestId = next.requestId + 1;
  return { requestId, state: Object.freeze({ ...next, requestId,
    pending: Object.freeze({ requestId, startedAtMs: performanceMs }) }) };
}

export function failGoldenBootClientRequest(
  state: GoldenBootClientState, requestId: number, performanceMs: number,
): GoldenBootClientState {
  if (!state.pending || state.pending.requestId !== requestId) return state;
  return revoke(tickGoldenBootClient(state, performanceMs));
}

/** Cancels acceptance of any in-flight response, preserving the reducer watermark.
 * Returning to visibility requires another fetch; equal revisions cannot undo
 * revocation. A new authoritative revision is required by the shared reducer.
 */
export function revokeGoldenBootClient(
  state: GoldenBootClientState, performanceMs: number,
): GoldenBootClientState {
  return revoke(tickGoldenBootClient(state, performanceMs));
}

export function receiveGoldenBootClientResponse(
  state: GoldenBootClientState, requestId: number, envelope: unknown, performanceMs: number,
): GoldenBootClientState {
  // Old callbacks cannot switch scope, rewind the clock, or revoke newer state.
  if (!state.pending || state.pending.requestId !== requestId) return state;
  const roundTripMs = performanceMs - state.pending.startedAtMs;
  const valid = validPerformance(state, performanceMs);
  const next = tickGoldenBootClient(state, performanceMs);
  if (!valid || !next.pending || !Number.isFinite(roundTripMs)
      || roundTripMs < 0 || roundTripMs > MAX_ROUND_TRIP_MS
      || !envelope || typeof envelope !== "object" || Array.isArray(envelope)) return revoke(next);
  const { authority: payload, servedAtMs } = envelope as Record<string, unknown>;
  if (typeof servedAtMs !== "number" || !Number.isFinite(servedAtMs) || servedAtMs < 0) return revoke(next);
  // Full RTT, rounded upward, deliberately overestimates server time. Never
  // regress below elapsed time from the preceding accepted fetch's anchor.
  const now = Math.max(Math.ceil(servedAtMs + roundTripMs), serverNow(next, performanceMs) ?? 0);
  if (!Number.isSafeInteger(now)) return revoke(next);
  const parsed = parseGoldenBootPublicAuthority(payload);
  if (!parsed || (next.authority && (parsed.competitionId !== next.authority.competitionId
      || parsed.seasonId !== next.authority.seasonId))) return revoke(next);
  const remaining = parsed.expiresAt === null ? null : Date.parse(parsed.expiresAt) - now;
  if (remaining !== null && remaining > MAX_REMAINING_MS) return revoke(next);
  if (!next.authority && remaining !== null && remaining <= 0) return revoke(next);
  const authority = next.authority ?? createGoldenBootAuthorityState(parsed.competitionId, parsed.seasonId);
  return Object.freeze({ ...next, pending: null,
    clock: Object.freeze({ serverNowMs: now, performanceMs }),
    authority: advanceGoldenBootAuthority(authority, parsed, now) });
}
