import { NextResponse } from "next/server";
import { mapGlobalPlayer } from "@/lib/player-database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function cleanLimit(value: string | null) {
  const limit = Number(value ?? 12);
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.round(limit), 1), 50);
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

  if (query.length < 2) return NextResponse.json({ players: [] });

  const { data, error } = await admin.rpc("search_global_player_profiles", {
    search_query: query,
    result_limit: limit,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    players: ((data ?? []) as Record<string, unknown>[]).map(mapGlobalPlayer),
  });
}
