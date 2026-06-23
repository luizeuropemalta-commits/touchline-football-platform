import { NextResponse } from "next/server";
import { players as demoPlayers } from "@/lib/demo-data";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({
      players: demoPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        club: player.club,
        position: player.position,
        demo: true,
      })),
      preview: true,
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("players")
      .select("id, first_name, last_name, position, photo_url, external_market_provider, external_market_player_id, clubs:current_club_id(name)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      players: (data ?? []).map((player: any) => ({
        id: player.id,
        name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
        position: player.position,
        club: player.clubs?.name ?? null,
        photoUrl: player.photo_url,
        externalProvider: player.external_market_provider,
        externalPlayerId: player.external_market_player_id,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load players." }, { status: 500 });
  }
}
