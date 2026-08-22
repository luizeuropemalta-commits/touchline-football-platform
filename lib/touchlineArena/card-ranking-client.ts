"use client";

import { useSyncExternalStore } from "react";
import {
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";

const ACTIVE_RANKING_URL = "/api/touchline-arena/card-ranking/active";

let currentState: TouchlineActiveRankingState = TOUCHLINE_PRESEASON_RANKING_STATE;
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

  const controller = new AbortController();
  const deadline = window.setTimeout(() => controller.abort(), 8_000);
  activeRequest = fetch(ACTIVE_RANKING_URL, { cache: "no-store", signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) return;
      const nextState = parseTouchlineActiveRankingState(await response.json());
      if (!nextState) return;
      currentState = nextState;
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
