import { CLUB_POSITION_LIMITS } from "./club-acquisition.ts";

type Position = keyof typeof CLUB_POSITION_LIMITS;
type Player = Readonly<{ playerId: string; position: Position }>;
export type AffordabilityInput = Readonly<{
  verificationStatus: "confirmed" | "pending" | "unavailable";
  state: Readonly<{ seasonId: string; revision: number; balanceEur: number; coach: { id: string } | null; players: readonly Player[] }> | null;
  catalogue: Readonly<{
    /** Must cover the entire candidate universe, not a page/club/filter result.
     * No production adapter currently establishes this proof. Never synthesize it. */
    proof: Readonly<{ complete: true; verified: true; seasonId: string; collectionRevision: number; observedAtMs: number; validUntilMs: number }> | null;
    offers: readonly Readonly<Player & { price: number; priceState: "verified" | "provisional"; positionVerified: boolean }>[];
  }> | null;
  nowMs: number;
}>;
type Result = { status: "indeterminate"; reason: string } | {
  status: "insufficient" | "lower-bound-only" | "complete";
  minimumCost: number; shortfall: number; missing: Record<Position, number>;
  guaranteed: false;
};

/** Pure advisory lower bound. Broad positions intentionally relax tactical,
 * reservation and allocation constraints. Fitting the bound never proves feasibility.
 * Confirmed wallet already includes coach debit; do not charge the coach again. */
export function clubBudgetAffordability(input: AffordabilityInput): Result {
  const unknown = (reason: string): Result => ({ status: "indeterminate", reason });
  const { state, catalogue, nowMs } = input;
  if (input.verificationStatus !== "confirmed" || !state) return unknown("snapshot-unconfirmed");
  if (!state.coach?.id) return unknown("coach-unconfirmed");
  if (!state.seasonId || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !Number.isSafeInteger(state.balanceEur) || state.balanceEur < 0) return unknown("snapshot-invalid");
  const proof = catalogue?.proof;
  if (!catalogue || !proof || proof.complete !== true || proof.verified !== true
    || proof.seasonId !== state.seasonId || proof.collectionRevision !== state.revision
    || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(proof.observedAtMs) || !Number.isSafeInteger(proof.validUntilMs)
    || proof.observedAtMs > nowMs || nowMs > proof.validUntilMs || proof.observedAtMs < 0) return unknown("catalogue-unproven");
  const missing = { ...CLUB_POSITION_LIMITS };
  const owned = new Set<string>();
  for (const player of state.players) {
    if (!player.playerId || owned.has(player.playerId) || !Object.hasOwn(missing, player.position)) return unknown("snapshot-invalid");
    owned.add(player.playerId);
    if (--missing[player.position] < 0) return unknown("snapshot-invalid");
  }
  const prices: Record<Position, number[]> = { GK: [], CB: [], RB: [], LB: [], DM: [], MID: [], RW: [], LW: [], CF: [] };
  const ids = new Set<string>();
  for (const offer of catalogue.offers) {
    // Reject incomplete pricing rather than discard a possibly cheaper offer.
    if (!offer.playerId || ids.has(offer.playerId) || !Object.hasOwn(missing, offer.position)
      || offer.positionVerified !== true || offer.priceState !== "verified"
      || !Number.isSafeInteger(offer.price) || offer.price <= 0) return unknown("catalogue-invalid");
    ids.add(offer.playerId);
    if (!owned.has(offer.playerId)) prices[offer.position].push(offer.price);
  }
  let minimumCost = 0, vacancies = 0;
  for (const position of Object.keys(missing) as Position[]) {
    const count = missing[position];
    vacancies += count;
    if (prices[position].length < count) return unknown("verified-offers-missing");
    prices[position].sort((a, b) => a - b);
    minimumCost += prices[position].slice(0, count).reduce((sum, price) => sum + price, 0);
    if (!Number.isSafeInteger(minimumCost)) return unknown("cost-overflow");
  }
  return { status: vacancies === 0 ? "complete" : minimumCost > state.balanceEur ? "insufficient" : "lower-bound-only",
    minimumCost, shortfall: Math.max(0, minimumCost - state.balanceEur), missing, guaranteed: false };
}
