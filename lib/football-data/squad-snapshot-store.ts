import { createAdminClient } from "@/lib/supabase/admin";

const PROVIDER = "sportmonks";
const DEFAULT_SQUAD_SNAPSHOT_TTL_SECONDS = 60 * 60 * 24;
const EMPTY_SQUAD_SNAPSHOT_REVISION = new Date(0).toISOString();
const MIN_COMPLETE_SQUAD_SIZE = 11;

type DatabaseRecord = Record<string, unknown>;
type SquadSnapshotAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PersistedSquadPlayer = {
  providerId: string;
  name: string;
  displayName: string;
  nationality: string | null;
  position: string | null;
  jerseyNumber: number | null;
  marketValue: number | null;
  marketValueCurrency: string | null;
  sourceUpdatedAt: string;
};

export type PersistedSquadSnapshot = {
  teamId: string;
  capturedAt: string;
  fresh: boolean;
  players: PersistedSquadPlayer[];
};

export type SquadSnapshotPlayerInput = {
  providerId: string;
  name: string;
  nationality?: string | null;
  position?: string | null;
  shirtNumber?: number | null;
  marketValue?: number | null;
};

export type SquadSnapshotClubInput = {
  teamId: string;
  clubName: string;
  clubShortCode: string;
  clubLogoUrl: string | null;
};

function snapshotTtlSeconds() {
  const configured = Number(process.env.FOOTBALL_SQUAD_SNAPSHOT_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SQUAD_SNAPSHOT_TTL_SECONDS;
}

function asString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isFresh(capturedAt: string) {
  const timestamp = Date.parse(capturedAt);
  return Number.isFinite(timestamp)
    && Date.now() - timestamp <= snapshotTtlSeconds() * 1000;
}

function resolveSnapshotRevision(members: DatabaseRecord[]) {
  const revisions = members.map((member) => asString(member.source_updated_at));
  const timestamps = revisions.map((revision) => Date.parse(revision ?? ""));
  if (
    !revisions.length
    || revisions.some((revision) => !revision)
    || timestamps.some((timestamp) => !Number.isFinite(timestamp))
  ) {
    return { capturedAt: EMPTY_SQUAD_SNAPSHOT_REVISION, coherent: false };
  }

  const oldestTimestamp = Math.min(...timestamps);
  const oldestRevisionIndex = timestamps.indexOf(oldestTimestamp);
  return {
    capturedAt: revisions[oldestRevisionIndex] ?? EMPTY_SQUAD_SNAPSHOT_REVISION,
    // Exact comparison preserves PostgreSQL's sub-millisecond revision fence.
    coherent: new Set(revisions).size === 1,
  };
}

/**
 * Reads the last normalized squad received from the provider.
 *
 * This database snapshot is deliberately independent from the in-memory API
 * cache so a server restart, deployment or provider outage cannot erase valid
 * shirt numbers already confirmed by TouchLine.
 */
export async function readPersistedSquadSnapshot(
  teamId: string,
  providedAdmin?: SquadSnapshotAdminClient,
): Promise<PersistedSquadSnapshot | null> {
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return null;

  const { data: club, error: clubError } = await admin
    .from("football_clubs")
    .select("id,competition_id")
    .eq("provider", PROVIDER)
    .eq("provider_team_id", teamId)
    .maybeSingle();

  if (clubError || !club?.id) return null;

  let membersQuery = admin
    .from("football_squad_members")
    .select("player_id,jersey_number,position,source_updated_at")
    .eq("provider", PROVIDER)
    .eq("club_id", club.id)
    .eq("status", "active");

  // A club can only publish a squad in its own competition. Older snapshots
  // created before memberships were competition-scoped must never leak into a
  // competition-specific public roster while the next sync repairs them.
  const competitionId = asString(club.competition_id);
  if (competitionId) membersQuery = membersQuery.eq("competition_id", competitionId);

  const { data: members, error: membersError } = await membersQuery;

  if (membersError || !members || members.length < MIN_COMPLETE_SQUAD_SIZE) return null;

  const playerIds = members
    .map((member) => asString(member.player_id))
    .filter((value): value is string => Boolean(value));
  if (playerIds.length !== members.length || new Set(playerIds).size !== members.length) return null;

  const { data: playerRows, error: playersError } = await admin
    .from("football_players")
    .select(
      "id,provider_player_id,current_club_id,name,display_name,nationality,position,market_value,market_value_currency,source_updated_at",
    )
    .in("id", playerIds);

  if (playersError || !playerRows?.length) return null;

  const playersById = new Map(
    (playerRows as DatabaseRecord[]).map((player) => [asString(player.id), player] as const),
  );

  const canonicalMembers = (members as DatabaseRecord[]).filter((member) => {
    const player = playersById.get(asString(member.player_id));
    return asString(player?.current_club_id) === asString(club.id);
  });
  if (canonicalMembers.length < MIN_COMPLETE_SQUAD_SIZE) return null;

  const players = canonicalMembers
    .map((member): PersistedSquadPlayer | null => {
      const playerId = asString(member.player_id);
      const player = playerId ? playersById.get(playerId) : null;
      const currentClubId = asString(player?.current_club_id);
      const providerId = asString(player?.provider_player_id);
      const name = asString(player?.display_name) ?? asString(player?.name);
      const sourceUpdatedAt =
        asString(member.source_updated_at)
        ?? asString(player?.source_updated_at)
        ?? new Date(0).toISOString();

      // A transferred player can have a historical membership row in another
      // club. Only the provider's newest canonical current_club_id may publish
      // that player in an active TouchLine squad.
      if (!providerId || !name || currentClubId !== asString(club.id)) return null;

      return {
        providerId,
        name,
        displayName: asString(player?.display_name) ?? name,
        nationality: asString(player?.nationality),
        position: asString(member.position) ?? asString(player?.position),
        jerseyNumber: asNullableNumber(member.jersey_number),
        marketValue: asNullableNumber(player?.market_value),
        marketValueCurrency: asString(player?.market_value_currency),
        sourceUpdatedAt,
      };
    })
    .filter((player): player is PersistedSquadPlayer => Boolean(player));

  if (!players.length) return null;
  if (players.length !== canonicalMembers.length) return null;

  const revision = resolveSnapshotRevision(canonicalMembers);
  if (!revision.coherent) return null;

  return {
    teamId,
    capturedAt: revision.capturedAt,
    fresh: isFresh(revision.capturedAt),
    players,
  };
}

/**
 * Persists only validated normalized fields. A missing provider shirt number
 * never overwrites a previously stored valid number.
 */
export async function persistSquadSnapshot(
  club: SquadSnapshotClubInput,
  players: SquadSnapshotPlayerInput[],
  providedAdmin?: SquadSnapshotAdminClient,
): Promise<{ stored: boolean; reason?: string }> {
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return { stored: false, reason: "database-unavailable" };

  const incomingProviderIds = players.map((player) => player.providerId.trim()).filter(Boolean);
  if (incomingProviderIds.length < MIN_COMPLETE_SQUAD_SIZE) {
    return { stored: false, reason: "incomplete-squad" };
  }
  if (
    incomingProviderIds.length !== players.length
    || new Set(incomingProviderIds).size !== incomingProviderIds.length
    || incomingProviderIds.some((providerId) => !/^[0-9]{1,20}$/.test(providerId))
    || incomingProviderIds.some((providerId, index) => providerId !== players[index]?.providerId)
  ) {
    return { stored: false, reason: "invalid-squad-identities" };
  }

  const { data: clubRow, error: clubError } = await admin
    .from("football_clubs")
    .upsert(
      {
        provider: PROVIDER,
        provider_team_id: club.teamId,
        name: club.clubName,
        short_code: club.clubShortCode,
        logo_url: club.clubLogoUrl,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_team_id" },
    )
    // The club search trigger writes updated_at with PostgreSQL's clock,
    // giving concurrent app instances one shared revision fence.
    .select("id,updated_at,competition_id")
    .single();

  const capturedAt = asString(clubRow?.updated_at);
  if (clubError || !clubRow?.id || !capturedAt || !Number.isFinite(Date.parse(capturedAt))) {
    return { stored: false, reason: clubError?.message ?? "club-upsert-failed" };
  }
  const snapshotAdmin = admin;
  const clubId = asString(clubRow.id)!;
  const competitionId = asString(clubRow.competition_id);

  const playerRows = players.map((player) => ({
    provider: PROVIDER,
    provider_player_id: player.providerId,
    current_club_id: clubId,
    name: player.name,
    display_name: player.name,
    nationality: player.nationality ?? null,
    position: player.position ?? null,
    ...(player.marketValue
      ? { market_value: player.marketValue, market_value_currency: "EUR" }
      : {}),
    source_updated_at: capturedAt,
  }));

  const { data: savedPlayers, error: playersError } = await snapshotAdmin
    .from("football_players")
    .upsert(playerRows, { onConflict: "provider,provider_player_id" })
    .select("id,provider_player_id");

  if (playersError || !savedPlayers?.length) {
    return { stored: false, reason: playersError?.message ?? "player-upsert-failed" };
  }

  const savedPlayerIds = new Map(
    (savedPlayers as DatabaseRecord[])
      .map((player) => [asString(player.provider_player_id), asString(player.id)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  );
  if (savedPlayerIds.size !== incomingProviderIds.length) {
    return { stored: false, reason: "player-upsert-incomplete" };
  }

  const incomingPlayerIds = [...savedPlayerIds.values()];
  const { error: transferredMembershipsError } = await snapshotAdmin
    .from("football_squad_members")
    .update({ status: "inactive", source_updated_at: capturedAt })
    .eq("provider", PROVIDER)
    .in("player_id", incomingPlayerIds)
    .not("club_id", "in", `(${clubId})`)
    .eq("status", "active")
    .lt("source_updated_at", capturedAt);
  if (transferredMembershipsError) {
    return { stored: false, reason: transferredMembershipsError.message };
  }

  const existingMemberResult = await snapshotAdmin
    .from("football_squad_members")
    .select("player_id,jersey_number,position,status,source_updated_at,competition_id")
    .eq("provider", PROVIDER)
    .eq("club_id", clubId);
  if (existingMemberResult.error) {
    return { stored: false, reason: existingMemberResult.error.message };
  }
  const previousMemberships = (existingMemberResult.data ?? []) as DatabaseRecord[];
  const previousMembershipsByPlayerId = new Map(
    previousMemberships
      .map((member) => [asString(member.player_id), member] as const)
      .filter((entry): entry is [string, DatabaseRecord] => Boolean(entry[0])),
  );
  const existingNumbers = new Map(
    previousMemberships
      .map((member) => [asString(member.player_id), asNullableNumber(member.jersey_number)] as const)
      .filter((entry): entry is [string, number] => Boolean(entry[0]) && entry[1] !== null),
  );

  const memberRows = players.flatMap((player) => {
    const playerId = savedPlayerIds.get(player.providerId);
    if (!playerId) return [];

    return [{
      provider: PROVIDER,
      club_id: clubId,
      player_id: playerId,
      jersey_number: player.shirtNumber ?? existingNumbers.get(playerId) ?? null,
      position: player.position ?? null,
      competition_id: competitionId,
      status: "active",
      source_updated_at: capturedAt,
    }];
  });
  if (memberRows.length !== incomingProviderIds.length) {
    return { stored: false, reason: "membership-build-incomplete" };
  }

  async function rollbackMembershipRevision() {
    const rollbackResults = await Promise.all([
      ...previousMemberships.map((member) => {
        const playerId = asString(member.player_id);
        if (!playerId) return Promise.resolve({ error: null });
        return snapshotAdmin
          .from("football_squad_members")
          .update({
            jersey_number: asNullableNumber(member.jersey_number),
            position: asString(member.position),
            competition_id: asString(member.competition_id),
            status: asString(member.status) ?? "unknown",
            source_updated_at: asString(member.source_updated_at) ?? EMPTY_SQUAD_SNAPSHOT_REVISION,
          })
          .eq("provider", PROVIDER)
          .eq("club_id", clubId)
          .eq("player_id", playerId)
          .eq("source_updated_at", capturedAt);
      }),
      ...memberRows
        .filter((member) => !previousMembershipsByPlayerId.has(member.player_id))
        .map((member) => snapshotAdmin
          .from("football_squad_members")
          .update({ status: "inactive" })
          .eq("provider", PROVIDER)
          .eq("club_id", clubId)
          .eq("player_id", member.player_id)
          .eq("source_updated_at", capturedAt)),
    ]);
    return rollbackResults.find((result) => result.error)?.error ?? null;
  }

  async function failedPersistence(reason: string) {
    const rollbackError = await rollbackMembershipRevision();
    return {
      stored: false as const,
      reason: rollbackError ? `${reason}; membership-rollback-failed` : reason,
    };
  }

  const { error: memberInsertError } = await snapshotAdmin
    .from("football_squad_members")
    .upsert(memberRows, {
      onConflict: "provider,club_id,player_id",
      ignoreDuplicates: true,
    });

  if (memberInsertError) return failedPersistence(memberInsertError.message);

  const memberUpdateResults = await Promise.all(
    memberRows.map((member) => snapshotAdmin
      .from("football_squad_members")
      .update({
        jersey_number: member.jersey_number,
        position: member.position,
        competition_id: member.competition_id,
        status: "active",
        source_updated_at: capturedAt,
      })
      .eq("provider", PROVIDER)
      .eq("club_id", clubId)
      .eq("player_id", member.player_id)
      .lt("source_updated_at", capturedAt)),
  );
  const memberUpdateError = memberUpdateResults.find((result) => result.error)?.error;
  if (memberUpdateError) return failedPersistence(memberUpdateError.message);

  const activePlayerIds = memberRows.map((member) => member.player_id);
  let staleMemberships = snapshotAdmin
    .from("football_squad_members")
    .update({ status: "inactive", source_updated_at: capturedAt })
    .eq("provider", PROVIDER)
    .eq("club_id", clubId)
    .eq("status", "active")
    .lt("source_updated_at", capturedAt);

  if (activePlayerIds.length) {
    staleMemberships = staleMemberships.not("player_id", "in", `(${activePlayerIds.join(",")})`);
  }

  const { error: staleMembershipsError } = await staleMemberships;

  if (staleMembershipsError) return failedPersistence(staleMembershipsError.message);

  const { data: publishedMembers, error: publishedMembersError } = await snapshotAdmin
    .from("football_squad_members")
    .select("player_id,source_updated_at")
    .eq("provider", PROVIDER)
    .eq("club_id", clubId)
    .eq("status", "active");
  if (publishedMembersError) return failedPersistence(publishedMembersError.message);

  const expectedPlayerIds = new Set(activePlayerIds);
  const publishedRows = (publishedMembers ?? []) as DatabaseRecord[];
  const publishedPlayerIds = publishedRows.map((member) => asString(member.player_id)).filter(Boolean);
  const matchesCurrentRevision = publishedRows.length === expectedPlayerIds.size
    && publishedPlayerIds.length === publishedRows.length
    && publishedPlayerIds.every((playerId) => expectedPlayerIds.has(playerId!))
    && publishedRows.every((member) => asString(member.source_updated_at) === capturedAt);
  if (!matchesCurrentRevision) {
    const capturedTimestamp = Date.parse(capturedAt);
    const superseded = publishedRows.some((member) => {
      const timestamp = Date.parse(asString(member.source_updated_at) ?? "");
      return Number.isFinite(timestamp) && timestamp > capturedTimestamp;
    });
    return failedPersistence(superseded ? "snapshot-superseded" : "snapshot-verification-failed");
  }

  return { stored: true };
}
