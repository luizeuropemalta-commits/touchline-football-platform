"use client";

import { useMemo, useState } from "react";
import { Check, Crown, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { plans, type BillingInterval, type PlanAudience } from "@/lib/billing/plans";
import { CheckoutButton } from "./checkout-button";
import { cn } from "@/lib/utils";

const audienceLabels: Record<PlanAudience, string> = { agent: "Agents", club: "Clubs", academy: "Academies" };

export function PricingClient() {
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [audience, setAudience] = useState<PlanAudience>("agent");
  const visible = useMemo(() => plans.filter(plan => plan.audience === audience), [audience]);

  return (
    <div>
      <div className="mx-auto mb-10 flex max-w-fit flex-col items-center gap-3 sm:flex-row">
        <div className="flex rounded-xl border border-white/10 bg-white/[.035] p-1">
          {(Object.keys(audienceLabels) as PlanAudience[]).map(item => (
            <button key={item} onClick={() => setAudience(item)} className={cn("rounded-lg px-5 py-2.5 text-[9px] font-black uppercase tracking-[.14em] transition", audience === item ? "bg-cyan-300/15 text-cyan-100" : "text-slate-600 hover:text-white")}>{audienceLabels[item]}</button>
          ))}
        </div>
        <div className="flex rounded-xl border border-white/10 bg-white/[.035] p-1">
          <button onClick={() => setInterval("month")} className={cn("rounded-lg px-4 py-2.5 text-[9px] font-black uppercase tracking-wider transition", interval === "month" ? "bg-white/10 text-white" : "text-slate-600")}>Monthly</button>
          <button onClick={() => setInterval("year")} className={cn("rounded-lg px-4 py-2.5 text-[9px] font-black uppercase tracking-wider transition", interval === "year" ? "bg-[#a3ff12] text-[#071007]" : "text-slate-600")}>Yearly · save 2 months</button>
        </div>
      </div>

      <div className={cn("grid gap-5", visible.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {visible.map(plan => {
          const price = interval === "month" ? plan.monthly : plan.yearly;
          const availableInterval = plan.monthly === null ? "year" : interval;
          return (
            <article key={plan.key} className={cn(
              "glass glass-hover relative flex min-h-[470px] flex-col overflow-hidden rounded-2xl p-6",
              plan.featured && "border-[#a3ff12]/30 shadow-[0_0_60px_rgba(163,255,18,.07)]",
              plan.founder && "border-amber-300/30 bg-gradient-to-b from-amber-300/[.08] to-[#07111b]",
            )}>
              {(plan.featured || plan.founder) && <div className={cn("absolute right-0 top-0 rounded-bl-xl border-b border-l px-3 py-2 text-[8px] font-black uppercase tracking-[.15em]", plan.founder ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : "border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#baff4c]")}>{plan.founder ? "First 100 only" : "Most popular"}</div>}
              <div className={cn("grid size-11 place-items-center rounded-xl border", plan.founder ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300")}>
                {plan.founder ? <Crown size={20}/> : plan.audience === "club" ? <Trophy size={20}/> : <Sparkles size={20}/>}
              </div>
              <p className="mt-5 text-[9px] font-black uppercase tracking-[.2em] text-cyan-300/60">{audienceLabels[plan.audience]}</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">{plan.name}</h2>
              <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{plan.description}</p>
              <div className="my-5 border-y border-white/[.07] py-5">
                <span className="text-4xl font-black text-white">€{price}</span>
                <span className="ml-1 text-xs text-slate-500">/{availableInterval}</span>
                {availableInterval === "year" && plan.monthly !== null && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#a3ff12]">€{Math.round(plan.yearly / 12)}/month billed yearly</p>}
                {plan.founder && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">Lifetime locked annual price</p>}
              </div>
              <ul className="mb-6 flex-1 space-y-3">
                {plan.features.map(feature => <li key={feature} className="flex gap-2.5 text-[11px] text-slate-300"><Check size={14} className="mt-px shrink-0 text-[#a3ff12]"/>{feature}</li>)}
              </ul>
              <CheckoutButton planKey={plan.key} interval={availableInterval} featured={plan.featured || plan.founder} label={plan.founder ? "Claim founder access" : plan.key === "pro_agent" ? "Upgrade to Pro" : "Choose plan"}/>
            </article>
          );
        })}
      </div>

      <div className="glass mt-10 grid gap-6 rounded-2xl p-6 md:grid-cols-3">
        {[
          [ShieldCheck, "Secure by Stripe", "Payments, tax IDs and card data are handled on Stripe-hosted pages."],
          [Sparkles, "14-day trial", "Eligible plans can start with a configurable trial before the first charge."],
          [Trophy, "Switch anytime", "Upgrade, downgrade, update cards and download invoices in the billing portal."],
        ].map(([Icon, title, copy]) => {
          const CardIcon = Icon as typeof ShieldCheck;
          return <div key={String(title)} className="flex gap-4"><CardIcon className="shrink-0 text-cyan-300" size={20}/><div><p className="text-xs font-black uppercase tracking-wider text-white">{String(title)}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{String(copy)}</p></div></div>;
        })}
      </div>
    </div>
  );
}
