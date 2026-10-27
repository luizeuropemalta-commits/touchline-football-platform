import { CLUB_ROSTER_CAPACITY, validateClubRoster, type ClubRosterEntry } from "./club-roster.ts";
import { type ExchangePosition } from "./exchange-eligibility.ts";
import { CLUB_PLANS, inspectClubQuota } from "./club-market-rules.ts";

/** New full-collection economy; never substitute these values into an old locked XI. */
export const CLUB_ACQUISITION_BUDGETS = Object.freeze({ beta: CLUB_PLANS.beta.budget, standard: CLUB_PLANS.standard.budget, master: CLUB_PLANS.master.budget, vip: CLUB_PLANS.vip.budget });
export const CLUB_COACH_VALUES = Object.freeze({ "ruby-red": 5_000_000, "sapphire-blue": 10_000_000, "amethyst-purple": 15_000_000, "radiant-gold": 25_000_000, "emerald-green": 35_000_000, "clear-diamond": 50_000_000, "diamond-gold": 70_000_000 });
type Plan = keyof typeof CLUB_ACQUISITION_BUDGETS;
type CoachTier = keyof typeof CLUB_COACH_VALUES;
/** New collection policy; legacy round quotas remain untouched. */
export const CLUB_POSITION_LIMITS = Object.freeze({ GK: 3, CB: 6, RB: 3, LB: 3, DM: 5, MID: 5, RW: 3, LW: 3, CF: 4 });
type Position = ExchangePosition;
export type ClubOwnedPlayer = ClubRosterEntry & Readonly<{ valueEur: number; position: Position; clubId: string;
  /** Recorded for new contracts; legacy contracts are resolved without rewriting them. */
  primaryDetail?: string;
}>;
export type ClubAcquisitionState = Readonly<{
  revision: number;
  seasonId: string;
  plan: Plan;
  /** Verified plan credit allocation, not legacy purchased TC. */
  balanceEur: number;
  /** Explicit vacancy is valid after an authorized release; omitted is never a vacancy. */
  coach: Readonly<{ id: string; tier: CoachTier; valueEur: number }> | null;
  formationCode?: string;
  players: readonly ClubOwnedPlayer[];
  receipts: readonly Readonly<{ key: string; playerId: string; area: ClubRosterEntry["area"]; slot: number; valueEur: number; revision: number }>[];
}>;
export type ClubAcquisitionCommand = Readonly<{
  playerId: string; area: ClubRosterEntry["area"]; slot: number; expectedRevision: number; idempotencyKey: string;
}>;
export type PublishedClubOffer = Readonly<{
  playerId: string; clubId: string; position: Position; valueEur: number; published: boolean; primaryDetail?: string;
}>;
function ensure(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
const money = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Validates a trusted persisted snapshot, never a request-supplied wallet. */
export function inspectClubAcquisition(state: ClubAcquisitionState) {
  ensure(Object.hasOwn(CLUB_ACQUISITION_BUDGETS, state.plan), "CLUB_PLAN_INVALID");
  ensure(Number.isSafeInteger(state.revision) && state.revision >= 0, "CLUB_REVISION_INVALID");
  ensure(money(state.balanceEur), "CLUB_BALANCE_INVALID");
  ensure(state.formationCode === undefined || /^[0-9]+(?:-[0-9]+){1,4}$/.test(state.formationCode), "CLUB_FORMATION_INVALID");
  ensure(Object.hasOwn(state, "coach") && state.coach !== undefined, "CLUB_COACH_INVALID");
  if (state.coach !== null) {
    ensure(typeof state.coach === "object" && !Array.isArray(state.coach)
      && typeof state.coach.id === "string" && state.coach.id.trim()
      && Object.hasOwn(CLUB_COACH_VALUES, state.coach.tier)
      && state.coach.valueEur === CLUB_COACH_VALUES[state.coach.tier], "CLUB_COACH_INVALID");
  }
  ensure(validateClubRoster(state.players).length === 0, "CLUB_ROSTER_INVALID");
  inspectClubQuota(state.players, state.plan, state.seasonId);
  const counts = new Map<Position, number>();
  for (const player of state.players) {
    ensure(player.clubId && money(player.valueEur) && player.valueEur > 0
      && Object.hasOwn(CLUB_POSITION_LIMITS, player.position), "CLUB_PLAYER_INVALID");
    counts.set(player.position, (counts.get(player.position) ?? 0) + 1);
    ensure(counts.get(player.position)! <= CLUB_POSITION_LIMITS[player.position], "CLUB_POSITION_FULL");
  }
  ensure(new Set(state.receipts.map(r => r.key)).size === state.receipts.length
    && state.receipts.every(r => /^[a-zA-Z0-9_-]{8,120}$/.test(r.key)
      && r.playerId && money(r.valueEur) && r.valueEur > 0
      && Number.isSafeInteger(r.revision) && r.revision > 0 && r.revision <= state.revision
      && validateClubRoster([{ playerId: r.playerId, area: r.area, slot: r.slot }]).length === 0), "CLUB_RECEIPTS_INVALID");
  return { counts, vacantCount: CLUB_ROSTER_CAPACITY.total - state.players.length };
}

/**
 * Pure acquisition transition for a server-owned snapshot. Persistence must compare
 * revision and commit both wallet and contract in one transaction. This function
 * does not establish ownership, authenticity, persistence or a client-side wallet.
 */
export function acquireClubPlayer(state: ClubAcquisitionState, command: ClubAcquisitionCommand,
  context: Readonly<{ marketOpen: boolean; offer: PublishedClubOffer | null; allowedClubIds: readonly string[] | null }>) {
  inspectClubAcquisition(state);
  ensure(state.plan !== "beta" || context.allowedClubIds !== null, "CLUB_ALLOWLIST_REQUIRED");
  ensure(/^[a-zA-Z0-9_-]{8,120}$/.test(command.idempotencyKey), "CLUB_IDEMPOTENCY_INVALID");
  const prior = state.receipts.find(r => r.key === command.idempotencyKey);
  if (prior) {
    ensure(prior.playerId === command.playerId && prior.area === command.area && prior.slot === command.slot, "CLUB_IDEMPOTENCY_CONFLICT");
    // Retried completed purchases are readbacks, even after the window closes.
    return { state, receipt: prior, replayed: true };
  }
  ensure(command.expectedRevision === state.revision, "CLUB_STALE_REVISION");
  ensure(context.marketOpen, "CLUB_MARKET_CLOSED");
  ensure(state.players.length < CLUB_ROSTER_CAPACITY.total, "CLUB_ROSTER_FULL");
  ensure(!state.players.some(p => p.playerId === command.playerId), "CLUB_ALREADY_OWNED");
  ensure(!state.players.some(p => p.area === command.area && p.slot === command.slot), "CLUB_SLOT_OCCUPIED");
  const offer = context.offer;
  ensure(offer?.published && offer.playerId === command.playerId, "CLUB_OFFER_UNAVAILABLE");
  ensure(context.allowedClubIds === null || context.allowedClubIds.includes(offer.clubId), "CLUB_CLUB_NOT_ALLOWED");
  ensure(money(offer.valueEur) && offer.valueEur > 0, "CLUB_PRICE_INVALID");
  ensure(state.balanceEur >= offer.valueEur, "CLUB_INSUFFICIENT_BALANCE");
  ensure(state.revision < Number.MAX_SAFE_INTEGER, "CLUB_REVISION_INVALID");
  const receipt = { key: command.idempotencyKey, playerId: offer.playerId, area: command.area, slot: command.slot, valueEur: offer.valueEur, revision: state.revision + 1 };
  const next: ClubAcquisitionState = { ...state, revision: receipt.revision,
    balanceEur: state.balanceEur - offer.valueEur,
    players: [...state.players, { playerId: offer.playerId, clubId: offer.clubId, position: offer.position, valueEur: offer.valueEur, area: command.area, slot: command.slot,
      ...(offer.primaryDetail === undefined ? {} : { primaryDetail: offer.primaryDetail }) }],
    receipts: [...state.receipts, receipt],
  };
  inspectClubAcquisition(next);
  return { state: next, receipt, replayed: false };
}
