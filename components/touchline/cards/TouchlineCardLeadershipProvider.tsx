"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  allowsInheritedCardLeadership,
  EMPTY_CARD_LEADERSHIP_AUTHORITY,
  advancePlayerLeadershipRead,
  resetPlayerLeadershipSeed,
  type TouchlineCardLeadershipAuthority,
} from "@/lib/touchlineArena/card-leadership-authority";
import { getTouchlineRankingReadRevision, getTouchlineRankingRequestEpoch, useTouchlineRankingRead } from "@/lib/touchlineArena/card-ranking-client";

const AuthorityContext = createContext<TouchlineCardLeadershipAuthority | null>(null);

/** A page may pin this provider to the same immutable snapshot as its cards. */
export function TouchlineCardLeadershipProvider({ value, children, livePlayerUpdates = false }: {
  value: TouchlineCardLeadershipAuthority;
  children: ReactNode;
  livePlayerUpdates?: boolean;
}) {
  const pathname = usePathname();
  const allowed = allowsInheritedCardLeadership(pathname);
  // Existing store results pre-dating this mount cannot replace its server seed.
  const seedKey = `${allowed}:${livePlayerUpdates}:${value.playerRanking?.phase}:${value.playerRanking?.seasonId}:${value.playerRanking?.snapshotId}:${value.playerRanking?.publishedAt}`;
  const [accepted, setAccepted] = useState(() => ({ seedKey, state: resetPlayerLeadershipSeed(value.playerRanking, getTouchlineRankingReadRevision(), getTouchlineRankingRequestEpoch()) }));
  const read = useTouchlineRankingRead(livePlayerUpdates && allowed);
  const displayed = accepted.seedKey === seedKey
    ? advancePlayerLeadershipRead(accepted.state, read)
    : resetPlayerLeadershipSeed(value.playerRanking, getTouchlineRankingReadRevision(), getTouchlineRankingRequestEpoch());
  // Reconcile the seed in place: never key/remount the gameplay subtree.
  if (accepted.seedKey !== seedKey || accepted.state !== displayed) setAccepted({ seedKey, state: displayed });
  const resolved = !allowed ? EMPTY_CARD_LEADERSHIP_AUTHORITY : livePlayerUpdates ? { ...value, playerRanking: displayed.current } : value;
  return <AuthorityContext.Provider value={resolved}>{children}</AuthorityContext.Provider>;
}

export function useTouchlineCardLeadershipAuthority() {
  const authority = useContext(AuthorityContext);
  const pathname = usePathname();
  return allowsInheritedCardLeadership(pathname) ? authority : EMPTY_CARD_LEADERSHIP_AUTHORITY;
}
