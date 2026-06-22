"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Crosshair, Crown, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, Users } from "lucide-react";
import { players } from "@/lib/demo-data";
import { Button } from "@/components/ui";
import { Meter, PlayerGameCard } from "@/components/game-ui";

export default function PlayersPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const filtered = useMemo(() => players.filter(p => {
    const matches = `${p.name} ${p.club} ${p.position}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === "ALL" || (filter === "ELITE" && p.overall >= 85) || (filter === "RISING" && p.growth >= 8) || (filter === "HOT" && p.interest >= 85));
  }), [query, filter]);

  return (
    <div className="mx-auto max-w-[1760px] animate-in">
      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(34,211,238,.30)" } as React.CSSProperties}>
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/>24 active profiles</span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">Squad value €146.8M</span>
            </div>
            <p className="af-mode-kicker">Main Menu / Squad Cards</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Squad Vault</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300/80">Manage your player cards, growth paths, form, videos and transfer heat like a premium football career mode.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Button><Plus size={14}/>Sign Player</Button><Button variant="secondary"><Sparkles size={14}/>AI Lineup</Button></div>
          </div>
          <div className="stadium-scoreboard p-5">
            <div className="relative z-10 flex items-start justify-between">
              <div><p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Squad OVR</p><p className="font-display mt-2 text-7xl leading-none text-white">88</p></div>
              <Crown className="text-amber-300" size={34}/>
            </div>
            <div className="relative z-10 mt-5"><div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500"><span>Elite agency progress</span><span>76%</span></div><Meter value={76} color="lime"/></div>
            <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[.045] p-3"><Trophy size={15} className="mx-auto text-amber-300"/><p className="mt-2 text-[8px] text-slate-500">Elite</p><p className="text-sm font-black">8</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><Users size={15} className="mx-auto text-cyan-300"/><p className="mt-2 text-[8px] text-slate-500">Players</p><p className="text-sm font-black">24</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><ShieldCheck size={15} className="mx-auto text-[#a3ff12]"/><p className="mt-2 text-[8px] text-slate-500">Hot</p><p className="text-sm font-black">6</p></div>
            </div>
          </div>
        </div>
      </section>

      <div className="af-strip mt-6 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search squad, club or position..." className="h-10 w-full rounded-lg border border-white/[.07] bg-black/20 pl-9 pr-4 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25"/></div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {["ALL","ELITE","RISING","HOT"].map(x=><button key={x} onClick={()=>setFilter(x)} className={`h-9 shrink-0 rounded-lg px-3 text-[8px] font-black tracking-[.12em] transition ${filter===x?"border border-cyan-300/30 bg-cyan-300/10 text-cyan-200":"border border-white/[.07] text-slate-600 hover:text-white"}`}>{x}{x==="HOT"&&<span className="ml-1 text-rose-400">●</span>}</button>)}
          <button aria-label="Advanced filters" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[.07] text-slate-500"><SlidersHorizontal size={13}/></button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-wider text-slate-600"><span className="text-slate-200">{filtered.length}</span> player cards discovered</p><button className="flex items-center gap-2 text-[8px] font-black uppercase tracking-wider text-slate-600">Sort by <span className="text-cyan-300">Overall rating</span><ChevronDown size={11}/></button></div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filtered.map(player=><PlayerGameCard key={player.id} player={player}/>)}</div>
      {filtered.length === 0 && <div className="glass mt-4 flex min-h-72 flex-col items-center justify-center rounded-2xl text-center"><Crosshair size={28} className="text-slate-700"/><p className="mt-4 text-xs font-black uppercase">No players detected</p><p className="mt-1 text-[9px] text-slate-600">Adjust your squad filters to widen the scan.</p></div>}
    </div>
  );
}
