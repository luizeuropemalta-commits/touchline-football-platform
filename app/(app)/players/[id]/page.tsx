import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BrainCircuit, CalendarClock, ChevronRight, ExternalLink, FileText, Flame, Globe2, Play, Sparkles, TrendingUp, Trophy, Upload, Zap } from "lucide-react";
import { players } from "@/lib/demo-data";
import { Button } from "@/components/ui";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";

export function generateStaticParams() { return players.map(p=>({ id:p.id })); }

export default async function PlayerProfile({ params }: { params:Promise<{id:string}> }) {
  const { id } = await params;
  const p = players.find(player=>player.id===id);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <Link href="/players" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300"><ArrowLeft size={12}/>Return to squad</Link>
      <GamePanel className="relative overflow-hidden pitch-grid">
        <div className="absolute right-[-8%] top-[-60%] size-[500px] rounded-full border border-cyan-300/[.08]"/><div className="absolute right-[4%] top-[-30%] size-[330px] rounded-full border border-cyan-300/[.08]"/>
        <div className="relative grid min-h-[330px] lg:grid-cols-[320px_1fr]">
          <div className="relative overflow-hidden border-b border-white/[.07] lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-cyan-400/[.05]"/>
            <Image src={p.avatar!} fill sizes="400px" priority alt={p.name} className="object-cover object-top grayscale-[10%] contrast-[1.08]"/>
            <div className="absolute bottom-5 left-5"><LivePill>{p.status}</LivePill></div>
          </div>
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">{p.club} · {p.position}</p><h1 className="font-display mt-2 text-4xl uppercase italic sm:text-6xl">{p.name}</h1><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">{p.nationality} · AGE {p.age} · RIGHT FOOTED</p></div>
              <div className="flex items-start gap-2"><Button variant="secondary"><BrainCircuit size={13}/>AI Report</Button><Button><Zap size={13}/>Open Deal</Button></div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["OVR",p.overall,"text-white"],["POT",p.potential,"text-[#a3ff12]"],["FORM",p.form,"text-cyan-300"],["VALUE",`€${p.marketValue/1000000}M`,"text-amber-300"]].map(([label,value,color])=><div key={String(label)} className="rounded-xl border border-white/[.08] bg-black/20 p-4"><p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p><p className={`font-display mt-2 text-3xl ${color}`}>{value}</p></div>)}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3"><div><div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>AGENT RELATIONSHIP</span><span>{p.relationship}%</span></div><Meter value={p.relationship} color="lime"/></div><div><div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>TRANSFER INTEREST</span><span>{p.interest}%</span></div><Meter value={p.interest} color="cyan"/></div><div><div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>CAREER MOMENTUM</span><span>+{p.growth}</span></div><Meter value={Math.min(p.growth*8,100)} color="gold"/></div></div>
          </div>
        </div>
      </GamePanel>

      <nav className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-white/[.07] bg-white/[.025] p-1 scrollbar-none">{["Career Hub","Performance","Development","Contracts","Media","Vault"].map((tab,i)=><button key={tab} className={`shrink-0 rounded-lg px-4 py-2.5 text-[8px] font-black uppercase tracking-[.12em] ${i===0?"bg-cyan-300/10 text-cyan-200":"text-slate-600 hover:text-white"}`}>{tab}</button>)}</nav>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="2025/26 Intelligence" title="Performance Matrix" action={<span className="text-[8px] font-black text-[#a3ff12]">+8.4% SEASON</span>}/>
            <div className="grid gap-3 sm:grid-cols-4">{[["APP",p.appearances],["GOALS",p.goals],["ASSISTS",p.assists],["RATING","7.8"]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[8px] font-black text-slate-600">{label}</p><p className="font-display mt-2 text-2xl">{value}</p></div>)}</div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">{[["Pace",88],["Technical",84],["Vision",91],["Physical",77],["Composure",86],["Influence",92]].map(([label,value],i)=><div key={String(label)}><div className="mb-1.5 flex justify-between text-[8px] font-bold text-slate-500"><span>{label}</span><span className="text-slate-300">{value}</span></div><Meter value={Number(value)} color={i>3?"lime":"cyan"}/></div>)}</div>
          </GamePanel>
          <GamePanel className="p-5">
            <SectionHeader kicker="Career Development" title="Growth Path" action={<Sparkles size={14} className="text-amber-300"/>}/>
            <div className="grid gap-3 md:grid-cols-3">{[["Finishing Specialist","68%","Active plan",Flame],["Leadership","42%","Next unlock",Trophy],["Global Brand","81%","Elite pathway",TrendingUp]].map(([title,progress,note,Icon])=>{const I=Icon as typeof Flame; return <div key={String(title)} className="rounded-xl border border-white/[.07] bg-gradient-to-br from-white/[.035] to-transparent p-4"><I size={16} className="text-cyan-300"/><p className="mt-4 text-[10px] font-black uppercase">{String(title)}</p><p className="mt-1 text-[8px] text-slate-600">{String(note)}</p><div className="mt-4"><Meter value={parseInt(String(progress))} color="lime"/></div></div>})}</div>
          </GamePanel>
        </div>
        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader
              kicker="External Market Profile"
              title="Transfermarkt Link"
              action={<Globe2 size={15} className="text-cyan-300" />}
            />
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-wider text-cyan-300">{p.externalMarket?.provider ?? "External source"}</p>
                  <p className="mt-2 text-xl font-black uppercase italic text-white">{p.externalMarket?.marketValue ?? `€${p.marketValue / 1000000}M`}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">Contract: {p.externalMarket?.contractUntil ?? p.contractUntil}</p>
                </div>
                <Link
                  href={p.externalMarket?.profileUrl ?? "https://www.transfermarkt.com/"}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] text-cyan-200 transition hover:border-[#a3ff12]/35 hover:text-[#a3ff12]"
                  aria-label="Open external market profile"
                >
                  <ExternalLink size={15} />
                </Link>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-[8px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Data match confidence</span>
                  <span>{p.externalMarket?.confidence ?? 70}%</span>
                </div>
                <Meter value={p.externalMarket?.confidence ?? 70} color="cyan" />
              </div>
              <p className="mt-4 text-[9px] leading-5 text-slate-500">{p.externalMarket?.note ?? "Add an external profile URL to enrich this player with verified market data."}</p>
              <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[.055] px-3 py-2 text-[8px] font-bold uppercase leading-4 tracking-wider text-amber-200/80">
                Live sync ready: use an authorized football data API/provider before showing automatic Transfermarkt-style data.
              </p>
            </div>
          </GamePanel>
          <GamePanel className="p-5"><SectionHeader kicker="Contract Status" title="Critical Timeline" action={<CalendarClock size={15} className="text-rose-300"/>}/><div className="rounded-xl border border-rose-300/15 bg-rose-300/[.05] p-4"><p className="text-[8px] font-black uppercase tracking-wider text-rose-300">Contract countdown</p><p className="font-display mt-2 text-3xl">{p.contractUntil}</p><p className="mt-1 text-[8px] text-slate-500">Current agreement with {p.club}</p></div><Button className="mt-3 w-full">Start Renewal</Button></GamePanel>
          <GamePanel className="overflow-hidden"><div className="relative h-40"><Image src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=900&q=80" fill sizes="500px" alt="Training footage" className="object-cover opacity-55"/><div className="absolute inset-0 bg-gradient-to-t from-[#07111b] to-transparent"/><button aria-label="Play highlights" className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/15 text-cyan-200 backdrop-blur-md"><Play size={16} fill="currentColor"/></button><div className="absolute bottom-4 left-4"><p className="text-[10px] font-black uppercase">Performance Reel</p><p className="mt-1 text-[8px] text-slate-500">12 clips · AI tagged</p></div></div></GamePanel>
          <GamePanel className="p-5"><SectionHeader kicker="Secure Storage" title="Player Vault" action={<Upload size={14} className="text-cyan-300"/>}/><div className="space-y-2">{["Representation Agreement","Medical Assessment","Image Rights Schedule"].map((x,i)=><div key={x} className="flex items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.02] p-3"><FileText size={14} className={i===1?"text-rose-300":"text-cyan-300"}/><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-bold">{x}</p><p className="mt-1 text-[7px] text-slate-600">PDF · ENCRYPTED</p></div><ChevronRight size={12} className="text-slate-700"/></div>)}</div></GamePanel>
        </div>
      </div>
    </div>
  );
}
