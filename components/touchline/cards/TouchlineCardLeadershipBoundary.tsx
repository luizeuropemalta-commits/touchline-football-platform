import type { ReactNode } from "react";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { buildTouchlineCardLeadershipValue, EMPTY_CARD_LEADERSHIP_AUTHORITY } from "@/lib/touchlineArena/card-leadership-authority";
import { TouchlineCardLeadershipProvider } from "./TouchlineCardLeadershipProvider";

export type TouchlineCardLeadershipScope = "all" | "coach-only";

/** Only public ranking data crosses this server boundary; never user contracts. */
export default async function TouchlineCardLeadershipBoundary({ enabled, children, scope = "all" }: {
  enabled: boolean;
  children: ReactNode;
  scope?: TouchlineCardLeadershipScope;
}) {
  if (!enabled) return <TouchlineCardLeadershipProvider value={EMPTY_CARD_LEADERSHIP_AUTHORITY}>{children}</TouchlineCardLeadershipProvider>;
  const [playerRanking, coaches] = await Promise.all([
    scope === "coach-only" ? Promise.resolve(null) : loadTouchLineActiveRanking().catch(() => null),
    loadTouchLineCoachRanking().catch(() => null),
  ]);
  return <TouchlineCardLeadershipProvider livePlayerUpdates={scope === "all"} value={buildTouchlineCardLeadershipValue(playerRanking, coaches)}>{children}</TouchlineCardLeadershipProvider>;
}
