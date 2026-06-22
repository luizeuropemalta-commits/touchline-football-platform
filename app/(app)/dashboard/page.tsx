import Link from "next/link";
import {
  ArrowUpRight,
  BadgeEuro,
  Binoculars,
  Bot,
  Building2,
  Globe2,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { players } from "@/lib/demo-data";
import { GamePanel, Meter, PlayerGameCard } from "@/components/game-ui";

const ecosystemModules = [
  { href: "/players", title: "Player Portfolio", subtitle: "Profiles, video, contracts and career data", icon: Users, accent: "cyan" },
  { href: "/clubs", title: "Club Network", subtitle: "Search clubs, directors and recruitment needs", icon: Building2, accent: "blue" },
  { href: "/deals", title: "Deal Rooms", subtitle: "Offers, negotiations and transfer pipelines", icon: Zap, accent: "lime" },
  { href: "/scouting", title: "Scouting Center", subtitle: "Wonderkids, reports and regional discovery", icon: Binoculars, accent: "gold" },
];

const intelligence = [
  ["AI Matches", "18", "players fit active club searches", Sparkles],
  ["Club Needs", "42", "open recruitment requirements", Target],
  ["Messages", "11", "agent, club and scout conversations", MessageSquare],
];

const opportunities = [
  ["Left-back search", "Portugal U23 clubs", "6 player matches", "HIGH"],
  ["Striker shortlist", "Nordic second divisions", "3 promoted talents", "NEW"],
  ["Agency partnership", "Spanish academy network", "2 meetings due", "LIVE"],
];

export default function Dashboard() {
  return (
    <div className="relative mx-auto max-w-[1760px] animate-in">
      <section className="ps-career-home min-h-[calc(100vh-190px)] p-5 sm:p-7 xl:p-9">
        <div className="stadium-stands" />
        <div className="pitch-lines" />
        <div className="manager-silhouette" />

        <div className="relative z-10 grid min-h-[calc(100vh-250px)] gap-8 xl:grid-cols-[1fr_430px]">
          <div className="flex flex-col justify-between gap-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                  <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" /> Global ecosystem online
                </span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                  Founder admin access active
                </span>
              </div>

              <div className="mt-12">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[.36em] text-cyan-200/65">
                  Touchline / Global Football Network
                </p>
                <h1 className="console-title font-display text-[58px] uppercase italic leading-[.82] text-white sm:text-[96px] xl:text-[126px]">
                  Command
                  <br />
                  Center
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300/80">
                  Connect agents, clubs, scouts, players, academies and investors in one football business operating
                  system — built for recruitment, negotiations, portfolios and market intelligence.
                </p>
              </div>

              <div className="mt-9 grid max-w-4xl gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
                <Link href="/players" className="continue-career-button flex min-h-[92px] items-center justify-between px-7 text-[#071007]">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.24em]">Start here</span>
                    <span className="mt-1 block text-2xl font-black uppercase italic tracking-[-.06em]">Open Player Portfolio</span>
                  </span>
                  <Users size={28} />
                </Link>
                <Link href="/clubs" className="console-mini-card flex items-center justify-between p-5 text-white transition hover:-translate-y-1">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.22em] text-cyan-300/60">Network</span>
                    <span className="mt-1 block text-sm font-black uppercase italic">Club Database</span>
                  </span>
                  <Building2 className="text-cyan-300" />
                </Link>
                <Link href="/ai" className="console-mini-card flex items-center justify-between p-5 text-white transition hover:-translate-y-1">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.22em] text-amber-300/60">Assistant</span>
                    <span className="mt-1 block text-sm font-black uppercase italic">Touchline AI</span>
                  </span>
                  <Bot className="text-amber-300" />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {ecosystemModules.map(({ href, title, subtitle, icon: Icon, accent }) => (
                <Link key={href} href={href} className="mode-tile group min-h-[168px] p-5" data-accent={accent}>
                  <div className="relative z-10 flex items-start justify-between">
                    <span className="console-mode-icon"><Icon size={21} /></span>
                    <ArrowUpRight size={15} className="text-white/40 transition group-hover:text-[#a3ff12]" />
                  </div>
                  <div className="relative z-10 mt-8">
                    <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-200/55">Ecosystem module</p>
                    <h2 className="mt-2 text-2xl font-black uppercase italic tracking-[-.06em] text-white">{title}</h2>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{subtitle}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <aside className="space-y-4 xl:self-end">
            <div className="stadium-scoreboard p-5">
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-300">Founder office</p>
                  <h2 className="mt-2 text-2xl font-black uppercase italic text-white">Touchline HQ</h2>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Malta · Global football business</p>
                </div>
                <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-center">
                  <p className="text-[8px] font-black uppercase text-[#a3ff12]">REP</p>
                  <p className="font-display text-5xl">92</p>
                </div>
              </div>
              <div className="relative z-10 mt-6">
                <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                  <span>Network readiness</span>
                  <span>84%</span>
                </div>
                <Meter value={84} color="lime" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {intelligence.map(([label, value, note, Icon]) => {
                const CardIcon = Icon as typeof Sparkles;
                return (
                  <div key={String(label)} className="console-mini-card p-4 text-center">
                    <CardIcon size={18} className="mx-auto text-cyan-300" />
                    <p className="mt-3 text-[8px] font-black uppercase tracking-wider text-slate-500">{String(label)}</p>
                    <p className="mt-1 font-display text-2xl text-white">{String(value)}</p>
                    <p className="mt-1 text-[8px] text-[#a3ff12]">{String(note)}</p>
                  </div>
                );
              })}
            </div>

            <div className="console-mini-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Live opportunity feed</p>
                <Radio size={16} className="pulse-live text-rose-400" />
              </div>
              <div className="space-y-3">
                {opportunities.map(([type, title, meta, status]) => (
                  <div key={title} className="flex items-center justify-between rounded-2xl border border-white/[.07] bg-white/[.035] p-3">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{type}</p>
                      <p className="mt-1 text-[11px] font-black uppercase italic text-white">{title}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] text-slate-500">{meta}</p>
                      <span className="mt-1 inline-flex rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-2 py-1 text-[8px] font-black text-[#a3ff12]">{status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_420px]">
        <GamePanel className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Featured player portfolio</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">Market-ready talent</h2>
            </div>
            <Star className="text-amber-300" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {players.slice(0, 4).map((player) => <PlayerGameCard key={player.id} player={player} compact />)}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-amber-300">Market intelligence</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">Transfer pulse</h2>
            </div>
            <BadgeEuro className="text-[#a3ff12]" />
          </div>
          <div className="space-y-3">
            {[
              ["Southern Europe", "Full-backs + defensive midfielders", "+18% demand", "RISING"],
              ["Nordic market", "U21 attackers with resale value", "+11% demand", "HOT"],
              ["Middle East", "Experienced creators and strikers", "€64M active", "OPEN"],
            ].map(([region, detail, value, status]) => (
              <div key={region} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase italic text-white">{region}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#a3ff12]">{value}</p>
                    <p className="mt-1 text-[8px] font-black uppercase text-rose-300">{status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GamePanel>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["Football database", "Players, clubs, agents, coaches, leagues and transfer history in one connected structure.", Globe2],
          ["AI matching engine", "Clubs searching by position, value, contract status or region trigger opportunity alerts.", Sparkles],
          ["Secure business layer", "Private negotiation, contracts, documents, billing and permission-based access.", ShieldCheck],
        ].map(([title, body, Icon]) => {
          const CardIcon = Icon as typeof Globe2;
          return (
            <GamePanel key={String(title)} className="p-5">
              <CardIcon className="text-cyan-300" />
              <h3 className="mt-5 text-lg font-black uppercase italic text-white">{String(title)}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{String(body)}</p>
            </GamePanel>
          );
        })}
      </section>
    </div>
  );
}
