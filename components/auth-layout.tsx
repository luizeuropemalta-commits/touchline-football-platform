import Link from "next/link";
import { Check, Globe2, Radio, Trophy, Users, Zap } from "lucide-react";
import { Logo } from "./logo";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="arena-bg console-shell relative min-h-screen overflow-hidden bg-[#02050a]">
      <div className="stadium-light stadium-light-left" />
      <div className="stadium-light stadium-light-right" />
      <div className="football-orb" />
      <div className="stadium-skyline" />

      <section className="relative z-10 grid min-h-screen lg:grid-cols-[1.15fr_.85fr]">
        <div className="flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16">
          <header className="flex items-center justify-between">
            <Logo />
            <Link href="/world" className="console-mini-card hidden items-center gap-2 px-4 py-3 text-[8px] font-black uppercase tracking-[.16em] text-cyan-200 transition hover:-translate-y-1 sm:inline-flex">
              <Globe2 size={14}/> Football Network
            </Link>
          </header>

          <div className="my-auto grid gap-8 py-10 xl:grid-cols-[1fr_430px] xl:items-end">
            <div className="max-w-3xl">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/> Global ecosystem online</span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">Agents · Clubs · Scouts · Players</span>
              </div>
              <p className="mb-3 text-[9px] font-black uppercase tracking-[.34em] text-cyan-200/60">Touchline / Secure Access</p>
              <h1 className="console-title font-display text-6xl uppercase italic leading-[.82] text-white sm:text-8xl xl:text-[118px]">
                Football
                <br />
                Business
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-slate-300/80">
                Enter the football industry network where agents, clubs, scouts, academies and players connect,
                recruit, negotiate and manage professional opportunities.
              </p>

              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                <div className="console-mini-card p-4"><Trophy size={18} className="text-amber-300"/><p className="mt-4 text-[8px] font-black uppercase tracking-wider text-slate-500">Global Rank</p><p className="mt-1 text-xl font-black">#184</p></div>
                <div className="console-mini-card p-4"><Users size={18} className="text-cyan-300"/><p className="mt-4 text-[8px] font-black uppercase tracking-wider text-slate-500">Portfolio Value</p><p className="mt-1 text-xl font-black">€146M</p></div>
                <div className="console-mini-card p-4"><Zap size={18} className="text-[#a3ff12]"/><p className="mt-4 text-[8px] font-black uppercase tracking-wider text-slate-500">Opportunities</p><p className="mt-1 text-xl font-black">LIVE</p></div>
              </div>
            </div>

            <div className="premium-ring stadium-scoreboard w-full p-5 sm:p-6">
              <div className="relative z-10">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Secure workspace</p>
                    <h2 className="mt-1 text-xl font-black uppercase italic text-white">Enter Touchline</h2>
                  </div>
                  <span className="grid size-12 place-items-center rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]"><Globe2 size={22}/></span>
                </div>
                {children}
              </div>
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3">
            <p className="text-[9px] text-slate-700">© 2026 Touchline Technologies Ltd. All rights reserved.</p>
            <div className="hidden items-center gap-2 text-[8px] font-black uppercase tracking-[.16em] text-slate-600 sm:flex"><Radio size={12} className="text-[#a3ff12]"/> Market online</div>
          </footer>
        </div>

        <aside className="ps-career-home relative hidden min-h-screen border-l border-cyan-100/10 p-10 lg:block">
          <div className="stadium-stands" />
          <div className="pitch-lines" />
          <div className="manager-silhouette" />
          <div className="relative z-10 mt-auto flex h-full flex-col justify-end">
            <p className="text-[9px] font-black uppercase tracking-[.28em] text-cyan-300/70">Global football ecosystem</p>
            <h2 className="font-display mt-5 text-6xl uppercase italic leading-[.86] xl:text-7xl">Connect football.<br/><span className="text-[#a3ff12]">Move careers.</span></h2>
            <div className="mt-9 space-y-4">{["AI player and club matching","Professional player portfolios and videos","Private negotiations, documents and CRM"].map(x=><div key={x} className="console-mini-card flex items-center gap-3 p-4 text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="grid size-7 place-items-center rounded-lg border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]"><Check size={13} strokeWidth={3}/></span>{x}</div>)}</div>
          </div>
        </aside>
      </section>
    </main>
  );
}
