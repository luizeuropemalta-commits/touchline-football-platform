import { normalizeOfficialShirtNumber } from "../football-data/arena-lineup.ts";
import {
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import type { ClubOwnerSquadCard } from "./demo-data.ts";
import { normalizeTouchlineMarketInventoryId } from "./market-inventory.ts";

export type AuthoritativeRosterClientResult =
  | { ok: true; cards: ClubOwnerSquadCard[] }
  | { ok: false };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function marketValueSource(value: unknown): ClubOwnerSquadCard["marketValueSource"] | null {
  return value === "provider" || value === "verified-cache" || value === "unavailable"
    ? value
    : null;
}

/**
 * Treats the roster endpoint as an untrusted network boundary. A partial or
 * malformed payload is rejected wholesale so the UI never makes an owned card
 * disappear because one response row was incomplete.
 */
export function parseAuthoritativeRosterResponse(
  value: unknown,
): AuthoritativeRosterClientResult {
  const payload = record(value);
  if (
    payload?.ok !== true
    || payload.state !== "authenticated"
    || payload.source !== "supabase"
    || !Array.isArray(payload.cards)
    || !Number.isInteger(payload.activeContractCount)
    || Number(payload.activeContractCount) !== payload.cards.length
  ) return { ok: false };

  const inventoryIds = new Set<string>();
  const cards: ClubOwnerSquadCard[] = [];

  for (const rawCard of payload.cards) {
    const card = record(rawCard);
    const id = requiredText(card?.id);
    const inventoryId = normalizeTouchlineMarketInventoryId(card?.inventoryId);
    const name = requiredText(card?.name);
    const shortName = requiredText(card?.shortName);
    const role = requiredText(card?.role);
    const position = requiredText(card?.position);
    const clubName = requiredText(card?.clubName);
    const countryCode3 = requiredText(card?.countryCode3);
    const marketValue = requiredText(card?.marketValue);
    const source = marketValueSource(card?.marketValueSource);
    const tier = requiredText(card?.cardTier);
    const points = typeof card?.touchlinePoints === "number" && Number.isFinite(card.touchlinePoints)
      ? card.touchlinePoints
      : null;

    if (
      !id
      || !inventoryId
      || inventoryIds.has(inventoryId)
      || !name
      || !shortName
      || !role
      || !position
      || !clubName
      || !countryCode3
      || !marketValue
      || !source
      || !tier
      || !touchlineArenaTierForKey(tier)
      || points === null
    ) return { ok: false };

    inventoryIds.add(inventoryId);
    cards.push({
      id,
      inventoryId,
      name,
      shortName,
      role,
      position,
      clubName,
      shirtNumber: normalizeOfficialShirtNumber(card?.shirtNumber),
      countryCode3,
      marketValue,
      marketValueSource: source,
      cardTier: tier as TouchlineCardTierKey,
      cardPriceVersion: optionalText(card?.cardPriceVersion),
      touchlinePoints: points,
    });
  }

  return { ok: true, cards };
}
