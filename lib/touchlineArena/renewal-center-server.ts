import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type DatabaseRecord = Record<string, unknown>;

export type TouchlineRenewalCenterReadError =
  | "TL_RENEWAL_CENTER_USER_INVALID"
  | "TL_RENEWAL_CENTER_CONTRACTS_UNAVAILABLE"
  | "TL_RENEWAL_CENTER_QUOTES_UNAVAILABLE"
  | "TL_RENEWAL_CENTER_PLAYERS_UNAVAILABLE";

export type TouchlineRenewalCenterServerItem = {
  quoteId: string;
  sourceContractId: string;
  playerId: string;
  playerName: string;
  position: string | null;
  contractLifecycleState: string;
  quoteStatus: "READY" | "NOT_ELIGIBLE" | "MARKET_VALUE_PENDING" | "UNAVAILABLE";
  currentMarketValueEur: number | null;
  priceTc: number | null;
  expiresAt: string | null;
  reason: string | null;
};

export type TouchlineRenewalCenterReadResult =
  | { ok: true; items: TouchlineRenewalCenterServerItem[] }
  | { ok: false; error: TouchlineRenewalCenterReadError };

function record(value: unknown): DatabaseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DatabaseRecord
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNonNegativeInteger(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function quoteStatus(value: unknown): TouchlineRenewalCenterServerItem["quoteStatus"] {
  switch (text(value)?.toLowerCase()) {
    case "ready": return "READY";
    case "not_eligible": return "NOT_ELIGIBLE";
    case "market_value_pending": return "MARKET_VALUE_PENDING";
    default: return "UNAVAILABLE";
  }
}

/**
 * Server-only view for the authenticated ClubOwner. Quotes are matched through
 * the ClubOwner's own contracts, so a browser never chooses a user, contract,
 * price, tier or eligibility. This function intentionally performs reads only
 * and fails closed while the local quote migration is not applied remotely.
 */
export async function readTouchlineRenewalCenter(
  admin: SupabaseClient,
  authenticatedUserId: string,
): Promise<TouchlineRenewalCenterReadResult> {
  const userId = text(authenticatedUserId);
  if (!userId) return { ok: false, error: "TL_RENEWAL_CENTER_USER_INVALID" };

  const contractsResult = await admin
    .from("touchline_card_contracts")
    .select("id,card_id,season_lifecycle_state")
    .eq("user_id", userId);
  if (contractsResult.error) return { ok: false, error: "TL_RENEWAL_CENTER_CONTRACTS_UNAVAILABLE" };

  const contracts = (contractsResult.data ?? []).flatMap((source) => {
    const row = record(source);
    const id = row ? text(row.id) : null;
    const cardId = row ? text(row.card_id) : null;
    return row && id && cardId ? [{ ...row, id, card_id: cardId } as DatabaseRecord] : [];
  });
  if (contracts.length === 0) return { ok: true, items: [] };

  const contractIds = contracts.map((contract) => contract.id as string);
  const cardIds = [...new Set(contracts.map((contract) => contract.card_id as string))];
  const [quotesResult, inventoryResult] = await Promise.all([
    admin
      .from("touchline_contract_renewal_quotes")
      .select("id,source_contract_id,player_id,status,market_value_eur,price_tc,quote_expires_at,eligibility_reason,is_current")
      .in("source_contract_id", contractIds)
      .eq("is_current", true),
    admin
      .from("touchline_card_inventory")
      .select("id,player_id")
      .in("id", cardIds),
  ]);
  if (quotesResult.error) return { ok: false, error: "TL_RENEWAL_CENTER_QUOTES_UNAVAILABLE" };
  if (inventoryResult.error) return { ok: false, error: "TL_RENEWAL_CENTER_PLAYERS_UNAVAILABLE" };

  const contractById = new Map(contracts.map((contract) => [contract.id as string, contract]));
  const playerIdByCardId = new Map(
    (inventoryResult.data ?? []).flatMap((source) => {
      const row = record(source);
      const cardId = row ? text(row.id) : null;
      const playerId = row ? text(row.player_id) : null;
      return cardId && playerId ? [[cardId, playerId] as const] : [];
    }),
  );
  const quoteRows = (quotesResult.data ?? []).flatMap((source) => {
    const row = record(source);
    const quoteId = row ? text(row.id) : null;
    const sourceContractId = row ? text(row.source_contract_id) : null;
    const playerId = row ? text(row.player_id) : null;
    const contract = sourceContractId ? contractById.get(sourceContractId) : null;
    const contractPlayerId = contract ? playerIdByCardId.get(contract.card_id as string) : null;
    return row && quoteId && sourceContractId && playerId && contract && contractPlayerId === playerId
      ? [{ ...row, id: quoteId, source_contract_id: sourceContractId, player_id: playerId } as DatabaseRecord]
      : [];
  });
  if (quoteRows.length === 0) return { ok: true, items: [] };

  const playerIds = [...new Set(quoteRows.map((quote) => quote.player_id as string))];
  const playersResult = await admin
    .from("football_players")
    .select("id,name,display_name,position")
    .in("id", playerIds);
  if (playersResult.error) return { ok: false, error: "TL_RENEWAL_CENTER_PLAYERS_UNAVAILABLE" };

  const playersById = new Map(
    (playersResult.data ?? []).flatMap((source) => {
      const row = record(source);
      const id = row ? text(row.id) : null;
      const name = row ? (text(row.display_name) ?? text(row.name)) : null;
      return id && name ? [[id, { name, position: text(row?.position) }] as const] : [];
    }),
  );

  return {
    ok: true,
    items: quoteRows.flatMap((quote) => {
      const sourceContractId = quote.source_contract_id as string;
      const contract = contractById.get(sourceContractId);
      const playerId = quote.player_id as string;
      const player = playersById.get(playerId);
      if (!contract || !player) return [];
      return [{
        quoteId: quote.id as string,
        sourceContractId,
        playerId,
        playerName: player.name,
        position: player.position,
        contractLifecycleState: text(contract.season_lifecycle_state) ?? "UNKNOWN",
        quoteStatus: quoteStatus(quote.status),
        currentMarketValueEur: nullableNonNegativeInteger(quote.market_value_eur),
        priceTc: nullableNonNegativeInteger(quote.price_tc),
        expiresAt: text(quote.quote_expires_at),
        reason: text(quote.eligibility_reason),
      } satisfies TouchlineRenewalCenterServerItem];
    }),
  };
}
