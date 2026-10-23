"use client";

import { useSyncExternalStore } from "react";
import {
  TOUCHLINE_PRESEASON_RANKING_STATE,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";
import { touchlineLivePresentationStore } from "./live-presentation-client-store";
import type { TouchLineCoachRankingState } from "./coach-ranking-server";

let currentState: TouchlineActiveRankingState = TOUCHLINE_PRESEASON_RANKING_STATE;
export type TouchlineRankingRead = Readonly<{ state: TouchlineActiveRankingState; coachRanking: TouchLineCoachRankingState | null; revision: number; requestEpoch: number; publicationDigest: string }>;
export const getTouchlineRankingRequestEpoch = () => touchlineLivePresentationStore.getRequestEpoch();
const NO_COMPLETED_READ: TouchlineRankingRead | null = null;
let completedRead: TouchlineRankingRead | null = null;
export const getTouchlineRankingReadRevision = () => completedRead?.revision ?? 0;
const getCompletedRead = () => completedRead;
const getNoCompletedRead = () => NO_COMPLETED_READ;
let stopShared: (() => void) | null = null;
const listeners = new Set<() => void>();
const subscribeWithoutUpdates = () => () => undefined;
const getActiveRankingSnapshot = () => currentState;
const getPreseasonRankingSnapshot = () => TOUCHLINE_PRESEASON_RANKING_STATE;

function emitChange() {
  for (const listener of listeners) {
    try { listener(); } catch (error) { globalThis.reportError?.(error); }
  }
}

function subscribe(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  listeners.add(listener);
  if (!stopShared) {
    stopShared = touchlineLivePresentationStore.subscribe(read => {
      const publication = read.sportsPublication;
      if (!publication || publication.publication.contentDigest !== read.state.livePresentationSnapshotId
        || publication.publication.playerRankingSnapshotId !== read.state.playerRankingSnapshotId
        || publication.publication.coachRankingSnapshotId !== read.state.coachRankingSnapshotId) return;
      currentState = publication.playerRanking ?? TOUCHLINE_PRESEASON_RANKING_STATE;
      completedRead = { state: currentState, coachRanking: publication.coachRanking, revision: read.generation, requestEpoch: read.requestEpoch,
        publicationDigest: publication.publication.contentDigest };
      emitChange();
    }, true);
  } else {
    // A new server-seeded route must not wait for the previous route's timer.
    touchlineLivePresentationStore.revalidate();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopShared?.();
      stopShared = null;
    }
  };
}

export function useTouchlineActiveRanking(subscribeToUpdates = true) {
  return useSyncExternalStore(
    subscribeToUpdates ? subscribe : subscribeWithoutUpdates,
    subscribeToUpdates ? getActiveRankingSnapshot : getPreseasonRankingSnapshot,
    getPreseasonRankingSnapshot,
  );
}

/** Null means no completed valid response, not an authoritative withdrawal. */
export function useTouchlineRankingRead(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribe : subscribeWithoutUpdates,
    enabled ? getCompletedRead : getNoCompletedRead, getNoCompletedRead);
}
