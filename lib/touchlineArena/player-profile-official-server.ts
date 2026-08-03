import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadTouchLineOfficialPlayerProfile,
  type TouchLineOfficialPlayerProfile,
} from "@/lib/touchlineArena/player-profile-official";
import {
  buildTouchLineOfficialProfileSnapshot,
  hydrateTouchLineOfficialProfileSnapshot,
  type TouchLineOfficialProfileSnapshot,
} from "@/lib/touchlineArena/player-profile-snapshot";

type SnapshotRow = {
  provider: "sportmonks";
  provider_player_id: string;
  season_id: string | null;
  season_name: string | null;
  statistics_status: "live" | "pending";
  transfer_status: "live" | "pending";
  player_payload: TouchLineOfficialProfileSnapshot["player"];
  statistics_payload: TouchLineOfficialProfileSnapshot["stats"];
  transfers_payload: TouchLineOfficialProfileSnapshot["transfers"];
  statistics_fetched_at: string | null;
  transfers_fetched_at: string | null;
  captured_at: string;
};

function snapshotFromRow(row: SnapshotRow): TouchLineOfficialProfileSnapshot | null {
  if (
    row.provider !== "sportmonks"
    || !/^\d+$/.test(row.provider_player_id)
    || !row.player_payload
    || !Array.isArray(row.statistics_payload)
    || !Array.isArray(row.transfers_payload)
  ) {
    return null;
  }

  return {
    provider: "sportmonks",
    providerPlayerId: row.provider_player_id,
    seasonId: row.season_id,
    seasonName: row.season_name,
    statisticsStatus: row.statistics_status,
    transferStatus: row.transfer_status,
    player: row.player_payload,
    stats: row.statistics_payload,
    transfers: row.transfers_payload,
    statisticsFetchedAt: row.statistics_fetched_at,
    transfersFetchedAt: row.transfers_fetched_at,
    capturedAt: row.captured_at,
  };
}

async function readSnapshot(
  admin: SupabaseClient,
  providerPlayerId: string | null | undefined,
): Promise<TouchLineOfficialProfileSnapshot | null> {
  if (!providerPlayerId || !/^\d+$/.test(providerPlayerId)) return null;

  const { data, error } = await admin
    .from("football_player_profile_snapshots")
    .select(
      "provider,provider_player_id,season_id,season_name,statistics_status,transfer_status,player_payload,statistics_payload,transfers_payload,statistics_fetched_at,transfers_fetched_at,captured_at",
    )
    .eq("provider", "sportmonks")
    .eq("provider_player_id", providerPlayerId)
    .maybeSingle();

  if (error || !data) return null;
  return snapshotFromRow(data as SnapshotRow);
}

async function persistSnapshot(
  admin: SupabaseClient,
  profile: TouchLineOfficialPlayerProfile,
): Promise<void> {
  const previous = await readSnapshot(admin, profile.providerPlayerId);
  const snapshot = buildTouchLineOfficialProfileSnapshot({ profile, previous });
  if (!snapshot) return;

  const player = snapshot.player;
  const { data: playerRow, error: playerError } = await admin
    .from("football_players")
    .upsert(
      {
        provider: "sportmonks",
        provider_player_id: snapshot.providerPlayerId,
        name: player.name,
        display_name: player.displayName,
        ...(player.firstName ? { first_name: player.firstName } : {}),
        ...(player.lastName ? { last_name: player.lastName } : {}),
        ...(player.photoUrl ? { photo_url: player.photoUrl } : {}),
        ...(player.dateOfBirth ? { date_of_birth: player.dateOfBirth } : {}),
        ...(typeof player.age === "number" ? { age: player.age } : {}),
        ...(player.nationality ? { nationality: player.nationality } : {}),
        ...(player.countryId ? { country_id: player.countryId } : {}),
        ...(player.position ? { position: player.position } : {}),
        ...(player.positionId ? { position_id: player.positionId } : {}),
        ...(player.height ? { height: player.height } : {}),
        ...(player.weight ? { weight: player.weight } : {}),
        ...(player.contractUntil ? { contract_until: player.contractUntil } : {}),
        source_updated_at: snapshot.capturedAt,
      },
      { onConflict: "provider,provider_player_id" },
    )
    .select("id")
    .single();

  if (playerError || !playerRow?.id) return;

  await admin
    .from("football_player_profile_snapshots")
    .upsert(
      {
        provider: "sportmonks",
        provider_player_id: snapshot.providerPlayerId,
        football_player_id: playerRow.id,
        season_id: snapshot.seasonId,
        season_name: snapshot.seasonName,
        statistics_status: snapshot.statisticsStatus,
        transfer_status: snapshot.transferStatus,
        player_payload: snapshot.player,
        statistics_payload: snapshot.stats,
        transfers_payload: snapshot.transfers,
        statistics_fetched_at: snapshot.statisticsFetchedAt,
        transfers_fetched_at: snapshot.transfersFetchedAt,
        captured_at: snapshot.capturedAt,
      },
      { onConflict: "provider,provider_player_id" },
    );
}

function mergeLiveWithSnapshot(
  live: TouchLineOfficialPlayerProfile,
  snapshot: TouchLineOfficialProfileSnapshot | null,
): TouchLineOfficialPlayerProfile {
  if (!snapshot) return live;
  const persisted = hydrateTouchLineOfficialProfileSnapshot(snapshot);
  const usePersistedStatistics = live.status !== "live" && persisted.status === "live";
  const usePersistedTransfers = live.transferStatus !== "live" && persisted.transferStatus === "live";

  return {
    ...live,
    player: live.player ?? persisted.player,
    providerPlayerId: live.providerPlayerId ?? persisted.providerPlayerId,
    seasonId: usePersistedStatistics ? persisted.seasonId : live.seasonId,
    seasonName: usePersistedStatistics ? persisted.seasonName : live.seasonName,
    status: usePersistedStatistics ? "live" : live.status,
    fetchedAt: usePersistedStatistics ? persisted.fetchedAt : live.fetchedAt,
    stats: usePersistedStatistics ? persisted.stats : live.stats,
    reason: usePersistedStatistics ? "persisted-official-snapshot" : live.reason,
    transferStatus: usePersistedTransfers ? "live" : live.transferStatus,
    transfers: usePersistedTransfers ? persisted.transfers : live.transfers,
    transfersFetchedAt: usePersistedTransfers ? persisted.transfersFetchedAt : live.transfersFetchedAt,
    transferReason: usePersistedTransfers ? "persisted-official-snapshot" : live.transferReason,
  };
}

export async function loadTouchLineOfficialPlayerProfileReliable(input: {
  name: string;
  providerPlayerId?: string | null;
}): Promise<TouchLineOfficialPlayerProfile> {
  const admin = createAdminClient();
  const initialSnapshotPromise = admin
    ? readSnapshot(admin, input.providerPlayerId)
    : Promise.resolve(null);
  const [live, initialSnapshot] = await Promise.all([
    loadTouchLineOfficialPlayerProfile(input),
    initialSnapshotPromise,
  ]);

  if (!admin) return live;
  const snapshot = initialSnapshot
    ?? (live.providerPlayerId && live.providerPlayerId !== input.providerPlayerId
      ? await readSnapshot(admin, live.providerPlayerId)
      : null);
  const reliable = mergeLiveWithSnapshot(live, snapshot);

  await persistSnapshot(admin, live);
  return reliable;
}
