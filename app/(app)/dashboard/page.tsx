import Link from "next/link";
import { ArrowUpRight, BadgeEuro, Binoculars, Bot, Building2, Flame, Gamepad2, GraduationCap, Landmark, MessageSquare, Newspaper, Radio, ShieldCheck, Sparkles, Target, Trophy, Users, Zap } from "lucide-react";
import { players } from "@/lib/demo-data";
import { GamePanel, LivePill, Meter, PlayerGameCard, SectionHeader, StatTile } from "@/components/game-ui";

const negotiations = [
  { player:"Enzo Martínez", clubs:"ARS · RMA", offer:"€42.5M", status:"BID WAR", heat:94, time:"01:42:18", color:"text-rose-300" },
  { player:"Luca Bianchi", clubs:"BVB · ATM", offer:"€26.0M", status:"COUNTER", heat:77, time:"06:18:04", color:"text-amber-300" },
  { player:"Noah Williams", clubs:"BHA", offer:"€4.2M / YR", status:"RENEWAL", heat:52, time:"2 DAYS", color:"text-cyan-300" },
];

export default function Dashboard() {
  const modes = [
    { href: "/players", title: "Squad Vault", note: "Manage career cards", icon: Users, glow: "rgba(34,211,238,.28)", active: true },
    { href: "/deals", title: "Transfer Window", note: "Live offers & bid wars", icon: Zap, glow: "rgba(163,255,18,.28)" },
    { href: "/scouting", title: "Scout Network", note: "Find hidden gems", icon: Binoculars, glow: "rgba(247,198,93,.28)" },
    { href: "/inbox", title: "Career Inbox", note: "Club messages", icon: MessageSquare, glow: "rgba(251,113,133,.25)" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <section className="career-stage premium-ring status-scan mb-6 p-5 sm:p-7 lg:p-8">
        <div className="stadium-stands" />
        <div className="pitch-lines" />
        <div className="relative z-10 grid gap-7 xl:grid-cols-[1.25fr_.75fr] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <LivePill>AF Career Mode</LivePill>
              <span className="xp-ribbon rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">Season 26 · Summer Window</span>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-amber-200">Founder Admin</span>
            </div>
            <h1 className="console-title font-display max-w-4xl text-5xl uppercase italic leading-[.86] text-white sm:text-7xl xl:text-8xl">
              Agent football universe
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">
              Build careers, dominate transfer windows, discover talents and grow your global football reputation inside a console-style operating system.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/deals" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#a3ff12] px-6 text-[9px] font-black uppercase tracking-[.14em] text-[#081008] shadow-[0_0_38px_rgba(163,255,18,.22)]">Enter transfer window <Zap size={15}/></Link>
              <Link href="/players" className="inline-flex h-12 items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/[.08] px-6 text-[9px] font-black uppercase tracking-[.14em] text-cyan-100">Open squad cards <Gamepad2 size={15}/></Link>
            </div>
          </div>
          <div className="stadium-scoreboard p-5">
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Agent rating</p>
                <p className="font-display mt-2 text-7xl leading-none text-white text-glow">842</p>
              </div>
              <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-right">
                <p className="text-[8px] font-black uppercase tracking-wider text-[#a3ff12]">Global rank</p>
                <p className="font-display mt-1 text-4xl">#184</p>
              </div>
            </div>
            <div className="relative z-10 mt-6">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500"><span>Icon agent progress</span><span>84%</span></div>
              <Meter value={84} color="lime"/>
            </div>
            <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">Deals</p><p className="mt-1 text-sm font-black">18</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">Players</p><p className="mt-1 text-sm font-black">24</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">Revenue</p><p className="mt-1 text-sm font-black">€2.84M</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modes.map(({ href, title, note, icon: Icon, glow, active }) => (
          <Link key={href} href={href} className={`mode-tile ${active ? "mode-tile-active" : ""} p-5`} style={{ "--mode-glow": glow } as React.CSSProperties}>
            <div className="relative z-10 flex items-start justify-between">
              <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-black/20 text-cyan-100"><Icon size={20}/></span>
              <ArrowUpRight size={15} className="text-white/35"/>
            </div>
            <div className="relative z-10 mt-6">
              <p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-200/70">Game mode</p>
              <h2 className="mt-1 text-xl font-black uppercase italic tracking-[-.05em] text-white">{title}</h2>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{note}</p>
            </div>
          </Link>
        ))}
      </section>

      <div className="stagger grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
        <GamePanel className="premium-ring status-scan console-hud relative overflow-hidden p-5 pitch-grid sm:p-7">
          <div className="soft-orbit right-[-5%] top-[-25%] size-72"/><div className="soft-orbit right-[2%] top-[-6%] size-48"/>
          <div className="absolute -right-16 bottom-0 h-48 w-[420px] bg-gradient-to-l from-cyan-400/[.08] to-transparent blur-2xl"/>
          <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent"/>
          <div className="relative flex flex-col justify-between gap-8 md:flex-row">
            <div className="max-w-lg"><p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Agent Career Rating</p><div className="mt-3 flex items-end gap-4"><span className="number-glow font-display text-7xl leading-none text-glow text-white sm:text-8xl">842</span><div className="mb-2"><p className="text-[10px] font-black uppercase text-[#a3ff12]">Elite career tier</p><p className="mt-1 text-[9px] text-slate-400/70">+18 reputation this week</p></div></div><div className="mt-5 max-w-sm"><div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500"><span>Progress to Icon Agent</span><span>842 / 1,000</span></div><Meter value={84} color="lime"/></div></div>
            <div className="grid grid-cols-2 gap-2 md:w-[330px]"><div className="ps-focus rounded-2xl border border-white/[.08] bg-black/20 p-4"><Trophy size={17} className="text-amber-300"/><p className="mt-5 text-[8px] font-black uppercase tracking-wider text-slate-500">Global rank</p><p className="mt-1 font-display text-3xl">#184</p><p className="mt-1 text-[8px] text-[#a3ff12]">↑ 23 positions</p></div><div className="ps-focus rounded-2xl border border-white/[.08] bg-black/20 p-4"><ShieldCheck size={17} className="text-cyan-300"/><p className="mt-5 text-[8px] font-black uppercase tracking-wider text-slate-500">Network power</p><p className="mt-1 font-display text-3xl">91</p><p className="mt-1 text-[8px] text-cyan-300">Top 2% worldwide</p></div></div>
          </div>
        </GamePanel>

        <GamePanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300/70">Career progression</p><h2 className="mt-1 text-xs font-black uppercase italic">Monthly Objectives</h2></div><Target size={18} className="text-[#a3ff12]"/></div>
          <div className="space-y-4 p-5">
            {[["Close 3 transfer deals","2 / 3",67,"lime"],["Generate €500K fees","€412K",82,"gold"],["Sign a wonderkid","0 / 1",15,"cyan"]].map(([label,value,progress,color])=><div key={String(label)}><div className="mb-2 flex justify-between text-[9px]"><span className="font-bold text-slate-300">{label}</span><span className="font-black text-slate-500">{value}</span></div><Meter value={Number(progress)} color={color as "lime"|"gold"|"cyan"}/></div>)}
            <Link href="/objectives" className="mt-2 flex items-center justify-between rounded-lg border border-white/[.07] bg-white/[.025] px-3 py-2.5 text-[8px] font-black uppercase tracking-wider text-slate-500 hover:text-cyan-300"><span>View all objectives</span><ArrowUpRight size={12}/></Link>
          </div>
        </GamePanel>
      </div>

      <section className="stagger mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={BadgeEuro} label="Career Revenue" value="€2.84M" delta="+18.4% YTD" accent="gold"/>
        <StatTile icon={Zap} label="Closed Deals" value="18" delta="6 this window" accent="lime"/>
        <StatTile icon={Users} label="Managed Talent" value="24" delta="€146.8M value" accent="cyan"/>
        <StatTile icon={Flame} label="Market Momentum" value="92" delta="Hot streak × 7" accent="rose"/>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.8fr]">
        <GamePanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><div className="flex items-center gap-2"><Radio size={13} className="text-rose-400"/><p className="text-[8px] font-black uppercase tracking-[.2em] text-rose-300">Live Room</p></div><h2 className="mt-1 text-sm font-black uppercase italic">Negotiation Board</h2></div><Link href="/deals" className="text-[8px] font-black uppercase tracking-wider text-cyan-400">Open transfer hub →</Link></div>
          <div className="divide-y divide-white/[.06]">
            {negotiations.map((n,i)=><div key={n.player} className="live-row group grid items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_110px_100px_90px]" style={{"--row-accent":i===0?"#fb7185":i===1?"#fbbf24":"#22d3ee"} as React.CSSProperties}><div className="flex items-center gap-3"><span className="interactive-icon grid size-8 place-items-center rounded-lg border border-white/[.08] bg-white/[.03] text-[9px] font-black text-slate-400">0{i+1}</span><div><p className="text-[11px] font-black uppercase italic">{n.player}</p><p className="mt-1 text-[8px] font-bold tracking-wider text-slate-600">{n.clubs} COMPETING</p></div></div><div><p className="text-[8px] text-slate-600">LEADING OFFER</p><p className="mt-1 text-xs font-black">{n.offer}</p></div><div><p className={cnText("text-[8px] font-black",n.color)}>{n.status}</p><div className="mt-2 w-20"><Meter value={n.heat} color={i===0?"red":i===1?"gold":"cyan"}/></div></div><div className="text-right"><p className="text-[8px] text-slate-600">DEADLINE</p><p className="mt-1 font-mono text-[10px] font-bold text-slate-300">{n.time}</p></div></div>)}
          </div>
        </GamePanel>

        <GamePanel className="relative overflow-hidden p-5">
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-cyan-500/[.08] to-transparent"/>
          <SectionHeader kicker="Live intelligence" title="Market Pulse" action={<Sparkles size={15} className="text-cyan-300"/>}/>
          <div className="relative mt-6 flex h-32 items-end gap-1.5 border-b border-white/[.08]">{[28,42,36,54,48,63,58,74,69,86,78,94].map((h,i)=><div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-600/30 to-cyan-300/75 transition hover:to-[#a3ff12]" style={{height:`${h}%`}}/>)}</div>
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center"><div><p className="text-[8px] text-slate-600">ACTIVITY</p><p className="mt-1 text-xs font-black text-[#a3ff12]">+24%</p></div><div className="border-x border-white/[.07]"><p className="text-[8px] text-slate-600">AVG. VALUE</p><p className="mt-1 text-xs font-black">€8.2M</p></div><div><p className="text-[8px] text-slate-600">DEMAND</p><p className="mt-1 text-xs font-black text-cyan-300">HIGH</p></div></div>
        </GamePanel>
      </div>

      <section className="mt-6">
        <SectionHeader kicker="Squad intelligence" title="Top Talents" action={<Link href="/players" className="text-[8px] font-black uppercase tracking-wider text-cyan-400">View full squad →</Link>}/>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{players.slice(0,4).map(player=><PlayerGameCard key={player.id} player={player} compact/>)}</div>
      </section>

      <section className="mt-6">
        <SectionHeader kicker="Connected Football Universe" title="Ecosystem Pulse" action={<span className="text-[8px] font-black uppercase tracking-wider text-[#a3ff12]">462 entities live</span>}/>
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["/clubs","Club Network","216 clubs","42 directors online",Building2,"text-cyan-300"],
            ["/academies","Academy Network","2,840 talents","184 newly uploaded",GraduationCap,"text-[#a3ff12]"],
            ["/investors","Investor Hub","€38.4M active","3 new deal rooms",Landmark,"text-amber-300"],
            ["/feed","World Feed","1,482 updates","12 opportunities",Newspaper,"text-rose-300"],
            ["/ai","Touchline AI","94.2 intelligence","6 specialist models",Bot,"text-violet-300"],
          ].map(([href,title,value,note,Icon,color]) => {
            const EcosystemIcon = Icon as typeof Building2;
            return <Link key={String(href)} href={String(href)} className="glass glass-hover group rounded-xl p-4"><div className="flex items-center justify-between"><EcosystemIcon size={16} className={String(color)}/><ArrowUpRight size={12} className="text-slate-700 transition group-hover:text-cyan-300"/></div><p className="mt-5 text-[8px] font-black uppercase tracking-[.14em] text-slate-600">{String(title)}</p><p className="mt-1 text-sm font-black">{String(value)}</p><p className="mt-1 text-[8px] text-slate-600">{String(note)}</p></Link>;
          })}
        </div>
      </section>
    </div>
  );
}

function cnText(...classes: string[]) { return classes.join(" "); }
