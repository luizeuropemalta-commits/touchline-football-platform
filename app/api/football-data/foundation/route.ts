import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

type FootballDbClient = SupabaseClient;
type FoundationRow = Record<string, unknown>;

type ReadableClientResult =
  | { client: FootballDbClient; mode: "owner_session" | "sync_secret" }
  | { client: null; mode: "missing" };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * This is an owner/server diagnostics contract, never a browser table proxy.
 * Every field below is deliberately allowlisted; provider identifiers, raw
 * valuation/contract metadata, provider payloads and sync errors remain
 * server-side.
 */
function competitionDto(row: FoundationRow) {
  return {
    id: text(row.id),
    name: text(row.name),
    type: text(row.type),
    country: text(row.country),
    logoUrl: text(row.logo_url),
    sourceUpdatedAt: text(row.source_updated_at),
  };
}

function seasonDto(row: FoundationRow) {
  return {
    id: text(row.id),
    competitionId: text(row.competition_id),
    name: text(row.name),
    startsAt: text(row.starts_at),
    endsAt: text(row.ends_at),
    isCurrent: row.is_current === true,
    sourceUpdatedAt: text(row.source_updated_at),
  };
}

function clubDto(row: FoundationRow) {
  return {
    id: text(row.id),
    competitionId: text(row.competition_id),
    name: text(row.name),
    shortCode: text(row.short_code),
    country: text(row.country),
    founded: safeInteger(row.founded),
    logoUrl: text(row.logo_url),
    sourceUpdatedAt: text(row.source_updated_at),
  };
}

function squadMemberDto(row: FoundationRow) {
  return {
    clubId: text(row.club_id),
    playerId: text(row.player_id),
    competitionId: text(row.competition_id),
    shirtNumber: safeInteger(row.jersey_number),
    position: text(row.position),
    status: text(row.status),
    sourceUpdatedAt: text(row.source_updated_at),
  };
}

function playerDto(row: FoundationRow) {
  return {
    id: text(row.id),
    currentClubId: text(row.current_club_id),
    name: text(row.name),
    displayName: text(row.display_name),
    age: safeInteger(row.age),
    nationality: text(row.nationality),
    position: text(row.position),
    sourceUpdatedAt: text(row.source_updated_at),
  };
}

function syncRunDto(row: FoundationRow) {
  return {
    id: text(row.id),
    syncType: text(row.sync_type),
    status: text(row.status),
    startedAt: text(row.started_at),
    completedAt: text(row.completed_at),
    recordsCreated: safeInteger(row.records_created),
    recordsUpdated: safeInteger(row.records_updated),
    recordsSkipped: safeInteger(row.records_skipped),
  };
}

function readSecret() {
  return process.env.FOOTBALL_DATA_SYNC_SECRET ?? process.env.FOOTBALL_DATA_VALIDATION_SECRET;
}

async function getReadableClient(request: NextRequest): Promise<ReadableClientResult> {
  const secret = readSecret();
  const authorization = request.headers.get("authorization");
  const admin = createAdminClient();

  if (secret && authorization === `Bearer ${secret}`) {
    return admin ? { client: admin, mode: "sync_secret" } : { client: null, mode: "missing" };
  }

  const supabase = await createClient();
  if (!supabase) return { client: null, mode: "missing" };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email) || !admin) {
    return { client: null, mode: "missing" };
  }

  // A user session authorizes the owner-only route; raw rows are queried only
  // through the server client after that authorization succeeds.
  return { client: admin, mode: "owner_session" };
}

export async function GET(request: NextRequest) {
  const { client, mode } = await getReadableClient(request);
  if (!client) {
    return NextResponse.json(
      { ok: false, status: "unauthorized", error: "Owner session or football data read secret required." },
      { status: 401 },
    );
  }

  try {
    const requestedClubId = request.nextUrl.searchParams.get("clubId");
    const [{ data: competitions, error: competitionsError }, { data: seasons, error: seasonsError }, { data: clubs, error: clubsError }, { data: syncRuns, error: syncError }] =
      await Promise.all([
        client
          .from("football_competitions")
          .select("id,name,type,logo_url,country,source_updated_at")
          .order("name", { ascending: true }),
        client
          .from("football_seasons")
          .select("id,competition_id,name,starts_at,ends_at,is_current,source_updated_at")
          .order("starts_at", { ascending: false }),
        client
          .from("football_clubs")
          .select("id,competition_id,name,short_code,logo_url,country,founded,source_updated_at")
          .order("name", { ascending: true }),
        client
          .from("football_data_sync_runs")
          .select("id,sync_type,status,started_at,completed_at,records_created,records_updated,records_skipped")
          .order("started_at", { ascending: false })
          .limit(5),
      ]);

    if (competitionsError) throw new Error(`Could not read competitions: ${competitionsError.message}`);
    if (seasonsError) throw new Error(`Could not read seasons: ${seasonsError.message}`);
    if (clubsError) throw new Error(`Could not read clubs: ${clubsError.message}`);
    if (syncError) throw new Error(`Could not read sync runs: ${syncError.message}`);

    const selectedClub = requestedClubId
      ? (clubs ?? []).find((club) => club.id === requestedClubId)
      : (clubs ?? [])[0];

    let squad: FoundationRow[] = [];
    let players: FoundationRow[] = [];

    if (selectedClub) {
      const { data: squadMembers, error: squadError } = await client
        .from("football_squad_members")
        .select("club_id,player_id,competition_id,jersey_number,position,status,source_updated_at")
        .eq("club_id", selectedClub.id)
        .order("jersey_number", { ascending: true, nullsFirst: false });

      if (squadError) throw new Error(`Could not read squad members: ${squadError.message}`);
      squad = (squadMembers ?? []) as FoundationRow[];

      const playerIds = squad.map((member) => text(member.player_id)).filter((id): id is string => Boolean(id));
      if (playerIds.length) {
        const { data: playerRows, error: playersError } = await client
          .from("football_players")
          .select("id,current_club_id,name,display_name,age,nationality,position,source_updated_at")
          .in("id", playerIds)
          .order("name", { ascending: true });

        if (playersError) throw new Error(`Could not read players: ${playersError.message}`);
        players = (playerRows ?? []) as FoundationRow[];
      }
    }

    return NextResponse.json({
      ok: true,
      status: "ready",
      mode,
      sourceOfTruth: "touchline_verified_database",
      counts: {
        competitions: competitions?.length ?? 0,
        seasons: seasons?.length ?? 0,
        clubs: clubs?.length ?? 0,
        selectedClubSquadMembers: squad.length,
        selectedClubPlayers: players.length,
      },
      selectedClub: selectedClub ? clubDto(selectedClub as FoundationRow) : null,
      competitions: (competitions ?? []).map((row) => competitionDto(row as FoundationRow)),
      seasons: (seasons ?? []).map((row) => seasonDto(row as FoundationRow)),
      clubs: (clubs ?? []).map((row) => clubDto(row as FoundationRow)),
      squad: squad.map(squadMemberDto),
      players: players.map(playerDto),
      recentSyncRuns: (syncRuns ?? []).map((row) => syncRunDto(row as FoundationRow)),
      note: "Owner/server diagnostics use an explicit TouchLine allowlist; browser roles cannot read raw football tables.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown football foundation read error.",
        hint: "If this mentions a missing relation, apply the QA football foundation migrations first.",
      },
      { status: 500 },
    );
  }
}
