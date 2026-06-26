import type { SupabaseClient } from "@supabase/supabase-js";

import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type {
  FootballDataProvider,
  TouchlineCompetition,
  TouchlinePlayer,
  TouchlineSquadMember,
  TouchlineTeam,
} from "@/lib/football-data/types";

type AdminClient = SupabaseClient;

type SyncOptions = {
  competitionId?: string;
  clubId?: string;
};

export type StarterFoundationSyncResult = {
  ok: boolean;
  status: "success" | "partial" | "error" | "not_configured";
  provider: "sportmonks";
  competitionProviderId?: string;
  clubProviderId?: string;
  competition?: { id: string; name: string };
  club?: { id: string; name: string };
  squadCount: number;
  playerCount: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  syncRunId?: string;
};

const DEFAULT_STARTER_COMPETITION_ID = "8";
const DEFAULT_STARTER_CLUB_ID = "19";

export function configuredStarterCompetitionId(explicit?: string) {
  return explicit ?? process.env.SPORTMONKS_STARTER_LEAGUE_ID ?? DEFAULT_STARTER_COMPETITION_ID;
}

export function configuredStarterClubId(explicit?: string) {
  return explicit ?? process.env.SPORTMONKS_STARTER_CLUB_ID ?? DEFAULT_STARTER_CLUB_ID;
}

export async function syncSportmonksStarterFoundation(
  admin: AdminClient,
  options: SyncOptions = {},
): Promise<StarterFoundationSyncResult> {
  const provider = createFootballDataProvider("sportmonks");
  const competitionProviderId = configuredStarterCompetitionId(options.competitionId);
  const clubProviderId = configuredStarterClubId(options.clubId);

  const run = await createSyncRun(admin, {
    competitionProviderId,
    clubProviderId,
  });

  const result: StarterFoundationSyncResult = {
    ok: false,
    status: "error",
    provider: "sportmonks",
    competitionProviderId,
    clubProviderId,
    squadCount: 0,
    playerCount: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    errors: [],
    syncRunId: run.id,
  };

  if (!process.env.SPORTMONKS_API_TOKEN) {
    result.status = "not_configured";
    result.errors.push("SPORTMONKS_API_TOKEN is not configured.");
    await finishSyncRun(admin, run.id, result);
    return result;
  }

  const competitionResponse = await provider.getCompetitionById(competitionProviderId);
  if (!competitionResponse.ok || !competitionResponse.data) {
    result.status = competitionResponse.ok ? "error" : competitionResponse.error.code === "not_configured" ? "not_configured" : "error";
    result.errors.push(competitionResponse.ok ? `Competition ${competitionProviderId} was not found.` : competitionResponse.error.message);
    await finishSyncRun(admin, run.id, result);
    return result;
  }

  const competition = await upsertCompetition(admin, competitionResponse.data);
  result.competition = { id: competition.id, name: competition.name };
  result.recordsUpdated += 1;

  const clubResponse = await provider.getTeamById(clubProviderId);
  if (!clubResponse.ok || !clubResponse.data) {
    result.status = clubResponse.ok ? "partial" : clubResponse.error.code === "not_configured" ? "not_configured" : "partial";
    result.errors.push(clubResponse.ok ? `Club ${clubProviderId} was not found.` : clubResponse.error.message);
    await finishSyncRun(admin, run.id, result);
    return result;
  }

  const club = await upsertClub(admin, clubResponse.data, competition.id);
  result.club = { id: club.id, name: club.name };
  result.recordsUpdated += 1;

  const squadResponse = await provider.getSquad(clubProviderId);
  if (!squadResponse.ok) {
    result.status = squadResponse.error.code === "not_configured" ? "not_configured" : "partial";
    result.errors.push(squadResponse.error.message);
    await finishSyncRun(admin, run.id, result);
    return result;
  }

  result.squadCount = squadResponse.data.length;

  for (const member of squadResponse.data) {
    try {
      const player = await upsertPlayer(admin, member.player, club.id);
      await upsertSquadMember(admin, member, club.id, player.id, competition.id);
      await upsertProviderMapping(admin, {
        provider: "sportmonks",
        providerEntityType: "player",
        providerEntityId: member.player.providerId,
        touchlineEntityType: "player",
        touchlineEntityId: player.id,
      });
      result.playerCount += 1;
      result.recordsUpdated += 2;
    } catch (error) {
      result.recordsSkipped += 1;
      result.errors.push(error instanceof Error ? error.message : "Unknown squad member sync error.");
    }
  }

  await upsertProviderMapping(admin, {
    provider: "sportmonks",
    providerEntityType: "competition",
    providerEntityId: competitionProviderId,
    touchlineEntityType: "competition",
    touchlineEntityId: competition.id,
  });
  await upsertProviderMapping(admin, {
    provider: "sportmonks",
    providerEntityType: "club",
    providerEntityId: clubProviderId,
    touchlineEntityType: "club",
    touchlineEntityId: club.id,
  });

  result.ok = result.errors.length === 0;
  result.status = result.errors.length === 0 ? "success" : "partial";
  await finishSyncRun(admin, run.id, result, competition.id, club.id);
  return result;
}

async function createSyncRun(
  admin: AdminClient,
  payload: { competitionProviderId: string; clubProviderId: string },
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("football_data_sync_runs")
    .insert({
      provider: "sportmonks",
      sync_type: "starter_foundation",
      status: "running",
      source_payload: {
        competitionProviderId: payload.competitionProviderId,
        clubProviderId: payload.clubProviderId,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create football sync run: ${error.message}`);
  return data as { id: string };
}

async function finishSyncRun(
  admin: AdminClient,
  id: string | undefined,
  result: StarterFoundationSyncResult,
  competitionId?: string,
  clubId?: string,
) {
  if (!id) return;
  await admin
    .from("football_data_sync_runs")
    .update({
      status: result.status,
      competition_id: competitionId,
      club_id: clubId,
      completed_at: new Date().toISOString(),
      records_created: result.recordsCreated,
      records_updated: result.recordsUpdated,
      records_skipped: result.recordsSkipped,
      error_message: result.errors.join("\n") || null,
      source_payload: {
        competitionProviderId: result.competitionProviderId,
        clubProviderId: result.clubProviderId,
        squadCount: result.squadCount,
        playerCount: result.playerCount,
      },
    })
    .eq("id", id);
}

async function upsertCompetition(admin: AdminClient, competition: TouchlineCompetition): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from("football_competitions")
    .upsert(
      {
        provider: competition.provider,
        provider_competition_id: competition.providerId,
        name: competition.name,
        type: competition.type,
        logo_url: competition.logoUrl,
        country: competition.country,
        country_id: competition.countryId,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_competition_id" },
    )
    .select("id,name")
    .single();

  if (error) throw new Error(`Could not upsert competition ${competition.name}: ${error.message}`);
  return data as { id: string; name: string };
}

async function upsertClub(admin: AdminClient, club: TouchlineTeam, competitionId: string): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from("football_clubs")
    .upsert(
      {
        provider: club.provider,
        provider_team_id: club.providerId,
        competition_id: competitionId,
        name: club.name,
        short_code: club.shortCode,
        logo_url: club.logoUrl,
        country: club.country,
        country_id: club.countryId,
        founded: club.founded,
        venue_id: club.venueId,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_team_id" },
    )
    .select("id,name")
    .single();

  if (error) throw new Error(`Could not upsert club ${club.name}: ${error.message}`);
  return data as { id: string; name: string };
}

async function upsertPlayer(admin: AdminClient, player: TouchlinePlayer, clubId: string): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from("football_players")
    .upsert(
      {
        provider: player.provider,
        provider_player_id: player.providerId,
        current_club_id: clubId,
        name: player.name,
        display_name: player.displayName,
        first_name: player.firstName,
        last_name: player.lastName,
        photo_url: player.photoUrl,
        date_of_birth: player.dateOfBirth,
        age: player.age,
        nationality: player.nationality,
        country_id: player.countryId,
        position: player.position,
        position_id: player.positionId,
        height: player.height,
        weight: player.weight,
        market_value: player.marketValue,
        market_value_currency: player.marketValueCurrency,
        contract_until: player.contractUntil,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_player_id" },
    )
    .select("id,name")
    .single();

  if (error) throw new Error(`Could not upsert player ${player.name}: ${error.message}`);
  return data as { id: string; name: string };
}

async function upsertSquadMember(
  admin: AdminClient,
  member: TouchlineSquadMember,
  clubId: string,
  playerId: string,
  competitionId: string,
) {
  const { error } = await admin
    .from("football_squad_members")
    .upsert(
      {
        provider: member.player.provider,
        club_id: clubId,
        player_id: playerId,
        competition_id: competitionId,
        jersey_number: member.jerseyNumber,
        position: member.position ?? member.player.position,
        status: "active",
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,club_id,player_id" },
    );

  if (error) throw new Error(`Could not upsert squad member ${member.player.name}: ${error.message}`);
}

async function upsertProviderMapping(
  admin: AdminClient,
  params: {
    provider: string;
    providerEntityType: string;
    providerEntityId: string;
    touchlineEntityType: string;
    touchlineEntityId: string;
  },
) {
  await admin
    .from("football_provider_mappings")
    .upsert(
      {
        provider: params.provider,
        provider_entity_type: params.providerEntityType,
        provider_entity_id: params.providerEntityId,
        touchline_entity_type: params.touchlineEntityType,
        touchline_entity_id: params.touchlineEntityId,
        confidence: "provider_exact",
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_entity_type,provider_entity_id" },
    );
}
