import { recognizedSportmonksDetailedPosition } from "../football-data/sportmonks-position-taxonomy.ts";
import { clubPlayerPosition } from "./club-position.ts";
import type { ExchangePosition } from "./exchange-eligibility.ts";

/** Trusted catalogue/DB projection, never request JSON or a broad display role. */
export type ClubPrimaryPositionIndex = Readonly<Record<string, string | null>>;

export function clubPrimaryPositionIndex(cards: readonly Readonly<{
  id: string; canonicalPlayerId?: string | null; primaryPositionDetail?: string | null; position?: string;
}>[], options: Readonly<{ allowLegacyDisplay?: boolean }> = {}): ClubPrimaryPositionIndex {
  const result: Record<string, string | null> = Object.create(null);
  for (const card of cards) {
    const id = card.canonicalPlayerId ?? card.id;
    // Only a pre-existing SSR card missing the new field may retain its detailed
    // display preview. Never use this option as server-side write authority.
    const detail = recognizedSportmonksDetailedPosition(options.allowLegacyDisplay
      && !Object.hasOwn(card, "primaryPositionDetail") ? card.position : card.primaryPositionDetail);
    // Duplicate identities must not silently choose one of two authoritative rows.
    result[id] = Object.hasOwn(result, id) ? null : detail;
  }
  return Object.freeze(result);
}

/** Existing contracts are not rewritten. Missing/conflicting current detail or
 * a changed quota category requires reconciliation, not implicit reclassification.
 * A provided index is authoritative even when an ID/detail is absent. */
export function ownedClubPrimaryDetail(player: Readonly<{
  playerId: string; position: ExchangePosition; primaryDetail?: string;
}>, primaryDetails?: ClubPrimaryPositionIndex): string | null {
  const stored = recognizedSportmonksDetailedPosition(player.primaryDetail);
  if (player.primaryDetail !== undefined && !stored) return null;
  const current = primaryDetails
    ? Object.hasOwn(primaryDetails, player.playerId)
      ? recognizedSportmonksDetailedPosition(primaryDetails[player.playerId]) : null
    : stored;
  if (!current || (stored && stored !== current)) return null;
  return clubPlayerPosition(current) === player.position ? current : null;
}
