import type {
  TouchlineMarketInventoryCard,
  TouchlineMarketInventorySnapshot,
} from "./market-inventory.ts";

/**
 * Commercial read-model primitives.
 *
 * A football player and club are identified by their provider IDs.  The
 * inventory UUID is deliberately a separate product identifier: it is the
 * only identifier that can be submitted to the checkout boundary.  Keeping
 * those identities explicit prevents a visual card, a name or a URL slug from
 * accidentally becoming a purchase identifier.
 */
export type TouchlineMarketPlayerSource = {
  id: string;
  providerId?: string | number | null;
  clubTeamId?: string | number | null;
};

export type TouchlineMarketIdentity = {
  playerKey: string | null;
  clubKey: string | null;
  providerPlayerId: string | null;
  providerTeamId: string | null;
};

export type TouchlineMarketCardReadModel = TouchlineMarketIdentity & {
  inventory: TouchlineMarketInventoryCard | null;
  /**
   * `inventoryId` is intentionally the only checkout-facing product ID.
   * It remains null for public/degraded data and must never be guessed on the
   * client from a player name, slug or provider ID.
   */
  inventoryId: string | null;
  source: "supabase" | "public";
};

function normalizeProviderNumber(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^\d{1,20}$/.test(normalized) ? normalized : null;
}

export function touchlineMarketPlayerKey(value: unknown) {
  const providerPlayerId = normalizeProviderNumber(value);
  return providerPlayerId ? `sportmonks:player:${providerPlayerId}` : null;
}

export function touchlineMarketClubKey(value: unknown) {
  const providerTeamId = normalizeProviderNumber(value);
  return providerTeamId ? `sportmonks:club:${providerTeamId}` : null;
}

export function resolveTouchlineMarketIdentity(
  source: TouchlineMarketPlayerSource,
): TouchlineMarketIdentity {
  const providerPlayerId = normalizeProviderNumber(source.providerId ?? source.id);
  const providerTeamId = normalizeProviderNumber(source.clubTeamId);
  return {
    playerKey: touchlineMarketPlayerKey(providerPlayerId),
    clubKey: touchlineMarketClubKey(providerTeamId),
    providerPlayerId,
    providerTeamId,
  };
}

/**
 * Creates the single commercial read model for a player displayed in Market.
 * No price, tier, wallet, availability or contract rule is calculated here;
 * those values remain authoritative in the server inventory/RPC layer.
 */
export function resolveTouchlineMarketCardReadModel(
  source: TouchlineMarketPlayerSource,
  snapshot: TouchlineMarketInventorySnapshot | null,
): TouchlineMarketCardReadModel {
  const identity = resolveTouchlineMarketIdentity(source);
  const canUseInventory = Boolean(
    snapshot
    && identity.providerPlayerId
    && identity.providerTeamId
    && snapshot.providerTeamId === identity.providerTeamId,
  );
  const inventory = canUseInventory
    ? snapshot!.cards.find((candidate) => candidate.providerPlayerId === identity.providerPlayerId) ?? null
    : null;

  return {
    ...identity,
    inventory,
    inventoryId: inventory?.inventoryId ?? null,
    source: inventory ? "supabase" : "public",
  };
}

/**
 * Market list rows use the exact same canonical identity as the selected-card
 * view. This is intentionally a list/detail boundary without a second copy of
 * player, club, card or commercial data.
 */
export function resolveTouchlineMarketCardReadModels<T extends TouchlineMarketPlayerSource>(
  players: readonly T[],
  snapshot: TouchlineMarketInventorySnapshot | null,
) {
  return players.map((player) => ({
    player,
    card: resolveTouchlineMarketCardReadModel(player, snapshot),
  }));
}
