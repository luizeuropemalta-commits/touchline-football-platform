import type { ReactNode } from "react";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { buildTouchlineCardLeadershipValue, EMPTY_CARD_LEADERSHIP_AUTHORITY } from "@/lib/touchlineArena/card-leadership-authority";
import { TouchlineCardLeadershipProvider } from "./TouchlineCardLeadershipProvider";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";

export type TouchlineCardLeadershipScope = "all" | "coach-only";

/** Only public ranking data crosses this server boundary; never user contracts. */
export default async function TouchlineCardLeadershipBoundary({ enabled, children, scope = "all" }: {
  enabled: boolean;
  children: ReactNode;
  scope?: TouchlineCardLeadershipScope;
}) {
  if (!enabled) return <TouchlineCardLeadershipProvider value={EMPTY_CARD_LEADERSHIP_AUTHORITY}>{children}</TouchlineCardLeadershipProvider>;
  const [playerRanking, coaches] = await Promise.all([
    scope === "coach-only" ? Promise.resolve(null) : resolveServerReadWithin(loadTouchLineActiveRanking(), null, 8_000),
    resolveServerReadWithin(loadTouchLineCoachRanking(), null, 8_000),
  ]);
  return <TouchlineCardLeadershipProvider livePlayerUpdates={scope === "all"} liveCoachUpdates value={buildTouchlineCardLeadershipValue(playerRanking, coaches)}>{children}</TouchlineCardLeadershipProvider>;
}
