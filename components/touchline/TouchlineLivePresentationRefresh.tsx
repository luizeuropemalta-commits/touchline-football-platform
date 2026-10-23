"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  mergeTouchlineLivePresentationRevision,
  touchlineLivePresentationRevisionChanged,
  type TouchlineLivePresentationState,
} from "@/lib/touchlineArena/live-presentation-state";
import { touchlineLivePresentationStore } from "@/lib/touchlineArena/live-presentation-client-store";

type Props = {
  initialPlayerRankingSnapshotId?: string | null;
  initialCoachRankingSnapshotId?: string | null;
  /** Server-only facts (official XI/table cache) are not yet in the sports envelope. */
  serverRefreshAfterMs?: number | null;
  /** One context boundary such as T−24/T−1, checked on the shared read. */
  serverRefreshAt?: number | null;
  serverRefreshScope?: string | null;
};

/**
 * One invisible boundary refreshes the current Server Component tree when an
 * immutable ranking snapshot changes. router.refresh preserves browser state
 * and scroll; individual cards and open Zooms never issue their own requests.
 */
export default function TouchlineLivePresentationRefresh({
  initialPlayerRankingSnapshotId,
  initialCoachRankingSnapshotId,
  serverRefreshAfterMs = null,
  serverRefreshAt = null,
  serverRefreshScope = null,
}: Props) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const refreshOwnerRef = useRef({});
  const isRefreshingRef = useRef(false);
  const lastServerRefreshRef = useRef<number | null>(null);
  const wakesRef = useRef({ scope: serverRefreshScope, pending: new Set<number>(), acknowledged: new Set<number>() });
  useEffect(() => {
    if (wakesRef.current.scope !== serverRefreshScope) {
      wakesRef.current = { scope: serverRefreshScope, pending: new Set(), acknowledged: new Set() };
    }
    // Retain a deadline crossed before an RSC/clock rerender moves its prop
    // to the next future boundary. Only an accepted shared read acknowledges it.
    if (serverRefreshAt !== null && Number.isFinite(serverRefreshAt)
      && !wakesRef.current.acknowledged.has(serverRefreshAt)) wakesRef.current.pending.add(serverRefreshAt);
  }, [serverRefreshAt, serverRefreshScope]);
  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
    if (!isRefreshing) touchlineLivePresentationStore.completeRouteRefresh(refreshOwnerRef.current);
  }, [isRefreshing]);
  useEffect(() => {
    const owner = refreshOwnerRef.current;
    return () => touchlineLivePresentationStore.completeRouteRefresh(owner);
  }, []);
  const watchesPlayerRanking = initialPlayerRankingSnapshotId !== undefined;
  const watchesCoachRanking = initialCoachRankingSnapshotId !== undefined;
  const hasObservedPublicationRef = useRef(false);
  const latestVerifiedRef = useRef<Pick<
    TouchlineLivePresentationState,
    "playerRankingSnapshotId" | "coachRankingSnapshotId" | "livePresentationSnapshotId"
  >>({
    playerRankingSnapshotId: initialPlayerRankingSnapshotId ?? null,
    coachRankingSnapshotId: initialCoachRankingSnapshotId ?? null,
    livePresentationSnapshotId: null,
  });

  useEffect(() => {
    // A late Server Component tree must not roll back an acknowledged client
    // signal. Before the first read, updated SSR props remain the baseline.
    if (hasObservedPublicationRef.current) return;
    latestVerifiedRef.current = {
      playerRankingSnapshotId: watchesPlayerRanking
        ? initialPlayerRankingSnapshotId ?? null
        : latestVerifiedRef.current.playerRankingSnapshotId,
      coachRankingSnapshotId: watchesCoachRanking
        ? initialCoachRankingSnapshotId ?? null
        : latestVerifiedRef.current.coachRankingSnapshotId,
      livePresentationSnapshotId: latestVerifiedRef.current.livePresentationSnapshotId,
    };
  }, [
    initialCoachRankingSnapshotId,
    initialPlayerRankingSnapshotId,
    watchesCoachRanking,
    watchesPlayerRanking,
  ]);

  useEffect(() => {
    lastServerRefreshRef.current ??= Date.now();
    return touchlineLivePresentationStore.subscribe(({ state }, claimRefresh, refreshPending) => {
      if (isRefreshingRef.current || refreshPending) return;
      const trackedState = mergeTouchlineLivePresentationRevision(
        latestVerifiedRef.current,
        state,
        { player: watchesPlayerRanking, coach: watchesCoachRanking },
      );
      // No shared digest accompanies the SSR seed yet. Its rendered score
      // may therefore predate even the first known publication. Refresh once
      // for that publication; retain the acknowledged digest across renders
      // and effect restarts so router.refresh cannot create a refresh loop.
      // The merge preserves a known digest when an absent/null one arrives.
      const changed = touchlineLivePresentationRevisionChanged(latestVerifiedRef.current, trackedState);
      const previousRevision = latestVerifiedRef.current;
      const previouslyObserved = hasObservedPublicationRef.current;
      const previousRefreshAt = lastServerRefreshRef.current;
      latestVerifiedRef.current = trackedState;
      hasObservedPublicationRef.current = true;
      const now = Date.now();
      const periodicDue = serverRefreshAfterMs !== null && Number.isFinite(serverRefreshAfterMs)
        && serverRefreshAfterMs >= 10_000 && now - (lastServerRefreshRef.current ?? now) >= serverRefreshAfterMs;
      const dueWakes = [...wakesRef.current.pending].filter(at => at <= now);
      const wakeDue = dueWakes.length > 0;
      if (changed || periodicDue || wakeDue) {
        // A false claim means another subscriber has refreshed this same route
        // for this accepted read. Acknowledge it too, avoiding a staggered loop.
        lastServerRefreshRef.current = now;
        for (const at of dueWakes) { wakesRef.current.pending.delete(at); wakesRef.current.acknowledged.add(at); }
        if (claimRefresh(refreshOwnerRef.current)) startTransition(() => {
          try { router.refresh(); }
          catch (error) {
            latestVerifiedRef.current = previousRevision;
            hasObservedPublicationRef.current = previouslyObserved;
            lastServerRefreshRef.current = previousRefreshAt;
            for (const at of dueWakes) { wakesRef.current.acknowledged.delete(at); wakesRef.current.pending.add(at); }
            touchlineLivePresentationStore.completeRouteRefresh(refreshOwnerRef.current);
            throw error;
          }
        });
      }
    });
  }, [router, watchesCoachRanking, watchesPlayerRanking, serverRefreshAfterMs, startTransition]);

  return null;
}
