"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Building2, CalendarPlus, Check, ExternalLink, Eye, GitCompareArrows, ImageIcon, Link2, MessageSquare, Play, Plus, Search, Star, Zap } from "lucide-react";
import { players } from "@/lib/demo-data";
import { Button } from "@/components/ui";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";

const clubs = [
  { name:"Arsenal", code:"ARS", league:"Premier League", nation:"ENG", power:94, budget:"€128M", needs:"CM · ST", active:3, color:"from-rose-500/25" },
  { name:"Real Madrid", code:"RMA", league:"La Liga", nation:"ESP", power:98, budget:"€186M", needs:"CB · CM", active:2, color:"from-indigo-400/25" },
  { name:"AC Milan", code:"ACM", league:"Serie A", nation:"ITA", power:89, budget:"€74M", needs:"LW · RB", active:4, color:"from-red-500/25" },
  { name:"Borussia Dortmund", code:"BVB", league:"Bundesliga", nation:"GER", power:87, budget:"€92M", needs:"ST · CAM", active:5, color:"from-amber-300/25" },
];

type RealPlayerProfile = {
  id: string;
  name: string;
  club?: string | null;
  position?: string | null;
  photoUrl?: string | null;
  externalProvider?: string | null;
  externalUrl?: string | null;
};

export default function Clubs() {
  const [shortlist,setShortlist]=useState<string[]>(["enzo-martinez"]);
  const [realProfiles, setRealProfiles] = useState<RealPlayerProfile[]>([]);
  const toggle=(id:string)=>setShortlist(list=>list.includes(id)?list.filter(x=>x!==id):[...list,id].slice(-3));

  useEffect(() => {
    let cancelled = false;
    async function loadRealProfiles() {
      try {
        const response = await fetch("/api/players/link-options");
        if (!response.ok) return;
        const data = (await response.json()) as { players?: RealPlayerProfile[] };
        if (!cancelled) setRealProfiles((data.players ?? []).filter((player) => player.externalUrl).slice(0, 6));
      } catch {}
    }
    void loadRealProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  return <div className="mx-auto max-w-[1500px] animate-in">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-3"><LivePill>216 clubs online</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">42 decision-makers active</span></div><h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Club Network</h1><p className="mt-1.5 text-xs text-slate-500">Where recruitment teams discover talent and transfer conversations begin.</p></div><Button><CalendarPlus size={14}/>Request Meeting</Button></div>
    <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatTile icon={Building2} label="Connected Clubs" value="216" delta="+18 this season" accent="cyan"/><StatTile icon={Eye} label="Profile Views" value="1,842" delta="+26% this week" accent="lime"/><StatTile icon={MessageSquare} label="Club Requests" value="14" delta="6 require reply" accent="gold"/><StatTile icon={Zap} label="Transfer Intent" value="HIGH" delta="12 clubs buying" accent="rose"/></div>

    <section className="mt-6"><SectionHeader kicker="Verified Recruitment Teams" title="Active Club Rooms" action={<button className="text-[8px] font-black uppercase text-cyan-300">Explore all clubs →</button>}/><div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{clubs.map(c=><GamePanel key={c.code} className="glass-hover status-scan group relative overflow-hidden p-4"><div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${c.color} to-transparent transition duration-500 group-hover:h-36`}/><div className="relative flex items-start justify-between"><span className="interactive-icon grid size-12 place-items-center rounded-xl border border-white/10 bg-black/25 text-sm font-black shadow-[0_10px_35px_rgba(0,0,0,.25)]">{c.code}</span><span className="flex items-center gap-1 text-[7px] font-black text-[#a3ff12]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/>ONLINE</span></div><div className="relative mt-5"><h3 className="text-sm font-black uppercase italic">{c.name}</h3><p className="mt-1 text-[8px] font-bold text-slate-600">{c.league} · {c.nation}</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg border border-white/[.06] bg-black/15 p-2.5"><p className="text-[7px] text-slate-600">BUDGET</p><p className="mt-1 text-xs font-black text-amber-300">{c.budget}</p></div><div className="rounded-lg border border-white/[.06] bg-black/15 p-2.5"><p className="text-[7px] text-slate-600">NEEDS</p><p className="mt-1 text-xs font-black text-cyan-300">{c.needs}</p></div></div><div className="mt-4 flex items-center justify-between"><span className="text-[8px] font-bold text-slate-500">{c.active} active searches</span><button className="text-[8px] font-black uppercase text-cyan-300 transition group-hover:text-white">Enter hub →</button></div></div></GamePanel>)}</div></section>

    {realProfiles.length > 0 && (
      <section className="mt-6">
        <SectionHeader
          kicker="Live Database"
          title="Agent profiles linked to Transfermarkt"
          action={<span className="text-[8px] font-black uppercase tracking-wider text-[#a3ff12]">Real Supabase records</span>}
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {realProfiles.map((player) => (
            <GamePanel key={player.id} className="glass-hover overflow-hidden">
              <div className="grid grid-cols-[96px_1fr]">
                <div className="relative min-h-32 overflow-hidden bg-cyan-300/[.04]">
                  {player.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="grid h-full place-items-center text-cyan-300/40">
                      <ImageIcon size={24} />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em] text-cyan-100">
                    <Link2 size={10} />
                    {player.externalProvider ?? "link preview"}
                  </div>
                  <h3 className="mt-2 truncate text-base font-black uppercase italic text-white">{player.name}</h3>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                    {player.position ?? "Position open"} {player.club ? `· ${player.club}` : ""}
                  </p>
                  <a
                    href={player.externalUrl ?? "https://www.transfermarkt.com/"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase tracking-wider text-[#caff72] transition hover:bg-[#a3ff12]/15"
                  >
                    Abrir Transfermarkt <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </GamePanel>
          ))}
        </div>
      </section>
    )}

    <div className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
      <GamePanel className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] p-5"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">Club Discovery Mode</p><h2 className="mt-1 text-sm font-black uppercase italic">Available Talent</h2></div><div className="relative hidden sm:block"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/><input placeholder="Search available players..." className="h-8 w-52 rounded-lg border border-white/[.07] bg-black/20 pl-8 text-[8px] outline-none"/></div></div><div className="divide-y divide-white/[.06]">{players.slice(0,4).map(p=><div key={p.id} className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_80px_90px_100px]"><div className="flex items-center gap-3"><div className="relative size-12 overflow-hidden rounded-xl"><Image src={p.avatar!} fill sizes="48px" alt={p.name} className="object-cover"/></div><div><p className="text-[10px] font-black uppercase italic">{p.name}</p><p className="mt-1 text-[8px] text-slate-600">{p.position} · {p.club}</p></div></div><div><p className="text-[7px] text-slate-600">OVR / POT</p><p className="mt-1 text-xs font-black">{p.overall} <span className="text-[#a3ff12]">/ {p.potential}</span></p></div><div><p className="text-[7px] text-slate-600">VALUE</p><p className="mt-1 text-xs font-black">€{p.marketValue/1000000}M</p></div><div className="flex justify-end gap-2"><button aria-label={`Watch ${p.name} video`} className="grid size-8 place-items-center rounded-lg border border-white/[.08] text-slate-500 hover:text-cyan-300"><Play size={12}/></button><button aria-label={`${shortlist.includes(p.id)?"Remove":"Add"} ${p.name} shortlist`} onClick={()=>toggle(p.id)} className={`grid size-8 place-items-center rounded-lg border ${shortlist.includes(p.id)?"border-[#a3ff12]/30 bg-[#a3ff12]/10 text-[#a3ff12]":"border-white/[.08] text-slate-500"}`}>{shortlist.includes(p.id)?<Check size={12}/>:<Plus size={12}/>}</button></div></div>)}</div></GamePanel>
      <GamePanel className="p-5"><SectionHeader kicker="Recruitment Workspace" title="Club Shortlist" action={<GitCompareArrows size={15} className="text-cyan-300"/>}/>{shortlist.length===0?<div className="flex min-h-48 flex-col items-center justify-center text-center"><Star size={20} className="text-slate-700"/><p className="mt-3 text-[9px] font-black uppercase">Shortlist empty</p></div>:<div className="space-y-2">{shortlist.map(id=>{const p=players.find(x=>x.id===id)!;return <div key={id} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3"><div className="relative size-9 overflow-hidden rounded-lg"><Image src={p.avatar!} fill sizes="36px" alt={p.name} className="object-cover"/></div><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-black uppercase">{p.name}</p><p className="mt-1 text-[7px] text-slate-600">OVR {p.overall} · €{p.marketValue/1000000}M</p></div><button onClick={()=>toggle(id)} className="text-[8px] text-slate-600">×</button></div>})}</div>}<Button variant="secondary" className="mt-4 w-full" disabled={shortlist.length<2}><GitCompareArrows size={13}/>Compare {shortlist.length} Players</Button><Button className="mt-2 w-full" disabled={shortlist.length===0}><MessageSquare size={13}/>Contact Agents</Button></GamePanel>
    </div>
  </div>;
}
