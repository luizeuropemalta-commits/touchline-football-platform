import type { ArenaLineupPlayer } from "../football-data/arena-lineup.ts";
import type { ArenaPersistencePrincipal } from "./arena-persistence-namespace.ts";
import type { ClubOwnerSquadCard } from "./demo-data.ts";
import { normalizeTouchlineMarketInventoryId } from "./market-inventory.ts";

export type ArenaAccountSyncStatus =
  | "pending"
  | "ready"
  | "unavailable"
  | "demo"
  | "anonymous";

export type ArenaAccountStateEnvelope<TState> = {
  ok?: boolean;
  userId?: unknown;
  state?: TState | null;
};

export type ArenaAccountIdentityResponse<TState> = {
  ok: boolean;
  status: number;
  payload: ArenaAccountStateEnvelope<TState>;
};

export type ArenaAccountSyncResolution<TState> = {
  principal: ArenaPersistencePrincipal;
  status: Exclude<ArenaAccountSyncStatus, "pending">;
  remoteState: TState | null;
};

export function resolveArenaAccountSync<TState>(input: {
  isDemoRequest: boolean;
  anonymousPrincipal: ArenaPersistencePrincipal;
  response?: ArenaAccountIdentityResponse<TState> | null;
}): ArenaAccountSyncResolution<TState> {
  if (input.isDemoRequest) {
    return {
      principal: { kind: "demo", demoId: "arena-lineup" },
      status: "demo",
      remoteState: null,
    };
  }

  const response = input.response;
  if (!response) {
    return {
      principal: input.anonymousPrincipal,
      status: "unavailable",
      remoteState: null,
    };
  }

  if (response.status === 401) {
    return {
      principal: input.anonymousPrincipal,
      status: "anonymous",
      remoteState: null,
    };
  }

  const userId = typeof response.payload.userId === "string"
    ? response.payload.userId.trim()
    : "";
  if (!userId) {
    return {
      principal: input.anonymousPrincipal,
      status: "unavailable",
      remoteState: null,
    };
  }

  const principal = { kind: "authenticated" as const, userId };
  if (response.status !== 200 || !response.ok || response.payload.ok !== true) {
    return {
      principal,
      status: "unavailable",
      remoteState: null,
    };
  }

  return {
    principal,
    status: "ready",
    remoteState: response.payload.state ?? null,
  };
}

export function canPersistArenaAccountState(
  principal: ArenaPersistencePrincipal | null | undefined,
  status: ArenaAccountSyncStatus,
) {
  return principal?.kind === "authenticated" && status === "ready";
}

function normalizeIdentity(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeClubIdentity(value?: string | null) {
  return normalizeIdentity(value)
    .replace(/\b(?:afc|fc|football club)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rosterCardForPlayer(
  player: ArenaLineupPlayer,
  roster: ClubOwnerSquadCard[],
) {
  const inventoryId = normalizeTouchlineMarketInventoryId(player.card?.inventoryId);
  if (inventoryId) {
    const inventoryMatches = roster.filter(
      (card) => normalizeTouchlineMarketInventoryId(card.inventoryId) === inventoryId,
    );
    if (inventoryMatches.length === 1) return inventoryMatches[0];
    return null;
  }

  const directId = normalizeIdentity(player.id);
  const directMatches = roster.filter((card) => normalizeIdentity(card.id) === directId);
  if (directMatches.length === 1) return directMatches[0];

  const playerName = normalizeIdentity(player.card?.playerName || player.name);
  const clubName = normalizeClubIdentity(player.card?.clubName);
  const identityMatches = roster.filter((card) => (
    normalizeIdentity(card.name) === playerName
    && (!clubName || normalizeClubIdentity(card.clubName) === clubName)
  ));
  return identityMatches.length === 1 ? identityMatches[0] : null;
}

export function mergeArenaLineupInventoryFromRoster(
  players: ArenaLineupPlayer[],
  roster: ClubOwnerSquadCard[],
) {
  let changed = false;
  const mergedPlayers = players.map((player) => {
    if (!player.card) return player;
    const rosterCard = rosterCardForPlayer(player, roster);
    const inventoryId = normalizeTouchlineMarketInventoryId(rosterCard?.inventoryId);
    if (!rosterCard || !inventoryId) return player;

    changed = true;
    return {
      ...player,
      name: rosterCard.name,
      shortName: rosterCard.shortName,
      card: {
        ...player.card,
        playerName: rosterCard.name,
        shirtNumber: rosterCard.shirtNumber,
        clubName: rosterCard.clubName,
        position: rosterCard.position,
        countryCode3: rosterCard.countryCode3,
        cardTier: rosterCard.cardTier ?? null,
        cardPriceVersion: rosterCard.cardPriceVersion ?? null,
        cardPriceAuthority: rosterCard.cardPriceAuthority ?? null,
        editorialCard: rosterCard.editorialCard ?? null,
        inventoryId,
        totalRating: rosterCard.seasonTotalRating ?? null,
        matchRating: rosterCard.matchRating ?? null,
        seasonStats: rosterCard.seasonStats,
        matchStats: rosterCard.matchStats,
      },
    };
  });

  return changed ? mergedPlayers : players;
}

/**
 * Reconciles a saved lineup with the active-contract roster. This is used only
 * after a complete authoritative roster response has been validated. A card
 * without an owned inventory UUID, or whose contract is no longer active, is
 * removed from the field instead of being silently persisted again.
 */
export function reconcileArenaLineupWithAuthoritativeRoster(
  players: ArenaLineupPlayer[],
  roster: ClubOwnerSquadCard[],
) {
  const rosterInventoryIds = new Set(
    roster
      .map((card) => normalizeTouchlineMarketInventoryId(card.inventoryId))
      .filter((inventoryId): inventoryId is string => Boolean(inventoryId)),
  );
  const mergedPlayers = mergeArenaLineupInventoryFromRoster(players, roster);

  return mergedPlayers.filter((player) => {
    const inventoryId = normalizeTouchlineMarketInventoryId(player.card?.inventoryId);
    return Boolean(inventoryId && rosterInventoryIds.has(inventoryId));
  });
}
