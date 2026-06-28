import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const entityType = searchParams.get("entityType")?.trim() ?? "player";
  if (!q) return NextResponse.json({ ok: true, entityType, results: [] });

  if (entityType !== "player") {
    return NextResponse.json({
      ok: true,
      entityType,
      results: [],
      note: "Non-player entity search uses registered Touchline data or QA fallback until production tables are connected.",
    });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin is not configured." }, { status: 500 });

  const { data, error } = await admin
    .from("football_players")
    .select("id,provider,provider_player_id,name,display_name,photo_url,nationality,position,market_value,market_value_currency,source_updated_at")
    .eq("provider", "sportmonks")
    .or(`name.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(10);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    entityType,
    results: (data ?? []).map((player) => ({
      ...player,
      sourceImageUrl: player.photo_url,
      sourceImageProvider: "sportmonks",
      sourceImageLicenseStatus: "source_tracked",
      avatarRenderStatus: player.photo_url ? "rendered" : "fallback",
      avatarRenderVersion: "runtime-css-v1",
      avatarRenderType: player.photo_url ? "touchline_branded_render" : "touchline_initials_fallback",
      marketValueSource: player.market_value ? "registered_database" : "unavailable_from_provider",
    })),
  });
}
