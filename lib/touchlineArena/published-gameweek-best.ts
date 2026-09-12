import type { ClubOwnerSquadCard } from "./demo-data";
import type { TouchlinePublishedTopEleven, TouchlinePublishedTopElevenSlot } from "./published-top-eleven";

export type TouchlinePublishedGameweekBest =
  | Readonly<{
    phase: "ready";
    snapshotId: string;
    roundId: string;
    publishedAt: string;
    slots: ReadonlyArray<Readonly<{ slot: TouchlinePublishedTopElevenSlot; card: ClubOwnerSquadCard }>>;
    coach: TouchlinePublishedTopEleven["coach"];
  }>
  | Readonly<{ phase: "unavailable"; reason: "no-published-selection" | "incomplete-card-catalogue" }>;

/**
 * The Gameweek coach is a fact from the immutable published selection.  It is
 * deliberately resolved separately from the season coach standings: a season
 * leader must never be substituted into a Gameweek publication.
 */
export type TouchlinePublishedGameweekCoach =
  | Readonly<{ phase: "ready"; coachProviderId: string; touchlinePoints: number }>
  | Readonly<{ phase: "unavailable"; reason: "no-published-selection" | "no-published-coach" }>;

function identifiersForCard(card: ClubOwnerSquadCard) {
  return [card.id, card.canonicalPlayerId]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

/**
 * The public Best XI is a Gameweek read model, never a visual selection made
 * by the browser. It renders only when all eleven immutable slots resolve to
 * eleven distinct published cards. Missing data remains a clear pending state.
 */
export function resolveTouchlinePublishedGameweekBest(input: Readonly<{
  selection: TouchlinePublishedTopEleven | null;
  cards: readonly ClubOwnerSquadCard[];
}>): TouchlinePublishedGameweekBest {
  if (!input.selection) return { phase: "unavailable", reason: "no-published-selection" };

  const cardsByIdentifier = new Map<string, ClubOwnerSquadCard>();
  for (const card of input.cards) {
    for (const identifier of identifiersForCard(card)) cardsByIdentifier.set(identifier, card);
  }
  const resolved = input.selection.slots.map((slot) => {
    const card = slot.playerIds.map((identifier) => cardsByIdentifier.get(identifier)).find(Boolean) ?? null;
    return card ? { slot, card } : null;
  });
  const cards = resolved.map((entry) => entry?.card).filter((card): card is ClubOwnerSquadCard => Boolean(card));
  if (
    resolved.length !== 11
    || resolved.some((entry) => entry === null)
    || cards.length !== 11
    || new Set(cards.map((card) => card.canonicalPlayerId ?? card.id)).size !== 11
  ) {
    return { phase: "unavailable", reason: "incomplete-card-catalogue" };
  }

  return {
    phase: "ready",
    snapshotId: input.selection.snapshotId,
    roundId: input.selection.roundId,
    publishedAt: input.selection.publishedAt,
    slots: resolved as ReadonlyArray<Readonly<{ slot: TouchlinePublishedTopElevenSlot; card: ClubOwnerSquadCard }>>,
    coach: input.selection.coach,
  };
}

/**
 * Returns only the exact coach and points stored in the immutable Gameweek
 * payload.  Callers must show a pending state when that payload has no coach;
 * they may not fall back to the live/season ranking.
 */
export function resolveTouchlinePublishedGameweekCoach(
  selection: TouchlinePublishedTopEleven | null,
): TouchlinePublishedGameweekCoach {
  if (!selection) return { phase: "unavailable", reason: "no-published-selection" };
  if (!selection.coach) return { phase: "unavailable", reason: "no-published-coach" };
  return {
    phase: "ready",
    coachProviderId: selection.coach.coachProviderId,
    touchlinePoints: selection.coach.touchlinePoints,
  };
}
