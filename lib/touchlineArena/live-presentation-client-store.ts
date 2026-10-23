"use client";

import { parseTouchlineLivePresentationState, type TouchlineLivePresentationState } from "./live-presentation-state";
import { parseTouchlineSportsPublication, type TouchlineSportsPublication } from "./sports-publication";

const STATE_URL = "/api/touchline-arena/live-presentation-state";
const PUBLICATION_URL = "/api/touchline-arena/sports-publication";
const REQUEST_TIMEOUT_MS = 8_000;
const ERROR_RETRY_MS = 30_000;
const IDLE_RECHECK_MS = 60_000;
const MAX_RESUME_TIMER_MS = 60 * 60 * 1_000;

export type TouchlinePresentationRead = Readonly<{
  state: TouchlineLivePresentationState;
  // Local accepted-read sequence, NOT an ordering of opaque publication IDs.
  generation: number;
  requestEpoch: number;
  receivedAt: number;
  sportsPublication: TouchlineSportsPublication | null;
}>;

type Listener = (read: TouchlinePresentationRead, claimRefresh: (owner?: object) => boolean, refreshPending: boolean) => void;

function freezePublication<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePublication(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * One public publication signal per browser tab. No SSR seed, private account
 * data or provider call enters this store. Sports consumers share one frozen
 * publication, accepted together with its signal; no per-card poller.
 */
export function createTouchlineLivePresentationStore() {
  const listeners = new Map<Listener, boolean>();
  let current: TouchlinePresentationRead | null = null;
  let requestEpoch = 0;
  let readAgain = false;
  let routeRefreshOwner: object | null = null;
  let timer: number | null = null;
  let request: { controller: AbortController; deadline: number } | null = null;

  const canRead = () => listeners.size > 0 && !document.hidden && navigator.onLine;

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }

  function cancelRequest() {
    readAgain = false;
    const previous = request;
    request = null;
    if (!previous) return;
    window.clearTimeout(previous.deadline);
    previous.controller.abort();
  }

  function scheduleAfter(delay: number) {
    if (!canRead()) return;
    clearTimer();
    timer = window.setTimeout(() => {
      timer = null;
      void load();
    }, delay);
  }

  function schedule(state: TouchlineLivePresentationState) {
    let delay = state.pollAfterMs;
    if (delay === null && state.resumeAt) {
      delay = Math.min(MAX_RESUME_TIMER_MS, Math.max(1_000, Date.parse(state.resumeAt) - Date.now()));
    }
    // An idle publication can be replaced by a correction or a new schedule.
    // Recheck our persisted signal; this never requests the sports provider.
    scheduleAfter(delay !== null && Number.isFinite(delay) ? Math.min(delay, IDLE_RECHECK_MS) : IDLE_RECHECK_MS);
  }

  async function load() {
    if (!canRead() || request) return;
    clearTimer();
    const controller = new AbortController();
    const startedEpoch = ++requestEpoch;
    const deadline = window.setTimeout(() => {
      if (request?.controller !== controller) return;
      // Release even if a body reader never settles after abort. Its eventual
      // result cannot replace the next read because controller identity changed.
      cancelRequest();
      scheduleAfter(ERROR_RETRY_MS);
    }, REQUEST_TIMEOUT_MS);
    request = { controller, deadline };
    const isCurrent = () => request?.controller === controller && !controller.signal.aborted && canRead();
    try {
      const response = await fetch(STATE_URL, { cache: "no-store", signal: controller.signal });
      if (!isCurrent()) return;
      if (!response.ok) {
        scheduleAfter(ERROR_RETRY_MS);
        return;
      }
      const payload: unknown = await response.json();
      if (!isCurrent()) return;
      const state = parseTouchlineLivePresentationState(payload);
      if (!state?.available) {
        scheduleAfter(ERROR_RETRY_MS);
        return;
      }
      let sportsPublication = current?.sportsPublication ?? null;
      if ([...listeners.values()].some(Boolean)) {
        if (!state.livePresentationSnapshotId) {
          scheduleAfter(ERROR_RETRY_MS);
          return;
        }
        if (sportsPublication?.publication.contentDigest !== state.livePresentationSnapshotId
          || sportsPublication.publication.playerRankingSnapshotId !== state.playerRankingSnapshotId
          || sportsPublication.publication.coachRankingSnapshotId !== state.coachRankingSnapshotId) {
          const publicationResponse = await fetch(PUBLICATION_URL, { cache: "no-store", signal: controller.signal });
          if (!isCurrent()) return;
          if (!publicationResponse.ok) { scheduleAfter(ERROR_RETRY_MS); return; }
          const body: unknown = await publicationResponse.json();
          if (!isCurrent()) return;
          const envelope = body && typeof body === "object" ? body as { ok?: unknown; data?: unknown } : null;
          const publication = envelope?.ok === true ? parseTouchlineSportsPublication(envelope.data) : null;
          if (!publication || publication.publication.contentDigest !== state.livePresentationSnapshotId
            || publication.publication.playerRankingSnapshotId !== state.playerRankingSnapshotId
            || publication.publication.coachRankingSnapshotId !== state.coachRankingSnapshotId) {
            // A pointer can advance between the signal and payload read. Do
            // not combine generations; re-read both through the same transport.
            scheduleAfter(ERROR_RETRY_MS);
            return;
          }
          sportsPublication = freezePublication(publication);
        }
      }
      current = Object.freeze({
        state: freezePublication(state),
        generation: (current?.generation ?? 0) + 1,
        requestEpoch: startedEpoch,
        receivedAt: Date.now(),
        sportsPublication,
      });
      // All mounted boundaries see the accepted read before the next read.
      // One refresh updates their shared route tree, regardless of watch masks.
      let claimed = false;
      const refreshPending = routeRefreshOwner !== null;
      const claimRefresh = (owner?: object) => {
        if (claimed || refreshPending || !isCurrent()) return false;
        claimed = true;
        if (owner) routeRefreshOwner = owner;
        return true;
      };
      for (const listener of [...listeners.keys()]) {
        if (!listeners.has(listener)) continue;
        try {
          listener(current, claimRefresh, refreshPending);
        } catch (error) {
          // A broken consumer must not prevent the other consumers or retry.
          globalThis.reportError?.(error);
        }
      }
      if (isCurrent()) schedule(state);
    } catch {
      // An unavailable response is not an authoritative empty publication.
      if (isCurrent()) scheduleAfter(ERROR_RETRY_MS);
    } finally {
      window.clearTimeout(deadline);
      if (request?.controller === controller) {
        request = null;
        if (readAgain) {
          readAgain = false;
          void load();
        }
      }
    }
  }

  function resume() {
    if (!canRead()) return;
    void load();
  }

  function pause() {
    if (!document.hidden && navigator.onLine) return;
    clearTimer();
    cancelRequest();
  }

  const handleVisibility = () => document.hidden ? pause() : resume();

  return {
    getSnapshot: () => current,
    getRequestEpoch: () => requestEpoch,
    completeRouteRefresh(owner: object) {
      if (routeRefreshOwner === owner) routeRefreshOwner = null;
    },
    revalidate() {
      if (typeof window === "undefined" || !canRead()) return;
      if (request) readAgain = true;
      else void load();
    },
    subscribe(listener: Listener, includeSports = false) {
      // Effects subscribe only in the browser; SSR must never mutate a
      // process-wide store on behalf of a request or a user's rendered seed.
      if (typeof window === "undefined") return () => undefined;
      listeners.set(listener, includeSports);
      if (listeners.size === 1) {
        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("online", resume);
        window.addEventListener("offline", pause);
      }
      // Do not replay a cached signal over a newly rendered SSR tree. A newly
      // mounted route needs a fresh read immediately, not the previous route's
      // remaining 10/30-second timer. Concurrent mounts join the same request.
      void load();
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        clearTimer();
        cancelRequest();
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("online", resume);
        window.removeEventListener("offline", pause);
      };
    },
  };
}

export const touchlineLivePresentationStore = createTouchlineLivePresentationStore();
