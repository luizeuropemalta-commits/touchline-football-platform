import type { ReactNode } from "react";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { buildTouchlineCardLeadershipValue, EMPTY_CARD_LEADERSHIP_AUTHORITY } from "@/lib/touchlineArena/card-leadership-authority";
import { TouchlineCardLeadershipProvider } from "./TouchlineCardLeadershipProvider";

/** Only public ranking data crosses this server boundary; never user contracts. */
export default async function TouchlineCardLeadershipBoundary({ enabled, children }: {
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <TouchlineCardLeadershipProvider value={EMPTY_CARD_LEADERSHIP_AUTHORITY}>{children}</TouchlineCardLeadershipProvider>;
  const [playerRanking, coaches] = await Promise.all([
    loadTouchLineActiveRanking().catch(() => null),
    loadTouchLineCoachRanking().catch(() => null),
  ]);
  return <TouchlineCardLeadershipProvider livePlayerUpdates value={buildTouchlineCardLeadershipValue(playerRanking, coaches)}>{children}</TouchlineCardLeadershipProvider>;
}
