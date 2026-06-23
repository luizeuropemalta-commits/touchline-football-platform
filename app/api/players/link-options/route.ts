import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  photo_url: string | null;
  external_market_provider: string | null;
  external_market_player_id: string | null;
  external_market_url: string | null;
  clubs?: ClubJoin;
};

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ players: [], preview: true });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("players")
      .select("id, first_name, last_name, position, photo_url, external_market_provider, external_market_player_id, external_market_url, clubs:current_club_id(name)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      players: ((data ?? []) as PlayerRow[]).map((player) => ({
        id: player.id,
        name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
        position: player.position,
        club: clubName(player.clubs),
        photoUrl: player.photo_url,
        externalProvider: player.external_market_provider,
        externalPlayerId: player.external_market_player_id,
        externalUrl: player.external_market_url,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load players." }, { status: 500 });
  }
}
