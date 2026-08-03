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
const listeners = new Set<() => void>();
const subscribeWithoutUpdates = () => () => undefined;
const getActiveRankingSnapshot = () => currentState;
const getPreseasonRankingSnapshot = () => TOUCHLINE_PRESEASON_RANKING_STATE;

function emitChange() {
  for (const listener of listeners) listener();
}

function loadActiveRanking() {
  if (activeRequest || typeof window === "undefined") return;

  activeRequest = fetch(ACTIVE_RANKING_URL, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return;
      const nextState = parseTouchlineActiveRankingState(await response.json());
      if (!nextState) return;
      currentState = nextState;
      emitChange();
    })
    .catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  loadActiveRanking();
  return () => listeners.delete(listener);
}

export function useTouchlineActiveRanking(subscribeToUpdates = true) {
  return useSyncExternalStore(
    subscribeToUpdates ? subscribe : subscribeWithoutUpdates,
    subscribeToUpdates ? getActiveRankingSnapshot : getPreseasonRankingSnapshot,
    getPreseasonRankingSnapshot,
  );
}
