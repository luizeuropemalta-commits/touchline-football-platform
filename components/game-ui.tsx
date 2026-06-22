import Image from "next/image";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SectionHeader({ kicker, title, action }: { kicker?: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div className="flex items-end gap-3"><span className="mb-0.5 hidden h-8 w-[3px] rounded-full bg-gradient-to-b from-cyan-200 via-blue-500 to-[#a3ff12] shadow-[0_0_16px_rgba(34,211,238,.65)] sm:block"/><div>{kicker && <p className="mb-1.5 text-[8px] font-black uppercase tracking-[.26em] text-cyan-300/70">{kicker}</p>}<h2 className="text-base font-black uppercase italic tracking-[-.04em] text-slate-50">{title}</h2></div></div>{action}</div>;
}

export function GamePanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("glass console-panel rounded-3xl", className)}>{children}</section>;
}

export function Meter({ value, color = "cyan" }: { value: number; color?: "cyan" | "lime" | "gold" | "red" }) {
  const colors = { cyan:"from-blue-500 to-cyan-300 shadow-[0_0_8px_rgba(34,211,238,.45)]", lime:"from-emerald-500 to-[#a3ff12] shadow-[0_0_8px_rgba(163,255,18,.4)]", gold:"from-amber-600 to-amber-300", red:"from-rose-600 to-orange-400" };
  return <div className="h-1 overflow-hidden rounded-full bg-white/[.07]"><div className={cn("relative h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out after:absolute after:right-0 after:top-1/2 after:size-1 after:-translate-y-1/2 after:rounded-full after:bg-white after:shadow-[0_0_7px_white]", colors[color])} style={{ width:`${value}%` }}/></div>;
}

export function PlayerGameCard({ player, compact = false }: { player: Player; compact?: boolean }) {
  const elite = player.overall >= 85;
  const glow = elite ? "rgba(247,198,93,.28)" : player.potential >= 90 ? "rgba(163,255,18,.22)" : "rgba(34,211,238,.2)";
  return (
    <Link href={`/players/${player.id}`} className={cn("player-card shimmer relative block border p-[1px]", elite ? "border-amber-300/50" : "border-cyan-300/30", compact ? "min-h-[300px]" : "min-h-[382px]")} style={{ "--card-glow":glow } as React.CSSProperties}>
      <span className="card-edge"/>
      <span className="soft-orbit left-1/2 top-9 size-40 -translate-x-1/2 opacity-70"/>
      <div className="relative z-10 h-full overflow-hidden p-[18px]">
        <div className="flex items-start justify-between">
          <div><p className={cn("card-rating font-display leading-none text-white", compact ? "text-[44px]" : "text-[54px]")}>{player.overall}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">{player.position}</p></div>
          <div className="text-right"><span className={cn("console-chip inline-flex rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider", elite ? "border-amber-300/35 bg-amber-300/10 text-amber-300" : "border-cyan-300/25 bg-cyan-300/[.07] text-cyan-300")}>{elite ? "Icon" : "Pro"}</span><p className="mt-2 text-[8px] font-bold text-slate-500">{player.nationality}</p></div>
        </div>
        <div className={cn("relative mx-auto", compact ? "-mt-1 h-32" : "-mt-4 h-48")}>
          <div className="absolute bottom-2 left-1/2 h-12 w-40 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-2xl"/>
          <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent"/>
          <Image src={player.avatar!} fill sizes="300px" alt={player.name} className="card-photo object-cover object-top [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] saturate-[.8] contrast-[1.08]"/>
        </div>
        <div className={cn("relative text-center", compact ? "-mt-1" : "-mt-2")}>
          <p className="truncate text-base font-black uppercase italic tracking-[-.05em]">{player.name}</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400/70">{player.club}</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-white/[.08] pt-3 text-center">
          <div className="card-stat rounded-lg py-2"><p className="text-[8px] font-bold text-slate-500">POT</p><p className="mt-0.5 text-sm font-black text-[#a3ff12]">{player.potential}</p></div>
          <div className="card-stat rounded-lg py-2"><p className="text-[8px] font-bold text-slate-500">FORM</p><p className="mt-0.5 text-sm font-black text-cyan-300">{player.form}</p></div>
          <div className="card-stat rounded-lg py-2"><p className="text-[8px] font-bold text-slate-500">GROWTH</p><p className="mt-0.5 text-sm font-black text-emerald-400">+{player.growth}</p></div>
        </div>
        {!compact && <div className="mt-3 space-y-2"><div><div className="mb-1 flex justify-between text-[8px] font-bold text-slate-600"><span>AGENT BOND</span><span className="text-slate-400">{player.relationship}%</span></div><Meter value={player.relationship} color="lime"/></div><div><div className="mb-1 flex justify-between text-[8px] font-bold text-slate-600"><span>TRANSFER HEAT</span><span className="text-slate-400">{player.interest}%</span></div><Meter value={player.interest} color="cyan"/></div></div>}
      </div>
    </Link>
  );
}

export function StatTile({ icon: Icon, label, value, delta, accent = "cyan" }: { icon: React.ElementType; label:string; value:string; delta:string; accent?: "cyan"|"lime"|"gold"|"rose" }) {
  const colors = { cyan:"text-cyan-300 bg-cyan-300/[.08] border-cyan-300/15", lime:"text-[#a3ff12] bg-[#a3ff12]/[.07] border-[#a3ff12]/15", gold:"text-amber-300 bg-amber-300/[.07] border-amber-300/15", rose:"text-rose-300 bg-rose-300/[.07] border-rose-300/15" };
  return <div className="glass glass-hover console-hud group rounded-2xl p-4"><div className="flex items-center justify-between"><span className={cn("interactive-icon grid size-9 place-items-center rounded-xl border",colors[accent])}><Icon size={15}/></span><TrendingUp size={12} className="text-slate-700 transition group-hover:text-[#a3ff12]"/></div><p className="mt-5 text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><strong className="number-glow font-display text-[28px] leading-none">{value}</strong><span className="mb-0.5 text-[8px] font-bold text-slate-500 transition group-hover:text-slate-300">{delta}</span></div></div>;
}

export function LivePill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.15em] text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/>{children}</span>;
}
