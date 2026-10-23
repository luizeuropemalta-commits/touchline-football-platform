"use client";

import { useMemo } from "react";
import { useTouchlineActiveRanking } from "./card-ranking-client";
import { cardGoalsLeaderIds } from "./card-goals-leadership.ts";
import type { TouchlineActiveRankingState } from "./card-ranking-live";

const EMPTY: readonly string[] = Object.freeze([]);

/** Share Crown's single ranking subscription and immutable publication. No
 * independent provider query, manual award selection, or second polling loop.
 * Caller retains its canonical publication and allowed-path checks. */
export function useTouchlineGoldenBootPlayers(enabled: boolean, pinnedRanking?: TouchlineActiveRankingState | null): readonly string[] {
  // An explicitly scoped card (including a pinned null) must never borrow an
  // award from another current publication. Only legacy unscoped callers poll.
  const fallback = useTouchlineActiveRanking(enabled && pinnedRanking === undefined);
  const ranking = pinnedRanking === undefined ? fallback : pinnedRanking;
  return useMemo(() => enabled && ranking?.phase === "ranked" && ranking.snapshotId
    ? cardGoalsLeaderIds(ranking.cardGoals, ranking.snapshotId) : EMPTY,
  [enabled, ranking]);
}
