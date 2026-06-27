import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CircleDollarSign, Globe2, Shield, Sparkles, Trophy, UsersRound } from "lucide-react";
import { GamePanel } from "@/components/game-ui";
import { PlayerProfileCommandCenter, type PlayerProfile2Data } from "@/components/player-profile-command-center";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadOrCreateTdiePlayerIdentity } from "@/lib/tdie/server";

type PageParams = { id: string };
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function formatMoney(value?: number | null, currency = "EUR", fallback?: string | null) {
  if (fallback) return fallback;
  if (!value) return "Data not available";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function compactDate(value?: string | null) {
  if (!value) return "Not synced yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not synced yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(parsed);
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

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/g, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://touchline-football-platform.vercel.app";
}

function playerTier(marketValue?: number | null): PlayerProfile2Data["cardTier"] {
  if ((marketValue ?? 0) >= 50_000_000) return "Gold";
  if ((marketValue ?? 0) >= 5_000_000) return "Silver";
  return "Bronze";
}

function tierColor(tier: PlayerProfile2Data["cardTier"]): PlayerProfile2Data["cardTierColor"] {
  if (tier === "Gold") return "gold";
  if (tier === "Silver") return "silver";
  return "bronze";
}

function openOr(value?: string | null, fallback = "Data not available") {
  return value?.trim() || fallback;
}

function buildHonours(enrichment: JsonRecord): PlayerProfile2Data["honours"] {
  const rawHonours = Array.isArray(enrichment.honours) ? enrichment.honours : [];
  const source = rawHonours.length ? rawHonours : [
    { label: "League titles", count: null, icon: "🏆" },
    { label: "Continental titles", count: null, icon: "🌍" },
    { label: "Domestic cups", count: null, icon: "🥈" },
    { label: "Individual awards", count: null, icon: "⭐" },
  ];

  return source.flatMap((item) => {
    const record = asRecord(item);
    const label = asString(record.label);
    if (!label) return [];
    return [{
      label,
      count: typeof record.count === "number" ? record.count : null,
      icon: asString(record.icon) ?? "🏆",
    }];
  });
}

function buildStats(profile: {
  marketValueLabel: string;
  age: number | null;
  position: string | null;
  currentClub: string | null;
  contractExpiry: string | null;
  sourceLabel: string;
}): PlayerProfile2Data["stats"] {
  return [
    { label: "Goals", value: "—", detail: "official stats pending", accent: "gold" },
    { label: "Assists", value: "—", detail: "official stats pending", accent: "cyan" },
    { label: "Minutes", value: "—", detail: "match data pending", accent: "lime" },
    { label: "Cards", value: "—", detail: "discipline data pending", accent: "rose" },
    { label: "Market", value: profile.marketValueLabel, detail: profile.sourceLabel, accent: "gold" },
    { label: "Age", value: profile.age ? String(profile.age) : "Data not available", detail: "identity profile", accent: "cyan" },
    { label: "Role", value: openOr(profile.position, "Position unavailable"), detail: "main position", accent: "lime" },
    { label: "Club", value: openOr(profile.currentClub, "Club unavailable"), detail: profile.contractExpiry ? `contract ${profile.contractExpiry}` : "contract data not available", accent: "cyan" },
  ];
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
        <p className="mt-3 text-slate-400">Login to search the Touchline football database.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Login
        </Link>
      </GamePanel>
    );
  }

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: playerRow, error } = await admin
    .from("global_player_profiles")
    .select(
      "id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !playerRow) notFound();

  const player = playerRow;
  const sourcePayload = asRecord(player.source_payload);
  const enrichment = asRecord(sourcePayload.transfermarktProfileEnrichment);
  const details = asRecord(enrichment.details);
  const age = player.age ?? ageFromDate(player.date_of_birth);
  const playerName = String(player.player_name ?? "Unnamed player");
  const sourceLabel = player.source_provider === "transfermarkt"
    ? "Transfermarkt"
    : sourcePayload.source === "api-football"
      ? "API-Football"
      : "Football Data";
  const sourceId = sourcePayload.apiFootballPlayerId ? String(sourcePayload.apiFootballPlayerId) : String(player.transfermarkt_player_id ?? "");
  const sourceLinkLabel = player.source_provider === "transfermarkt" ? "Transfermarkt" : "Source Link";
  const marketValueLabel = formatMoney(player.market_value, player.currency ?? "EUR", player.market_value_text);
  const cardTier = playerTier(player.market_value);
  const internalProfileUrl = `${siteUrl()}/players/database/${player.id}`;
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(`Touchline player profile: ${playerName}\n${internalProfileUrl}`)}`;
  const contractExpiry = asString(details.contractExpires);
  const joined = asString(details.joined);
  const tdieIdentity = await loadOrCreateTdiePlayerIdentity(admin, {
    playerSource: "global_player_profiles",
    playerSourceId: String(player.id),
    provider: player.source_provider,
    providerPlayerId: sourceId || player.transfermarkt_player_id,
    name: playerName,
    clubName: player.current_club,
    position: player.position,
    nationality: player.nationality,
    marketValue: player.market_value,
    currency: player.currency ?? "EUR",
    sourceReferenceUrl: player.profile_url,
    sourcePhotoUrl: player.photo_url,
    sourceUpdatedAt: player.last_updated_at ?? player.updated_at ?? player.created_at,
  });
  const profileCompleteness = Math.min(
    100,
    [
      tdieIdentity,
      player.current_club,
      player.position,
      player.nationality,
      player.date_of_birth || player.age,
      player.profile_url,
      player.transfermarkt_player_id,
      player.market_value || player.market_value_text,
      contractExpiry,
      details.height,
    ].filter(Boolean).length * 10,
  );

  const timeline: PlayerProfile2Data["timeline"] = [
    {
      label: "Identity created",
      value: compactDate(player.created_at),
      meta: "Touchline created the player identity inside the global football profile registry.",
      icon: <Sparkles size={15} />,
    },
    {
      label: "Born",
      value: player.date_of_birth ? compactDate(player.date_of_birth) : "Birth data pending",
      meta: asString(details.placeOfBirth) ? `Place of birth: ${details.placeOfBirth}` : "Birthplace will appear when official provider data is available.",
      icon: <CalendarClock size={15} />,
    },
    {
      label: "Current club",
      value: openOr(player.current_club, "Club unavailable"),
      meta: joined ? `Joined: ${joined}` : "Club movement timeline will expand when provider transfer history is available.",
      icon: <Shield size={15} />,
    },
    {
      label: "Market checkpoint",
      value: marketValueLabel,
      meta: `Official value follows ${sourceLabel}. Touchline never changes official market value manually.`,
      icon: <CircleDollarSign size={15} />,
    },
  ];

  const data: PlayerProfile2Data = {
    id: String(player.id),
    name: playerName,
    initials: initialBadge(playerName),
    sourceLabel,
    sourceId,
    sourceLinkLabel,
    profileUrl: String(player.profile_url ?? "#"),
    internalProfileUrl,
    shareUrl,
    photoUrl: player.photo_url,
    tdieIdentity,
    club: player.current_club,
    nationality: player.nationality,
    position: player.position,
    age,
    dateOfBirth: player.date_of_birth,
    height: asString(details.height),
    preferredFoot: asString(details.foot),
    coach: "Data not available",
    agent: player.agent_name,
    agency: player.agency_name,
    league: "Data not available",
    competition: "Data not available",
    marketValueLabel,
    marketValueNumber: player.market_value,
    currency: player.currency ?? "EUR",
    contractExpiry,
    joined,
    placeOfBirth: asString(details.placeOfBirth),
    outfitter: asString(details.outfitter),
    playerStatus: asString(details.playerStatus),
    updatedAtLabel: compactDate(player.last_updated_at),
    profileCompleteness,
    searchReadiness: 100,
    cardTier,
    cardTierColor: tierColor(cardTier),
    availability: asString(details.playerStatus) ?? "Data not available",
    transferStatus: contractExpiry ? "Monitoring" : "Data not available",
    currentForm: "Awaiting match data",
    injuryStatus: "Data not available",
    honours: buildHonours(enrichment),
    timeline,
    stats: buildStats({
      marketValueLabel,
      age,
      position: player.position,
      currentClub: player.current_club,
      contractExpiry,
      sourceLabel,
    }),
    related: [
      { label: "Club", value: openOr(player.current_club, "Club unavailable"), href: "/club-network", icon: <Shield size={15} /> },
      { label: "Agent", value: openOr(player.agent_name ?? player.agency_name, "Agent unavailable"), href: "/agents", icon: <UsersRound size={15} /> },
      { label: "League", value: "Data not available", href: "/admin/football-data", icon: <Trophy size={15} /> },
      { label: "Competition", value: "Data not available", href: "/admin/football-data", icon: <Globe2 size={15} /> },
    ],
    videos: [
      {
        title: "Latest highlights",
        description: "Video modules are ready. Approved YouTube, Vimeo, Hudl, Wyscout and Veo embeds can connect here without leaving Touchline.",
      },
      {
        title: "AI summary future",
        description: "Future AI summaries will convert highlight videos into scouting notes, strengths, risks and club-fit recommendations.",
      },
    ],
    live: {
      status: "No live match active",
      minute: "Pre-match",
      points: "0",
      events: [
        { label: "Goals", value: "0", accent: "gold" },
        { label: "Assists", value: "0", accent: "cyan" },
        { label: "Cards", value: "0", accent: "rose" },
        { label: "Minutes", value: "0", accent: "lime" },
      ],
    },
  };

  return <PlayerProfileCommandCenter data={data} />;
}
