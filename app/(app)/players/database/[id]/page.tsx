import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, DatabaseZap, ExternalLink, Globe2, ShieldCheck, Sparkles, UserRoundSearch } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PageParams = { id: string };

function ageFromDate(date?: string | null) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function formatMoney(value?: number | null, currency = "EUR", fallback?: string | null) {
  if (fallback) return fallback;
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function compactDate(value?: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en", { month: "long", day: "2-digit", year: "numeric" }).format(new Date(value));
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

export default async function PlayerDatabaseProfile({ params }: { params: Promise<PageParams> }) {
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
        <p className="mt-3 text-slate-400">Login to search the Touchline player database.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Login
        </Link>
      </GamePanel>
    );
  }

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: player, error } = await admin
    .from("global_player_profiles")
    .select(
      "id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !player) notFound();

  const age = player.age ?? ageFromDate(player.date_of_birth);
  const sourcePayload = player.source_payload && typeof player.source_payload === "object" && !Array.isArray(player.source_payload)
    ? player.source_payload as Record<string, unknown>
    : {};
  const sourceLabel = player.source_provider === "transfermarkt"
    ? "Transfermarkt"
    : sourcePayload.source === "api-football"
      ? "API-Football"
      : "Football Data";
  const sourceId = sourcePayload.apiFootballPlayerId ? String(sourcePayload.apiFootballPlayerId) : player.transfermarkt_player_id;
  const sourceLinkLabel = player.source_provider === "transfermarkt" ? "Transfermarkt" : "Source Link";
  const profileCompleteness = Math.min(
    100,
    [
      player.photo_url,
      player.current_club,
      player.position,
      player.nationality,
      player.date_of_birth || player.age,
      player.profile_url,
      player.transfermarkt_player_id,
    ].filter(Boolean).length * 14,
  );

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <Link href="/players/database" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />
        Return to player database
      </Link>

      <GamePanel className="relative overflow-hidden pitch-grid">
        <div className="absolute right-[-8%] top-[-60%] size-[500px] rounded-full border border-cyan-300/[.08]" />
        <div className="relative grid min-h-[360px] min-w-0 lg:grid-cols-[330px_1fr]">
          <div className="relative overflow-hidden border-b border-white/[.07] bg-cyan-300/[.035] lg:border-b-0 lg:border-r">
            {player.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.photo_url} alt={player.player_name} className="h-full min-h-[360px] w-full object-cover object-top grayscale-[8%] contrast-[1.08]" />
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center text-6xl font-black text-cyan-300/25">{initialBadge(player.player_name)}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-cyan-400/[.05]" />
            <div className="absolute bottom-5 left-5"><LivePill>Database profile</LivePill></div>
          </div>

          <div className="relative min-w-0 p-5 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                  {player.current_club ?? "Club open"} · {player.position ?? "Position open"}
                </p>
                <h1 className="font-display mt-2 break-words text-4xl uppercase italic sm:text-6xl">{player.player_name}</h1>
                <p className="mt-2 break-words text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {player.nationality ?? "Nationality open"} {age ? `· AGE ${age}` : ""} · {sourceLabel} ID {sourceId}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <a href={player.profile_url} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007] sm:w-auto">
                  {sourceLinkLabel} <ExternalLink size={13} />
                </a>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["VALUE", formatMoney(player.market_value, player.currency ?? "EUR", player.market_value_text), "text-amber-300"],
                ["CLUB", player.current_club ?? "Open", "text-white"],
                ["AGENT", player.agent_name ?? player.agency_name ?? "Open", "text-cyan-300"],
                ["UPDATED", compactDate(player.last_updated_at), "text-[#a3ff12]"],
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
                <Meter value={player.source_provider === "transfermarkt" ? 90 : 60} color="gold" />
              </div>
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Touchline search profile" title="Database intelligence" action={<DatabaseZap size={15} className="text-cyan-300" />} />
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {[
              [`${sourceLabel} ID`, sourceId],
              ["Profile URL", player.profile_url],
              ["Position", player.position ?? "Open"],
              ["Nationality", player.nationality ?? "Open"],
              ["Date of birth", player.date_of_birth ?? "Open"],
              ["Age", age ? String(age) : "Open"],
              ["Agent", player.agent_name ?? "Open"],
              ["Agency", player.agency_name ?? "Open"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p>
                <p className="mt-2 overflow-wrap-anywhere text-xs font-bold text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </GamePanel>

        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Legal source rule" title="How Touchline uses this data" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
            <div className="space-y-3 text-xs leading-6 text-slate-400">
              <p>Touchline searches its own saved player-link database first. If the player was missing, it can save a basic profile from an authorized provider such as API-Football.</p>
              <p>External sources remain reference links only. Representation, legal status and club visibility are controlled inside Touchline.</p>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.05] p-4">
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300">Sync status</p>
                <p className="mt-2 text-white">Last updated: {compactDate(player.last_updated_at)}</p>
              </div>
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Future AI matching" title="Opportunity engine" action={<Sparkles size={15} className="text-amber-300" />} />
            <div className="space-y-3 text-xs leading-6 text-slate-400">
              <p>This profile can be used later for club needs, shortlists, AI scouting suggestions and daily sync workflows.</p>
              <div className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <CalendarClock size={16} className="text-cyan-300" />
                <span>Daily sync-ready profile reference</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <Globe2 size={16} className="text-[#a3ff12]" />
                <span>Global search and autocomplete enabled</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <UserRoundSearch size={16} className="text-amber-300" />
                <span>Ready for club discovery workflows</span>
              </div>
            </div>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}
