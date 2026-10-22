"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recoverFantasyRound, type FantasyContinuityState } from "@/lib/touchlineFantasy/round-continuity-client";
import { getFantasyContinuityCopy } from "@/lib/touchlineFantasy/round-continuity-i18n";
import controls from "../TouchlineGlobalNavigation.module.css";

export default function TouchlineFantasyRoundContinuity({ accountId, gameweekId, locale, draftLocalesEnabled = false, startAllowed = true, onReady }: {
  accountId: string; gameweekId: string; locale: string; draftLocalesEnabled?: boolean;
  onReady: (state: FantasyContinuityState) => void;
  startAllowed?: boolean;
}) {
  const router = useRouter(), copy = getFantasyContinuityCopy(locale, draftLocalesEnabled);
  const [phase, setPhase] = useState<"waiting" | "loading" | "unconfirmed">("waiting");
  const attempted = useRef(false), pending = useRef(false), mounted = useRef(false);
  const receive = useRef(onReady);
  useEffect(() => { receive.current = onReady; }, [onReady]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const recover = useCallback(async (prepare: boolean) => {
    if (pending.current) return;
    pending.current = true; setPhase("loading");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const state = await recoverFantasyRound({ accountId, gameweekId, signal: controller.signal, prepare });
      if (!mounted.current) return;
      receive.current(state); router.refresh();
    } catch { if (mounted.current) setPhase("unconfirmed"); }
    finally { window.clearTimeout(timer); pending.current = false; }
  }, [accountId, gameweekId, router]);
  useEffect(() => {
    // Keep one attempt through StrictMode effect replay. The canonical SQL
    // operation is idempotent across tabs; unmount never implies rollback.
    if (!startAllowed || attempted.current) return;
    attempted.current = true;
    void recover(true);
  }, [recover, startAllowed]);
  // Stay mounted when readiness changes: an uncertain preparation must never
  // become a fresh automatic POST on remount. Explicit recovery remains GET-only.
  if (phase === "waiting") return null;
  return <section data-fantasy-continuity={phase} aria-busy={phase === "loading"} aria-live="polite">
    <h2>{copy.title}</h2>
    <p role={phase === "unconfirmed" ? "alert" : "status"}>{phase === "loading" ? copy.busy : copy.unavailable}</p>
    {phase === "unconfirmed" ? <button type="button" className={controls.arena} onClick={() => void recover(false)}>{copy.verify}</button> : null}
  </section>;
}
