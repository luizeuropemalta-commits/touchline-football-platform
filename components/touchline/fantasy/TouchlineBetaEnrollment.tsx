"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getClubOwnerPlanShowcaseCopy } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { getTouchlineBetaEnrollmentCopy } from "@/lib/touchlineFantasy/beta-enrollment-i18n";
import { isTouchlineFantasyMarketAccess } from "@/lib/touchlineFantasy/market-plan-policy";
import controls from "../TouchlineGlobalNavigation.module.css";

export function isConfirmedBetaEnrollment(value: unknown) {
  return isTouchlineFantasyMarketAccess(value) && value.planKey === "beta"
    && "ok" in value && value.ok === true && "status" in value && value.status === "active";
}

export default function TouchlineBetaEnrollment({ locale, draftLocalesEnabled = false }: { locale: string; draftLocalesEnabled?: boolean }) {
  const router = useRouter();
  const labels = getTouchlineBetaEnrollmentCopy(locale, draftLocalesEnabled);
  const plan = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const [phase, setPhase] = useState<"idle" | "saving" | "confirmed" | "retry" | "refresh">("idle");
  const [message, setMessage] = useState<"unavailable" | "preserved" | "review" | "forbidden" | "rejected" | null>(null);
  const busyRef = useRef(false), confirmedRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function enroll() {
    if (!mounted.current || busyRef.current || confirmedRef.current) return;
    busyRef.current = true; setPhase("saving"); setMessage(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/touchline-fantasy/beta/enroll", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (response.ok && isConfirmedBetaEnrollment(payload)) {
        confirmedRef.current = true; setPhase("confirmed"); router.refresh(); return;
      }
      const code = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
      if (!response.ok && response.status === 409) {
        setMessage(code === "BETA_ACTIVE_PLAN_PRESERVED" ? "preserved" : "review"); setPhase("refresh");
      } else if (!response.ok && response.status === 403) { setMessage("forbidden"); setPhase("refresh"); }
      else if (!response.ok && response.status === 400) { setMessage("rejected"); setPhase("refresh"); }
      else { setMessage("unavailable"); setPhase("retry"); }
    } catch { if (mounted.current) { setMessage("unavailable"); setPhase("retry"); } }
    finally { window.clearTimeout(timer); busyRef.current = false; }
  }

  return <section className="grid gap-4 rounded-2xl border border-white/15 bg-black/20 p-5" data-beta-enrollment="true" aria-busy={phase === "saving"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-white">Beta</h2><strong className="text-cyan-200">{plan.betaPrice}</strong></div>
    <p className="text-sm leading-6 text-slate-200">{plan.betaBenefit}</p>
    <button type="button" className={`${controls.arena} w-fit max-w-full`} disabled={phase === "saving"}
      onClick={phase === "confirmed" || phase === "refresh" ? () => router.refresh() : enroll}>
      <ShieldCheck size={16} aria-hidden="true" />{phase === "saving" ? labels.busy : phase === "confirmed" || phase === "refresh" ? labels.refresh : phase === "retry" ? labels.retry : labels.start}
    </button>
    {phase === "confirmed" ? <p className="text-sm leading-6 text-emerald-200" role="status">{labels.confirmed}</p> : null}
    {message ? <p className="text-sm leading-6 text-amber-100" role="status">{labels[message]}</p> : null}
  </section>;
}
