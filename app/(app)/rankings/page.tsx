import { ArrowUpRight, DatabaseZap, Radio, ShieldCheck, Trophy } from "lucide-react";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";
import { rankingBoards } from "@/lib/rankings";

const accentClass = {
  gold: "border-amber-300/25 text-amber-300 bg-amber-300/[.07]",
  cyan: "border-cyan-300/25 text-cyan-300 bg-cyan-300/[.07]",
  lime: "border-[#a3ff12]/25 text-[#a3ff12] bg-[#a3ff12]/[.07]",
  rose: "border-rose-300/25 text-rose-300 bg-rose-300/[.07]",
};

export default function RankingsPage() {
  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3"><LivePill>Rankings live room</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Daily data sync architecture</span></div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Market Rankings</h1>
          <p className="mt-1.5 max-w-2xl text-xs text-slate-500">Player values, club squad value, agent portfolio value and transfer heat — designed to become a daily football-market intelligence engine.</p>
        </div>
        <div className="rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.055] px-4 py-3 text-right">
          <p className="text-[7px] font-black uppercase tracking-wider text-[#a3ff12]">Founder access</p>
          <p className="font-display mt-1 text-2xl">ADMIN</p>
        </div>
      </div>

      <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Trophy} label="Ranking Boards" value="04" delta="Players · clubs · agents" accent="gold"/>
        <StatTile icon={DatabaseZap} label="Data Engine" value="API" delta="Provider ready" accent="cyan"/>
        <StatTile icon={Radio} label="Refresh Target" value="24H" delta="Daily market update" accent="lime"/>
        <StatTile icon={ShieldCheck} label="Compliance" value="Safe" delta="No scraping dependency" accent="rose"/>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {rankingBoards.map((board) => {
          const Icon = board.icon;
          return (
            <GamePanel key={board.key} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[.07] p-5">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">{board.updateCadence}</p>
                  <h2 className="mt-1 text-sm font-black uppercase italic">{board.title}</h2>
                </div>
                <span className="premium-ring grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><Icon size={18}/></span>
              </div>
              <div className="p-5">
                <p className="mb-4 text-[9px] leading-5 text-slate-500">{board.description}</p>
                <div className="divide-y divide-white/[.06] rounded-2xl border border-white/[.07] bg-black/10">
                  {board.items.map((item) => (
                    <div key={item.name} className="live-row grid items-center gap-3 p-4 sm:grid-cols-[56px_1fr_110px_80px]" style={{ "--row-accent": item.accent === "rose" ? "#fb7185" : item.accent === "gold" ? "#fbbf24" : item.accent === "lime" ? "#a3ff12" : "#22d3ee" } as React.CSSProperties}>
                      <span className={`font-display text-2xl ${item.rank <= 3 ? "text-amber-300" : "text-slate-600"}`}>#{item.rank}</span>
                      <div><p className="text-[10px] font-black uppercase italic">{item.name}</p><p className="mt-1 text-[8px] text-slate-600">{item.meta}</p></div>
                      <p className="number-glow text-sm font-black">{item.value}</p>
                      <span className={`w-fit rounded-lg border px-2 py-1 text-[7px] font-black uppercase ${accentClass[item.accent]}`}>{item.movement}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] p-3">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{board.source}</p>
                  <ArrowUpRight size={13} className="text-cyan-300"/>
                </div>
              </div>
            </GamePanel>
          );
        })}
      </div>
    </div>
  );
}

