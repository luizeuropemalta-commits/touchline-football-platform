"use client";

import { useMemo } from "react";
import { useTouchlineActiveRanking } from "./card-ranking-client";
import { cardGoalsLeaderIds } from "./card-goals-leadership.ts";

const EMPTY: readonly string[] = Object.freeze([]);

/** Share Crown's single ranking subscription and immutable publication. No
 * independent provider query, manual award selection, or second polling loop.
 * Caller retains its canonical publication and allowed-path checks. */
export function useTouchlineGoldenBootPlayers(enabled: boolean): readonly string[] {
  const ranking = useTouchlineActiveRanking(enabled);
  return useMemo(() => enabled && ranking.phase === "ranked" && ranking.snapshotId
    ? cardGoalsLeaderIds(ranking.cardGoals, ranking.snapshotId) : EMPTY,
  [enabled, ranking]);
}
