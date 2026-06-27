import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe2,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { GamePanel, Meter, SectionHeader } from "@/components/game-ui";
import { TouchlinePlayerCard } from "@/components/touchline-card-engine";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";
import { loadOrCreateTdiePlayerIdentity } from "@/lib/tdie/server";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type AiProfile = {
  generated?: boolean;
  professional_biography?: string;
  scouting_summary?: string;
  strengths?: string[];
  weaknesses?: string[];
};

function clubName(clubs?: ClubJoin) {
  if (!clubs) return "Data not available";
  return Array.isArray(clubs) ? (clubs[0]?.name ?? "Data not available") : (clubs.name ?? "Data not available");
}

function fullName(player: { first_name?: string | null; last_name?: string | null }) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

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

function formatMoney(value?: number | null, currency = "EUR") {
  if (!value) return "Data not available";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function displayData(value?: string | number | null, fallback = "Data not available") {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
  }
  return fallback;
}

function embedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.replace("/", "")}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (host.endsWith("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : url;
    }
    return url;
  } catch {
    return url;
  }
}

export default async function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
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
        <p className="mt-3 text-slate-400">Login to view this real player profile.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">Login</Link>
      </GamePanel>
    );
  }

  const { admin, agencyId } = await ensureUserWorkspace(user);
  const { data: player, error } = await admin
    .from("players")
    .select("id, first_name, last_name, date_of_birth, nationality, position, preferred_foot, status, market_value, currency, photo_url, contract_end_date, height_cm, weight_kg, external_market_provider, external_market_player_id, external_market_url, external_market_payload, ai_profile, stats, clubs:current_club_id(name)")
    .eq("agency_id", agencyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !player) notFound();

  const [{ data: documents }, { data: videos }, { data: interests }, { data: opportunities }] = await Promise.all([
    admin.from("player_documents").select("id, name, category, mime_type, size_bytes, created_at").eq("agency_id", agencyId).eq("player_id", id).order("created_at", { ascending: false }),
    admin.from("player_videos").select("id, title, url, thumbnail_url, created_at").eq("agency_id", agencyId).eq("player_id", id).order("created_at", { ascending: false }),
    admin.from("player_interests").select("id, club_name, sporting_director, position_needed, status, created_at").eq("agency_id", agencyId).eq("player_id", id).order("created_at", { ascending: false }),
    admin.from("player_opportunities").select("id, title, position_needed, match_score, status, created_at").eq("agency_id", agencyId).eq("player_id", id).order("created_at", { ascending: false }),
  ]);

  const name = fullName(player);
  const age = ageFromDate(player.date_of_birth);
  const aiProfile = player.ai_profile as AiProfile | null;
  const playerClubName = clubName(player.clubs as ClubJoin);
  const tdieIdentity = await loadOrCreateTdiePlayerIdentity(admin, {
    playerSource: "players",
    playerSourceId: String(player.id),
    provider: player.external_market_provider ?? "touchline",
    providerPlayerId: player.external_market_player_id ?? String(player.id),
    name,
    clubName: playerClubName,
    position: player.position,
    nationality: player.nationality,
    marketValue: player.market_value,
    currency: player.currency ?? "EUR",
    sourceReferenceUrl: player.external_market_url,
    sourcePhotoUrl: player.photo_url,
    sourceUpdatedAt: player.contract_end_date ?? undefined,
  });
  const profileCompleteness = Math.min(
    100,
    [
      tdieIdentity,
      player.contract_end_date,
      player.market_value,
      player.position,
      player.nationality,
      player.date_of_birth,
      player.external_market_url,
    ].filter(Boolean).length * 14,
  );

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <Link href="/players" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />Return to players
      </Link>

      <GamePanel className="tdie-identity-stage relative overflow-hidden pitch-grid">
        <div className="absolute right-[-8%] top-[-60%] size-[500px] rounded-full border border-amber-300/[.08] bg-amber-300/[.035]" />
        <div className="absolute left-[-10%] bottom-[-58%] size-[440px] rounded-full border border-cyan-300/[.08] bg-cyan-300/[.035]" />
        <div className="relative grid min-h-[330px] lg:grid-cols-[320px_1fr]">
          <div className="relative overflow-hidden border-b border-white/[.07] bg-cyan-300/[.035] p-4 lg:border-b-0 lg:border-r">
            <TouchlinePlayerCard
              variant="compact"
              player={{
                id: String(player.id),
                name,
                initials: name.slice(0, 2).toUpperCase(),
                tdieIdentity,
                nationality: player.nationality,
                position: player.position,
                age,
                currentClub: playerClubName,
                officialMarketValue: player.market_value,
                officialMarketValueLabel: formatMoney(player.market_value, player.currency ?? "EUR"),
                currency: player.currency ?? "EUR",
                contractStatus: player.contract_end_date ? `Until ${player.contract_end_date}` : "Data not available",
                currentForm: aiProfile?.generated ? "AI ready" : "Sync",
                availability: player.status ?? "Active",
                context: "profile",
              }}
            />
          </div>
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">{playerClubName} · {displayData(player.position, "Position unavailable")}</p>
                <h1 className="font-display mt-2 text-4xl uppercase italic sm:text-6xl">{name}</h1>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {displayData(player.nationality, "Nationality unavailable")} {age ? `· AGE ${age}` : ""} {player.preferred_foot ? `· ${player.preferred_foot} footed` : ""}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Link href="/players" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100">
                  <BrainCircuit size={13} />AI / Vault
                </Link>
                <Link href="/deals" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007]">
                  <Zap size={13} />Open Deal
                </Link>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["VALUE", formatMoney(player.market_value, player.currency ?? "EUR"), "text-amber-300"],
                ["HEIGHT", player.height_cm ? `${player.height_cm}cm` : "—", "text-white"],
                ["WEIGHT", player.weight_kg ? `${player.weight_kg}kg` : "—", "text-cyan-300"],
                ["CONTRACT", player.contract_end_date ?? "—", "text-[#a3ff12]"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-white/[.08] bg-black/20 p-4">
                  <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p>
                  <p className={`mt-2 text-xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div><div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>PROFILE COMPLETENESS</span><span>{profileCompleteness}%</span></div><Meter value={profileCompleteness} color="lime" /></div>
              <div><div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>TRANSFER INTEREST</span><span>{interests?.length ?? 0}</span></div><Meter value={Math.min(100, (interests?.length ?? 0) * 20)} color="cyan" /></div>
              <div><div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>AI READINESS</span><span>{aiProfile?.generated ? 100 : 30}%</span></div><Meter value={aiProfile?.generated ? 100 : 30} color="gold" /></div>
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="AI Player Profile" title="Professional intelligence" action={<Sparkles size={14} className="text-amber-300" />} />
            {aiProfile?.generated ? (
              <div className="space-y-5">
                <p className="text-sm leading-7 text-slate-300">{aiProfile.professional_biography}</p>
                <p className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4 text-sm leading-7 text-slate-300">{aiProfile.scouting_summary}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#caff72]">Strengths</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-300">{(aiProfile.strengths ?? []).map((item: string) => <li key={item}>• {item}</li>)}</ul>
                  </div>
                  <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.045] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-200">Weaknesses / next actions</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-300">{(aiProfile.weaknesses ?? []).map((item: string) => <li key={item}>• {item}</li>)}</ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[.07] bg-black/20 p-6 text-sm text-slate-400">
                No AI player profile generated yet. Use the AI Profile button on the Players page.
              </div>
            )}
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Opportunities" title="Club matching workflow" action={<ShieldCheck size={14} className="text-cyan-300" />} />
            <div className="space-y-3">
              {opportunities?.length ? opportunities.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-sm font-black uppercase italic text-white">{item.title}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{item.position_needed ?? "Requirement open"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-[#a3ff12]">{item.match_score ?? 0}%</p>
                      <p className="text-[8px] uppercase text-slate-500">{item.status}</p>
                    </div>
                  </div>
                </div>
              )) : <p className="rounded-2xl border border-white/[.07] bg-black/20 p-6 text-sm text-slate-500">No opportunities connected to this player yet.</p>}
            </div>
          </GamePanel>
        </div>

        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="External Market Profile" title="Transfermarkt Link" action={<Globe2 size={15} className="text-cyan-300" />} />
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-wider text-cyan-300">{player.external_market_provider ?? "No external profile"}</p>
                  <p className="mt-2 text-xl font-black uppercase italic text-white">{formatMoney(player.market_value, player.currency ?? "EUR")}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">Contract: {displayData(player.contract_end_date)}</p>
                </div>
                {player.external_market_url && (
                  <Link href={player.external_market_url} target="_blank" rel="noreferrer" className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] text-cyan-200 transition hover:border-[#a3ff12]/35 hover:text-[#a3ff12]" aria-label="Open external market profile">
                    <ExternalLink size={15} />
                  </Link>
                )}
              </div>
              <p className="mt-4 text-[9px] leading-5 text-slate-500">Touchline stores the official URL, preview metadata and click-through reference. It does not copy a third-party database.</p>
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Club Interest" title="Interest System" action={<CalendarClock size={15} className="text-rose-300" />} />
            <div className="space-y-2">
              {interests?.length ? interests.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                  <p className="text-[10px] font-black uppercase text-white">{item.club_name}</p>
                  <p className="mt-1 text-[8px] text-slate-500">{item.position_needed ?? "Need open"} · {item.status.replaceAll("_", " ")}</p>
                </div>
              )) : <p className="rounded-xl border border-white/[.07] bg-black/20 p-4 text-xs text-slate-500">No club interest yet.</p>}
            </div>
          </GamePanel>

          <GamePanel className="overflow-hidden">
            <div className="p-5">
              <SectionHeader kicker="Video Hub" title="Highlights" action={<Play size={14} className="text-cyan-300" />} />
            </div>
            {videos?.length ? (
              <div className="space-y-3 p-5 pt-0">
                {videos.map((video) => (
                  <div key={video.id} className="overflow-hidden rounded-2xl border border-white/[.08] bg-black/30">
                    <iframe src={embedUrl(video.url)} title={video.title} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    <p className="p-3 text-[10px] font-black uppercase text-white">{video.title}</p>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 pt-0 text-xs text-slate-500">No embedded videos yet.</p>}
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Secure Storage" title="Player Vault" action={<Upload size={14} className="text-cyan-300" />} />
            <div className="space-y-2">
              {documents?.length ? documents.map((document) => (
                <div key={document.id} className="flex items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.02] p-3">
                  <FileText size={14} className="text-cyan-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[9px] font-bold">{document.name}</p>
                    <p className="mt-1 text-[7px] uppercase text-slate-600">{document.category ?? "other"} · encrypted</p>
                  </div>
                  <ChevronRight size={12} className="text-slate-700" />
                </div>
              )) : <p className="rounded-xl border border-white/[.07] bg-black/20 p-4 text-xs text-slate-500">No documents uploaded yet.</p>}
            </div>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}
