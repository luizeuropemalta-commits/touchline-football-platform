import { AlertTriangle, ArrowRightLeft, Clock3, Flame, Radio, TrendingUp, Users, Zap } from "lucide-react";
import { GamePanel, Meter, SectionHeader, StatTile } from "@/components/game-ui";
import { Button } from "@/components/ui";

const offers = [
  { player:"Enzo Martínez", from:"Arsenal", amount:"€42.5M", change:"+€3.5M", status:"BID WAR", demand:96, deadline:"01:42:18", up:true },
  { player:"Luca Bianchi", from:"Borussia Dortmund", amount:"€26.0M", change:"+€2.0M", status:"COUNTER SENT", demand:84, deadline:"06:18:04", up:true },
  { player:"Marcus Rashford", from:"AC Milan", amount:"€38.0M", change:"-€4.0M", status:"NEW OFFER", demand:71, deadline:"18:04:31", up:false },
  { player:"Noah Williams", from:"Brighton", amount:"€4.2M/YR", change:"+12%", status:"RENEWAL", demand:55, deadline:"2 DAYS", up:true },
];

export default function TransferMarket() {
  return <div className="mx-auto max-w-[1760px] animate-in">
    <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(163,255,18,.25)" } as React.CSSProperties}>
      <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/>Negotiations live</span>
            <span className="rounded-full border border-rose-300/20 bg-rose-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-rose-100">4 urgent actions</span>
          </div>
          <p className="af-mode-kicker">Touchline / Deal Rooms</p>
          <h1 className="af-mode-title font-display mt-3 text-white">Deal Rooms</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300/80">Track offers, negotiations, club pressure, contract stages and transfer momentum inside private football business rooms.</p>
          <div className="mt-8"><Button><Zap size={14}/>Start Deal Room</Button></div>
        </div>
        <div className="stadium-scoreboard p-5">
          <div className="relative z-10 flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.22em] text-[#a3ff12]">Deal Heat</p><p className="font-display mt-2 text-7xl leading-none text-white">96</p></div><Flame className="text-rose-300" size={38}/></div>
          <div className="relative z-10 mt-5"><div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500"><span>Market pressure</span><span>Extreme</span></div><Meter value={96} color="red"/></div>
        </div>
      </div>
    </section>
    <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatTile icon={ArrowRightLeft} label="Active Deals" value="07" delta="€82.4M volume" accent="cyan"/><StatTile icon={Flame} label="Bid Wars" value="02" delta="High pressure" accent="rose"/><StatTile icon={Users} label="Interested Clubs" value="18" delta="+6 this week" accent="lime"/><StatTile icon={Clock3} label="Urgent Actions" value="04" delta="Under 24 hours" accent="gold"/></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.75fr]">
      <GamePanel className="status-scan overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-rose-300">Live negotiations</p><h2 className="mt-1 text-sm font-black uppercase italic">Offer Exchange</h2></div><Radio size={16} className="pulse-live text-rose-400"/></div><div className="divide-y divide-white/[.06]">{offers.map((o,i)=><div key={o.player} className="live-row grid gap-4 px-5 py-5 md:grid-cols-[1.1fr_.7fr_.7fr_.65fr] md:items-center" style={{"--row-accent":o.demand>90?"#fb7185":o.demand>70?"#fbbf24":"#22d3ee"} as React.CSSProperties}><div className="flex items-center gap-3"><span className="interactive-icon grid size-9 place-items-center rounded-lg border border-white/[.08] bg-white/[.03] text-[9px] font-black text-slate-500">0{i+1}</span><div><p className="text-[11px] font-black uppercase italic">{o.player}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{o.from}</p></div></div><div><p className="text-[8px] text-slate-600">OFFER</p><p className="number-glow mt-1 text-sm font-black">{o.amount}</p><p className={`mt-1 text-[8px] font-bold ${o.up?"text-[#a3ff12]":"text-rose-300"}`}>{o.change}</p></div><div><div className="flex justify-between text-[8px]"><span className="font-black text-slate-500">DEMAND</span><span className="font-black text-cyan-300">{o.demand}</span></div><div className="mt-2"><Meter value={o.demand} color={o.demand>90?"red":o.demand>70?"gold":"cyan"}/></div><p className="mt-2 text-[8px] font-black text-amber-300">{o.status}</p></div><div className="md:text-right"><p className="text-[8px] text-slate-600">EXPIRES</p><p className="mt-1 font-mono text-[10px] font-bold">{o.deadline}</p><button className="mt-2 text-[8px] font-black uppercase text-cyan-300 transition hover:text-white">Enter room →</button></div></div>)}</div></GamePanel>
      <div className="space-y-5"><GamePanel className="p-5"><SectionHeader kicker="Market Velocity" title="Value Fluctuation" action={<TrendingUp size={14} className="text-[#a3ff12]"/>}/><div className="mt-5 flex h-32 items-end gap-1">{[42,38,51,49,62,59,74,68,81,78,92,88,96].map((v,i)=><span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-blue-600/20 to-cyan-300/70" style={{height:`${v}%`}}/>)}</div><div className="mt-4 flex justify-between text-[8px] font-bold text-slate-600"><span>JUN 01</span><span className="text-[#a3ff12]">+14.8% MARKET</span><span>JUN 22</span></div></GamePanel><GamePanel className="border-rose-400/15 p-5"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-400/10 text-rose-300"><AlertTriangle size={15}/></span><div><p className="text-[10px] font-black uppercase">Agent pressure alert</p><p className="mt-2 text-[9px] leading-5 text-slate-500">Two competing agents entered the Enzo Martínez negotiation. Your exclusivity window ends in 19 hours.</p><button className="mt-3 text-[8px] font-black uppercase text-rose-300">Defend position →</button></div></div></GamePanel></div>
    </div>
  </div>;
}
