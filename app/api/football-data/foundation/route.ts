import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

type FootballDbClient = SupabaseClient;

function readSecret() {
  return process.env.FOOTBALL_DATA_SYNC_SECRET ?? process.env.FOOTBALL_DATA_VALIDATION_SECRET;
}

async function getReadableClient(request: NextRequest): Promise<{ client: FootballDbClient | null; mode: "authenticated" | "sync_secret" | "missing" }> {
  const secret = readSecret();
  const authorization = request.headers.get("authorization");

  if (secret && authorization === `Bearer ${secret}`) {
    return { client: createAdminClient(), mode: "sync_secret" };
  }

  const supabase = await createClient();
  if (!supabase) return { client: null, mode: "missing" };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hasArenaAccess = hasTouchLineArenaAccess(user);
  return {
    client: hasArenaAccess ? supabase : null,
    mode: hasArenaAccess ? "authenticated" : "missing",
  };
}

export async function GET(request: NextRequest) {
  const { client, mode } = await getReadableClient(request);
  if (!client) {
    return NextResponse.json(
      { ok: false, status: "unauthorized", error: "Authenticated session or football data read secret required." },
      { status: 401 },
    );
  }

  try {
    const requestedClubId = request.nextUrl.searchParams.get("clubId");

    const [{ data: competitions, error: competitionsError }, { data: clubs, error: clubsError }, { data: syncRuns, error: syncError }] =
      await Promise.all([
        client
          .from("football_competitions")
          .select("id,provider,provider_competition_id,name,type,logo_url,country,source_updated_at")
          .order("name", { ascending: true }),
        client
          .from("football_clubs")
          .select("id,provider,provider_team_id,competition_id,name,short_code,logo_url,country,founded,source_updated_at")
          .order("name", { ascending: true }),
        client
          .from("football_data_sync_runs")
          .select("id,provider,sync_type,status,competition_id,club_id,started_at,completed_at,records_created,records_updated,records_skipped,error_message")
          .order("started_at", { ascending: false })
          .limit(5),
      ]);

    if (competitionsError) throw new Error(`Could not read competitions: ${competitionsError.message}`);
    if (clubsError) throw new Error(`Could not read clubs: ${clubsError.message}`);
    if (syncError) throw new Error(`Could not read sync runs: ${syncError.message}`);

    const selectedClub = requestedClubId
      ? (clubs ?? []).find((club) => club.id === requestedClubId || club.provider_team_id === requestedClubId)
      : (clubs ?? [])[0];

    let squad: unknown[] = [];
    let players: unknown[] = [];

    if (selectedClub) {
      const { data: squadMembers, error: squadError } = await client
        .from("football_squad_members")
        .select("id,provider,club_id,player_id,competition_id,jersey_number,position,status,source_updated_at")
        .eq("club_id", selectedClub.id)
        .order("jersey_number", { ascending: true, nullsFirst: false });

      if (squadError) throw new Error(`Could not read squad members: ${squadError.message}`);
      squad = squadMembers ?? [];

      const playerIds = (squadMembers ?? []).map((member) => member.player_id).filter(Boolean);
      if (playerIds.length) {
        const { data: playerRows, error: playersError } = await client
          .from("football_players")
          .select(
            "id,provider,provider_player_id,current_club_id,name,display_name,photo_url,date_of_birth,age,nationality,position,height,weight,market_value,market_value_currency,contract_until,source_updated_at",
          )
          .in("id", playerIds)
          .order("name", { ascending: true });

        if (playersError) throw new Error(`Could not read players: ${playersError.message}`);
        players = playerRows ?? [];
      }
    }

    return NextResponse.json({
      ok: true,
      status: "ready",
      mode,
      sourceOfTruth: "touchline_database",
      provider: "sportmonks",
      counts: {
        competitions: competitions?.length ?? 0,
        clubs: clubs?.length ?? 0,
        selectedClubSquadMembers: squad.length,
        selectedClubPlayers: players.length,
      },
      selectedClub: selectedClub ?? null,
      competitions: competitions ?? [],
      clubs: clubs ?? [],
      squad,
      players,
      recentSyncRuns: syncRuns ?? [],
      note: "This endpoint reads only normalized Touchline database tables. It never calls Sportmonks directly.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown football foundation read error.",
        hint: "If this mentions a missing relation, run supabase/migrations/013_football_data_foundation.sql in Supabase first.",
      },
      { status: 500 },
    );
  }
}
