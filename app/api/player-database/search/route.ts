import { NextResponse } from "next/server";
import { getApiFootballSeason } from "@/lib/market-data/season";
import { mapGlobalPlayer } from "@/lib/player-database";
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

  if (query.length < 2) return NextResponse.json({ players: [] });

  const { data, error } = await admin.rpc("search_global_player_profiles", {
    search_query: query,
    result_limit: limit,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length) rows = await hydrateProfiles(admin, rows);

  if (!rows.length && shouldDiscover) {
    rows = await discoverFromApiFootball(admin, query, limit);
  }

  return NextResponse.json({
    players: rows.map(mapGlobalPlayer),
    discovered: !data?.length && rows.length > 0,
  });
}
