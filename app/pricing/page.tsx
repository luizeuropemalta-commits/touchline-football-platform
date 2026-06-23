import Link from "next/link";
import { ArrowLeft, Radio, Zap } from "lucide-react";
import { Logo } from "@/components/logo";
import { PricingClient } from "@/components/billing/pricing-client";

export default function PricingPage() {
  return (
    <main className="arena-bg min-h-[100dvh] px-4 py-6 sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-[1440px] items-center justify-between">
        <Logo light/>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hidden items-center gap-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-500 hover:text-white sm:flex"><ArrowLeft size={13}/>Command Center</Link>
          <Link href="/login" className="rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-2.5 text-[9px] font-black uppercase tracking-[.14em] text-cyan-100 hover:bg-cyan-300/[.12]">Sign in</Link>
        </div>
      </header>
      <section className="mx-auto max-w-[1440px] py-16">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] px-4 py-2 text-[9px] font-black uppercase tracking-[.18em] text-[#baff4c]"><Radio size={12} className="pulse-live"/>Live football business infrastructure</div>
          <h1 className="font-display mt-6 text-5xl text-white sm:text-7xl">Choose your level.<br/><span className="bg-gradient-to-r from-cyan-300 via-white to-[#a3ff12] bg-clip-text text-transparent">Own the market.</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-500">Professional subscription infrastructure for agents, clubs and academies — with yearly savings and secure Stripe billing.</p>
          <div className="mt-5 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[.15em] text-cyan-300/60"><Zap size={13}/>Instant access after checkout</div>
        </div>
        <PricingClient/>
      </section>
    </main>
  );
}
