import Link from "next/link";
import { notFound } from "next/navigation";
import type { ElementType } from "react";
import { ArrowLeft, Building2, CalendarClock, DatabaseZap, ExternalLink, Globe2, Send, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { enrichTransfermarktClubProfile, loadClubLinkedPlayers, syncClubRosterOnProfileOpen } from "@/lib/club-database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PageParams = { id: string };

type ClubRow = {
  id: string;
  transfermarkt_id: string;
  name: string;
  canonical_url: string;
  profile_url: string;
  photo_url: string | null;
  status: string;
  last_checked_at: string | null;
  updated_at: string | null;
  source_payload: Record<string, unknown> | null;
};

type InsightCard = {
  icon: ElementType;
  title: string;
  body: string;
};

function compactDate(value?: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en", { month: "long", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatMoney(value?: number | null, currency = "EUR", fallback?: string | null) {
  if (fallback) return fallback;
  if (!value) return "Value pending";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function initialBadge(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function completeness(values: unknown[]) {
  return Math.min(100, values.filter(Boolean).length * 13);
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/g, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://touchline-football-platform.vercel.app";
}

export default async function ClubDatabaseProfile({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Login required</h1>
        <p className="mt-3 text-slate-400">Login to open club profiles.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Login
        </Link>
      </GamePanel>
    );
  }

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: row, error } = await admin
    .from("transfermarkt_entities")
    .select("id, transfermarkt_id, name, canonical_url, profile_url, photo_url, status, last_checked_at, updated_at, source_payload")
    .eq("id", id)
    .eq("entity_type", "club")
    .maybeSingle();

  if (error || !row) notFound();

  await syncClubRosterOnProfileOpen(admin, row as ClubRow, user.id);
  const club = await enrichTransfermarktClubProfile(admin, row as ClubRow);
  const linkedPlayers = await loadClubLinkedPlayers(admin, club.id);
  const profileCompleteness = completeness([
    club.photoUrl,
    club.marketValueText || club.marketValue,
    club.squadSize,
    club.averageAge,
    club.stadium,
    club.league,
    club.honours.some((item) => item.count),
    club.profileUrl,
    club.transfermarktId,
  ]);
  const sourceLabel = "Transfermarkt";
  const internalProfileUrl = `${siteUrl()}/clubs/database/${club.id}`;
  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(`Touchline club profile: ${club.name}\n${internalProfileUrl}`)}`;

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <Link href="/football-search" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />
        Return to football search
      </Link>

      <GamePanel className="relative overflow-hidden pitch-grid">
        <div className="absolute right-[-8%] top-[-60%] size-[500px] rounded-full border border-[#a3ff12]/[.08]" />
        <div className="relative grid min-h-[360px] min-w-0 lg:grid-cols-[330px_1fr]">
          <div className="relative overflow-hidden border-b border-white/[.07] bg-cyan-300/[.035] lg:border-b-0 lg:border-r">
            {club.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.photoUrl} alt={club.name} className="h-full min-h-[360px] w-full object-contain p-10 contrast-[1.08]" />
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center text-6xl font-black text-cyan-300/25">{initialBadge(club.name)}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-cyan-400/[.05]" />
            <div className="absolute bottom-5 left-5"><LivePill>Club profile</LivePill></div>
          </div>

          <div className="relative min-w-0 p-5 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                  {club.league ?? "League pending"} · {club.country ?? "Country pending"}
                </p>
                <h1 className="font-display mt-2 break-words text-4xl uppercase italic sm:text-6xl">{club.name}</h1>
                <p className="mt-2 break-words text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {sourceLabel} Club ID {club.transfermarktId} · {club.status}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <a href={club.profileUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007] sm:w-auto">
                  Transfermarkt <ExternalLink size={13} />
                </a>
                <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/[.08] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-cyan-100 sm:w-auto">
                  Share WhatsApp <Send size={13} />
                </a>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["CLUB VALUE", formatMoney(club.marketValue, club.currency ?? "EUR", club.marketValueText), "text-amber-300"],
                ["SQUAD", club.squadSize ?? String(linkedPlayers.length || "Pending"), "text-white"],
                ["AVG AGE", club.averageAge ?? "Pending", "text-cyan-300"],
                ["UPDATED", compactDate(club.lastCheckedAt ?? club.updatedAt), "text-[#a3ff12]"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-white/[.08] bg-black/20 p-4">
                  <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p>
                  <p className={`mt-2 truncate text-xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>PROFILE COMPLETENESS</span><span>{profileCompleteness}%</span></div>
                <Meter value={profileCompleteness} color="lime" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>SEARCH READINESS</span><span>100%</span></div>
                <Meter value={100} color="cyan" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>SYNC SOURCE</span><span>{sourceLabel}</span></div>
                <Meter value={85} color="gold" />
              </div>
            </div>
          </div>
        </div>
      </GamePanel>

      <GamePanel className="mt-5 overflow-hidden p-5">
        <SectionHeader kicker="Club honours" title="Trophy cabinet" action={<Trophy size={15} className="text-amber-300" />} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {club.honours.map((honour) => (
            <div key={honour.label} className="relative overflow-hidden rounded-3xl border border-amber-300/15 bg-amber-300/[.055] p-4">
              <div className="absolute -right-4 -top-6 text-6xl opacity-10">{honour.icon}</div>
              <div className="grid size-11 place-items-center rounded-2xl border border-amber-300/20 bg-black/25 text-xl">
                {honour.icon}
              </div>
              <p className="mt-5 text-[8px] font-black uppercase tracking-[.18em] text-amber-200/80">{honour.label}</p>
              <p className="mt-1 font-display text-4xl font-black text-white">
                {honour.count ?? "—"}
              </p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                {honour.count ? "synced from public source" : "sync pending"}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] leading-5 text-slate-500">
          Trophy data is displayed as Touchline club intelligence. If public metadata is unavailable, the cabinet remains ready for licensed/approved sync.
        </p>
      </GamePanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Club intelligence" title="Market profile" action={<DatabaseZap size={15} className="text-cyan-300" />} />
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {[
              ["Transfermarkt ID", club.transfermarktId],
              ["Profile URL", club.profileUrl],
              ["Market value", formatMoney(club.marketValue, club.currency ?? "EUR", club.marketValueText)],
              ["League", club.league ?? "Pending"],
              ["Country", club.country ?? "Pending"],
              ["Stadium", club.stadium ?? "Pending"],
              ["Foreigners", club.foreigners ?? "Pending"],
              ["National team players", club.nationalTeamPlayers ?? "Pending"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p>
                <p className="mt-2 overflow-wrap-anywhere text-xs font-bold text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <SectionHeader kicker="Linked players" title="Public squad references" action={<UsersRound size={15} className="text-[#a3ff12]" />} />
          <div className="space-y-2">
            {linkedPlayers.length ? linkedPlayers.map((player) => {
              const href = player.internalProfileUrl ?? player.profileUrl;
              const external = !player.internalProfileUrl;
              return (
              <Link
                key={player.id}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.05]"
              >
                <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[.08] bg-black/30">
                  {player.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                  ) : (
                    <span className="text-[10px] font-black text-cyan-300/60">{initialBadge(player.name)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-black uppercase italic text-white">{player.name}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    TM ID {player.transfermarktId} · {player.status} · {player.internalProfileUrl ? "Touchline profile" : "External profile"}
                  </p>
                </div>
                <ExternalLink size={13} className="text-slate-600" />
              </Link>
            );}) : (
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Squad list pending</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">
                  Touchline has the club profile now. Public player references appear here after the safe registry discovers or approves links.
                </p>
              </div>
            )}
          </div>
        </GamePanel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {([
          { icon: Trophy, title: "Rank & valuation", body: "Club ranking and richer valuation boards require licensed or permitted data. Touchline can display saved public metadata now." },
          { icon: ShieldCheck, title: "Legal data rule", body: "Touchline stores limited public club profile metadata and keeps Transfermarkt as the original source link." },
          { icon: Globe2, title: "Network workflows", body: "This profile can connect later to recruitment needs, shortlists, agent contact, deal rooms and club market alerts." },
          { icon: CalendarClock, title: "Daily sync ready", body: "Known club links are ready for scheduled checks through the safe registry and rate-limited sync jobs." },
          { icon: Building2, title: "Club portal", body: "This page is the foundation for the future club-side profile, recruitment center and deal room." },
          { icon: DatabaseZap, title: "Database-first", body: "Search uses Touchline saved links first, then enriches only the selected profile when needed." },
        ] satisfies InsightCard[]).map(({ icon: Icon, title, body }) => (
          <GamePanel key={title} className="p-5">
            <div className="grid size-10 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[.07] text-cyan-300">
              <Icon size={16} />
            </div>
            <p className="mt-4 text-xs font-black uppercase italic text-white">{title}</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">{body}</p>
          </GamePanel>
        ))}
      </div>
    </div>
  );
}
