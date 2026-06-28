import { PlayerCardPreviewLab, type PlayerCardPreviewItem } from "@/components/player-card-preview-lab";
import type { TouchlinePlayerCardModel } from "@/components/touchline-card-engine";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const referenceImageSrc = "/touchline-card-reference.png";

type PlayerProfileRow = {
  id: string;
  player_name: string | null;
  current_club: string | null;
  position: string | null;
  nationality: string | null;
  age: number | null;
  agent_name: string | null;
  agency_name: string | null;
  market_value: number | null;
  market_value_text: string | null;
  source_provider: string | null;
  last_updated_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  source_payload: Record<string, unknown> | null;
};

type SportmonksPreviewRow = {
  id: string;
  provider_player_id: string | null;
  name: string | null;
  display_name: string | null;
  photo_url: string | null;
  nationality: string | null;
  position: string | null;
  market_value: number | null;
  market_value_currency: string | null;
  source_updated_at: string | null;
  current_club:
    | { name: string | null; logo_url?: string | null; competition?: { name?: string | null; logo_url?: string | null } | null }
    | { name: string | null; logo_url?: string | null; competition?: { name?: string | null; logo_url?: string | null } | null }[]
    | null;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length ? value.trim() : fallback;
}

function compactMoney(value: number | null, label: string | null) {
  if (label) return label.replace(/ Last update:.*/i, "").trim();
  if (!value) return "Pending";
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}m`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
  return `€${value.toLocaleString()}`;
}

function tier(value: number | null): PlayerCardPreviewItem["tier"] {
  const money = Number(value || 0);
  if (money >= 50_000_000) return "gold";
  if (money >= 5_000_000) return "silver";
  return "bronze";
}

function payloadText(payload: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  const enrichment = payload?.transfermarktProfileEnrichment;
  if (enrichment && typeof enrichment === "object") {
    const record = enrichment as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
  }
  return "";
}

function toPreviewPlayer(player: PlayerProfileRow): PlayerCardPreviewItem {
  return {
    id: player.id,
    name: text(player.player_name, "Unknown Player"),
    club: text(player.current_club),
    position: text(player.position),
    nationality: text(player.nationality),
    age: player.age ? String(player.age) : "",
    market: compactMoney(player.market_value, player.market_value_text),
    marketValue: player.market_value || 0,
    tier: tier(player.market_value),
    agent: text(player.agent_name || player.agency_name),
    height: payloadText(player.source_payload, ["height", "heightText"]),
    foot: payloadText(player.source_payload, ["foot", "preferredFoot"]),
    shirt: payloadText(player.source_payload, ["shirtNumber", "number"]),
    league: payloadText(player.source_payload, ["league", "competition"]),
    updated: player.last_updated_at || player.updated_at || player.created_at || "",
    source: text(player.source_provider, "Touchline DB"),
  };
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function currentClubName(currentClub: SportmonksPreviewRow["current_club"]) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.name ?? null;
}

function currentClubLogo(currentClub: SportmonksPreviewRow["current_club"]) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.logo_url ?? null;
}

function currentLeagueName(currentClub: SportmonksPreviewRow["current_club"]) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.competition?.name ?? null;
}

function fallbackClub(player: SportmonksPreviewRow) {
  const providerId = String(player.provider_player_id ?? "");
  const name = normalizeSearch(`${player.display_name ?? ""} ${player.name ?? ""}`);
  if (providerId === "184798" || name.includes("lionel messi")) return "Inter Miami CF";
  if (providerId === "186320" || name === "neymar") return "Santos FC";
  if (providerId === "37656179" || name.includes("lamine yamal")) return "Barcelona";
  if (providerId === "37592729" || name.includes("joao neves")) return "Paris Saint-Germain";
  if (providerId === "28931574" || name.includes("joao pedro")) return "Chelsea";
  if (providerId === "218295" || name.includes("weverton")) return "Pembroke";
  return null;
}

function fallbackShirtNumber(player: SportmonksPreviewRow) {
  const providerId = String(player.provider_player_id ?? "");
  const name = normalizeSearch(`${player.display_name ?? ""} ${player.name ?? ""}`);
  if (providerId === "37656179" || name.includes("lamine yamal")) return "19";
  return null;
}

function toCardModel(player: SportmonksPreviewRow): TouchlinePlayerCardModel {
  return {
    id: player.id,
    name: text(player.display_name || player.name, "Unknown Player"),
    photoUrl: player.photo_url,
    avatarUrl: player.photo_url,
    sourceImageUrl: player.photo_url,
    sourceImageProvider: "sportmonks",
    sourceImageLicenseStatus: "source_tracked",
    sourceImageFetchedAt: player.source_updated_at,
    avatarRenderStatus: player.photo_url ? "rendered" : "fallback",
    avatarRenderVersion: "runtime-css-v1",
    avatarRenderType: player.photo_url ? "touchline_branded_render" : "touchline_initials_fallback",
    nationality: text(player.nationality) || null,
    position: text(player.position) || null,
    currentClub: currentClubName(player.current_club) ?? fallbackClub(player),
    clubBadgeUrl: currentClubLogo(player.current_club),
    league: currentLeagueName(player.current_club),
    shirtNumber: fallbackShirtNumber(player),
    officialMarketValue: player.market_value,
    marketValue: player.market_value,
    currency: player.market_value_currency ?? "EUR",
    lastUpdated: player.source_updated_at,
    context: "search",
    syncStatus: "Sportmonks registered",
    statusLabel: "Sportmonks registered",
  };
}

async function findSportmonksPreviewPlayer(admin: ReturnType<typeof createAdminClient>, playerName: string) {
  if (!admin || !playerName.trim()) return null;
  const needle = normalizeSearch(playerName);
  const { data } = await admin
    .from("football_players")
    .select("id,provider_player_id,name,display_name,photo_url,nationality,position,market_value,market_value_currency,source_updated_at,current_club:current_club_id(name,logo_url,competition:competition_id(name,logo_url))")
    .eq("provider", "sportmonks")
    .order("market_value", { ascending: false, nullsFirst: false })
    .limit(100);

  const row = ((data || []) as SportmonksPreviewRow[]).find((player) => {
    const haystack = normalizeSearch(`${player.display_name ?? ""} ${player.name ?? ""} ${player.provider_player_id ?? ""} ${currentClubName(player.current_club) ?? ""}`);
    return haystack.includes(needle);
  });

  return row ? toCardModel(row) : null;
}

export default async function CardPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ playerName?: string }>;
}) {
  const params = await searchParams;
  const playerName = params?.playerName?.trim() ?? "";
  const admin = createAdminClient();

  if (!admin) {
    return <PlayerCardPreviewLab players={[]} initialQuery={playerName} referenceImageSrc={referenceImageSrc} />;
  }

  const columns =
    "id,player_name,current_club,position,nationality,age,agent_name,agency_name,market_value,market_value_text,source_provider,last_updated_at,updated_at,created_at,source_payload";

  const preferredNames = ["neymar", "messi", "cristiano", "ronaldo", "weverton", "diogo", "antonio", "pedro", "ruben", "joao", "manuel", "karim"];
  const rows: PlayerProfileRow[] = [];

  for (const name of preferredNames) {
    const { data } = await admin
      .from("global_player_profiles")
      .select(columns)
      .ilike("player_name", `%${name}%`)
      .limit(4);
    rows.push(...((data || []) as PlayerProfileRow[]));
  }

  if (rows.length < 8) {
    const { data } = await admin
      .from("global_player_profiles")
      .select(columns)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(24);
    rows.push(...((data || []) as PlayerProfileRow[]));
  }

  const seen = new Set<string>();
  const players = rows
    .filter((player) => player.id && !seen.has(player.id) && seen.add(player.id))
    .slice(0, 24)
    .map(toPreviewPlayer);

  const initialPlayer = await findSportmonksPreviewPlayer(admin, playerName);

  return <PlayerCardPreviewLab players={players} initialPlayer={initialPlayer} initialQuery={playerName} referenceImageSrc={referenceImageSrc} />;
}
