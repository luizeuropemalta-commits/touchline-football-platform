import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlineSquadMember } from "@/lib/football-data/types";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const EXPECTED_CLUBS = 20;
const EXPECTED_PLAYERS = 588;
const PROVIDER = "sportmonks";

type AdminClient = SupabaseClient;

type CanonicalClub = Readonly<{ id: string; provider_team_id: string }>;
type CanonicalMembership = Readonly<{ player_id: string; club_id: string }>;
type CanonicalPlayer = Readonly<{
  id: string;
  provider_player_id: string;
  current_club_id: string | null;
  nationality: string | null;
  country_id: string | null;
}>;

type ProviderClubSquad = Readonly<{ teamId: string; members: readonly TouchlineSquadMember[] }>;

export type QaCountrySyncPlan = Readonly<{
  ok: boolean;
  errors: readonly string[];
  providerPlayers: number;
  canonicalPlayers: number;
  nationalityProvided: number;
  countryIdsProvided: number;
  updates: readonly Readonly<{ playerId: string; nationality?: string; countryId?: string }>[];
}>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown) {
  return text(value).toLocaleLowerCase();
}

/**
 * Pure preflight. It never creates players/memberships or infers country data:
 * a complete provider/canonical 20-club identity match is required before any
 * nationality field can be updated.
 */
export function buildQaCountrySyncPlan(
  clubs: readonly CanonicalClub[],
  memberships: readonly CanonicalMembership[],
  players: readonly CanonicalPlayer[],
  providerSquads: readonly ProviderClubSquad[],
): QaCountrySyncPlan {
  const errors: string[] = [];
  const expectedTeamIds = new Set(TOUCHLINE_ENGLAND_CLUBS.map((club) => club.teamId));
  const clubByProviderTeamId = new Map(clubs.map((club) => [text(club.provider_team_id), club] as const));
  if (clubByProviderTeamId.size !== EXPECTED_CLUBS || [...expectedTeamIds].some((teamId) => !clubByProviderTeamId.has(teamId))) {
    errors.push("canonical-club-scope-incomplete");
  }

  const membershipByPlayerId = new Map<string, CanonicalMembership[]>();
  for (const membership of memberships) {
    const playerId = text(membership.player_id);
    membershipByPlayerId.set(playerId, [...(membershipByPlayerId.get(playerId) ?? []), membership]);
  }
  if (players.length !== EXPECTED_PLAYERS || memberships.length !== EXPECTED_PLAYERS) {
    errors.push("canonical-player-or-membership-count-mismatch");
  }
  if (new Set(players.map((player) => text(player.provider_player_id))).size !== players.length) {
    errors.push("canonical-provider-player-duplicate");
  }

  const canonicalByProviderId = new Map(players.map((player) => [text(player.provider_player_id), player] as const));
  const providerById = new Map<string, { member: TouchlineSquadMember; teamId: string }>();
  if (providerSquads.length !== EXPECTED_CLUBS || new Set(providerSquads.map((squad) => squad.teamId)).size !== EXPECTED_CLUBS) {
    errors.push("provider-club-scope-incomplete");
  }

  let nationalityProvided = 0;
  let countryIdsProvided = 0;
  for (const squad of providerSquads) {
    if (!expectedTeamIds.has(squad.teamId) || squad.members.length < 11) {
      errors.push(`provider-squad-incomplete:${squad.teamId}`);
      continue;
    }
    for (const member of squad.members) {
      const providerId = text(member.player.providerId);
      if (!providerId || providerById.has(providerId)) {
        errors.push(`provider-player-duplicate-or-missing:${providerId || squad.teamId}`);
        continue;
      }
      providerById.set(providerId, { member, teamId: squad.teamId });
      if (text(member.player.nationality)) nationalityProvided += 1;
      if (text(member.player.countryId)) countryIdsProvided += 1;
    }
  }
  if (providerById.size !== EXPECTED_PLAYERS) errors.push("provider-player-count-mismatch");
  if (nationalityProvided === 0 && countryIdsProvided === 0) errors.push("provider-country-data-unavailable");

  const updates: Array<{ playerId: string; nationality?: string; countryId?: string }> = [];
  for (const [providerId, provider] of providerById) {
    const canonical = canonicalByProviderId.get(providerId);
    const expectedClub = clubByProviderTeamId.get(provider.teamId);
    const membership = canonical ? membershipByPlayerId.get(canonical.id) : undefined;
    if (!canonical || !expectedClub || canonical.current_club_id !== expectedClub.id || membership?.length !== 1 || membership[0]?.club_id !== expectedClub.id) {
      errors.push(`canonical-identity-mismatch:${providerId}`);
      continue;
    }
    const nationality = text(provider.member.player.nationality);
    const countryId = text(provider.member.player.countryId);
    const update: { playerId: string; nationality?: string; countryId?: string } = { playerId: canonical.id };
    if (nationality && normalized(nationality) !== normalized(canonical.nationality)) update.nationality = nationality;
    if (countryId && countryId !== text(canonical.country_id)) update.countryId = countryId;
    if (update.nationality || update.countryId) updates.push(update);
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    providerPlayers: providerById.size,
    canonicalPlayers: players.length,
    nationalityProvided,
    countryIdsProvided,
    // A partial/ambiguous proof never carries a write set forward.
    updates: Object.freeze((errors.length ? [] : updates).map((update) => Object.freeze(update))),
  });
}

function assertQaRuntime() {
  const inspection = inspectTouchlineIsolatedPreviewEnvironment();
  if (inspection.status !== "qa" || process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== QA_PROJECT_REF) {
    throw new Error("QA country sync is available only in the dedicated functional QA Preview.");
  }
}

async function readProviderSquads(): Promise<ProviderClubSquad[]> {
  const provider = createFootballDataProvider("sportmonks");
  const squads: ProviderClubSquad[] = [];
  // Bounded serial reads protect the provider account and make a failure leave
  // the database untouched; each squad already performs the documented dual
  // primary/extended request in the provider adapter.
  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    const result = await provider.getSquad(club.teamId);
    if (!result.ok) throw new Error(`Sportmonks squad ${club.teamId} failed: ${result.error.code}`);
    squads.push({ teamId: club.teamId, members: result.data });
  }
  return squads;
}

export type QaCountrySyncResult = Readonly<{
  status: "applied" | "already-current";
  runId: string;
  providerPlayers: number;
  canonicalPlayers: number;
  nationalityProvided: number;
  countryIdsProvided: number;
  recordsUpdated: number;
}>;

/**
 * Runs only after the QA-only SQL backup has captured all 588 pre-images.
 * It updates the two provider-authoritative country fields and nothing else.
 */
export async function syncQaCountryData(
  admin: AdminClient,
  runId: string,
): Promise<QaCountrySyncResult> {
  assertQaRuntime();
  const normalizedRunId = text(runId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedRunId)) {
    throw new Error("A valid QA country-sync backup run ID is required.");
  }

  const teamIds = TOUCHLINE_ENGLAND_CLUBS.map((club) => club.teamId);
  const { data: clubs, error: clubsError } = await admin
    .from("football_clubs")
    .select("id,provider_team_id")
    .eq("provider", PROVIDER)
    .in("provider_team_id", teamIds);
  if (clubsError) throw new Error("Could not load the QA club scope.");
  const scopedClubs = (clubs ?? []) as CanonicalClub[];
  const clubIds = scopedClubs.map((club) => club.id);

  const { data: memberships, error: membershipsError } = await admin
    .from("football_squad_members")
    .select("player_id,club_id")
    .eq("provider", PROVIDER)
    .eq("status", "active")
    .in("club_id", clubIds);
  if (membershipsError) throw new Error("Could not load the QA squad scope.");
  const scopedMemberships = (memberships ?? []) as CanonicalMembership[];
  const playerIds = scopedMemberships.map((membership) => membership.player_id);

  const { data: players, error: playersError } = await admin
    .from("football_players")
    .select("id,provider_player_id,current_club_id,nationality,country_id")
    .eq("provider", PROVIDER)
    .in("id", playerIds);
  if (playersError) throw new Error("Could not load the QA canonical player scope.");

  const plan = buildQaCountrySyncPlan(
    scopedClubs,
    scopedMemberships,
    (players ?? []) as CanonicalPlayer[],
    await readProviderSquads(),
  );
  if (!plan.ok) throw new Error(`QA country sync preflight failed: ${plan.errors.join(",")}`);

  const { data: backup, error: backupError } = await admin.rpc("touchline_capture_qa_country_sync_backup", {
    p_project_ref: QA_PROJECT_REF,
    p_run_id: normalizedRunId,
  });
  if (backupError || !backup) throw new Error("QA country sync backup was not captured.");

  let recordsUpdated = 0;
  try {
    for (const update of plan.updates) {
      const payload = {
        ...(update.nationality ? { nationality: update.nationality } : {}),
        ...(update.countryId ? { country_id: update.countryId } : {}),
      };
      const { error } = await admin.from("football_players").update(payload).eq("id", update.playerId).eq("provider", PROVIDER);
      if (error) throw new Error("QA country sync player update failed.");
      recordsUpdated += 1;
    }
    const { error: appliedError } = await admin.rpc("touchline_mark_qa_country_sync_applied", {
      p_project_ref: QA_PROJECT_REF,
      p_run_id: normalizedRunId,
      p_observed_counts: {
        clubs: EXPECTED_CLUBS,
        provider_players: plan.providerPlayers,
        canonical_players: plan.canonicalPlayers,
        nationality_provided: plan.nationalityProvided,
        country_ids_provided: plan.countryIdsProvided,
        records_updated: recordsUpdated,
      },
    });
    if (appliedError) throw new Error("QA country sync could not be marked applied.");
  } catch (error) {
    await admin.rpc("touchline_rollback_qa_country_sync", {
      p_project_ref: QA_PROJECT_REF,
      p_run_id: normalizedRunId,
    });
    throw error;
  }

  return Object.freeze({
    status: recordsUpdated ? "applied" : "already-current",
    runId: normalizedRunId,
    providerPlayers: plan.providerPlayers,
    canonicalPlayers: plan.canonicalPlayers,
    nationalityProvided: plan.nationalityProvided,
    countryIdsProvided: plan.countryIdsProvided,
    recordsUpdated,
  });
}
