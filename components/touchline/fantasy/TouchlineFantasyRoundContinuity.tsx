"use client";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { recoverFantasyRound, type FantasyContinuityState } from "@/lib/touchlineFantasy/round-continuity-client";

export default function TouchlineFantasyRoundContinuity({ accountId, gameweekId, locale, draftLocalesEnabled = false, startAllowed = true, onReady }: {
  accountId: string; gameweekId: string; locale: string; draftLocalesEnabled?: boolean;
  onReady: (state: FantasyContinuityState) => void;
  startAllowed?: boolean;
}) {
  const router = useRouter();
  const attempted = useRef(false), pending = useRef(false), mounted = useRef(false);
  const receive = useRef(onReady);
  useEffect(() => { receive.current = onReady; }, [onReady]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const recover = useCallback(async (prepare: boolean) => {
    if (pending.current) return;
    pending.current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const state = await recoverFantasyRound({ accountId, gameweekId, signal: controller.signal, prepare });
      if (!mounted.current) return;
      receive.current(state); router.refresh();
    } catch { /* The saved-team recovery is deliberately silent in ClubOwner. */ }
    finally { window.clearTimeout(timer); pending.current = false; }
  }, [accountId, gameweekId, router]);
  useEffect(() => {
    // Keep one attempt through StrictMode effect replay. The canonical SQL
    // operation is idempotent across tabs; unmount never implies rollback.
    if (!startAllowed || attempted.current) return;
    attempted.current = true;
    void recover(true);
  }, [recover, startAllowed]);
  // Keep continuity preparation in the background. The ClubOwner workspace
  // owns the team's visible state and must not interrupt it with a recovery card.
  return null;
}
