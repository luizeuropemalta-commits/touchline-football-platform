import Link from "next/link";
import {
  ArrowUpRight,
  BadgeEuro,
  Binoculars,
  Building2,
  CalendarClock,
  Crown,
  Flame,
  Gamepad2,
  MessageSquare,
  Radio,
  ShieldCheck,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { players } from "@/lib/demo-data";
import { Meter, PlayerGameCard } from "@/components/game-ui";

const modes = [
  { href: "/deals", title: "Transfer Window", subtitle: "Bid wars, offers, negotiations", icon: Zap, accent: "lime" },
  { href: "/players", title: "Squad Vault", subtitle: "Player cards, growth, videos", icon: Users, accent: "cyan" },
  { href: "/scouting", title: "Scout Network", subtitle: "Wonderkids and hidden gems", icon: Binoculars, accent: "gold" },
  { href: "/clubs", title: "Club Hub", subtitle: "Directors, shortlists, meetings", icon: Building2, accent: "blue" },
];

const sideCards = [
  ["Global Rank", "#184", Trophy, "↑ 23 this week"],
  ["Agency OVR", "92", Crown, "Elite tier"],
  ["Market Heat", "LIVE", Radio, "7 active talks"],
];

const fixtures = [
  ["Objective", "Close Enzo bid war", "01:42:18"],
  ["Inbox", "5 urgent club messages", "NEW"],
  ["Scouting", "3 wonderkids detected", "HOT"],
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
                  <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" /> Live Career Mode
                </span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                  Founder admin unlocked
                </span>
              </div>

              <div className="mt-12">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[.36em] text-cyan-200/65">
                  Main Menu / Agent Career
                </p>
                <h1 className="console-title font-display text-[70px] uppercase italic leading-[.78] text-white sm:text-[118px] xl:text-[150px]">
                  AF
                  <br />
                  Career
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300/80">
                  Run the football world from one playable command hub: players, clubs, transfers, scouting,
                  rankings and reputation.
                </p>
              </div>

              <div className="mt-9 grid max-w-4xl gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
                <Link href="/deals" className="continue-career-button flex min-h-[92px] items-center justify-between px-7 text-[#071007]">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.24em]">Press to play</span>
                    <span className="mt-1 block text-2xl font-black uppercase italic tracking-[-.06em]">Continue Career</span>
                  </span>
                  <Gamepad2 size={28} />
                </Link>
                <Link href="/players" className="console-mini-card flex items-center justify-between p-5 text-white transition hover:-translate-y-1">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.22em] text-cyan-300/60">Next</span>
                    <span className="mt-1 block text-sm font-black uppercase italic">Open Squad</span>
                  </span>
                  <Users className="text-cyan-300" />
                </Link>
                <Link href="/rankings" className="console-mini-card flex items-center justify-between p-5 text-white transition hover:-translate-y-1">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.22em] text-amber-300/60">World</span>
                    <span className="mt-1 block text-sm font-black uppercase italic">Rankings</span>
                  </span>
                  <Trophy className="text-amber-300" />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {modes.map(({ href, title, subtitle, icon: Icon, accent }) => (
                <Link key={href} href={href} className="mode-tile group min-h-[168px] p-5" data-accent={accent}>
                  <div className="relative z-10 flex items-start justify-between">
                    <span className="console-mode-icon"><Icon size={21} /></span>
                    <ArrowUpRight size={15} className="text-white/40 transition group-hover:text-[#a3ff12]" />
                  </div>
                  <div className="relative z-10 mt-8">
                    <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-200/55">Game mode</p>
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
                  <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-300">Manager profile</p>
                  <h2 className="mt-2 text-2xl font-black uppercase italic text-white">Luiz Founder Office</h2>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Malta · Elite agency</p>
                </div>
                <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-center">
                  <p className="text-[8px] font-black uppercase text-[#a3ff12]">OVR</p>
                  <p className="font-display text-5xl">92</p>
                </div>
              </div>
              <div className="relative z-10 mt-6">
                <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                  <span>Icon agent progress</span>
                  <span>84%</span>
                </div>
                <Meter value={84} color="lime" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {sideCards.map(([label, value, Icon, note]) => {
                const CardIcon = Icon as typeof Trophy;
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
                <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Live career feed</p>
                <Flame size={16} className="text-rose-300" />
              </div>
              <div className="space-y-3">
                {fixtures.map(([type, title, meta]) => (
                  <div key={title} className="flex items-center justify-between rounded-2xl border border-white/[.07] bg-white/[.035] p-3">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{type}</p>
                      <p className="mt-1 text-[11px] font-black uppercase italic text-white">{title}</p>
                    </div>
                    <span className="rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-2 py-1 text-[8px] font-black text-[#a3ff12]">{meta}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="console-mini-card p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Featured squad cards</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">Top Talents</h2>
            </div>
            <Star className="text-amber-300" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {players.slice(0, 4).map((player) => <PlayerGameCard key={player.id} player={player} compact />)}
          </div>
        </div>

        <div className="console-mini-card p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-amber-300">Transfer room</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">Market Pulse</h2>
            </div>
            <BadgeEuro className="text-[#a3ff12]" />
          </div>
          <div className="space-y-3">
            {[
              ["Enzo Martínez", "ARS · RMA", "€42.5M", "BID WAR"],
              ["Luca Bianchi", "BVB · ATM", "€26.0M", "COUNTER"],
              ["Noah Williams", "BHA", "€4.2M/YR", "RENEWAL"],
            ].map(([name, clubs, value, status]) => (
              <div key={name} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black uppercase italic text-white">{name}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{clubs}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#a3ff12]">{value}</p>
                    <p className="mt-1 text-[8px] font-black uppercase text-rose-300">{status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
