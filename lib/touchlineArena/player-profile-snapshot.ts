import type {
  FootballDataSourceRef,
  TouchlinePlayer,
  TouchlineTransfer,
} from "@/lib/football-data/types";
import type { TouchLineOfficialPlayerProfile } from "@/lib/touchlineArena/player-profile-official";
import type { TouchLineOfficialStat } from "@/lib/touchlineArena/player-profile-statistics";

export type TouchLineOfficialProfileSnapshot = {
  provider: "sportmonks";
  providerPlayerId: string;
  seasonId: string | null;
  seasonName: string | null;
  statisticsStatus: "live" | "pending";
  transferStatus: "live" | "pending";
  player: Omit<TouchlinePlayer, "marketValue" | "marketValueCurrency">;
  stats: TouchLineOfficialStat[];
  transfers: TouchlineTransfer[];
  statisticsFetchedAt: string | null;
  transfersFetchedAt: string | null;
  capturedAt: string;
};

function cleanSource(source: FootballDataSourceRef | undefined, providerId: string): FootballDataSourceRef {
  return {
    provider: "sportmonks",
    providerId,
    ...(source?.externalUrl ? { externalUrl: source.externalUrl } : {}),
    ...(source?.lastSyncedAt ? { lastSyncedAt: source.lastSyncedAt } : {}),
  };
}

function cleanPlayer(
  player: TouchlinePlayer,
): TouchLineOfficialProfileSnapshot["player"] {
  return {
    id: player.id,
    providerId: player.providerId,
    provider: "sportmonks",
    name: player.name,
    displayName: player.displayName,
    ...(player.firstName ? { firstName: player.firstName } : {}),
    ...(player.lastName ? { lastName: player.lastName } : {}),
    ...(player.photoUrl ? { photoUrl: player.photoUrl } : {}),
    ...(player.dateOfBirth ? { dateOfBirth: player.dateOfBirth } : {}),
    ...(typeof player.age === "number" ? { age: player.age } : {}),
    ...(player.nationality ? { nationality: player.nationality } : {}),
    ...(player.countryId ? { countryId: player.countryId } : {}),
    ...(player.position ? { position: player.position } : {}),
    ...(player.positionId ? { positionId: player.positionId } : {}),
    ...(player.height ? { height: player.height } : {}),
    ...(player.weight ? { weight: player.weight } : {}),
    ...(player.preferredFoot ? { preferredFoot: player.preferredFoot } : {}),
    ...(player.currentTeamId ? { currentTeamId: player.currentTeamId } : {}),
    ...(player.currentTeamName ? { currentTeamName: player.currentTeamName } : {}),
    ...(player.contractUntil ? { contractUntil: player.contractUntil } : {}),
    source: cleanSource(player.source, player.providerId),
  };
}

function cleanStats(stats: TouchLineOfficialStat[]): TouchLineOfficialStat[] {
  return stats.map((stat) => ({
    typeId: String(stat.typeId),
    ...(stat.code ? { code: stat.code } : {}),
    ...(stat.name ? { name: stat.name } : {}),
    value: stat.value,
    label: stat.label,
    group: stat.group,
  }));
}

function cleanTransfers(transfers: TouchlineTransfer[]): TouchlineTransfer[] {
  return transfers.map((transfer) => ({
    id: transfer.id,
    providerId: transfer.providerId,
    provider: "sportmonks",
    ...(transfer.playerId ? { playerId: transfer.playerId } : {}),
    ...(transfer.playerName ? { playerName: transfer.playerName } : {}),
    ...(transfer.fromTeamId ? { fromTeamId: transfer.fromTeamId } : {}),
    ...(transfer.fromTeamName ? { fromTeamName: transfer.fromTeamName } : {}),
    ...(transfer.toTeamId ? { toTeamId: transfer.toTeamId } : {}),
    ...(transfer.toTeamName ? { toTeamName: transfer.toTeamName } : {}),
    ...(transfer.date ? { date: transfer.date } : {}),
    ...(transfer.type ? { type: transfer.type } : {}),
    ...(typeof transfer.amount === "number" ? { amount: transfer.amount } : {}),
    ...(transfer.currency ? { currency: transfer.currency } : {}),
    source: cleanSource(transfer.source, transfer.providerId),
  }));
}

export function buildTouchLineOfficialProfileSnapshot(input: {
  profile: TouchLineOfficialPlayerProfile;
  previous?: TouchLineOfficialProfileSnapshot | null;
  capturedAt?: string;
}): TouchLineOfficialProfileSnapshot | null {
  const { profile, previous = null } = input;
  const player = profile.player
    ? cleanPlayer(profile.player)
    : previous?.player
      ? cleanPlayer(previous.player)
      : null;
  const providerPlayerId = profile.providerPlayerId ?? previous?.providerPlayerId ?? null;
  if (!player || !providerPlayerId || !/^\d+$/.test(providerPlayerId)) return null;

  const hasLiveStatistics = profile.status === "live" && profile.stats.length > 0 && Boolean(profile.fetchedAt);
  const hasLiveTransfers = profile.transferStatus === "live" && profile.transfers.length > 0 && Boolean(profile.transfersFetchedAt);
  if (!previous && !hasLiveStatistics && !hasLiveTransfers) return null;

  return {
    provider: "sportmonks",
    providerPlayerId,
    seasonId: hasLiveStatistics ? profile.seasonId : previous?.seasonId ?? profile.seasonId,
    seasonName: hasLiveStatistics ? profile.seasonName : previous?.seasonName ?? profile.seasonName,
    statisticsStatus: hasLiveStatistics ? "live" : previous?.statisticsStatus ?? "pending",
    transferStatus: hasLiveTransfers ? "live" : previous?.transferStatus ?? "pending",
    player,
    stats: hasLiveStatistics ? cleanStats(profile.stats) : previous?.stats ?? [],
    transfers: hasLiveTransfers ? cleanTransfers(profile.transfers) : previous?.transfers ?? [],
    statisticsFetchedAt: hasLiveStatistics ? profile.fetchedAt : previous?.statisticsFetchedAt ?? null,
    transfersFetchedAt: hasLiveTransfers ? profile.transfersFetchedAt : previous?.transfersFetchedAt ?? null,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
}

export function hydrateTouchLineOfficialProfileSnapshot(
  snapshot: TouchLineOfficialProfileSnapshot,
): TouchLineOfficialPlayerProfile {
  return {
    status: snapshot.statisticsStatus,
    player: cleanPlayer(snapshot.player),
    providerPlayerId: snapshot.providerPlayerId,
    seasonId: snapshot.seasonId,
    seasonName: snapshot.seasonName,
    fetchedAt: snapshot.statisticsFetchedAt,
    stats: snapshot.stats,
    transferStatus: snapshot.transferStatus,
    transfers: snapshot.transfers,
    transfersFetchedAt: snapshot.transfersFetchedAt,
    transferReason: snapshot.transferStatus === "live" ? undefined : "verified-career-pending",
    reason: "persisted-official-snapshot",
  };
}
