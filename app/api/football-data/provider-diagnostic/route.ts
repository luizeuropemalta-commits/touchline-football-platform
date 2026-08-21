import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlineSquadMember } from "@/lib/football-data/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizeOwner() {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const PROVIDER = "sportmonks";
const MAX_DIAGNOSTIC_IDS_PER_CLUB = 24;

type ClubRow = Readonly<{ id: string; provider_team_id: string }>;
type MembershipRow = Readonly<{ club_id: string; player_id: string }>;
type PlayerRow = Readonly<{ id: string; provider_player_id: string }>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function identifier(value: unknown) {
  const normalized = text(value);
  return /^\d{1,20}$/.test(normalized) ? normalized : null;
}

function safePositionEvidence(member: TouchlineSquadMember) {
  const rawMember = record(member.raw);
  const rawPlayer = record(rawMember.player);

  return {
    providerPlayerId: member.player.providerId,
    name: member.player.displayName,
    jerseyNumber: member.jerseyNumber ?? null,
    squadPosition: member.position ?? null,
    playerPosition: member.player.position ?? null,
    squadPositionId: identifier(rawMember.position_id),
    squadDetailedPositionId: identifier(rawMember.detailed_position_id),
    playerPositionId: identifier(rawPlayer.position_id) ?? identifier(member.player.positionId),
    playerDetailedPositionId: identifier(rawPlayer.detailed_position_id),
  };
}

async function twentyClubPositionReadOnlyDiagnostic() {
  const provider = createFootballDataProvider("sportmonks");
  const clubs: Array<Record<string, unknown>> = [];

  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    const squad = await provider.getSquad(club.teamId);
    if (!squad.ok) throw new Error(`Sportmonks squad ${club.teamId} failed: ${squad.error.code}`);
    clubs.push({
      teamId: club.teamId,
      club: club.name,
      players: squad.data.map(safePositionEvidence),
    });
  }

  return {
    scope: "twenty-club-position-read-only",
    clubs,
    totals: {
      clubs: clubs.length,
      players: clubs.reduce((total, club) => total + (Array.isArray(club.players) ? club.players.length : 0), 0),
    },
  };
}

async function twentyClubReadOnlyDiagnostic() {
  const admin = createAdminClient();
  if (!admin) throw new Error("QA canonical player data is unavailable.");
  const teamIds = TOUCHLINE_ENGLAND_CLUBS.map((club) => club.teamId);
  const { data: clubs, error: clubsError } = await admin
    .from("football_clubs")
    .select("id,provider_team_id")
    .eq("provider", PROVIDER)
    .in("provider_team_id", teamIds);
  if (clubsError || !clubs) throw new Error("QA club scope could not be read.");

  const clubRows = clubs as ClubRow[];
  const clubIds = clubRows.map((club) => club.id);
  const { data: memberships, error: membershipsError } = await admin
    .from("football_squad_members")
    .select("club_id,player_id")
    .eq("provider", PROVIDER)
    .eq("status", "active")
    .in("club_id", clubIds);
  if (membershipsError || !memberships) throw new Error("QA active memberships could not be read.");

  const membershipRows = memberships as MembershipRow[];
  const playerIds = membershipRows.map((membership) => membership.player_id);
  const { data: players, error: playersError } = await admin
    .from("football_players")
    .select("id,provider_player_id")
    .eq("provider", PROVIDER)
    .in("id", playerIds);
  if (playersError || !players) throw new Error("QA canonical players could not be read.");

  const playerById = new Map((players as PlayerRow[]).map((player) => [player.id, player.provider_player_id] as const));
  const canonicalByTeamId = new Map<string, Set<string>>();
  for (const club of clubRows) canonicalByTeamId.set(club.provider_team_id, new Set<string>());
  for (const membership of membershipRows) {
    const club = clubRows.find((candidate) => candidate.id === membership.club_id);
    const providerPlayerId = playerById.get(membership.player_id);
    if (club && providerPlayerId) canonicalByTeamId.get(club.provider_team_id)?.add(providerPlayerId);
  }

  const provider = createFootballDataProvider("sportmonks");
  const clubDiagnostics: Array<Record<string, unknown>> = [];
  let providerPlayers = 0;
  let canonicalPlayers = 0;
  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    const squad = await provider.getSquad(club.teamId);
    if (!squad.ok) throw new Error(`Sportmonks squad ${club.teamId} failed: ${squad.error.code}`);
    const providerIds = new Set(squad.data.map((member) => text(member.player.providerId)).filter(Boolean));
    const canonicalIds = canonicalByTeamId.get(club.teamId) ?? new Set<string>();
    const providerOnly = [...providerIds].filter((id) => !canonicalIds.has(id));
    const canonicalOnly = [...canonicalIds].filter((id) => !providerIds.has(id));
    providerPlayers += providerIds.size;
    canonicalPlayers += canonicalIds.size;
    clubDiagnostics.push({
      teamId: club.teamId,
      club: club.name,
      providerPlayers: providerIds.size,
      canonicalPlayers: canonicalIds.size,
      providerOnly: providerOnly.length,
      canonicalOnly: canonicalOnly.length,
      providerOnlyIds: providerOnly.slice(0, MAX_DIAGNOSTIC_IDS_PER_CLUB),
      canonicalOnlyIds: canonicalOnly.slice(0, MAX_DIAGNOSTIC_IDS_PER_CLUB),
    });
  }

  return {
    scope: "twenty-club-read-only",
    clubs: clubDiagnostics,
    totals: {
      clubs: clubDiagnostics.length,
      providerPlayers,
      canonicalPlayers,
      providerOnly: clubDiagnostics.reduce((total, club) => total + Number(club.providerOnly), 0),
      canonicalOnly: clubDiagnostics.reduce((total, club) => total + Number(club.canonicalOnly), 0),
    },
  };
}

/**
 * QA owner-only, read-only evidence endpoint. It deliberately returns only
 * coverage counts and a few non-sensitive sample fields; provider tokens and
 * raw payloads remain server-only.
 */
export async function GET(request: NextRequest) {
  if (!await authorizeOwner()) {
    return NextResponse.json({ ok: false, error: "Owner session required." }, { status: 401 });
  }

  const scope = text(request.nextUrl.searchParams.get("scope"));
  if (scope === "twenty") {
    try {
      return NextResponse.json({
        ok: true,
        source: "sportmonks-live-read-only",
        diagnostic: await twentyClubReadOnlyDiagnostic(),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "QA roster diagnostic failed.",
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }

  if (scope === "positions") {
    try {
      return NextResponse.json({
        ok: true,
        source: "sportmonks-live-read-only",
        diagnostic: await twentyClubPositionReadOnlyDiagnostic(),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "QA position diagnostic failed.",
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }

  const teamId = text(request.nextUrl.searchParams.get("teamId"));
  if (!/^\d{1,20}$/.test(teamId)) {
    return NextResponse.json({ ok: false, error: "A numeric teamId is required." }, { status: 400 });
  }

  const provider = createFootballDataProvider("sportmonks");
  const [squad, capabilities] = await Promise.all([
    provider.getSquad(teamId),
    provider.getSubscriptionCapabilities(),
  ]);

  if (!squad.ok) {
    return NextResponse.json({ ok: false, teamId, error: squad.error.message }, { status: 502 });
  }

  const players = squad.data;
  const expectedLineupsAvailable = capabilities.ok
    ? [...capabilities.data.resources, ...capabilities.data.enrichments].some((item) => (
      /expected[ -]?lineups?/i.test(`${item.name ?? ""} ${item.endpoint ?? ""} ${item.id}`)
      && item.available !== false
    ))
    : false;

  return NextResponse.json({
    ok: true,
    teamId,
    source: "sportmonks-live-read-only",
    squad: {
      total: players.length,
      withNationality: players.filter((member) => Boolean(text(member.player.nationality))).length,
      withCountryId: players.filter((member) => Boolean(text(member.player.countryId))).length,
      withShirtNumber: players.filter((member) => Number.isInteger(member.jerseyNumber) && Number(member.jerseyNumber) > 0).length,
      sample: players.slice(0, 3).map((member) => ({
        providerPlayerId: member.player.providerId,
        name: member.player.displayName,
        nationality: member.player.nationality ?? null,
        countryId: member.player.countryId ?? null,
        position: member.position ?? member.player.position ?? null,
        shirtNumber: member.jerseyNumber ?? null,
      })),
    },
    capabilities: {
      readable: capabilities.ok,
      expectedLineupsAvailable,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
