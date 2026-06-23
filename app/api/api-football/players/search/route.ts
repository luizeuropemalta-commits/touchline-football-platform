import { NextResponse } from "next/server";
import { getApiFootballSeason } from "@/lib/market-data/season";
import { createClient } from "@/lib/supabase/server";

type ApiFootballSearchResponse = {
  response?: Array<{
    player?: {
      id?: number;
      name?: string;
      firstname?: string;
      lastname?: string;
      age?: number;
      nationality?: string;
      photo?: string;
      injured?: boolean;
    };
    statistics?: Array<{
      team?: { id?: number; name?: string; logo?: string };
      league?: { id?: number; name?: string; country?: string; logo?: string; season?: number };
      games?: { appearences?: number; position?: string; rating?: string };
      goals?: { total?: number; assists?: number };
    }>;
  }>;
  errors?: unknown;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const season = getApiFootballSeason(searchParams.get("season") || process.env.API_FOOTBALL_SEASON);
  const apiKey = process.env.API_FOOTBALL_KEY ?? process.env.APISPORTS_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";

  if (!query || query.length < 2) {
    return NextResponse.json({ error: "Search at least 2 letters." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "API-Football key is not configured in Vercel." }, { status: 500 });
  }

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

  if (!response.ok) {
    return NextResponse.json({ error: `API-Football request failed with status ${response.status}` }, { status: 502 });
  }

  const data = (await response.json()) as ApiFootballSearchResponse;

  const players = (data.response ?? []).slice(0, 24).map((item) => {
    const stats = item.statistics?.[0];
    return {
      id: item.player?.id,
      name: item.player?.name,
      firstname: item.player?.firstname,
      lastname: item.player?.lastname,
      age: item.player?.age,
      nationality: item.player?.nationality,
      photo: item.player?.photo,
      injured: item.player?.injured,
      team: stats?.team,
      league: stats?.league,
      position: stats?.games?.position,
      appearances: stats?.games?.appearences,
      rating: stats?.games?.rating,
      goals: stats?.goals?.total,
      assists: stats?.goals?.assists,
    };
  });

  return NextResponse.json({ query, season, players });
}
