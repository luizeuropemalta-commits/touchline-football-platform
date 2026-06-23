import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ interests: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("player_interests")
      .select("id, club_name, sporting_director, position_needed, message, status, created_at, updated_at, players:player_id(id, first_name, last_name, position, photo_url)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return NextResponse.json({ interests: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load interests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const playerId = cleanText(body.playerId, 80);
    const clubName = cleanText(body.clubName, 180);
    if (!playerId || !clubName) {
      return NextResponse.json({ error: "Player and club name are required." }, { status: 400 });
    }

    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id, first_name, last_name")
      .eq("agency_id", agencyId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw new Error(playerError.message);
    if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

    const { data: club, error: clubError } = await admin
      .from("clubs")
      .upsert({ agency_id: agencyId, name: clubName }, { onConflict: "agency_id,name" })
      .select("id")
      .single();

    if (clubError) throw new Error(clubError.message);

    const { data: interest, error } = await admin
      .from("player_interests")
      .insert({
        agency_id: agencyId,
        player_id: playerId,
        club_id: club.id,
        club_name: clubName,
        sporting_director: cleanText(body.sportingDirector, 180) || null,
        position_needed: cleanText(body.positionNeeded, 80) || null,
        message: cleanText(body.message, 1000) || null,
        status: "new_interest",
        created_by: user.id,
      })
      .select("id, status")
      .single();

    if (error) throw new Error(error.message);

    const playerName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
    await admin.from("negotiation_rooms").insert({
      agency_id: agencyId,
      interest_id: interest.id,
      player_id: playerId,
      club_id: club.id,
      title: `${clubName} × ${playerName || "Player"}`,
      status: "active",
      created_by: user.id,
    });

    return NextResponse.json({ ok: true, interest });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create interest." }, { status: 500 });
  }
}
