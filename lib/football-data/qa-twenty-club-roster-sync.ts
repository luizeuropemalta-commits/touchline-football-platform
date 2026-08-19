import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import { persistSquadSnapshot, type SquadSnapshotPlayerInput } from "@/lib/football-data/squad-snapshot-store";
import type { TouchlineSquadMember } from "@/lib/football-data/types";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";

const PROVIDER = "sportmonks";
const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const MIN_COMPLETE_SQUAD_SIZE = 11;

type AdminClient = SupabaseClient;

type ProviderSquad = Readonly<{
  teamId: string;
  members: readonly TouchlineSquadMember[];
}>;

export type QaTwentyClubRosterSyncPlan = Readonly<{
  ok: boolean;
  errors: readonly string[];
  providerPlayers: number;
  nationalityProvided: number;
  countryIdsProvided: number;
  shirtNumbersProvided: number;
}>;

export type QaTwentyClubRosterSyncResult = Readonly<{
  status: "applied" | "already-current";
  runId: string;
  clubs: number;
  providerPlayers: number;
  nationalityProvided: number;
  countryIdsProvided: number;
  shirtNumbersProvided: number;
}>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
}

function assertQaRuntime() {
  const inspection = inspectTouchlineIsolatedPreviewEnvironment();
  if (inspection.status !== "qa" || process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== QA_PROJECT_REF) {
    throw new Error("Twenty-club roster sync is available only in the dedicated functional QA Preview.");
  }
}

/**
 * A pure, complete provider preflight. It accepts the provider's current
 * roster size rather than preserving the obsolete 588-member snapshot. It
 * deliberately refuses partial clubs, duplicate provider identities, and
 * identity-free records before a database backup is ever captured.
 */
export function buildQaTwentyClubRosterSyncPlan(squads: readonly ProviderSquad[]): QaTwentyClubRosterSyncPlan {
  const errors: string[] = [];
  const expectedTeamIds = new Set(TOUCHLINE_ENGLAND_CLUBS.map((club) => club.teamId));
  const foundTeamIds = new Set(squads.map((squad) => squad.teamId));
  if (squads.length !== TOUCHLINE_ENGLAND_CLUBS.length || foundTeamIds.size !== TOUCHLINE_ENGLAND_CLUBS.length) {
    errors.push("provider-club-scope-incomplete");
  }

  const providerIds = new Set<string>();
  let nationalityProvided = 0;
  let countryIdsProvided = 0;
  let shirtNumbersProvided = 0;
  for (const squad of squads) {
    if (!expectedTeamIds.has(squad.teamId) || squad.members.length < MIN_COMPLETE_SQUAD_SIZE) {
      errors.push(`provider-squad-incomplete:${squad.teamId}`);
      continue;
    }
    for (const member of squad.members) {
      const providerId = text(member.player.providerId);
      if (!providerId || providerIds.has(providerId)) {
        errors.push(`provider-player-duplicate-or-missing:${providerId || squad.teamId}`);
        continue;
      }
      providerIds.add(providerId);
      if (!text(member.player.name)) errors.push(`provider-player-name-missing:${providerId}`);
      if (text(member.player.nationality)) nationalityProvided += 1;
      if (text(member.player.countryId)) countryIdsProvided += 1;
      if (Number.isInteger(member.jerseyNumber) && (member.jerseyNumber ?? 0) > 0) shirtNumbersProvided += 1;
    }
  }
  if (providerIds.size < TOUCHLINE_ENGLAND_CLUBS.length * MIN_COMPLETE_SQUAD_SIZE) {
    errors.push("provider-player-scope-incomplete");
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    providerPlayers: providerIds.size,
    nationalityProvided,
    countryIdsProvided,
    shirtNumbersProvided,
  });
}

async function readProviderSquads(): Promise<ProviderSquad[]> {
  const provider = createFootballDataProvider("sportmonks");
  const squads: ProviderSquad[] = [];
  // Serial reads keep the run bounded and make every provider failure happen
  // before the QA backup/write boundary.
  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    const result = await provider.getSquad(club.teamId);
    if (!result.ok) throw new Error(`Sportmonks squad ${club.teamId} failed: ${result.error.code}`);
    squads.push({ teamId: club.teamId, members: result.data });
  }
  return squads;
}

function playerInput(member: TouchlineSquadMember): SquadSnapshotPlayerInput {
  return {
    providerId: member.player.providerId,
    name: member.player.displayName || member.player.name,
    nationality: text(member.player.nationality) || null,
    countryId: text(member.player.countryId) || null,
    position: text(member.position) || text(member.player.position) || null,
    shirtNumber: Number.isInteger(member.jerseyNumber) && (member.jerseyNumber ?? 0) > 0
      ? member.jerseyNumber
      : null,
    marketValue: member.player.marketValue ?? null,
  };
}

type CurrentMembershipRow = Readonly<{
  player_id: string;
  jersey_number: number | null;
  position: string | null;
}>;

type CurrentPlayerRow = Readonly<{
  id: string;
  provider_player_id: string;
  current_club_id: string | null;
  display_name: string | null;
  name: string | null;
  nationality: string | null;
  country_id: string | null;
  position: string | null;
}>;

/**
 * A repeat must never turn a completed reconciliation into another full write
 * merely because an owner pressed the control twice. This compares every
 * provider-backed identity, club, country/nationality, position and supplied
 * shirt value before the backup/write boundary. Missing provider shirt values
 * deliberately preserve the known canonical shirt number.
 */
async function isCurrentQaTwentyClubRoster(admin: AdminClient, squads: readonly ProviderSquad[]) {
  const teamIds = squads.map((squad) => squad.teamId);
  const { data: clubs, error: clubsError } = await admin
    .from("football_clubs")
    .select("id,provider_team_id")
    .eq("provider", PROVIDER)
    .in("provider_team_id", teamIds);
  if (clubsError || !clubs || clubs.length !== squads.length) return false;

  const clubByTeamId = new Map(
    (clubs as Array<{ id: string; provider_team_id: string }>).map((club) => [text(club.provider_team_id), club.id]),
  );

  for (const squad of squads) {
    const clubId = clubByTeamId.get(squad.teamId);
    if (!clubId) return false;
    const { data: membershipRows, error: membershipsError } = await admin
      .from("football_squad_members")
      .select("player_id,jersey_number,position")
      .eq("provider", PROVIDER)
      .eq("club_id", clubId)
      .eq("status", "active");
    const memberships = (membershipRows ?? []) as CurrentMembershipRow[];
    if (membershipsError || memberships.length !== squad.members.length) return false;

    const playerIds = memberships.map((membership) => text(membership.player_id)).filter(Boolean);
    if (playerIds.length !== memberships.length || new Set(playerIds).size !== memberships.length) return false;
    const { data: playerRows, error: playersError } = await admin
      .from("football_players")
      .select("id,provider_player_id,current_club_id,display_name,name,nationality,country_id,position")
      .in("id", playerIds);
    const players = (playerRows ?? []) as CurrentPlayerRow[];
    if (playersError || players.length !== memberships.length) return false;

    const playerById = new Map(players.map((player) => [text(player.id), player]));
    const currentByProviderId = new Map(memberships.map((membership) => {
      const player = playerById.get(text(membership.player_id));
      return [text(player?.provider_player_id), { membership, player }] as const;
    }));
    if (currentByProviderId.size !== squad.members.length || currentByProviderId.has("")) return false;

    for (const member of squad.members) {
      const expected = playerInput(member);
      const current = currentByProviderId.get(text(expected.providerId));
      if (!current?.player || text(current.player.current_club_id) !== clubId) return false;
      if ((text(current.player.display_name) || text(current.player.name)) !== text(expected.name)) return false;
      if (text(current.player.nationality) !== text(expected.nationality)) return false;
      if (text(current.player.country_id) !== text(expected.countryId)) return false;
      if (text(current.membership.position) !== text(expected.position)) return false;
      if (expected.shirtNumber !== null && current.membership.jersey_number !== expected.shirtNumber) return false;
    }
  }

  return true;
}

async function verifyAppliedRoster(admin: AdminClient, squads: readonly ProviderSquad[]) {
  const teamIds = squads.map((squad) => squad.teamId);
  const { data: clubs, error: clubsError } = await admin
    .from("football_clubs")
    .select("id,provider_team_id")
    .eq("provider", PROVIDER)
    .in("provider_team_id", teamIds);
  if (clubsError || !clubs || clubs.length !== squads.length) throw new Error("QA roster verification could not load all clubs.");

  const clubByTeamId = new Map((clubs as Array<{ id: string; provider_team_id: string }>).map((club) => [club.provider_team_id, club.id]));
  for (const squad of squads) {
    const clubId = clubByTeamId.get(squad.teamId);
    if (!clubId) throw new Error(`QA roster verification missing club ${squad.teamId}.`);
    const { data: members, error } = await admin
      .from("football_squad_members")
      .select("player_id")
      .eq("provider", PROVIDER)
      .eq("club_id", clubId)
      .eq("status", "active");
    if (error || (members ?? []).length !== squad.members.length) {
      throw new Error(`QA roster verification failed for club ${squad.teamId}.`);
    }
  }
}

/**
 * QA-only global roster reconciliation. No player/card/publication is
 * deleted. The RPC captures a reversible provider snapshot before the first
 * write; any failure returns every pre-existing membership to its prior state
 * and marks newly-added rows inactive rather than erasing history.
 */
export async function syncQaTwentyClubRosters(admin: AdminClient, runId: string): Promise<QaTwentyClubRosterSyncResult> {
  assertQaRuntime();
  if (!isUuid(runId)) throw new Error("A valid QA twenty-club roster backup run ID is required.");

  const squads = await readProviderSquads();
  const plan = buildQaTwentyClubRosterSyncPlan(squads);
  if (!plan.ok) throw new Error(`QA twenty-club roster preflight failed: ${plan.errors.join(",")}`);

  if (await isCurrentQaTwentyClubRoster(admin, squads)) {
    return Object.freeze({
      status: "already-current" as const,
      runId,
      clubs: squads.length,
      providerPlayers: plan.providerPlayers,
      nationalityProvided: plan.nationalityProvided,
      countryIdsProvided: plan.countryIdsProvided,
      shirtNumbersProvided: plan.shirtNumbersProvided,
    });
  }

  const { data: backup, error: backupError } = await admin.rpc("touchline_capture_qa_twenty_club_roster_backup", {
    p_project_ref: QA_PROJECT_REF,
    p_run_id: runId,
  });
  if (backupError || !backup) throw new Error("QA twenty-club roster backup was not captured.");

  try {
    for (const club of TOUCHLINE_ENGLAND_CLUBS) {
      const squad = squads.find((entry) => entry.teamId === club.teamId);
      if (!squad) throw new Error(`QA roster preflight lost club ${club.teamId}.`);
      const stored = await persistSquadSnapshot({
        teamId: club.teamId,
        clubName: club.name,
        clubShortCode: club.shortCode,
        clubLogoUrl: club.logoUrl ?? null,
      }, squad.members.map(playerInput), admin);
      if (!stored.stored) throw new Error(`QA roster persistence failed for ${club.teamId}: ${stored.reason ?? "unknown"}`);
    }

    await verifyAppliedRoster(admin, squads);
    const { error: markError } = await admin.rpc("touchline_mark_qa_twenty_club_roster_applied", {
      p_project_ref: QA_PROJECT_REF,
      p_run_id: runId,
      p_observed_counts: {
        clubs: squads.length,
        provider_players: plan.providerPlayers,
        nationality_provided: plan.nationalityProvided,
        country_ids_provided: plan.countryIdsProvided,
        shirt_numbers_provided: plan.shirtNumbersProvided,
      },
    });
    if (markError) throw new Error("QA twenty-club roster sync could not be marked applied.");
  } catch (error) {
    await admin.rpc("touchline_rollback_qa_twenty_club_roster", {
      p_project_ref: QA_PROJECT_REF,
      p_run_id: runId,
    });
    throw error;
  }

  return Object.freeze({
    status: "applied",
    runId,
    clubs: squads.length,
    providerPlayers: plan.providerPlayers,
    nationalityProvided: plan.nationalityProvided,
    countryIdsProvided: plan.countryIdsProvided,
    shirtNumbersProvided: plan.shirtNumbersProvided,
  });
}
