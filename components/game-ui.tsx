import { TrendingUp } from "lucide-react";
import { TouchlinePlayerCard } from "@/components/touchline-card-engine";
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
  return (
    <TouchlinePlayerCard
      variant={compact ? "compact" : "showcase"}
      player={{
        id: player.id,
        name: player.name,
        nationality: player.nationality,
        position: player.position,
        currentClub: player.club,
        photoUrl: player.photoUrl,
        avatarUrl: player.photoUrl,
        officialMarketValue: player.marketValue,
        officialMarketValueLabel: player.externalMarket?.marketValue,
        href: `/players/${player.id}`,
        liveState: player.status === "Injured" ? "injury" : "idle",
        context: "dashboard",
      }}
    />
  );
}

export function StatTile({ icon: Icon, label, value, delta, accent = "cyan" }: { icon: React.ElementType; label:string; value:string; delta:string; accent?: "cyan"|"lime"|"gold"|"rose" }) {
  const colors = { cyan:"text-cyan-300 bg-cyan-300/[.08] border-cyan-300/15", lime:"text-[#a3ff12] bg-[#a3ff12]/[.07] border-[#a3ff12]/15", gold:"text-amber-300 bg-amber-300/[.07] border-amber-300/15", rose:"text-rose-300 bg-rose-300/[.07] border-rose-300/15" };
  return <div className="glass glass-hover console-hud group rounded-2xl p-4"><div className="flex items-center justify-between"><span className={cn("interactive-icon grid size-9 place-items-center rounded-xl border",colors[accent])}><Icon size={15}/></span><TrendingUp size={12} className="text-slate-700 transition group-hover:text-[#a3ff12]"/></div><p className="mt-5 text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><strong className="number-glow font-display text-[28px] leading-none">{value}</strong><span className="mb-0.5 text-[8px] font-bold text-slate-500 transition group-hover:text-slate-300">{delta}</span></div></div>;
}

export function LivePill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.15em] text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/>{children}</span>;
}
