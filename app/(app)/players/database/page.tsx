import Link from "next/link";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { PlayerDatabaseSearch } from "@/components/player-database-search";

export default function PlayerDatabasePage() {
  return (
    <div className="mx-auto max-w-[1760px] animate-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/players" className="inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
          <ArrowLeft size={12} />
          Back to portfolio
        </Link>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
          <DatabaseZap size={12} />
          Touchline player database
        </div>
      </div>
      <PlayerDatabaseSearch />
    </div>
  );
}
