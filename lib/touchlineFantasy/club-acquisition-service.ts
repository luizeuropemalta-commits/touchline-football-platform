import { acquireClubPlayer, inspectClubAcquisition, type ClubAcquisitionState, type ClubAcquisitionCommand, type PublishedClubOffer } from "./club-acquisition.ts";
import type { TouchlineFormationGeometry } from "../touchlineArena/formation-geometry.ts";
import { clubStarterSelections } from "./club-allocation.ts";
import { ownedClubPrimaryDetail, type ClubPrimaryPositionIndex } from "./club-primary-position-index.ts";
import { collectionSlotPlan } from "./club-position-plan.ts";

/** Server adapter contract. Wallets and offers must never come from request JSON. */
export type ClubAcquisitionStore = Readonly<{
  read: (ownerId: string, seasonId: string) => Promise<ClubAcquisitionState | null>;
  commit: (ownerId: string, before: ClubAcquisitionState, next: ClubAcquisitionState,
    command: ClubAcquisitionCommand) => Promise<ClubAcquisitionState>;
}>;
export type ClubAcquisitionAuthority = Readonly<{
  ownerId: string;
  seasonId: string;
  active: boolean;
  marketOpen: boolean;
  allowedClubIds: readonly string[] | null;
  offer: PublishedClubOffer | null;
  geometry?: TouchlineFormationGeometry | null;
  primaryDetails?: ClubPrimaryPositionIndex;
}>;

/** Both normal acquisition and a retry return the persisted balance, never an optimistic wallet. */
export async function purchaseClubPlayer(store: ClubAcquisitionStore, authority: ClubAcquisitionAuthority,
  command: ClubAcquisitionCommand) {
  if (!authority.active || !authority.ownerId || !authority.seasonId) throw new Error("CLUB_ACCESS_REQUIRED");
  const before = await store.read(authority.ownerId, authority.seasonId);
  if (!before) throw new Error("CLUB_COLLECTION_REQUIRED");
  inspectClubAcquisition(before);
  if (before.seasonId !== authority.seasonId) throw new Error("CLUB_SEASON_MISMATCH");
  const transition = acquireClubPlayer(before, command, authority);
  if (transition.replayed) return transition;
  const incoming = transition.state.players.find(player => player.playerId === command.playerId);
  if (!incoming?.primaryDetail || !ownedClubPrimaryDetail(incoming, authority.primaryDetails)) throw new Error("CLUB_PRIMARY_POSITION_UNCONFIRMED");
  if (!authority.geometry) throw new Error("CLUB_FORMATION_INVALID");
  if (command.area === "starters") {
    clubStarterSelections(transition.state, authority.geometry, authority.primaryDetails);
  }
  const beforePlan = collectionSlotPlan(authority.geometry, before.players, authority.primaryDetails);
  if (!beforePlan || (command.area !== "starters" && beforePlan[command.area][command.slot] !== incoming.position)
    || !collectionSlotPlan(authority.geometry, transition.state.players, authority.primaryDetails)) {
    throw new Error("CLUB_COLLECTION_POSITION_INVALID");
  }
  // The storage operation rechecks revision, entitlement and the existing round
  // window inside one transaction. A preflight read alone cannot authorize writes.
  const persisted = await store.commit(authority.ownerId, before, transition.state, command);
  inspectClubAcquisition(persisted);
  const receipt = persisted.receipts.find(entry => entry.key === command.idempotencyKey);
  if (persisted.seasonId !== authority.seasonId || !receipt
    || receipt.playerId !== command.playerId || receipt.area !== command.area || receipt.slot !== command.slot) {
    throw new Error("CLUB_PERSISTENCE_MISMATCH");
  }
  return { state: persisted, receipt, replayed: false };
}

/** Strict input allowlist: no owner, plan, price, balance or exception accepted. */
export function parseClubAcquisitionCommand(value: unknown): ClubAcquisitionCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["playerId", "area", "slot", "expectedRevision", "idempotencyKey"].includes(key))) return null;
  if (typeof row.playerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.playerId)
    || !["starters", "reserves", "outside"].includes(String(row.area))
    || typeof row.slot !== "number" || !Number.isSafeInteger(row.slot) || row.slot < 0
    || row.slot >= ({ starters: 11, reserves: 9, outside: 15 }[row.area as "starters" | "reserves" | "outside"])
    || typeof row.expectedRevision !== "number" || !Number.isSafeInteger(row.expectedRevision) || row.expectedRevision < 0
    || typeof row.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,120}$/.test(row.idempotencyKey)) return null;
  return row as ClubAcquisitionCommand;
}
