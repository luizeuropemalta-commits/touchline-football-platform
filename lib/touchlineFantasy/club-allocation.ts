import type { TouchlineFormationGeometry } from "../touchlineArena/formation-geometry.ts";
import { inspectClubAcquisition, type ClubAcquisitionState, type ClubOwnedPlayer } from "./club-acquisition.ts";
import { relocateClubPlayer, type ClubRosterArea } from "./club-roster.ts";
import { ownedClubPrimaryDetail, type ClubPrimaryPositionIndex } from "./club-primary-position-index.ts";
import { primaryPositionFitsTacticalSlot } from "./club-primary-position-policy.ts";
import { CLUB_RESERVE_POSITIONS, collectionSlotPlan } from "./club-position-plan.ts";
export type ClubAllocationCommand = Readonly<{ expectedRevision: number; idempotencyKey: string }> & (
  Readonly<{ action: "formation"; formationCode: string }> |
  Readonly<{ action: "move"; playerId: string; area: ClubRosterArea; slot: number }>
);
function ensure(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }

export function parseClubAllocationCommand(input: unknown): ClubAllocationCommand | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  const keys = v.action === "formation" ? ["action","formationCode","expectedRevision","idempotencyKey"]
    : v.action === "move" ? ["action","playerId","area","slot","expectedRevision","idempotencyKey"] : [];
  if (!keys.length || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))
    || !Number.isSafeInteger(v.expectedRevision) || Number(v.expectedRevision) < 0
    || typeof v.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,120}$/.test(v.idempotencyKey)) return null;
  if (v.action === "formation") return typeof v.formationCode === "string" && /^[0-9]+(?:-[0-9]+){1,4}$/.test(v.formationCode)
    ? v as ClubAllocationCommand : null;
  if (typeof v.playerId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v.playerId)
    || !["starters","reserves","outside"].includes(String(v.area)) || !Number.isInteger(v.slot)
    || Number(v.slot) < 0 || Number(v.slot) >= ({ starters: 11, reserves: 9, outside: 15 }[v.area as ClubRosterArea])) return null;
  return v as ClubAllocationCommand;
}

export function clubStarterSelections(state: ClubAcquisitionState, geometry: TouchlineFormationGeometry,
  primaryDetails?: ClubPrimaryPositionIndex) {
  ensure(state.formationCode === geometry.formationCode && geometry.slots.length === 11, "CLUB_FORMATION_INVALID");
  return state.players.filter(p => p.area === "starters").sort((a,b) => a.slot-b.slot).map(p => {
    const slot = geometry.slots[p.slot];
    const detail = ownedClubPrimaryDetail(p, primaryDetails);
    ensure(detail, "CLUB_PRIMARY_POSITION_UNCONFIRMED");
    ensure(slot && primaryPositionFitsTacticalSlot(detail, geometry.formationCode, slot.id), "CLUB_SLOT_POSITION_INVALID");
    return { playerId: p.playerId, slotId: slot.id };
  });
}

/** Read-only placement preview; actual allocation rechecks ownership, locks and revision on the server. */
export function clubStarterDestinations(state: ClubAcquisitionState, playerId: string, geometry: TouchlineFormationGeometry,
  primaryDetails?: ClubPrimaryPositionIndex) {
  const source = state.players.find(player => player.playerId === playerId);
  if (!source || source.area === "starters") return [];
  return geometry.slots.flatMap((position, slot) => {
    try {
      allocateClubPlayers(state, { action: "move", playerId, area: "starters", slot,
        expectedRevision: state.revision, idempotencyKey: "placement_preview" },
      { marketOpen: true, geometry, reservedIds: [], primaryDetails });
      return [{ slot, position: position.id, displacedPlayerId: state.players.find(player => player.area === "starters" && player.slot === slot)?.playerId ?? null }];
    } catch { return []; }
  });
}

/** Changes allocation, never ownership or cash. Proposal reservations come from trusted storage. */
export function allocateClubPlayers(state: ClubAcquisitionState, command: ClubAllocationCommand,
  context: Readonly<{ marketOpen: boolean; geometry: TouchlineFormationGeometry; reservedIds: readonly string[];
    primaryDetails?: ClubPrimaryPositionIndex }>): ClubAcquisitionState {
  inspectClubAcquisition(state);
  ensure(command.expectedRevision === state.revision, "CLUB_STALE_REVISION");
  ensure(context.marketOpen, "CLUB_MARKET_CLOSED");
  ensure(state.revision < Number.MAX_SAFE_INTEGER, "CLUB_REVISION_INVALID");
  let players: readonly ClubOwnedPlayer[] = state.players;
  const formationCode = command.action === "formation" ? command.formationCode : state.formationCode;
  ensure(formationCode === context.geometry.formationCode, "CLUB_FORMATION_INVALID");
  const detailOf = (player: ClubOwnedPlayer) => ownedClubPrimaryDetail(player, context.primaryDetails);
  ensure(players.every(player => detailOf(player)), "CLUB_PRIMARY_POSITION_UNCONFIRMED");
  const fits = (player: ClubOwnedPlayer, slot: TouchlineFormationGeometry["slots"][number]) =>
    primaryPositionFitsTacticalSlot(detailOf(player), context.geometry.formationCode, slot.id);
  if (command.action === "move") {
    const source = players.find(p => p.playerId === command.playerId);
    const destination = players.find(p => p.area === command.area && p.slot === command.slot);
    ensure(source && !context.reservedIds.includes(source.playerId)
      && (!destination || !context.reservedIds.includes(destination.playerId)), "CLUB_PLAYER_RESERVED_OR_MISSING");
    const moved = relocateClubPlayer(players, command.playerId, command.area, command.slot);
    ensure(moved, "CLUB_ROSTER_INVALID");
    players = moved.map(p => ({ ...state.players.find(owned => owned.playerId === p.playerId)!, ...p }));
  } else {
    // Preserve ownership even at 35: a displaced starter can exchange places
    // with a compatible outside/reserve card, without requiring a sale.
    // Maximum matching avoids consuming a restricted role with a flexible player
    // merely because the persisted array happened to list that player first.
    const bySlot = new Map<number, ClubOwnedPlayer>();
    const candidates = (player: ClubOwnedPlayer) => context.geometry.slots.flatMap((slot,index) =>
      fits(player,slot) && (!context.reservedIds.includes(player.playerId) || index === player.slot) ? [index] : [])
      .sort((a,b) => Number(b === player.slot)-Number(a === player.slot));
    const assignStarter = (player: ClubOwnedPlayer, seen: Set<number>): boolean => {
      for (const index of candidates(player)) {
        if (seen.has(index)) continue;
        seen.add(index);
        const occupant = bySlot.get(index);
        if (!occupant || !context.reservedIds.includes(occupant.playerId) && assignStarter(occupant,seen)) {
          bySlot.set(index,player); return true;
        }
      }
      return false;
    };
    const starters = players.filter(player => player.area === "starters");
    for (const player of [...starters].sort((a,b) => Number(context.reservedIds.includes(b.playerId))-Number(context.reservedIds.includes(a.playerId))
      || candidates(a).length-candidates(b).length)) assignStarter(player,new Set());
    const assigned = new Set(bySlot.keys());
    const assignedPlayer = new Map([...bySlot].map(([slot,player]) => [player.playerId,slot]));
    const outside = new Set(players.filter(p => p.area === "outside").map(p => p.slot));
    const reserves = new Set(players.filter(p => p.area === "reserves").map(p => p.slot));
    const displaced: ClubOwnedPlayer[] = [];
    const nextPlayers = players.map(p => {
      if (p.area !== "starters") return { ...p };
      const slot = assignedPlayer.get(p.playerId);
      if (slot !== undefined) return { ...p, slot };
      displaced.push(p); return { ...p };
    });
    const promoted = new Set<string>();
    for (const p of displaced) {
      const target = nextPlayers.find(entry => entry.playerId === p.playerId)!;
      const free = Array.from({length:15},(_,i) => i).find(i => !outside.has(i));
      if (free !== undefined) { outside.add(free); target.area="outside";target.slot=free;continue; }
      const bench = Array.from({length:9},(_,i) => i).find(i => !reserves.has(i) && CLUB_RESERVE_POSITIONS[i] === p.position);
      if (bench !== undefined) { reserves.add(bench); target.area="reserves";target.slot=bench;continue; }
      const replacement = [...players.filter(entry=>entry.area==="outside"),...players.filter(entry=>entry.area==="reserves")]
        .find(entry=>!promoted.has(entry.playerId)&&!context.reservedIds.includes(entry.playerId)
          && (entry.area !== "reserves" || CLUB_RESERVE_POSITIONS[entry.slot] === p.position)
          &&context.geometry.slots.some((s,i)=>!assigned.has(i)&&fits(entry,s)));
      ensure(replacement, "CLUB_FORMATION_REQUIRES_COMPATIBLE_PLAYER");
      const replacementSlot=context.geometry.slots.findIndex((s,i)=>!assigned.has(i)&&fits(replacement,s));
      assigned.add(replacementSlot);promoted.add(replacement.playerId);
      target.area=replacement.area;target.slot=replacement.slot;
      const incoming=nextPlayers.find(entry=>entry.playerId===replacement.playerId)!;
      incoming.area="starters";incoming.slot=replacementSlot;
    }
    players=nextPlayers;
  }
  const next = { ...state, formationCode, players, revision: state.revision+1 };
  ensure(state.players.every(before => !context.reservedIds.includes(before.playerId)
    || next.players.some(after => after.playerId === before.playerId && after.area === before.area && after.slot === before.slot)),
  "CLUB_PLAYER_RESERVED_OR_MISSING");
  inspectClubAcquisition(next);
  clubStarterSelections(next, context.geometry, context.primaryDetails);
  ensure(collectionSlotPlan(context.geometry, next.players, context.primaryDetails), "CLUB_COLLECTION_POSITION_INVALID");
  return next;
}
