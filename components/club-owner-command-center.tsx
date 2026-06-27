import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BadgeEuro,
  Banknote,
  Bell,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Crown,
  Dumbbell,
  Landmark,
  Medal,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";

import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { TouchlinePlayerCard } from "@/components/touchline-card-engine";

type CommandCenterPlayer = {
  id: string;
  name: string;
  position: string;
  photoUrl: string | null;
  marketValue: number | null;
  currency: string | null;
};

type CommandCenterData = {
  owner: {
    name: string;
    avatarUrl: string | null;
    country: string;
    ranking: string;
    reputation: number;
  };
  club: {
    id: string | null;
    name: string;
    badgeUrl: string | null;
    league: string;
    division: string;
    country: string;
    rating: number;
    netWorth: number;
    credits: number;
    prestige: "Bronze" | "Silver" | "Gold" | "Emerald" | "Diamond";
    lastUpdated: string;
  };
  financial: {
    cash: number;
    transferBudget: number;
    salaryBudget: number;
    revenue: number;
    expenses: number;
    ffpStatus: "Healthy" | "Monitor" | "At Risk";
  };
  squad: {
    startingXi: number;
    bench: number;
    totalPlayers: number;
    goldCards: number;
    silverCards: number;
    bronzeCards: number;
    squadMarketValue: number;
    coach: string;
    formation: string;
    players: CommandCenterPlayer[];
  };
  competition: {
    leaguePosition: string;
    nextMatch: string;
    seasonProgress: number;
    promotionZone: string;
    relegationZone: string;
    championsQualification: string;
  };
  transfer: {
    latestOffers: number;
    pendingOffers: number;
    negotiations: number;
    watchlist: number;
    recentTransfers: number;
  };
  liveArena: {
    nextMatch: string;
    countdown: string;
    latestResults: string[];
  };
  history: {
    titles: number;
    cups: number;
    bestSeason: string;
    biggestTransfer: string;
    legacy: string;
  };
  notifications: Array<{
    title: string;
    body: string;
    tone: "green" | "cyan" | "gold" | "rose";
  }>;
};

function formatMoney(value: number, currency = "EUR") {
  if (!value) return "Value pending";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function prestigeClasses(prestige: CommandCenterData["club"]["prestige"]) {
  const map = {
    Bronze: "border-amber-700/55 from-amber-500/20 via-white/[.03] to-orange-950/25 shadow-[0_0_42px_rgba(180,83,9,.18)]",
    Silver: "border-slate-200/45 from-slate-200/18 via-white/[.03] to-cyan-950/20 shadow-[0_0_42px_rgba(226,232,240,.14)]",
    Gold: "border-amber-300/55 from-amber-300/24 via-white/[.04] to-yellow-950/25 shadow-[0_0_48px_rgba(251,191,36,.2)]",
    Emerald: "border-emerald-300/55 from-emerald-300/25 via-white/[.04] to-emerald-950/25 shadow-[0_0_50px_rgba(52,211,153,.2)]",
    Diamond: "border-cyan-200/60 from-cyan-200/25 via-white/[.05] to-blue-950/25 shadow-[0_0_58px_rgba(103,232,249,.24)]",
  };
  return map[prestige];
}

function toneClass(tone: "green" | "cyan" | "gold" | "rose") {
  const tones = {
    green: "border-[#a3ff12]/25 bg-[#a3ff12]/[.07] text-[#baff4c]",
    cyan: "border-cyan-300/20 bg-cyan-300/[.06] text-cyan-100",
    gold: "border-amber-300/20 bg-amber-300/[.07] text-amber-100",
    rose: "border-rose-300/20 bg-rose-300/[.07] text-rose-100",
  };
  return tones[tone];
}

function StatTile({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="glass glass-hover console-hud group rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="interactive-icon grid size-9 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.08] text-cyan-300">
          {icon}
        </span>
        <ArrowUpRight size={12} className="text-slate-700 transition group-hover:text-[#a3ff12]" />
      </div>
      <p className="mt-5 text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <strong className="number-glow font-display text-[28px] leading-none text-white">{value}</strong>
        <span className="mb-0.5 text-[8px] font-bold text-slate-500 transition group-hover:text-slate-300">{detail}</span>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ClubOwnerCard({ data }: { data: CommandCenterData }) {
  return (
    <section className={`relative overflow-hidden rounded-[2rem] border bg-gradient-to-br p-5 sm:p-6 ${prestigeClasses(data.club.prestige)}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(163,255,18,.18),transparent_28%),radial-gradient(circle_at_86%_20%,rgba(34,211,238,.16),transparent_24%),linear-gradient(110deg,transparent_0%,rgba(255,255,255,.10)_45%,transparent_55%)] opacity-80" />
      <div className="absolute -right-20 -top-24 size-72 rounded-full border border-white/10" />
      <div className="absolute -bottom-28 left-1/3 size-72 rounded-full bg-[#a3ff12]/10 blur-3xl" />

      <div className="relative z-10 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/35">
            <div className="aspect-[4/5] bg-cyan-300/[.05]">
              {data.owner.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.owner.avatarUrl} alt={data.owner.name} className="h-full w-full object-cover object-top" />
              ) : (
                <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,.18),transparent_65%)] text-6xl font-black italic text-cyan-200/50">
                  {initials(data.owner.name)}
                </div>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06111c] via-[#06111c]/88 to-transparent p-4">
              <LivePill>TDIE owner identity</LivePill>
            </div>
          </div>
        </div>

        <div className="min-w-0 self-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-cyan-100">
              {data.club.prestige} prestige border
            </span>
            <span className="rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-[#baff4c]">
              Global ranking {data.owner.ranking}
            </span>
          </div>

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.34em] text-cyan-200/70">Club Owner Command Center</p>
              <h1 className="mt-3 font-display text-[clamp(3.2rem,7vw,7.9rem)] uppercase italic leading-[.82] text-white">
                {data.club.name}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300/80">
                Managed by <span className="font-black text-white">{data.owner.name}</span>. {data.club.league} · {data.club.division} · {data.club.country}.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3 rounded-3xl border border-white/10 bg-black/30 p-3">
              <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06]">
                {data.club.badgeUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.club.badgeUrl} alt={data.club.name} className="max-h-16 max-w-16 object-contain" />
                ) : (
                  <ShieldCheck className="text-cyan-200" size={30} />
                )}
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.2em] text-slate-500">OVR</p>
                <p className="font-display text-5xl text-white">{data.club.rating}</p>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Club Net Worth" value={formatMoney(data.club.netWorth)} detail="cash + squad value" icon={<Landmark size={20} />} />
            <StatTile label="Touchline Credits" value={data.club.credits.toLocaleString("en")} detail="ecosystem balance" icon={<Sparkles size={20} />} />
            <StatTile label="Reputation" value={`${data.owner.reputation}%`} detail="trust layer" icon={<ShieldCheck size={20} />} />
            <StatTile label="Last Update" value={data.club.lastUpdated} detail="database source" icon={<CalendarClock size={20} />} />
          </div>
        </div>
      </div>
    </section>
  );
}

function CenterCard({
  title,
  kicker,
  icon,
  children,
}: {
  title: string;
  kicker: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <GamePanel className="p-5 sm:p-6">
      <SectionHeader kicker={kicker} title={title} action={icon} />
      <div className="mt-5">{children}</div>
    </GamePanel>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-white/[.08] bg-white/[.035] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[#a3ff12]/25 hover:bg-[#a3ff12]/[.05]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200">{icon}</span>
        <span className="truncate text-[10px] font-black uppercase italic tracking-[.08em] text-white">{label}</span>
      </span>
      <ArrowUpRight size={13} className="shrink-0 text-slate-600 transition group-hover:text-cyan-200" />
    </Link>
  );
}

export function ClubOwnerCommandCenter({ data }: { data: CommandCenterData }) {
  const financeCompleteness = data.financial.ffpStatus === "Healthy" ? 88 : data.financial.ffpStatus === "Monitor" ? 62 : 36;
  const squadCompleteness = Math.min(100, Math.round((data.squad.totalPlayers / 35) * 100));

  return (
    <div className="mx-auto w-full max-w-[1760px] min-w-0 animate-in space-y-6">
      <ClubOwnerCard data={data} />

      <GamePanel className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <LivePill>Touchline Fantasy Entry</LivePill>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Club Owner Home Screen
              </span>
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300/80">
              This is the official Fantasy starting point: manage your club identity, squad value, economy, competitions, transfers and live match flow from one command center.
            </p>
          </div>
          <Link href="/football-search" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[10px] font-black uppercase tracking-[.16em] text-[#071007] transition hover:bg-cyan-200">
            Start Building Squad <ArrowUpRight size={14} />
          </Link>
        </div>
      </GamePanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
          <CenterCard kicker="Club economy" title="Financial Center" icon={<CircleDollarSign className="text-[#a3ff12]" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label="Club Bank" value={formatMoney(data.financial.cash)} detail="available cash" icon={<Banknote size={19} />} />
              <StatTile label="Transfer Budget" value={formatMoney(data.financial.transferBudget)} detail="transfer center" icon={<BadgeEuro size={19} />} />
              <StatTile label="Salary Budget" value={formatMoney(data.financial.salaryBudget)} detail="squad wages" icon={<WalletCards size={19} />} />
              <StatTile label="FFP Status" value={data.financial.ffpStatus} detail="financial fair play" icon={<ShieldCheck size={19} />} />
            </div>
            <div className="mt-5 rounded-3xl border border-white/[.07] bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between text-[8px] font-black uppercase tracking-[.18em] text-slate-500">
                <span>Financial readiness</span>
                <span>{financeCompleteness}%</span>
              </div>
              <Meter value={financeCompleteness} color={financeCompleteness >= 70 ? "lime" : "gold"} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <p className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[.04] p-3 text-[10px] font-black uppercase text-emerald-100">
                  Revenue · {formatMoney(data.financial.revenue)}
                </p>
                <p className="rounded-2xl border border-rose-300/10 bg-rose-300/[.04] p-3 text-[10px] font-black uppercase text-rose-100">
                  Expenses · {formatMoney(data.financial.expenses)}
                </p>
              </div>
            </div>
          </CenterCard>

          <CenterCard kicker="Team management" title="Squad Summary" icon={<Users className="text-cyan-300" />}>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Starting XI" value={data.squad.startingXi} detail="match squad" icon={<Target size={19} />} />
              <StatTile label="Bench" value={data.squad.bench} detail="available subs" icon={<Dumbbell size={19} />} />
              <StatTile label="Players" value={data.squad.totalPlayers} detail="registered cards" icon={<Users size={19} />} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <p className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-center text-[10px] font-black uppercase text-amber-100">Gold · {data.squad.goldCards}</p>
              <p className="rounded-2xl border border-slate-200/15 bg-slate-200/[.05] p-3 text-center text-[10px] font-black uppercase text-slate-100">Silver · {data.squad.silverCards}</p>
              <p className="rounded-2xl border border-orange-300/15 bg-orange-300/[.05] p-3 text-center text-[10px] font-black uppercase text-orange-100">Bronze · {data.squad.bronzeCards}</p>
            </div>
            <div className="mt-5 rounded-3xl border border-white/[.07] bg-black/20 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">Coach</p>
                  <p className="mt-1 text-sm font-black uppercase italic text-white">{data.squad.coach}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">Formation</p>
                  <p className="mt-1 text-sm font-black uppercase italic text-[#a3ff12]">{data.squad.formation}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">Squad Value</p>
                  <p className="mt-1 text-sm font-black uppercase italic text-cyan-100">{formatMoney(data.squad.squadMarketValue)}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                  <span>35-player registration</span>
                  <span>{squadCompleteness}%</span>
                </div>
                <Meter value={squadCompleteness} color="cyan" />
              </div>
            </div>
          </CenterCard>

          <CenterCard kicker="Season command" title="Competition Center" icon={<Trophy className="text-amber-300" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label="League" value={data.club.league} detail={data.club.division} icon={<Medal size={19} />} />
              <StatTile label="Position" value={data.competition.leaguePosition} detail="current table" icon={<Crown size={19} />} />
              <StatTile label="Next Match" value={data.competition.nextMatch} detail="fixture center" icon={<CalendarClock size={19} />} />
              <StatTile label="Season" value={`${data.competition.seasonProgress}%`} detail="progress" icon={<Radio size={19} />} />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.05] p-4">
                <p className="text-[8px] font-black uppercase tracking-[.18em] text-[#baff4c]">Promotion Zone</p>
                <p className="mt-2 text-sm font-black uppercase italic text-white">{data.competition.promotionZone}</p>
              </div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.05] p-4">
                <p className="text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">Champions</p>
                <p className="mt-2 text-sm font-black uppercase italic text-white">{data.competition.championsQualification}</p>
              </div>
              <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[.05] p-4">
                <p className="text-[8px] font-black uppercase tracking-[.18em] text-rose-100">Relegation</p>
                <p className="mt-2 text-sm font-black uppercase italic text-white">{data.competition.relegationZone}</p>
              </div>
            </div>
          </CenterCard>

          <CenterCard kicker="Negotiation room" title="Transfer Center" icon={<Zap className="text-[#a3ff12]" />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatTile label="Latest Offers" value={data.transfer.latestOffers} detail="new activity" icon={<Bell size={18} />} />
              <StatTile label="Pending" value={data.transfer.pendingOffers} detail="awaiting answer" icon={<ClipboardList size={18} />} />
              <StatTile label="Negotiations" value={data.transfer.negotiations} detail="deal rooms" icon={<Zap size={18} />} />
              <StatTile label="Watchlist" value={data.transfer.watchlist} detail="targets" icon={<Search size={18} />} />
              <StatTile label="Transfers" value={data.transfer.recentTransfers} detail="recent moves" icon={<ArrowUpRight size={18} />} />
            </div>
            <Link href="/deals" className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[10px] font-black uppercase tracking-[.16em] text-[#071007] transition hover:bg-cyan-200">
              Open Transfer Center <ArrowUpRight size={14} />
            </Link>
          </CenterCard>
        </div>

        <aside className="min-w-0 space-y-4">
          <GamePanel className="p-5 sm:p-6">
            <SectionHeader kicker="Matchday energy" title="Live Arena Preview" action={<Radio className="pulse-live text-[#a3ff12]" />} />
            <div className="mt-5 rounded-[1.6rem] border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] p-5">
              <p className="text-[8px] font-black uppercase tracking-[.2em] text-[#baff4c]">Next Match</p>
              <h3 className="mt-2 text-2xl font-black uppercase italic text-white">{data.liveArena.nextMatch}</h3>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[.16em] text-cyan-100">Countdown · {data.liveArena.countdown}</p>
              <Link href="/competition" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-white/10 bg-white/[.05] px-4 text-[9px] font-black uppercase tracking-[.16em] text-white">
                Live Button <ArrowUpRight size={13} className="ml-2" />
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {data.liveArena.latestResults.map((result) => (
                <p key={result} className="rounded-2xl border border-white/[.07] bg-black/20 p-3 text-[10px] font-black uppercase text-slate-300">
                  {result}
                </p>
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 sm:p-6">
            <SectionHeader kicker="Club legacy" title="History" action={<Trophy className="text-amber-300" />} />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile label="Titles" value={data.history.titles} detail="major honours" icon={<Trophy size={18} />} />
              <StatTile label="Cups" value={data.history.cups} detail="knockout wins" icon={<Medal size={18} />} />
            </div>
            <div className="mt-4 space-y-3">
              <p className="rounded-2xl border border-white/[.07] bg-black/20 p-4 text-[10px] font-black uppercase text-slate-300">Best season · {data.history.bestSeason}</p>
              <p className="rounded-2xl border border-white/[.07] bg-black/20 p-4 text-[10px] font-black uppercase text-slate-300">Biggest transfer · {data.history.biggestTransfer}</p>
              <p className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.04] p-4 text-xs leading-6 text-cyan-50/80">{data.history.legacy}</p>
            </div>
          </GamePanel>

          <GamePanel className="p-5 sm:p-6">
            <SectionHeader kicker="Club signals" title="Notifications" action={<Bell className="text-cyan-300" />} />
            <div className="mt-5 space-y-3">
              {data.notifications.map((item) => (
                <div key={item.title} className={`rounded-2xl border p-4 ${toneClass(item.tone)}`}>
                  <p className="text-[10px] font-black uppercase italic tracking-[.08em]">{item.title}</p>
                  <p className="mt-1 text-[10px] leading-5 opacity-75">{item.body}</p>
                </div>
              ))}
            </div>
          </GamePanel>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <GamePanel className="p-5 sm:p-6">
          <SectionHeader kicker="Registered squad" title="Top Squad Assets" action={<Star className="text-amber-300" />} />
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.squad.players.length ? (
              data.squad.players.slice(0, 8).map((player) => (
                <TouchlinePlayerCard
                  key={player.id}
                  variant="compact"
                  player={{
                    id: player.id,
                    name: player.name,
                    initials: initials(player.name),
                    position: player.position,
                    officialMarketValue: player.marketValue,
                    officialMarketValueLabel: formatMoney(player.marketValue ?? 0, player.currency ?? "EUR"),
                    currency: player.currency,
                    context: "dashboard",
                  }}
                />
              ))
            ) : (
              <div className="rounded-3xl border border-amber-300/15 bg-amber-300/[.05] p-6 md:col-span-2 xl:col-span-4">
                <p className="text-sm font-black uppercase italic text-amber-100">No synced squad yet</p>
                <p className="mt-2 text-xs leading-6 text-amber-100/65">
                  Run the Football Data Foundation sync to populate real club, squad and player records from the provider-independent data layer.
                </p>
              </div>
            )}
          </div>
        </GamePanel>

        <GamePanel className="p-5 sm:p-6">
          <SectionHeader kicker="One-click command" title="Quick Actions" action={<Sparkles className="text-[#a3ff12]" />} />
          <div className="mt-5 grid gap-3">
            <QuickAction href="/football-search" label="Football Search" icon={<Search size={18} />} />
            <QuickAction href="/deals" label="Transfer Center" icon={<Zap size={18} />} />
            <QuickAction href="/competition" label="Live Arena" icon={<Radio size={18} />} />
            <QuickAction href="/competition" label="Competitions" icon={<Trophy size={18} />} />
            <QuickAction href="/football-search?type=player" label="Player Search" icon={<Users size={18} />} />
            <QuickAction href="/football-search?type=coach" label="Coach Search" icon={<Dumbbell size={18} />} />
            <QuickAction href="/settings" label="Settings" icon={<Settings size={18} />} />
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
