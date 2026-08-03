import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlinePlayer, TouchlineTransfer } from "@/lib/football-data/types";
import {
  normalizeTouchLineOfficialStats,
  type TouchLineOfficialStat,
} from "@/lib/touchlineArena/player-profile-statistics";
import { resolveTouchLineProviderPlayer } from "@/lib/touchlineArena/player-provider-resolution";

export type TouchLineOfficialPlayerProfile = {
  status: "live" | "pending" | "error";
  player: TouchlinePlayer | null;
  providerPlayerId: string | null;
  seasonId: string | null;
  seasonName: string | null;
  fetchedAt: string | null;
  stats: TouchLineOfficialStat[];
  transferStatus: "live" | "pending" | "error";
  transfers: TouchlineTransfer[];
  transfersFetchedAt: string | null;
  transferReason?: string;
  reason?: string;
};

export async function loadTouchLineOfficialPlayerProfile(input: {
  name: string;
  providerPlayerId?: string | null;
}): Promise<TouchLineOfficialPlayerProfile> {
  try {
    const provider = createFootballDataProvider("sportmonks");
    const player = await resolveTouchLineProviderPlayer(provider, {
      name: input.name,
      candidateId: input.providerPlayerId,
    });
    if (!player || !/^\d+$/.test(player.providerId)) {
      return {
        status: "pending",
        player: null,
        providerPlayerId: null,
        seasonId: null,
        seasonName: null,
        fetchedAt: null,
        stats: [],
        transferStatus: "pending",
        transfers: [],
        transfersFetchedAt: null,
        reason: "verified-player-id-pending",
      };
    }

    const [result, transfersResult] = await Promise.all([
      provider.getPlayerStats({ playerId: player.providerId }),
      provider.getTransfers({ playerId: player.providerId }),
    ]);
    const transfers = transfersResult.ok ? transfersResult.data : [];
    const transferState = {
      transferStatus: transfersResult.ok
        ? transfers.length
          ? "live" as const
          : "pending" as const
        : "error" as const,
      transfers,
      transfersFetchedAt: transfersResult.fetchedAt ?? null,
      transferReason: transfersResult.ok
        ? transfers.length
          ? undefined
          : "verified-career-empty"
        : transfersResult.error.code,
    };
    if (!result.ok) {
      return {
        status: "error",
        player,
        providerPlayerId: player.providerId,
        seasonId: null,
        seasonName: null,
        fetchedAt: null,
        stats: [],
        ...transferState,
        reason: result.error.code,
      };
    }

    const normalized = normalizeTouchLineOfficialStats(result.data);
    const seasonsResult = normalized.seasonId
      ? await provider.getSeasons()
      : null;
    const seasonName = seasonsResult?.ok
      ? seasonsResult.data.find((season) => season.providerId === normalized.seasonId)?.name ?? null
      : null;
    return {
      status: normalized.stats.length ? "live" : "pending",
      player,
      providerPlayerId: player.providerId,
      seasonName,
      ...normalized,
      ...transferState,
      reason: normalized.stats.length ? undefined : "season-statistics-pending",
    };
  } catch {
    return {
      status: "error",
      player: null,
      providerPlayerId: null,
      seasonId: null,
      seasonName: null,
      fetchedAt: null,
      stats: [],
      transferStatus: "error",
      transfers: [],
      transfersFetchedAt: null,
      transferReason: "provider-request-failed",
      reason: "provider-request-failed",
    };
  }
}
