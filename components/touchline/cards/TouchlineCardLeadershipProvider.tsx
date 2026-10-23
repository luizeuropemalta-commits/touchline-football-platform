"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  allowsInheritedCardLeadership,
  EMPTY_CARD_LEADERSHIP_AUTHORITY,
  resetCardLeadershipSeed,
  type TouchlineCardLeadershipAuthority,
} from "@/lib/touchlineArena/card-leadership-authority";
import { reconcileCardLeadershipSeed, type CardLeadershipSeedState } from "@/lib/touchlineArena/card-leadership-seed-state";
import { getTouchlineRankingReadRevision, getTouchlineRankingRequestEpoch, useTouchlineRankingRead } from "@/lib/touchlineArena/card-ranking-client";
import TouchlineLivePresentationRefresh from "../TouchlineLivePresentationRefresh";

const AuthorityContext = createContext<TouchlineCardLeadershipAuthority | null>(null);

/** A page may pin this provider to the same immutable snapshot as its cards. */
export function TouchlineCardLeadershipProvider({ value, children, livePlayerUpdates = false, liveCoachUpdates = false, expectedSeasonId }: {
  value: TouchlineCardLeadershipAuthority;
  children: ReactNode;
  livePlayerUpdates?: boolean;
  liveCoachUpdates?: boolean;
  expectedSeasonId?: string;
}) {
  const pathname = usePathname();
  const allowed = allowsInheritedCardLeadership(pathname);
  const liveUpdates = livePlayerUpdates || liveCoachUpdates;
  // Existing store results pre-dating this mount cannot replace its server seed.
  const scopeKey = JSON.stringify([pathname, allowed, livePlayerUpdates, liveCoachUpdates, expectedSeasonId ?? null]);
  const seedKey = `${scopeKey}:${value.playerRanking?.phase}:${value.playerRanking?.leagueKey}:${value.playerRanking?.seasonId}:${value.playerRanking?.snapshotId}:${value.playerRanking?.publishedAt}:${value.coachRanking?.phase}:${value.coachRanking?.seasonId}:${value.coachRanking?.snapshotId}:${value.coachLeader?.snapshotId}`;
  const [accepted, setAccepted] = useState<CardLeadershipSeedState>(() => ({ seedKey, scopeKey, hasAcceptedRead: false, state: resetCardLeadershipSeed(value, getTouchlineRankingReadRevision(), getTouchlineRankingRequestEpoch()) }));
  const read = useTouchlineRankingRead(liveUpdates && allowed);
  const scopedRead = expectedSeasonId && read && (
    read.state.seasonId && read.state.seasonId !== expectedSeasonId
    || read.coachRanking?.seasonId && read.coachRanking.seasonId !== expectedSeasonId
  ) ? null : read;
  const reconciled = reconcileCardLeadershipSeed(accepted, {
    seedKey, scopeKey, value, read: scopedRead,
    revision: getTouchlineRankingReadRevision(), requestFloor: getTouchlineRankingRequestEpoch(),
  });
  // Reconcile the seed in place: never key/remount the gameplay subtree.
  if (accepted !== reconciled) setAccepted(reconciled);
  const resolved = !allowed ? EMPTY_CARD_LEADERSHIP_AUTHORITY : liveUpdates ? reconciled.state.current : value;
  // These root consumers have no page-owned presentation refresh. Its pointer
  // hint requests new canonical server seeds; it never supplies crown authority.
  const refreshRootSeed = livePlayerUpdates && allowed && (pathname === "/arena" || pathname === "/my-club" || pathname === "/clubowner");
  return <AuthorityContext.Provider value={resolved}>
    {refreshRootSeed ? <TouchlineLivePresentationRefresh
      initialPlayerRankingSnapshotId={value.playerRanking?.snapshotId ?? null}
      initialCoachRankingSnapshotId={value.coachLeader?.snapshotId ?? null}
    /> : null}
    {children}
  </AuthorityContext.Provider>;
}

export function useTouchlineCardLeadershipAuthority() {
  const authority = useContext(AuthorityContext);
  const pathname = usePathname();
  return allowsInheritedCardLeadership(pathname) ? authority : EMPTY_CARD_LEADERSHIP_AUTHORITY;
}
