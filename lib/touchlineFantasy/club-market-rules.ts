// Collection funding is distinct from the historical XI valuation budget.
export const CLUB_COLLECTION_BUDGET_VERSION = "2026-10-20-approved-plan-budgets";
/** Approved 17 Oct 2026 rules. Pure domain code; never authorizes a payment or trusts client balances. */
export const CLUB_MARKET_RULES_VERSION = "2026-10-18-release-ten-percent";
export const CLUB_PLANS = Object.freeze({
  beta: { budget: 100_000_000, exchange: null, market: 10, topUpCents: null },
  standard: { budget: 750_000_000, exchange: 5, market: 10, topUpCents: 1000 },
  master: { budget: 1_500_000_000, exchange: 4, market: 10, topUpCents: 800 },
  vip: { budget: 3_000_000_000, exchange: 2, market: 10, topUpCents: 600 },
} as const);
export type ClubPlan = keyof typeof CLUB_PLANS;
export const CLUB_TOP_UP_CREDITS = 100_000_000;
export const CLUB_SEASON_TOP_UP_LIMIT = 200_000_000;
export const CLUB_LOW_BALANCE_THRESHOLD = 1_000_000;

export function assertClubRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export function assertCredits(...values: number[]) {
  assertClubRule(values.every(v => Number.isSafeInteger(v) && v >= 0), "CLUB_CREDITS_INVALID");
}
export function checkedCredits(value: bigint) {
  assertClubRule(value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER), "CLUB_CREDITS_OVERFLOW");
  return Number(value);
}
function policy(plan: ClubPlan) {
  assertClubRule(Object.hasOwn(CLUB_PLANS, plan), "CLUB_PLAN_INVALID");
  return CLUB_PLANS[plan];
}
export function creditPercentage(value: number, rate: number) {
  assertCredits(value, rate);
  // Existing integer-credit half-up rounding, never floating-point wallet arithmetic.
  return checkedCredits((BigInt(value) * BigInt(rate) + BigInt(50)) / BigInt(100));
}

/** The base remains the proposing owner's outgoing card, as in the existing quote. */
export function quoteClubExchange(outgoing: number, incoming: number, proposerPlan: ClubPlan) {
  assertCredits(outgoing, incoming);
  const rate = policy(proposerPlan).exchange;
  assertClubRule(rate !== null, "CLUB_EXCHANGE_PAID_PLAN_REQUIRED");
  const fee = creditPercentage(outgoing, rate);
  // Half-credit bonuses are not silently rounded into an unapproved distribution.
  assertClubRule(fee % 2 === 0, "CLUB_EXCHANGE_HALF_CREDIT_UNSUPPORTED");
  const bonus = fee / 2;
  const compensation = checkedCredits(BigInt(outgoing) - BigInt(incoming));
  return { rate, fee, bonus, retired: fee - bonus, compensation,
    proposerDelta: checkedCredits(BigInt(compensation) - BigInt(fee)),
    accepterDelta: checkedCredits(-BigInt(compensation) + BigInt(bonus)) };
}

export type ClubReturnReason = "ordinary" | "injury" | "suspension" | "same-league-transfer" | "left-league";
export function quoteClubReturn(paidCredits: number, plan: ClubPlan, reason: ClubReturnReason,
  confirmedLeagueExit = false) {
  assertCredits(paidCredits);
  assertClubRule(["ordinary", "injury", "suspension", "same-league-transfer", "left-league"].includes(reason), "CLUB_RETURN_REASON_INVALID");
  assertClubRule(reason !== "left-league" || confirmedLeagueExit, "CLUB_TRANSFER_CONFIRMATION_REQUIRED");
  const rate = reason === "left-league" ? 0 : policy(plan).market;
  policy(plan);
  const fee = creditPercentage(paidCredits, rate);
  return { rate, fee, refund: paidCredits - fee };
}

/** Season calendar is server-confirmed: do not infer the final whistle from a scheduled end. */
export type ClubSeason = Readonly<{ id: string; opensAt: number; endsAt: number; dataReady: boolean }>;
export function clubSeasonOpen(season: ClubSeason, now: number) {
  assertClubRule(season.id.trim() && Number.isFinite(season.opensAt) && Number.isFinite(season.endsAt)
    && season.opensAt < season.endsAt && Number.isFinite(now), "CLUB_SEASON_INVALID");
  return season.dataReady && now >= season.opensAt && now < season.endsAt;
}
export function clubMarketAccess(season: ClubSeason, now: number, existingLineupLocked: boolean) {
  const open = clubSeasonOpen(season, now);
  return { exchangeOpen: open, touchlineMarketOpen: open && !existingLineupLocked,
    lineupEditable: open && !existingLineupLocked };
}
export function quoteClubTopUp(input: Readonly<{ plan: ClubPlan; balance: number; seasonPurchased: number;
  season: ClubSeason; now: number }>) {
  assertCredits(input.balance, input.seasonPurchased);
  const priceCents = policy(input.plan).topUpCents;
  assertClubRule(priceCents !== null, "CLUB_TOP_UP_PAID_PLAN_REQUIRED");
  assertClubRule(clubSeasonOpen(input.season, input.now), "CLUB_SEASON_CLOSED");
  assertClubRule(input.balance === 0, "CLUB_TOP_UP_BALANCE_NOT_EXHAUSTED");
  assertClubRule(input.seasonPurchased % CLUB_TOP_UP_CREDITS === 0, "CLUB_TOP_UP_HISTORY_INVALID");
  assertClubRule(input.seasonPurchased <= CLUB_SEASON_TOP_UP_LIMIT - CLUB_TOP_UP_CREDITS, "CLUB_FAIR_PLAY_LIMIT");
  return { priceCents, credits: CLUB_TOP_UP_CREDITS, seasonId: input.season.id,
    expiresAt: input.season.endsAt, requiresExplicitConfirmation: true as const };
}
export function clubLowBalance(balance: number) {
  assertCredits(balance);
  return balance <= CLUB_LOW_BALANCE_THRESHOLD;
}

export type ClubQuotaPlayer = Readonly<{ playerId: string; clubId: string }>;
/** Identity validation remains mandatory. Real-club membership has no quantity cap. */
export function inspectClubQuota(players: readonly ClubQuotaPlayer[], plan: ClubPlan, seasonId: string) {
  policy(plan);
  assertClubRule(seasonId.trim(), "CLUB_SEASON_REQUIRED");
  assertClubRule(new Set(players.map(p => p.playerId)).size === players.length, "CLUB_DUPLICATE_PLAYER");
  const normal = new Map<string, number>();
  for (const p of players) {
    assertClubRule(p.playerId.trim() && p.clubId.trim(), "CLUB_PLAYER_IDENTITY_REQUIRED");
    normal.set(p.clubId, (normal.get(p.clubId) ?? 0) + 1);
  }
  return normal;
}

/** Confirmed same-league event only. League exits use a separate refund transaction. */
export function applyClubTransfer<T extends ClubQuotaPlayer>(players: readonly T[], plan: ClubPlan, seasonId: string,
  event: Readonly<{ id: string; playerId: string; fromClubId: string; toClubId: string; confirmed: boolean }>) {
  inspectClubQuota(players, plan, seasonId);
  assertClubRule(event.confirmed && event.id.trim() && event.toClubId.trim()
    && event.fromClubId !== event.toClubId, "CLUB_TRANSFER_CONFIRMATION_REQUIRED");
  const owned = players.find(p => p.playerId === event.playerId);
  assertClubRule(owned && owned.clubId === event.fromClubId, "CLUB_TRANSFER_OWNERSHIP_MISMATCH");
  const next = players.map(p => {
    if (p.playerId !== owned.playerId) return p;
    const { transferException: previousException, ...retained } = p as T & { transferException?: unknown };
    void previousException;
    return { ...retained, clubId: event.toClubId };
  });
  inspectClubQuota(next, plan, seasonId);
  return next;
}

/** Strip retired exception metadata when exchanging ownership. */
export function replaceClubQuotaPlayer<T extends ClubQuotaPlayer>(players: readonly T[], outgoingId: string,
  incoming: T, plan: ClubPlan, seasonId: string) {
  inspectClubQuota(players, plan, seasonId);
  assertClubRule(players.some(p => p.playerId === outgoingId), "CLUB_OWNERSHIP_REQUIRED");
  assertClubRule(!players.some(p => p.playerId === incoming.playerId), "CLUB_ALREADY_OWNED");
  const { transferException: previousException, ...acquired } = incoming as T & { transferException?: unknown };
  void previousException;
  const next = players.map(p => p.playerId === outgoingId ? acquired : p);
  inspectClubQuota(next, plan, seasonId);
  return next;
}
