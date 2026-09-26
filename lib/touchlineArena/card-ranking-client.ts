"use client";

import { useSyncExternalStore } from "react";
import {
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";

const ACTIVE_RANKING_URL = "/api/touchline-arena/card-ranking/active";

let currentState: TouchlineActiveRankingState = TOUCHLINE_PRESEASON_RANKING_STATE;
export type TouchlineRankingRead = Readonly<{ state: TouchlineActiveRankingState; revision: number; requestEpoch: number }>;
let requestEpoch = 0;
export const getTouchlineRankingRequestEpoch = () => requestEpoch;
const NO_COMPLETED_READ: TouchlineRankingRead | null = null;
let completedRead: TouchlineRankingRead | null = null;
export const getTouchlineRankingReadRevision = () => completedRead?.revision ?? 0;
const getCompletedRead = () => completedRead;
const getNoCompletedRead = () => NO_COMPLETED_READ;
let activeRequest: Promise<void> | null = null;
let refreshTimer: number | null = null;
const listeners = new Set<() => void>();
const subscribeWithoutUpdates = () => () => undefined;
const getActiveRankingSnapshot = () => currentState;
const getPreseasonRankingSnapshot = () => TOUCHLINE_PRESEASON_RANKING_STATE;

function emitChange() {
  for (const listener of listeners) listener();
}

function loadActiveRanking() {
  if (activeRequest || typeof window === "undefined") return;
  const startedEpoch = ++requestEpoch;

  const controller = new AbortController();
  const deadline = window.setTimeout(() => controller.abort(), 8_000);
  activeRequest = fetch(ACTIVE_RANKING_URL, { cache: "no-store", signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) return;
      const nextState = parseTouchlineActiveRankingState(await response.json());
      if (!nextState) return;
      currentState = nextState;
      completedRead = { state: nextState, revision: (completedRead?.revision ?? 0) + 1, requestEpoch: startedEpoch };
      emitChange();
    })
    .catch(() => undefined)
    .finally(() => {
      window.clearTimeout(deadline);
      activeRequest = null;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  loadActiveRanking();
  if (listeners.size === 1 && typeof window !== "undefined") {
    refreshTimer = window.setInterval(loadActiveRanking, 45_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
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
