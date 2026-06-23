import { ArrowLeft, Radar } from "lucide-react";
import Link from "next/link";
import { MarketRadar } from "@/components/market-radar";

export default function RadarPage() {
  return (
    <div className="mx-auto max-w-[1760px] animate-in">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />
        Return to command center
      </Link>

      <section className="af-mode-screen mb-6 p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(244,63,94,.24)" } as React.CSSProperties}>
        <div className="relative z-10">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/25 bg-rose-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-rose-100">
              <span className="pulse-live size-1.5 rounded-full bg-rose-300" />
              Rumor radar
            </span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
              Link previews only
            </span>
          </div>
          <p className="af-mode-kicker">Touchline / External Intelligence</p>
          <h1 className="af-mode-title font-display mt-3 text-white">Market Radar</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
            Organize public football links, Transfermarkt profiles, rumors and market signals into a premium internal feed.
          </p>
          <div className="mt-7 inline-flex items-center gap-2 rounded-2xl border border-rose-300/15 bg-rose-300/[.055] px-4 py-3 text-[9px] font-black uppercase tracking-wider text-rose-100">
            <Radar size={15} />
            Click-through intelligence · source traffic protected
          </div>
        </div>
      </section>

      <MarketRadar />
    </div>
  );
}
