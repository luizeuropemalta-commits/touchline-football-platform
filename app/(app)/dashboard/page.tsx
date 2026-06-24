import Link from "next/link";
import {
  ArrowUpRight,
  BadgeEuro,
  Bell,
  Binoculars,
  Bot,
  Building2,
  CalendarClock,
  ClipboardList,
  FileSignature,
  FileText,
  MessageSquare,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { GamePanel, Meter } from "@/components/game-ui";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  nationality: string | null;
  photo_url: string | null;
  market_value: number | null;
  currency: string | null;
  contract_end_date: string | null;
  clubs?: ClubJoin;
};

type OpportunityRow = {
  id: string;
  title: string;
  position_needed: string | null;
  match_score: number | null;
  status: string;
  created_at: string;
  players?: { first_name?: string | null; last_name?: string | null } | Array<{ first_name?: string | null; last_name?: string | null }> | null;
  clubs?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function clubName(clubs?: ClubJoin) {
  if (!clubs) return "No club linked";
  return Array.isArray(clubs) ? (clubs[0]?.name ?? "No club linked") : (clubs.name ?? "No club linked");
}

function linkedName(value: OpportunityRow["players"]) {
  const player = Array.isArray(value) ? value[0] : value;
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Unassigned player";
}

function opportunityClub(value: OpportunityRow["clubs"]) {
  const club = Array.isArray(value) ? value[0] : value;
  return club?.name ?? "Club requirement";
}

function playerName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

function formatMoney(value: number | null, currency = "EUR") {
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

async function safeCount(query: PromiseLike<{ count: number | null }>) {
  const { count } = await query;
  return count ?? 0;
}

export default async function Dashboard() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <h1 className="text-3xl font-black uppercase italic text-white">Touchline Command Center</h1>
          <p className="mt-3 text-slate-400">Connect Supabase to activate the real operating dashboard.</p>
        </GamePanel>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <h1 className="text-3xl font-black uppercase italic text-white">Login required</h1>
          <p className="mt-3 text-slate-400">Enter your account to load your real football command center.</p>
          <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
            Login
          </Link>
        </GamePanel>
      </div>
    );
  }

  const { admin, agencyId, profile } = await ensureUserWorkspace(user);
  const now = new Date();
  const inNinetyDays = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10);

  const [
    totalPlayers,
    clubsFollowing,
    openOpportunities,
    messages,
    activeNegotiations,
    contractExpirations,
    upcomingMatches,
    marketAlerts,
  ] = await Promise.all([
    safeCount(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("club_agent_follows").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    safeCount(admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["open", "sent_profile", "contact_requested"])),
    safeCount(admin.from("negotiation_messages").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("negotiation_rooms").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    safeCount(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).not("contract_end_date", "is", null).lte("contract_end_date", inNinetyDays)),
    safeCount(admin.from("football_live_items").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("item_type", "fixture").gte("starts_at", now.toISOString())),
    safeCount(admin.from("market_radar_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
  ]);

  const { data: playerRows } = await admin
    .from("players")
    .select("id, first_name, last_name, position, nationality, photo_url, market_value, currency, contract_end_date, clubs:current_club_id(name)")
    .eq("agency_id", agencyId)
    .order("updated_at", { ascending: false })
    .limit(4);

  const { data: opportunityRows } = await admin
    .from("player_opportunities")
    .select("id, title, position_needed, match_score, status, created_at, players:player_id(first_name,last_name), clubs:club_id(name)")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(5);

  const players = (playerRows ?? []) as PlayerRow[];
  const opportunities = (opportunityRows ?? []) as OpportunityRow[];
  const readiness = Math.min(100, Math.round((totalPlayers > 0 ? 35 : 0) + (openOpportunities > 0 ? 25 : 0) + (activeNegotiations > 0 ? 25 : 0) + (marketAlerts > 0 ? 15 : 0)));

  const overview = [
    ["Total Players", totalPlayers, "real player records", Users, "cyan"],
    ["Clubs Following Me", clubsFollowing, "club-agent follows", Building2, "lime"],
    ["Open Opportunities", openOpportunities, "matching actions", Target, "gold"],
    ["Messages", messages, "negotiation messages", MessageSquare, "cyan"],
    ["Active Negotiations", activeNegotiations, "private deal rooms", Zap, "lime"],
    ["Contract Expirations", contractExpirations, "next 90 days", FileSignature, "gold"],
    ["Upcoming Matches", upcomingMatches, "live center fixtures", CalendarClock, "cyan"],
    ["Market Alerts", marketAlerts, "radar links saved", Bell, "gold"],
  ];

  const aiActions = [
    ["Create contract", "Representation agreement or club contract draft", FileSignature],
    ["Create proposal", "Professional transfer/player proposal", BadgeEuro, "/players/pitch"],
    ["Create email", "Message to sporting director or scout", MessageSquare],
    ["Create scouting report", "Structured report with strengths and risks", Binoculars],
    ["Create player presentation", "Club-ready player dossier", Sparkles, "/players/pitch"],
  ];

  const operatingSuite = [
    {
      title: "Player Management",
      description: "Build a clean portfolio with photos, market data, videos, notes and documents.",
      href: "/players",
      metric: totalPlayers,
      metricLabel: "Players",
      icon: Users,
      accent: "lime",
    },
    {
      title: "Club Requests",
      description: "Track club needs, squad gaps and player opportunities without losing follow-ups.",
      href: "/opportunities",
      metric: openOpportunities,
      metricLabel: "Open",
      icon: ClipboardList,
      accent: "cyan",
    },
    {
      title: "Pitch Builder",
      description: "Use Touchline AI to create club-ready player presentations, proposals and emails.",
      href: "/players/pitch",
      metric: "AI",
      metricLabel: "Docs",
      icon: Sparkles,
      accent: "gold",
    },
    {
      title: "Contract Alerts",
      description: "Follow mandates, contract expirations, birthdays and renewal windows.",
      href: "/contracts",
      metric: contractExpirations,
      metricLabel: "90 days",
      icon: FileSignature,
      accent: "gold",
    },
    {
      title: "Document Vault",
      description: "Keep passports, mandates, contracts, medical files and work permits organized.",
      href: "/documents",
      metric: "Vault",
      metricLabel: "Secure",
      icon: FileText,
      accent: "cyan",
    },
    {
      title: "Finance Control",
      description: "Prepare commission tracking, player investments, invoices and deal revenue.",
      href: "/invoices",
      metric: "€",
      metricLabel: "Finance",
      icon: BadgeEuro,
      accent: "lime",
    },
  ];

  const requestToDealFlow = [
    ["Discover", "Search or auto-discover players from the database.", "/players/database", Search],
    ["Prepare", "Add videos, documents and AI profile material.", "/players", Users],
    ["Pitch", "Create a professional proposal for targeted clubs.", "/players/pitch", Sparkles],
    ["Interest", "Track club interest and opportunity status.", "/opportunities", Target],
    ["Negotiate", "Move into a private deal room with messages and files.", "/deals", Zap],
  ];

  return (
    <div className="relative mx-auto w-full max-w-[1500px] animate-in">
      <section className="ps-career-home overflow-hidden p-4 sm:p-6 xl:p-7">
        <div className="stadium-stands" />
        <div className="pitch-lines" />
        <div className="manager-silhouette" />

        <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,410px)] xl:items-start">
          <div className="min-w-0 space-y-7">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                  <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" /> Real ecosystem online
                </span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                  {profile.full_name || user.email}
                </span>
              </div>

              <div className="mt-8 lg:mt-10">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[.36em] text-cyan-200/65">
                  Touchline / Agent Operating System
                </p>
                <h1 className="console-title font-display text-[clamp(3.6rem,7vw,7.75rem)] uppercase italic leading-[.82] text-white">
                  Command
                  <br />
                  Center
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300/80">
                  Your morning football operating room: players, clubs, opportunities, negotiations, documents, AI actions
                  and market alerts connected to your real workspace data.
                </p>
              </div>

              <div className="mt-7 grid max-w-4xl gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
                <Link href="/players" className="continue-career-button flex min-h-[92px] items-center justify-between px-7 text-[#071007]">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.24em]">Start here</span>
                    <span className="mt-1 block text-2xl font-black uppercase italic tracking-[-.06em]">Add / manage players</span>
                  </span>
                  <Users size={28} />
                </Link>
                <Link href="/opportunities" className="console-mini-card flex items-center justify-between p-5 text-white transition hover:-translate-y-1">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.22em] text-cyan-300/60">AI Matching</span>
                    <span className="mt-1 block text-sm font-black uppercase italic">Opportunities</span>
                  </span>
                  <Target className="text-cyan-300" />
                </Link>
                <Link href="/deals" className="console-mini-card flex items-center justify-between p-5 text-white transition hover:-translate-y-1">
                  <span>
                    <span className="block text-[8px] font-black uppercase tracking-[.22em] text-amber-300/60">Private</span>
                    <span className="mt-1 block text-sm font-black uppercase italic">Negotiations</span>
                  </span>
                  <Zap className="text-amber-300" />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overview.slice(0, 4).map(([label, value, note, Icon, accent]) => {
                const CardIcon = Icon as typeof Users;
                return (
                  <div key={String(label)} className="mode-tile min-h-[132px] p-4" data-accent={accent}>
                    <div className="relative z-10 flex items-start justify-between">
                      <span className="console-mode-icon"><CardIcon size={21} /></span>
                      <ArrowUpRight size={15} className="text-white/40" />
                    </div>
                    <div className="relative z-10 mt-5">
                      <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-200/55">{String(label)}</p>
                      <h2 className="mt-2 font-display text-4xl text-white">{String(value)}</h2>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{String(note)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="min-w-0 space-y-4">
            <div className="stadium-scoreboard p-5">
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-300">Workspace readiness</p>
                  <h2 className="mt-2 text-2xl font-black uppercase italic text-white">Real data engine</h2>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">No records yet · Supabase live</p>
                </div>
                <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-center">
                  <p className="text-[8px] font-black uppercase text-[#a3ff12]">SYS</p>
                  <p className="font-display text-5xl">{readiness}</p>
                </div>
              </div>
              <div className="relative z-10 mt-6">
                <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                  <span>Operating completeness</span>
                  <span>{readiness}%</span>
                </div>
                <Meter value={readiness} color={readiness >= 70 ? "lime" : "cyan"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {overview.slice(4).map(([label, value, note, Icon]) => {
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
                <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">AI Assistant</p>
                <Bot size={16} className="pulse-live text-[#a3ff12]" />
              </div>
              <div className="space-y-2">
                {aiActions.map(([title, subtitle, Icon, href]) => {
                  const ActionIcon = Icon as typeof Bot;
                  return (
                    <Link key={String(title)} href={String(href ?? "/ai")} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.035] p-3 transition hover:border-cyan-300/20 hover:bg-cyan-300/[.05]">
                      <ActionIcon size={15} className="text-cyan-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-black uppercase italic text-white">{String(title)}</span>
                        <span className="mt-0.5 block text-[8px] text-slate-500">{String(subtitle)}</span>
                      </span>
                      <ArrowUpRight size={12} className="text-slate-600" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <GamePanel className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-[#a3ff12]">Daily agency operating suite</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white sm:text-3xl">Everything an agent opens every morning</h2>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
                Built to replace scattered WhatsApp notes, spreadsheets, folders and forgotten club requests with one
                connected football workspace.
              </p>
            </div>
            <Link href="/connect" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 text-[9px] font-black uppercase tracking-[.14em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-300/[.11]">
              Open network <ArrowUpRight size={13} />
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {operatingSuite.map(({ title, description, href, metric, metricLabel, icon: Icon, accent }) => (
              <Link
                key={title}
                href={href}
                className="mode-tile group min-h-[178px] p-4 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25"
                data-accent={accent}
              >
                <div className="relative z-10 flex items-start justify-between gap-3">
                  <span className="console-mode-icon"><Icon size={21} /></span>
                  <span className="rounded-2xl border border-white/[.08] bg-black/25 px-3 py-2 text-right">
                    <span className="block font-display text-2xl leading-none text-white">{metric}</span>
                    <span className="mt-1 block text-[7px] font-black uppercase tracking-[.16em] text-slate-500">{metricLabel}</span>
                  </span>
                </div>
                <div className="relative z-10 mt-8">
                  <h3 className="text-lg font-black uppercase italic tracking-[-.04em] text-white">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500">{description}</p>
                </div>
              </Link>
            ))}
          </div>
        </GamePanel>

        <GamePanel className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Request to deal flow</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">No lost opportunities</h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                The most important product loop: find a player, prepare the profile, pitch the club, track interest and
                negotiate inside Touchline.
              </p>
            </div>
            <Radio className="shrink-0 text-[#a3ff12]" />
          </div>

          <div className="space-y-3">
            {requestToDealFlow.map(([title, body, href, Icon], index) => {
              const FlowIcon = Icon as typeof Search;
              return (
                <Link key={String(title)} href={String(href)} className="group flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-3 transition hover:border-[#a3ff12]/25 hover:bg-[#a3ff12]/[.04]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-[10px] font-black text-cyan-200">
                    {index + 1}
                  </span>
                  <FlowIcon size={15} className="shrink-0 text-[#a3ff12]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black uppercase italic text-white">{String(title)}</span>
                    <span className="mt-0.5 block text-[9px] leading-4 text-slate-500">{String(body)}</span>
                  </span>
                  <ArrowUpRight size={12} className="shrink-0 text-slate-700 transition group-hover:text-cyan-300" />
                </Link>
              );
            })}
          </div>
        </GamePanel>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_420px]">
        <GamePanel className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Real player portfolio</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">Recently updated players</h2>
            </div>
            <Trophy className="text-amber-300" />
          </div>
          {players.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {players.map((player) => (
                <Link key={player.id} href={`/players/${player.id}`} className="overflow-hidden rounded-3xl border border-cyan-300/15 bg-white/[.035] transition hover:-translate-y-1 hover:border-cyan-300/30">
                  <div className="relative h-48 bg-cyan-300/[.04]">
                    {player.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.photo_url} alt={playerName(player)} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="grid h-full place-items-center text-3xl font-black text-cyan-300/30">{playerName(player).slice(0, 2).toUpperCase()}</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
                  </div>
                  <div className="p-4">
                    <p className="truncate text-base font-black uppercase italic text-white">{playerName(player)}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">{player.position ?? "Position open"} · {clubName(player.clubs)}</p>
                    <p className="mt-3 text-sm font-black text-[#a3ff12]">{formatMoney(player.market_value, player.currency ?? "EUR")}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/[.07] bg-black/20 p-8 text-center">
              <Users className="mx-auto text-slate-700" />
              <h3 className="mt-4 text-sm font-black uppercase text-white">No players yet</h3>
              <p className="mt-2 text-xs text-slate-500">Add your first real player profile to activate the ecosystem.</p>
              <Link href="/players" className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">
                Add player
              </Link>
            </div>
          )}
        </GamePanel>

        <GamePanel className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.24em] text-amber-300">Player opportunities</p>
              <h2 className="mt-1 text-2xl font-black uppercase italic text-white">AI match feed</h2>
            </div>
            <Radio className="text-[#a3ff12]" />
          </div>
          <div className="space-y-3">
            {opportunities.length ? opportunities.map((opportunity) => (
              <div key={opportunity.id} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase italic text-white">{opportunity.title}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                      {opportunityClub(opportunity.clubs)} · {linkedName(opportunity.players)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#a3ff12]">{opportunity.match_score ?? 0}%</p>
                    <p className="mt-1 text-[8px] font-black uppercase text-rose-300">{opportunity.status.replaceAll("_", " ")}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/[.07] bg-black/20 p-6 text-center">
                <Target className="mx-auto text-slate-700" />
                <p className="mt-3 text-xs font-black uppercase text-white">No opportunities yet</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">Create club requirements or add players so AI matching can generate opportunities.</p>
              </div>
            )}
          </div>
        </GamePanel>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["Interest System", "When a club clicks interest, the agent receives club name, director, need, message and status.", ShieldCheck],
          ["Negotiation Center", "Every interest can open a private room with messages, files, contracts, notes and timeline.", Zap],
          ["Daily Football Center", "Fixtures, results, injury reports and transfer alerts are stored as real live-center items.", CalendarClock],
        ].map(([title, body, Icon]) => {
          const CardIcon = Icon as typeof ShieldCheck;
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
