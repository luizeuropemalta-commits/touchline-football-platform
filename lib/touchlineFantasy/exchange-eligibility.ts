import { CLUB_ROSTER_CAPACITY, CLUB_ROSTER_SHOWCASE_LIMIT, validateClubRoster, type ClubRosterEntry } from "./club-roster.ts";

/** Exact approved positions; broad roles such as "attacker" are not interchangeable. */
export const EXCHANGE_POSITIONS = ["GK", "CB", "RB", "LB", "DM", "MID", "RW", "LW", "CF"] as const;
export type ExchangePosition = typeof EXCHANGE_POSITIONS[number];
export type ExchangePlayer = ClubRosterEntry & Readonly<{ position: ExchangePosition | null }>;
const approvedExchangePlans = ["beta", "standard", "master", "vip"] as const;
// All approved plans share the collection. Runtime API gates and settlement
// still authorize writes and enforce the receiving club allowlist.
const availableCollectionPlans = approvedExchangePlans;

/** Presentation prerequisite only. A complete roster NEVER authorizes proposals;
 * the unavailable transaction service must eventually validate both owners. */
export function projectExchangeReadiness(state: Readonly<{ plan: string; players: readonly ClubRosterEntry[] }> | null, confirmed: boolean) {
  const base = { requiredCount: CLUB_ROSTER_CAPACITY.total, proposalsAvailable: false as const };
  if (!confirmed || !state) return { ...base, status: "unconfirmed" as const, ownedCount: null, missingCount: null };
  if (!availableCollectionPlans.some(plan => plan === state.plan)) return { ...base, status: "plan-unavailable" as const, ownedCount: null, missingCount: null };
  if (validateClubRoster(state.players).length) return { ...base, status: "invalid" as const, ownedCount: null, missingCount: null };
  const ownedCount = state.players.length;
  return { ...base, status: ownedCount === CLUB_ROSTER_CAPACITY.total ? "complete" as const : "incomplete" as const,
    ownedCount, missingCount: CLUB_ROSTER_CAPACITY.total - ownedCount };
}
export type ExchangeAllocation = Readonly<{
  ownerId: string;
  plan: "beta" | "standard" | "master" | "vip";
  players: readonly ExchangePlayer[];
  listedIds: readonly string[];
  reservations: readonly Readonly<{ playerId: string; proposalId: string }>[];
  unavailableIds: readonly string[];
  /** Comes from the existing TouchLine Market/lineup clock, never a second timer. */
  lineupLocked: boolean;
}>;

function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

/** Count a withdrawn announcement that is still reserved by a pending proposal. */
export function assertExchangeCapacity(listedIds: readonly string[], reservedIds: readonly string[]): void {
  requireRule(new Set(listedIds).size === listedIds.length, "DUPLICATE_LISTING");
  requireRule(new Set([...listedIds, ...reservedIds]).size <= CLUB_ROSTER_SHOWCASE_LIMIT, "EMERGENCY_PLAYERS_REQUIRED");
}

/**
 * Pure validation of a server-owned snapshot, NOT proof of authentication or a DB transaction.
 * A caller must read ownership/allocation/reservations together and revalidate under its write lock.
 * Do not fabricate this allocation from catalogue cards absent from the XI.
 */
export function inspectExchangeAllocation(state: ExchangeAllocation) {
  requireRule(state.ownerId.trim().length > 0, "OWNER_REQUIRED");
  requireRule(approvedExchangePlans.some(plan => plan === state.plan), "EXCHANGE_PLAN_REQUIRED");
  // Club eligibility is revalidated against each receiving owner's approved
  // allowlist by the settlement boundary; allocation alone never authorizes it.
  requireRule(state.players.length === CLUB_ROSTER_CAPACITY.total && validateClubRoster(state.players).length === 0, "COMPLETE_ROSTER_REQUIRED");
  const byId = new Map(state.players.map(player => [player.playerId, player]));
  const outside = state.players.filter(player => player.area === "outside");
  const outsideIds = new Set(outside.map(player => player.playerId));
  requireRule(state.listedIds.every(id => outsideIds.has(id)), "RELATED_OR_FOREIGN_LISTING");
  requireRule(state.reservations.every(held => outsideIds.has(held.playerId) && held.proposalId.trim().length > 0), "INVALID_RESERVATION");
  requireRule(new Set(state.reservations.map(held => held.playerId)).size === state.reservations.length, "DUPLICATE_RESERVATION");
  requireRule(state.unavailableIds.every(id => byId.has(id)), "FOREIGN_AVAILABILITY_STATE");
  const reservedIds = state.reservations.map(held => held.playerId);
  assertExchangeCapacity(state.listedIds, reservedIds);
  const committed = new Set([...state.listedIds, ...reservedIds]);
  const freeOutsideIds = outside.filter(player => !committed.has(player.playerId)).map(player => player.playerId);
  requireRule(freeOutsideIds.length >= CLUB_ROSTER_CAPACITY.outside - CLUB_ROSTER_SHOWCASE_LIMIT, "EMERGENCY_PLAYERS_REQUIRED");
  return { byId, freeOutsideIds };
}

/** User chooses publicity explicitly; withdrawing never silently cancels a reservation. */
export function changeAllocatedListing(state: ExchangeAllocation, playerId: string, publish: boolean): ExchangeAllocation {
  inspectExchangeAllocation(state);
  if (!publish) return { ...state, listedIds: state.listedIds.filter(id => id !== playerId) };
  requireRule(!state.unavailableIds.includes(playerId), "PLAYER_UNAVAILABLE");
  requireRule(!state.reservations.some(held => held.playerId === playerId), "PLAYER_RESERVED");
  const next = { ...state, listedIds: state.listedIds.includes(playerId) ? state.listedIds : [...state.listedIds, playerId] };
  inspectExchangeAllocation(next);
  return next;
}

/**
 * Exchange stays available during the existing lineup lock. Both sides must be outside
 * the match and same-position. An existing proposal ID must be verified by the server;
 * it permits its own held cards, never somebody else's reservation.
 */
export function validateExchangePair(
  sender: ExchangeAllocation, receiver: ExchangeAllocation,
  outgoingId: string, incomingId: string, existingProposalId?: string,
) {
  requireRule(sender.ownerId !== receiver.ownerId, "SELF_EXCHANGE_FORBIDDEN");
  const own = inspectExchangeAllocation(sender);
  const other = inspectExchangeAllocation(receiver);
  requireRule((sender.plan === "beta") === (receiver.plan === "beta"), "CLUB_BETA_EXCHANGE_ONLY");
  const outgoing = own.byId.get(outgoingId);
  const incoming = other.byId.get(incomingId);
  requireRule(outgoing && incoming, "OWNERSHIP_REQUIRED");
  requireRule(outgoing.area === "outside" && incoming.area === "outside", "MATCH_RELATED_PLAYER");
  requireRule(!own.byId.has(incomingId) && !other.byId.has(outgoingId), "ALREADY_OWNED");
  requireRule(outgoing.position !== null && EXCHANGE_POSITIONS.includes(outgoing.position)
    && outgoing.position === incoming.position, "SAME_POSITION_REQUIRED");
  for (const [state, playerId] of [[sender, outgoingId], [receiver, incomingId]] as const) {
    requireRule(!state.unavailableIds.includes(playerId), "PLAYER_UNAVAILABLE");
    const held = state.reservations.find(item => item.playerId === playerId);
    if (existingProposalId !== undefined) {
      requireRule(held?.proposalId === existingProposalId, "PROPOSAL_RESERVATION_REQUIRED");
    } else {
      requireRule(!held, "PLAYER_RESERVED");
      requireRule(state.listedIds.includes(playerId), "PLAYER_NOT_LISTED");
    }
  }
  // New arrivals retain the outgoing outside-match slot. Never insert directly into the XI.
  return {
    outgoing, incoming,
    senderReceipt: { ...outgoing, playerId: incoming.playerId, position: incoming.position },
    receiverReceipt: { ...incoming, playerId: outgoing.playerId, position: outgoing.position },
    senderCanEditLineup: !sender.lineupLocked,
    receiverCanEditLineup: !receiver.lineupLocked,
  };
}
