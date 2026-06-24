import { NextResponse } from "next/server";
import { getApiFootballSeason } from "@/lib/market-data/season";
import { discoverTransfermarktLinksByName } from "@/lib/market-link-registry";
import { enrichGlobalPlayerProfileFromTransfermarkt, mapGlobalPlayer } from "@/lib/player-database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ApiFootballSearchResponse = {
  response?: Array<{
    player?: {
      id?: number;
      name?: string;
      firstname?: string;
      lastname?: string;
      age?: number;
      birth?: { date?: string };
      nationality?: string;
      photo?: string;
      injured?: boolean;
    };
    statistics?: Array<{
      team?: { id?: number; name?: string; logo?: string };
      league?: { id?: number; name?: string; country?: string; season?: number };
      games?: { appearences?: number; position?: string; rating?: string };
      goals?: { total?: number; assists?: number };
    }>;
  }>;
};

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function cleanLimit(value: string | null) {
  const limit = Number(value ?? 12);
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.round(limit), 1), 50);
}

function cleanText(value?: string | null, max = 220) {
  return value?.trim().replace(/\s+/g, " ").slice(0, max) || null;
}

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchResultScore(name: unknown, query: string) {
  const normalizedName = normalizeSearchText(typeof name === "string" ? name : "");
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedName || !normalizedQuery) return 0;

  let score = 0;
  if (normalizedName === normalizedQuery) score += 1000;
  if (normalizedName.startsWith(normalizedQuery)) score += 500;
  if (normalizedName.includes(normalizedQuery)) score += 250;
  const words = normalizedQuery.split(" ").filter(Boolean);
  score += words.filter((word) => normalizedName.includes(word)).length * 80;
  score -= Math.max(normalizedName.length - normalizedQuery.length, 0);
  return score;
}

function sortRowsForQuery(rows: Record<string, unknown>[], query: string) {
  return [...rows].sort((a, b) => {
    const scoreDiff = searchResultScore(b.player_name, query) - searchResultScore(a.player_name, query);
    if (scoreDiff !== 0) return scoreDiff;
    const relevanceA = typeof a.relevance === "number" ? a.relevance : 0;
    const relevanceB = typeof b.relevance === "number" ? b.relevance : 0;
    return relevanceB - relevanceA;
  });
}

function playerName(player?: { name?: string; firstname?: string; lastname?: string }) {
  return cleanText(player?.name, 180) || cleanText(`${player?.firstname ?? ""} ${player?.lastname ?? ""}`, 180);
}

function transfermarktSearchUrl(name: string) {
  const url = new URL("https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche");
  url.searchParams.set("query", name);
  return url.toString();
}

async function discoverFromApiFootball(admin: NonNullable<ReturnType<typeof createAdminClient>>, query: string, limit: number) {
  const apiKey = process.env.API_FOOTBALL_KEY ?? process.env.APISPORTS_KEY;
  if (!apiKey || query.length < 3) return [];

  const season = getApiFootballSeason(process.env.API_FOOTBALL_SEASON);
  const baseUrl = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  const url = new URL("/players", baseUrl);
  url.searchParams.set("search", query);
  url.searchParams.set("season", season);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as ApiFootballSearchResponse;
  const now = new Date().toISOString();
  const rows = (data.response ?? [])
    .slice(0, Math.min(limit, 24))
    .flatMap((item) => {
      const name = playerName(item.player);
      const apiFootballPlayerId = item.player?.id;
      if (!name || !apiFootballPlayerId) return [];

      const primaryStats = item.statistics?.[0];
      const sourceLink = transfermarktSearchUrl(name);

      return [{
        transfermarkt_player_id: `api-football-${apiFootballPlayerId}`,
        player_name: name,
        profile_url: sourceLink,
        photo_url: cleanText(item.player?.photo, 1000),
        current_club: cleanText(primaryStats?.team?.name, 180),
        position: cleanText(primaryStats?.games?.position, 80),
        nationality: cleanText(item.player?.nationality, 80),
        date_of_birth: cleanText(item.player?.birth?.date, 10),
        age: item.player?.age && item.player.age > 0 && item.player.age < 80 ? Math.round(item.player.age) : null,
        currency: "EUR",
        source_provider: "licensed_provider",
        source_payload: {
          source: "api-football",
          apiFootballPlayerId,
          season,
          transfermarktSearchUrl: sourceLink,
          player: item.player,
          primaryStats,
          discoveredFromQuery: query,
          importedAt: now,
          note: "Automatically discovered from API-Football when Touchline internal search had no result. Transfermarkt full profile link still requires saved link/licensed source.",
        },
        last_updated_at: now,
      }];
    });

  if (!rows.length) return [];

  const { data: saved } = await admin
    .from("global_player_profiles")
    .upsert(rows, { onConflict: "transfermarkt_player_id" })
    .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at")
    .limit(limit);

  return (saved ?? []) as Record<string, unknown>[];
}

async function fetchApiFootballCandidates(query: string) {
  const apiKey = process.env.API_FOOTBALL_KEY ?? process.env.APISPORTS_KEY;
  if (!apiKey || query.length < 3) return [];

  const season = getApiFootballSeason(process.env.API_FOOTBALL_SEASON);
  const baseUrl = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  const url = new URL("/players", baseUrl);
  url.searchParams.set("search", query);
  url.searchParams.set("season", season);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as ApiFootballSearchResponse;
  return (data.response ?? []).map((item) => {
    const name = playerName(item.player);
    const primaryStats = item.statistics?.[0];
    return {
      name,
      apiFootballPlayerId: item.player?.id,
      photoUrl: cleanText(item.player?.photo, 1000),
      currentClub: cleanText(primaryStats?.team?.name, 180),
      position: cleanText(primaryStats?.games?.position, 80),
      nationality: cleanText(item.player?.nationality, 80),
      dateOfBirth: cleanText(item.player?.birth?.date, 10),
      age: item.player?.age && item.player.age > 0 && item.player.age < 80 ? Math.round(item.player.age) : null,
      primaryStats,
      player: item.player,
      season,
    };
  }).filter((candidate) => candidate.name && candidate.apiFootballPlayerId);
}

async function enrichRowsFromApiFootball(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  query: string,
  rows: Record<string, unknown>[],
) {
  const needsEnrichment = rows.some((row) => !row.photo_url || !row.current_club || !row.position || !row.nationality || !row.age);
  if (!needsEnrichment) return rows;

  const candidates = await fetchApiFootballCandidates(query);
  if (!candidates.length) return rows;

  const now = new Date().toISOString();
  const patches = rows.flatMap((row) => {
    const best = candidates
      .map((candidate) => ({
        candidate,
        score: searchResultScore(candidate.name, String(row.player_name ?? query)),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < 220) return [];

    const sourcePayload = row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
      ? (row.source_payload as Record<string, unknown>)
      : {};

    return [{
      id: row.id,
      transfermarkt_player_id: row.transfermarkt_player_id,
      player_name: row.player_name,
      profile_url: row.profile_url,
      photo_url: cleanText(String(row.photo_url ?? ""), 1000) ?? best.candidate.photoUrl,
      current_club: cleanText(String(row.current_club ?? ""), 180) ?? best.candidate.currentClub,
      position: cleanText(String(row.position ?? ""), 80) ?? best.candidate.position,
      nationality: cleanText(String(row.nationality ?? ""), 80) ?? best.candidate.nationality,
      date_of_birth: cleanText(String(row.date_of_birth ?? ""), 10) ?? best.candidate.dateOfBirth,
      age: typeof row.age === "number" ? row.age : best.candidate.age,
      agent_name: row.agent_name ?? null,
      agency_name: row.agency_name ?? null,
      market_value: row.market_value ?? null,
      market_value_text: row.market_value_text ?? null,
      currency: row.currency ?? "EUR",
      source_provider: row.source_provider ?? "transfermarkt",
      source_payload: {
        ...sourcePayload,
        apiFootballEnrichment: {
          apiFootballPlayerId: best.candidate.apiFootballPlayerId,
          season: best.candidate.season,
          enrichedAt: now,
          note: "Used only to fill available public/licensed football metadata for a saved Transfermarkt link.",
        },
      },
      last_updated_at: now,
    }];
  });

  if (!patches.length) return rows;

  const { data } = await admin
    .from("global_player_profiles")
    .upsert(patches, { onConflict: "transfermarkt_player_id" })
    .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at");

  if (!data?.length) return rows;

  const byId = new Map((data as Record<string, unknown>[]).map((row) => [String(row.id), row]));
  return rows.map((row) => byId.get(String(row.id)) ?? row);
}

async function discoverFromMarketLinkRegistry(admin: NonNullable<ReturnType<typeof createAdminClient>>, query: string, limit: number) {
  const { data } = await admin.rpc("search_transfermarkt_entities", {
    search_query: query,
    entity_type_filter: "player",
    result_limit: limit,
  });

  const rows = ((data ?? []) as Record<string, unknown>[]).flatMap((entity) => {
    const transfermarktId = cleanText(String(entity.transfermarkt_id ?? ""), 80);
    const name = cleanText(String(entity.name ?? ""), 180);
    const profileUrl = cleanText(String(entity.canonical_url ?? entity.profile_url ?? ""), 1000);
    if (!transfermarktId || !name || !profileUrl) return [];

    return [{
      transfermarkt_player_id: transfermarktId,
      player_name: name,
      profile_url: profileUrl,
      photo_url: cleanText(entity.photo_url as string | null, 1000),
      source_provider: "transfermarkt",
      source_payload: {
        source: "market_link_registry",
        registryEntityId: entity.id,
        registryStatus: entity.status,
        note: "Created from Touchline Transfermarkt Link Registry. Stores link metadata only.",
      },
      last_updated_at: new Date().toISOString(),
    }];
  });

  if (!rows.length) return [];

  const { data: saved } = await admin
    .from("global_player_profiles")
    .upsert(rows, { onConflict: "transfermarkt_player_id" })
    .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at")
    .limit(limit);

  return (saved ?? []) as Record<string, unknown>[];
}

async function hydrateProfiles(admin: NonNullable<ReturnType<typeof createAdminClient>>, rows: Record<string, unknown>[]) {
  const ids = rows.map((row) => String(row.id)).filter(Boolean);
  if (!ids.length) return rows;

  const { data } = await admin
    .from("global_player_profiles")
    .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at")
    .in("id", ids);

  const byId = new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), row]));
  return rows.map((row) => byId.get(String(row.id)) ?? row);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const query = cleanQuery(searchParams.get("q"));
  const limit = cleanLimit(searchParams.get("limit"));
  const shouldDiscover = searchParams.get("discover") === "1" || searchParams.get("discover") === "true";
  const shouldEnrich = searchParams.get("enrich") === "1" || searchParams.get("enrich") === "true";

  if (query.length < 2) return NextResponse.json({ players: [] });

  const { data, error } = await admin.rpc("search_global_player_profiles", {
    search_query: query,
    result_limit: limit,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length) rows = await hydrateProfiles(admin, rows);

  if (!rows.length) {
    rows = await discoverFromMarketLinkRegistry(admin, query, limit);
  }

  if (!rows.length && shouldDiscover) {
    await discoverTransfermarktLinksByName(admin, {
      query,
      entityType: "player",
      limit,
      createdBy: user.id,
    });
    rows = await discoverFromMarketLinkRegistry(admin, query, limit);
  }

  if (!rows.length && shouldDiscover) {
    rows = await discoverFromApiFootball(admin, query, limit);
  }

  if (rows.length && (shouldDiscover || shouldEnrich)) {
    rows = await enrichRowsFromApiFootball(admin, query, rows);
  }

  if (rows.length && shouldEnrich) {
    const enrichedRows: Record<string, unknown>[] = [];
    for (const row of rows.slice(0, Math.min(limit, 6))) {
      enrichedRows.push(await enrichGlobalPlayerProfileFromTransfermarkt(admin, row));
    }
    rows = [...enrichedRows, ...rows.slice(enrichedRows.length)];
  }

  rows = sortRowsForQuery(rows, query).slice(0, limit);

  return NextResponse.json({
    players: rows.map(mapGlobalPlayer),
    discovered: !data?.length && rows.length > 0,
    enriched: shouldEnrich,
  });
}
