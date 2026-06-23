import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type ApiFootballPlayerPayload = {
  id?: number;
  name?: string;
  firstname?: string;
  lastname?: string;
  age?: number;
  nationality?: string;
  photo?: string;
  injured?: boolean;
  team?: { id?: number; name?: string; logo?: string };
  league?: { id?: number; name?: string; country?: string; logo?: string; season?: number };
  position?: string;
  appearances?: number;
  rating?: string;
  goals?: number;
  assists?: number;
};

function splitName(player: ApiFootballPlayerPayload) {
  const fullName = player.name?.trim() || `${player.firstname ?? ""} ${player.lastname ?? ""}`.trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (player.firstname || player.lastname) {
    return {
      firstName: player.firstname || parts[0] || "Unknown",
      lastName: player.lastname || parts.slice(1).join(" ") || "Player",
    };
  }
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Player",
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const json = await readJsonObject(request);
  if (!json.ok) return json.response;
  const body = json.data as {
    playerId?: string;
    apiFootballPlayer?: ApiFootballPlayerPayload;
  };

  const apiPlayer = body.apiFootballPlayer;
  if (!apiPlayer?.id || !apiPlayer.name) {
    return NextResponse.json({ error: "API-Football player data is required." }, { status: 400 });
  }

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    let targetPlayerId = body.playerId;
    let created = false;

    const externalPayload = {
      source: "api-football",
      player: apiPlayer,
      linkedBy: user.id,
      linkedAt: new Date().toISOString(),
      note: "Linked from Touchline API-Football Search.",
    };

    if (!targetPlayerId || targetPlayerId === "__create__") {
      const { firstName, lastName } = splitName(apiPlayer);
      let currentClubId: string | null = null;

      if (apiPlayer.team?.name) {
        const { data: club, error: clubError } = await admin
          .from("clubs")
          .upsert(
            {
              agency_id: agencyId,
              name: apiPlayer.team.name,
              league: apiPlayer.league?.name ?? null,
              crest_url: apiPlayer.team.logo ?? null,
            },
            { onConflict: "agency_id,name" },
          )
          .select("id")
          .single();

        if (clubError) throw new Error(clubError.message);
        currentClubId = club.id;
      }

      const { data: newPlayer, error: createError } = await admin
        .from("players")
        .insert({
          agency_id: agencyId,
          current_club_id: currentClubId,
          agent_id: user.id,
          first_name: firstName,
          last_name: lastName,
          position: apiPlayer.position ?? null,
          status: "active",
          photo_url: apiPlayer.photo ?? null,
          stats: externalPayload,
          external_market_provider: "api-football",
          external_market_player_id: String(apiPlayer.id),
          external_market_url: null,
          external_market_synced_at: new Date().toISOString(),
          external_market_payload: externalPayload,
        })
        .select("id")
        .single();

      if (createError) throw new Error(createError.message);
      targetPlayerId = newPlayer.id;
      created = true;
    } else {
      const { data: target, error: targetError } = await admin
        .from("players")
        .select("id, agency_id")
        .eq("id", targetPlayerId)
        .eq("agency_id", agencyId)
        .maybeSingle();

      if (targetError) throw new Error(targetError.message);
      if (!target) return NextResponse.json({ error: "Player profile not found in your workspace." }, { status: 404 });

      const { error: updateError } = await admin
        .from("players")
        .update({
          external_market_provider: "api-football",
          external_market_player_id: String(apiPlayer.id),
          external_market_synced_at: new Date().toISOString(),
          external_market_payload: externalPayload,
          photo_url: apiPlayer.photo ?? undefined,
        })
        .eq("id", targetPlayerId)
        .eq("agency_id", agencyId);

      if (updateError) throw new Error(updateError.message);
    }

    await admin.from("player_market_snapshots").insert({
      agency_id: agencyId,
      player_id: targetPlayerId,
      provider: "api-football",
      provider_player_id: String(apiPlayer.id),
      market_value: null,
      currency: "EUR",
      current_club: apiPlayer.team?.name ?? null,
      source_updated_at: new Date().toISOString(),
      raw_payload: externalPayload,
    });

    return NextResponse.json({
      ok: true,
      created,
      playerId: targetPlayerId,
      provider: "api-football",
      externalPlayerId: String(apiPlayer.id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save player link." }, { status: 500 });
  }
}
