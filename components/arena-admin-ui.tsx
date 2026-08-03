import { TrendingUp } from "lucide-react";
import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function GamePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={cn("glass console-panel rounded-3xl", className)}>{children}</section>;
}

export function StatTile({
  icon: Icon,
  label,
  value,
  delta,
  accent = "cyan",
}: {
  icon: ElementType;
  label: string;
  value: string;
  delta: string;
  accent?: "cyan" | "lime" | "gold" | "rose";
}) {
  const colors = {
    cyan: "text-cyan-300 bg-cyan-300/[.08] border-cyan-300/15",
    lime: "text-[#a3ff12] bg-[#a3ff12]/[.07] border-[#a3ff12]/15",
    gold: "text-amber-300 bg-amber-300/[.07] border-amber-300/15",
    rose: "text-rose-300 bg-rose-300/[.07] border-rose-300/15",
  };

  return (
    <div className="glass glass-hover console-hud group rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className={cn("interactive-icon grid size-9 place-items-center rounded-xl border", colors[accent])}>
          <Icon size={15} />
        </span>
        <TrendingUp size={12} className="text-slate-700 transition group-hover:text-[#a3ff12]" />
      </div>
      <p className="mt-5 text-[8px] font-black text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <strong className="number-glow font-display text-[28px] leading-none">{value}</strong>
        <span className="mb-0.5 text-[8px] font-bold text-slate-500 transition group-hover:text-slate-300">
          {delta}
        </span>
      </div>
    </div>
  );
}

export function LivePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-3 py-1.5 text-[8px] font-black text-[#b7ff45]">
      <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />
      {children}
    </span>
  );
}
