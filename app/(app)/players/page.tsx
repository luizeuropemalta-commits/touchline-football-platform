"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Crosshair, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { players } from "@/lib/demo-data";
import { Button } from "@/components/ui";
import { LivePill, PlayerGameCard } from "@/components/game-ui";

export default function PlayersPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const filtered = useMemo(() => players.filter(p => {
    const matches = `${p.name} ${p.club} ${p.position}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === "ALL" || (filter === "ELITE" && p.overall >= 85) || (filter === "RISING" && p.growth >= 8) || (filter === "HOT" && p.interest >= 85));
  }), [query, filter]);

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="mb-2 flex items-center gap-3"><LivePill>24 active profiles</LivePill><span className="text-[8px] font-bold uppercase tracking-[.16em] text-slate-700">Squad value €146.8M</span></div><h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Player Squad</h1><p className="mt-1.5 text-xs text-slate-500">Build careers. Develop value. Create football icons.</p></div>
        <div className="flex gap-2"><Button variant="secondary"><Sparkles size={14}/>AI Lineup</Button><Button><Plus size={14}/>Sign Player</Button></div>
      </div>

      <div className="glass mt-6 flex flex-col gap-3 rounded-xl p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search squad, club or position..." className="h-10 w-full rounded-lg border border-white/[.07] bg-black/20 pl-9 pr-4 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25"/></div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {["ALL","ELITE","RISING","HOT"].map(x=><button key={x} onClick={()=>setFilter(x)} className={`h-9 shrink-0 rounded-lg px-3 text-[8px] font-black tracking-[.12em] transition ${filter===x?"border border-cyan-300/30 bg-cyan-300/10 text-cyan-200":"border border-white/[.07] text-slate-600 hover:text-white"}`}>{x}{x==="HOT"&&<span className="ml-1 text-rose-400">●</span>}</button>)}
          <button aria-label="Advanced filters" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[.07] text-slate-500"><SlidersHorizontal size={13}/></button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-wider text-slate-600"><span className="text-slate-200">{filtered.length}</span> player cards discovered</p><button className="flex items-center gap-2 text-[8px] font-black uppercase tracking-wider text-slate-600">Sort by <span className="text-cyan-300">Overall rating</span><ChevronDown size={11}/></button></div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filtered.map(player=><PlayerGameCard key={player.id} player={player}/>)}</div>
      {filtered.length === 0 && <div className="glass mt-4 flex min-h-72 flex-col items-center justify-center rounded-2xl text-center"><Crosshair size={28} className="text-slate-700"/><p className="mt-4 text-xs font-black uppercase">No players detected</p><p className="mt-1 text-[9px] text-slate-600">Adjust your squad filters to widen the scan.</p></div>}
    </div>
  );
}
