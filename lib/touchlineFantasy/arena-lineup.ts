import type { ArenaLineupPlayer } from "../football-data/arena-lineup.ts";
import type { TouchlineFormationGeometryRegistry } from "../touchlineArena/formation-geometry.ts";
import type { ClubOwnerSquadCard } from "../touchlineArena/demo-data.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TouchlineFantasyArenaLineup = Readonly<{
  gameweekNumber: number;
  formationCode: string;
  coachProviderId: string;
  players: readonly ArenaLineupPlayer[];
}>;

type ArenaLineupSnapshotInput = Readonly<{
  activeGameweek: Readonly<{ number: number }> | null;
  userGameweek: Readonly<{
    formationCode: string;
    state: "DRAFT" | "CONFIRMED" | "LOCKED" | "FINAL";
    selectedCoachId: string | null;
  }> | null;
  selections: readonly Readonly<{ playerId: string; slotId: string }>[];
  catalogue: readonly ClubOwnerSquadCard[];
  formationRegistry: TouchlineFormationGeometryRegistry;
}>;

function canonicalId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

/**
 * Read-only adapter from the canonical Gameweek snapshot to the existing Arena
 * card layer. It never persists an Arena roster and it fails closed unless the
 * confirmed snapshot has one coach, one published formation and 11 unique
 * canonical player identities.
 */
export function buildTouchlineFantasyArenaLineup(
  snapshot: ArenaLineupSnapshotInput | null,
): TouchlineFantasyArenaLineup | null {
  const gameweek = snapshot?.activeGameweek;
  const userGameweek = snapshot?.userGameweek;
  if (!snapshot || !gameweek || !userGameweek || userGameweek.state === "DRAFT") return null;
  if (!userGameweek.selectedCoachId || snapshot.selections.length !== 11) return null;

  const geometry = snapshot.formationRegistry[userGameweek.formationCode];
  if (!geometry || geometry.slots.length !== 11) return null;

  const cardsByCanonicalId = new Map(snapshot.catalogue.flatMap((card) => {
    const id = canonicalId(card.canonicalPlayerId);
    return id ? [[id, card] as const] : [];
  }));
  const selectionsBySlot = new Map(snapshot.selections.map((selection) => [selection.slotId, selection] as const));
  const seen = new Set<string>();
  const players = geometry.slots.flatMap((slot): ArenaLineupPlayer[] => {
    const selection = selectionsBySlot.get(slot.id);
    const playerId = canonicalId(selection?.playerId);
    const card = playerId ? cardsByCanonicalId.get(playerId) : null;
    if (!selection || !playerId || !card || seen.has(playerId)) return [];
    seen.add(playerId);
    return [{
      id: playerId,
      name: card.name,
      shortName: card.shortName,
      role: slot.role,
      x: slot.x,
      y: slot.y,
      heightVh: 12,
      card: {
        canonicalPlayerId: playerId,
        templateUrl: "",
        playerName: card.name,
        shirtNumber: card.shirtNumber,
        clubName: card.clubName,
        position: card.position,
        countryCode3: card.countryCode3,
        totalRating: card.seasonTotalRating ?? null,
        matchRating: card.matchRating ?? null,
        marketValue: null,
        marketValueSource: "unavailable",
        marketValueState: card.marketValueState ?? "unavailable",
        classificationState: card.classificationState ?? "unavailable",
        cardTier: card.cardTier ?? null,
        cardPriceVersion: card.cardPriceVersion ?? null,
        cardPriceAuthority: card.cardPriceAuthority ?? null,
        editorialCard: card.editorialCard ?? null,
        inventoryId: card.inventoryId ?? null,
        seasonStats: card.seasonStats,
        matchStats: card.matchStats,
        matchPointContributions: card.matchPointContributions,
      },
    }];
  });

  if (players.length !== 11 || seen.size !== 11) return null;
  return Object.freeze({
    gameweekNumber: gameweek.number,
    formationCode: userGameweek.formationCode,
    coachProviderId: userGameweek.selectedCoachId,
    players: Object.freeze(players),
  });
}
