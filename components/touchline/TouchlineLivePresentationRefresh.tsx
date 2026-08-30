"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  parseTouchlineLivePresentationState,
  mergeTouchlineLivePresentationRevision,
  touchlineLivePresentationRevisionChanged,
  type TouchlineLivePresentationState,
} from "@/lib/touchlineArena/live-presentation-state";

const STATE_URL = "/api/touchline-arena/live-presentation-state";
const REQUEST_TIMEOUT_MS = 8_000;
const ERROR_RETRY_MS = 30_000;
const MAX_RESUME_TIMER_MS = 60 * 60 * 1_000;

type Props = {
  initialPlayerRankingSnapshotId?: string | null;
  initialCoachRankingSnapshotId?: string | null;
};

/**
 * One invisible boundary refreshes the current Server Component tree when an
 * immutable ranking snapshot changes. router.refresh preserves browser state
 * and scroll; individual cards and open Zooms never issue their own requests.
 */
export default function TouchlineLivePresentationRefresh({
  initialPlayerRankingSnapshotId,
  initialCoachRankingSnapshotId,
}: Props) {
  const router = useRouter();
  const watchesPlayerRanking = initialPlayerRankingSnapshotId !== undefined;
  const watchesCoachRanking = initialCoachRankingSnapshotId !== undefined;
  const latestVerifiedRef = useRef<Pick<
    TouchlineLivePresentationState,
    "playerRankingSnapshotId" | "coachRankingSnapshotId"
  >>({
    playerRankingSnapshotId: initialPlayerRankingSnapshotId ?? null,
    coachRankingSnapshotId: initialCoachRankingSnapshotId ?? null,
  });

  useEffect(() => {
    latestVerifiedRef.current = {
      playerRankingSnapshotId: watchesPlayerRanking
        ? initialPlayerRankingSnapshotId ?? null
        : latestVerifiedRef.current.playerRankingSnapshotId,
      coachRankingSnapshotId: watchesCoachRanking
        ? initialCoachRankingSnapshotId ?? null
        : latestVerifiedRef.current.coachRankingSnapshotId,
    };
  }, [
    initialCoachRankingSnapshotId,
    initialPlayerRankingSnapshotId,
    watchesCoachRanking,
    watchesPlayerRanking,
  ]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let requestController: AbortController | null = null;
    let requestDeadline: number | null = null;

    const scheduleAfter = (delay: number) => {
      if (disposed || document.hidden || !navigator.onLine) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), delay);
    };

    const clearScheduledWork = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (requestDeadline !== null) window.clearTimeout(requestDeadline);
      requestDeadline = null;
      requestController?.abort();
      requestController = null;
    };

    const schedule = (state: TouchlineLivePresentationState) => {
      if (disposed || document.hidden || !navigator.onLine) return;
      let delay = state.pollAfterMs;
      if (delay === null && state.resumeAt) {
        delay = Math.min(
          MAX_RESUME_TIMER_MS,
          Math.max(1_000, Date.parse(state.resumeAt) - Date.now()),
        );
      }
      if (delay === null || !Number.isFinite(delay)) return;
      scheduleAfter(delay);
    };

    async function load() {
      if (disposed || document.hidden || !navigator.onLine || requestController) return;
      const controller = new AbortController();
      requestController = controller;
      const deadline = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      requestDeadline = deadline;
      try {
        const response = await fetch(STATE_URL, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (disposed || requestController !== controller) return;
        if (!response.ok) {
          scheduleAfter(ERROR_RETRY_MS);
          return;
        }
        const state = parseTouchlineLivePresentationState(await response.json());
        if (!state?.available) {
          scheduleAfter(ERROR_RETRY_MS);
          return;
        }
        const trackedState = mergeTouchlineLivePresentationRevision(
          latestVerifiedRef.current,
          state,
          { player: watchesPlayerRanking, coach: watchesCoachRanking },
        );
        const changed = touchlineLivePresentationRevisionChanged(latestVerifiedRef.current, trackedState);
        latestVerifiedRef.current = trackedState;
        if (changed) startTransition(() => router.refresh());
        schedule(state);
      } catch {
        // Preserve the last verified Server Component tree. Visibility/online
        // recovery or the next scheduled read will retry without clearing it.
        if (requestController === controller) scheduleAfter(ERROR_RETRY_MS);
      } finally {
        window.clearTimeout(deadline);
        if (requestDeadline === deadline) requestDeadline = null;
        if (requestController === controller) requestController = null;
      }
    }

    const resume = () => {
      if (disposed || document.hidden || !navigator.onLine) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void load();
    };
    const pause = () => {
      if (!document.hidden && navigator.onLine) return;
      clearScheduledWork();
    };
    const handleVisibility = () => document.hidden ? pause() : resume();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", resume);
    window.addEventListener("offline", pause);
    void load();

    return () => {
      disposed = true;
      clearScheduledWork();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", pause);
    };
  }, [router, watchesCoachRanking, watchesPlayerRanking]);

  return null;
}
