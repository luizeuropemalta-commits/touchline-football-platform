import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Eye,
  Film,
  Flame,
  GitCompare,
  Globe2,
  HeartPulse,
  ListPlus,
  Play,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRoundSearch,
  UsersRound,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { TouchlinePlayerCard } from "@/components/touchline-card-engine";
import type { TdiePlayerIdentity } from "@/lib/tdie/player-identity";
import { cn } from "@/lib/utils";

export type PlayerProfile2Data = {
  id: string;
  name: string;
  initials: string;
  sourceLabel: string;
  sourceId: string;
  sourceLinkLabel: string;
  profileUrl: string;
  internalProfileUrl: string;
  shareUrl: string;
  photoUrl?: string | null;
  tdieIdentity?: TdiePlayerIdentity | null;
  club?: string | null;
  nationality?: string | null;
  position?: string | null;
  age?: number | null;
  dateOfBirth?: string | null;
  height?: string | null;
  preferredFoot?: string | null;
  coach?: string | null;
  agent?: string | null;
  agency?: string | null;
  league?: string | null;
  competition?: string | null;
  marketValueLabel: string;
  marketValueNumber?: number | null;
  currency: string;
  contractExpiry?: string | null;
  joined?: string | null;
  placeOfBirth?: string | null;
  outfitter?: string | null;
  playerStatus?: string | null;
  updatedAtLabel: string;
  profileCompleteness: number;
  searchReadiness: number;
  cardTier: "Bronze" | "Silver" | "Gold";
  cardTierColor: "bronze" | "silver" | "gold";
  availability: string;
  transferStatus: string;
  currentForm: string;
  injuryStatus: string;
  honours: Array<{ label: string; count: number | null; icon: string }>;
  timeline: Array<{ label: string; value: string; meta: string; icon: ReactNode }>;
  stats: Array<{ label: string; value: string; detail: string; accent: "cyan" | "lime" | "gold" | "rose" }>;
  related: Array<{ label: string; value: string; href?: string; icon: ReactNode }>;
  videos: Array<{ title: string; description: string; href?: string }>;
  live: {
    status: string;
    minute: string;
    points: string;
    events: Array<{ label: string; value: string; accent: "cyan" | "lime" | "gold" | "rose" }>;
  };
};

function CardShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[2rem] border border-white/[.08] bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]", className)}>
      {children}
    </div>
  );
}

function MicroStat({ label, value, detail, accent = "cyan" }: { label: string; value: string; detail: string; accent?: "cyan" | "lime" | "gold" | "rose" }) {
  const colors = {
    cyan: "text-cyan-300 border-cyan-300/15 bg-cyan-300/[.045]",
    lime: "text-[#a3ff12] border-[#a3ff12]/15 bg-[#a3ff12]/[.045]",
    gold: "text-amber-300 border-amber-300/15 bg-amber-300/[.045]",
    rose: "text-rose-300 border-rose-300/15 bg-rose-300/[.045]",
  };

  return (
    <CardShell className={cn("min-w-0", colors[accent])}>
      <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{label}</p>
      <p className={cn("mt-2 truncate text-2xl font-black", colors[accent].split(" ")[0])}>{value}</p>
      <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-600">{detail}</p>
    </CardShell>
  );
}

export function PlayerProfileCommandCenter({ data }: { data: PlayerProfile2Data }) {
  return (
    <div className="mx-auto max-w-[1760px] animate-in">
      <Link href="/football-search" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />
        Return to football search
      </Link>

      <GamePanel className="relative overflow-hidden pitch-grid">
        <div className="absolute -right-28 -top-56 size-[620px] rounded-full border border-cyan-300/[.08]" />
        <div className="absolute left-1/3 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent" />
        <div className="relative grid min-w-0 gap-5 p-4 lg:grid-cols-[420px_minmax(0,1fr)] xl:p-6">
          <TouchlinePlayerCard
            player={{
              id: data.id,
              name: data.name,
              initials: data.initials,
              tdieIdentity: data.tdieIdentity,
              nationality: data.nationality,
              position: data.position,
              age: data.age,
              currentClub: data.club,
              currentCoach: data.coach,
              currentAgent: data.agent ?? data.agency,
              officialMarketValue: data.marketValueNumber,
              officialMarketValueLabel: data.marketValueLabel,
              currency: data.currency,
              contractStatus: data.contractExpiry ? `Until ${data.contractExpiry}` : "Contract open",
              currentForm: data.currentForm,
              availability: data.availability,
              competition: data.competition,
              league: data.league,
              href: data.internalProfileUrl,
              externalHref: data.profileUrl,
              liveState: data.live.status === "No live match active" ? "idle" : "live_match",
              livePoints: data.live.points,
              context: "profile",
            }}
          />

          <div className="min-w-0 p-1 md:p-3">
            <div className="flex flex-col justify-between gap-5 xl:flex-row">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap gap-2">
                  <LivePill>{data.sourceLabel} connected</LivePill>
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.15em] text-cyan-200">{data.cardTier} player card</span>
                </div>
                <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">
                  {data.club ?? "Club open"} · {data.position ?? "Position open"} · {data.competition ?? data.league ?? "Competition open"}
                </p>
                <h1 className="font-display mt-2 break-words text-5xl uppercase italic tracking-[-.08em] text-white sm:text-7xl 2xl:text-8xl">{data.name}</h1>
                <p className="mt-3 break-words text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {data.nationality ?? "Nationality open"} {data.age ? `· AGE ${data.age}` : ""} {data.preferredFoot ? `· ${data.preferredFoot}` : ""} · {data.sourceLabel} ID {data.sourceId}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 xl:items-end">
                <a href={data.profileUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007]">
                  {data.sourceLinkLabel} <ExternalLink size={14} />
                </a>
                <a href={data.shareUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/[.08] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-cyan-100">
                  Share profile <Send size={14} />
                </a>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MicroStat label="Market value" value={data.marketValueLabel} detail="official provider value" accent="gold" />
              <MicroStat label="Club" value={data.club ?? "Open"} detail={data.league ?? "league pending"} accent="cyan" />
              <MicroStat label="Agent" value={data.agent ?? data.agency ?? "Open"} detail="relationship source" accent="lime" />
              <MicroStat label="Updated" value={data.updatedAtLabel} detail="profile sync" accent="rose" />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold uppercase tracking-wider text-slate-500"><span>Profile completeness</span><span>{data.profileCompleteness}%</span></div>
                <Meter value={data.profileCompleteness} color="lime" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold uppercase tracking-wider text-slate-500"><span>Search readiness</span><span>{data.searchReadiness}%</span></div>
                <Meter value={data.searchReadiness} color="cyan" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold uppercase tracking-wider text-slate-500"><span>Transfer heat</span><span>{data.transferStatus}</span></div>
                <Meter value={data.transferStatus === "Open" ? 72 : 38} color="gold" />
              </div>
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5">
          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Player identity" title="Football intelligence" action={<Sparkles size={16} className="text-amber-300" />} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Age", data.age ? String(data.age) : "Open", data.dateOfBirth ?? "birth date pending", <Clock3 key="age" size={16} />],
                ["Height", data.height ?? "Open", "physical profile", <Activity key="height" size={16} />],
                ["Preferred foot", data.preferredFoot ?? "Open", "technical identity", <Zap key="foot" size={16} />],
                ["Coach", data.coach ?? "Open", "current staff", <UsersRound key="coach" size={16} />],
                ["League", data.league ?? "Open", "domestic context", <Trophy key="league" size={16} />],
                ["Competition", data.competition ?? "Open", "active tournament", <Globe2 key="competition" size={16} />],
                ["Contract", data.contractExpiry ?? "Open", "expiry status", <CalendarClock key="contract" size={16} />],
                ["Injury", data.injuryStatus, "availability monitor", <HeartPulse key="injury" size={16} />],
              ].map(([label, value, detail, icon]) => (
                <CardShell key={String(label)} className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid size-9 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200">{icon}</div>
                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-600">{detail}</span>
                  </div>
                  <p className="mt-5 text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{label}</p>
                  <p className="mt-1 truncate text-lg font-black text-white">{String(value)}</p>
                </CardShell>
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Career timeline" title="Career command timeline" action={<Radar size={16} className="text-cyan-300" />} />
            <div className="relative space-y-3 before:absolute before:left-[23px] before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-cyan-300/15">
              {data.timeline.map((item) => (
                <div key={`${item.label}-${item.value}`} className="relative grid gap-3 rounded-3xl border border-white/[.07] bg-white/[.025] p-4 pl-16">
                  <div className="absolute left-3 top-4 grid size-9 place-items-center rounded-2xl border border-cyan-300/20 bg-[#07111b] text-cyan-200">{item.icon}</div>
                  <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300">{item.label}</p>
                  <p className="text-xl font-black uppercase italic text-white">{item.value}</p>
                  <p className="text-[10px] leading-5 text-slate-500">{item.meta}</p>
                </div>
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Statistics" title="Performance operating system" action={<BarChart3 size={16} className="text-[#a3ff12]" />} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.stats.map((stat) => (
                <MicroStat key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} accent={stat.accent} />
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Player honours" title="Trophy cabinet" action={<Trophy size={16} className="text-amber-300" />} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.honours.map((honour) => (
                <div key={honour.label} className="relative overflow-hidden rounded-3xl border border-amber-300/15 bg-amber-300/[.045] p-5">
                  <div className="absolute right-[-20px] top-[-20px] size-24 rounded-full bg-amber-300/[.05]" />
                  <div className="relative">
                    <div className="grid size-10 place-items-center rounded-2xl border border-amber-300/20 bg-black/20 text-lg">{honour.icon}</div>
                    <p className="mt-5 text-[9px] font-black uppercase tracking-[.16em] text-amber-200">{honour.label}</p>
                    <p className="mt-3 text-3xl font-black text-white">{honour.count ?? "—"}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{honour.count === null ? "Sync pending" : "Public metadata"}</p>
                  </div>
                </div>
              ))}
            </div>
          </GamePanel>
        </div>

        <div className="space-y-5">
          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Market information" title="Transfer readiness" action={<CircleDollarSign size={16} className="text-amber-300" />} />
            <div className="space-y-3">
              {[
                ["Official market value", data.marketValueLabel, "Synced from selected football data/source provider"],
                ["Contract status", data.contractExpiry ?? "Open", "Expiry and negotiation visibility"],
                ["Availability", data.availability, "Ready for scouting, shortlist and offers"],
                ["Transfer status", data.transferStatus, "Touchline Transfer Center state"],
                ["Current form", data.currentForm, "Live/stat data will upgrade this automatically"],
                ["Injury status", data.injuryStatus, "Availability monitor"],
              ].map(([label, value, detail]) => (
                <CardShell key={label}>
                  <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-black text-white">{value}</p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">{detail}</p>
                </CardShell>
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Live data" title="Live Arena preview" action={<Flame size={16} className="text-[#a3ff12]" />} />
            <div className="rounded-3xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#caff72]">{data.live.status}</p>
                  <p className="mt-1 text-3xl font-black text-white">{data.live.minute}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Touchline points</p>
                  <p className="text-3xl font-black text-[#a3ff12]">{data.live.points}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.live.events.map((event) => (
                  <MicroStat key={event.label} label={event.label} value={event.value} detail="live event" accent={event.accent} />
                ))}
              </div>
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Transfer Center" title="Quick actions" action={<Target size={16} className="text-cyan-300" />} />
            <div className="grid gap-2">
              {[
                ["Make offer", "/deals", <CircleDollarSign key="offer" size={15} />],
                ["Add to watchlist", "/football-search", <ListPlus key="watch" size={15} />],
                ["Compare player", "/football-search", <GitCompare key="compare" size={15} />],
                ["Scout report", "/scouting", <Eye key="scout" size={15} />],
                ["View agent", "/agents", <UserRoundSearch key="agent" size={15} />],
              ].map(([label, href, icon]) => (
                <Link key={String(label)} href={String(href)} className="flex h-12 items-center justify-between rounded-2xl border border-white/[.08] bg-white/[.035] px-4 text-[10px] font-black uppercase tracking-[.14em] text-slate-200 transition hover:border-[#a3ff12]/35 hover:bg-[#a3ff12]/[.08] hover:text-[#a3ff12]">
                  <span className="flex items-center gap-3">{icon}{label}</span>
                  <ExternalLink size={12} />
                </Link>
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Videos" title="Highlight command room" action={<Film size={16} className="text-cyan-300" />} />
            <div className="space-y-3">
              {data.videos.map((video) => (
                <CardShell key={video.title}>
                  <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200"><Play size={16} /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase italic text-white">{video.title}</p>
                      <p className="mt-1 text-[10px] leading-5 text-slate-500">{video.description}</p>
                    </div>
                  </div>
                </CardShell>
              ))}
            </div>
          </GamePanel>

          <GamePanel className="p-5 xl:p-6">
            <SectionHeader kicker="Related information" title="Connected football graph" action={<ShieldCheck size={16} className="text-[#a3ff12]" />} />
            <div className="space-y-2">
              {data.related.map((item) => (
                <Link key={item.label} href={item.href ?? "/football-search"} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.045]">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200">{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[8px] font-black uppercase tracking-wider text-slate-600">{item.label}</span>
                      <span className="block truncate text-xs font-black text-white">{item.value}</span>
                    </span>
                  </span>
                  <ExternalLink size={12} className="shrink-0 text-slate-600" />
                </Link>
              ))}
            </div>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}
