import { ArrowUpRight, Construction, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { GamePanel, LivePill } from "@/components/game-ui";

export function ComingSoon({ eyebrow, title, description }: { eyebrow:string; title:string; description:string }) {
  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 animate-in space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">{eyebrow}</p>
          <h1 className="font-display mt-2 max-w-4xl text-3xl uppercase italic leading-[.9] sm:text-[42px] lg:text-6xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-xs leading-6 text-slate-400">{description}</p>
        </div>
        <LivePill>Alpha Module</LivePill>
      </div>

      <GamePanel className="pitch-grid relative overflow-hidden p-5 sm:p-7 xl:p-9">
        <div className="absolute right-[-18%] top-[-65%] size-[520px] rounded-full border border-cyan-300/10 bg-cyan-300/[.035] blur-sm" />
        <div className="absolute bottom-[-45%] left-[-12%] size-[360px] rounded-full bg-[#a3ff12]/10 blur-3xl" />

        <div className="relative grid gap-6 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/30 bg-[#a3ff12]/10 px-3 py-2 text-[8px] font-black uppercase tracking-[.2em] text-[#a3ff12]">
              <Construction size={13} />
              Under development
            </div>
            <h2 className="font-display mt-5 max-w-2xl text-3xl uppercase italic leading-[.95] sm:text-5xl">
              Connected to the Touchline operating system.
            </h2>
            <p className="mt-4 max-w-2xl text-[11px] leading-6 text-slate-400">
              This area is intentionally visible in Alpha so agents, clubs and owners can understand where the product is going. It is not broken: it is reserved for the next production pass.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 py-3 text-[10px] font-black uppercase tracking-[.16em] text-slate-950 transition hover:bg-cyan-300">
                Back to Touchline Fantasy
                <ArrowUpRight size={13} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link href="/football-search" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/[.06] px-5 py-3 text-[10px] font-black uppercase tracking-[.16em] text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/[.1]">
                Open Football Search
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: ShieldCheck, label: "Safe Placeholder", text: "No fake actions or dead buttons." },
              { icon: Gauge, label: "Production Path", text: "Ready to connect when backend scope is approved." },
              { icon: Sparkles, label: "Premium Standard", text: "Uses the same Touchline visual language." },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
                <item.icon className="text-cyan-200" size={18} />
                <p className="mt-4 text-[9px] font-black uppercase tracking-[.18em] text-white">{item.label}</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </GamePanel>
    </div>
  );
}
