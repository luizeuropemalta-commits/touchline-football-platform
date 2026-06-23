import Link from "next/link";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { PlayerApiSearch } from "@/components/player-api-search";

export default function PlayerApiSearchPage() {
  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <Link href="/players" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />
        Return to player portfolio
      </Link>

      <section className="af-mode-screen mb-6 p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(163,255,18,.22)" } as React.CSSProperties}>
        <div className="relative z-10">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
              <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />
              API-Football connected
            </span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
              Free demo data sync
            </span>
          </div>
          <p className="af-mode-kicker">Touchline / External Data</p>
          <h1 className="af-mode-title font-display mt-3 text-white">Player API Search</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
            Search API-Football, identify the real player record, copy the provider ID and connect it to the Touchline
            player profile for daily data synchronization.
          </p>
          <div className="mt-7 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.055] px-4 py-3 text-[9px] font-black uppercase tracking-wider text-cyan-200">
            <DatabaseZap size={15} />
            Server-side search · API key protected
          </div>
        </div>
      </section>

      <PlayerApiSearch />
    </div>
  );
}
