export const TOUCHLINE_FANTASY_BETA_BUDGET_EUR = 50_000_000;
export const TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS = Object.freeze([
  "22",
  "117",
  "116",
  "52",
] as const);

const PLAN_KEYS = ["beta", "standard", "pro", "master", "vip"] as const;

export type TouchlineFantasyMarketPlanKey = typeof PLAN_KEYS[number];

export type TouchlineFantasyMarketAccess = Readonly<{
  planKey: TouchlineFantasyMarketPlanKey;
  budgetEur: number | null;
  allowedClubTeamIds: readonly string[] | null;
}>;

function normalizedTeamId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value.trim())) return null;
  return value.trim();
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isTouchlineFantasyMarketAccess(value: unknown): value is TouchlineFantasyMarketAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const access = value as Partial<TouchlineFantasyMarketAccess>;
  if (!PLAN_KEYS.includes(access.planKey as TouchlineFantasyMarketPlanKey)) return false;
  if (access.planKey === "vip") return access.budgetEur === null && access.allowedClubTeamIds === null;
  if (!isPositiveSafeInteger(access.budgetEur)) return false;
  if (access.planKey !== "beta") return access.allowedClubTeamIds === null;
  return access.budgetEur === TOUCHLINE_FANTASY_BETA_BUDGET_EUR
    && Array.isArray(access.allowedClubTeamIds)
    && access.allowedClubTeamIds.length === TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS.length
    && access.allowedClubTeamIds.every((teamId, index) => teamId === TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS[index]);
}

export function isTouchlineFantasyMarketClubAllowed(access: unknown, teamId: unknown) {
  if (!isTouchlineFantasyMarketAccess(access)) return false;
  if (access.allowedClubTeamIds === null) return true;
  const canonicalTeamId = normalizedTeamId(teamId);
  return canonicalTeamId !== null && access.allowedClubTeamIds.includes(canonicalTeamId);
}

/** Resolve only the server-read plan entitlement. */
export function resolveTouchlineFantasyMarketAccess(
  planKey: unknown,
): TouchlineFantasyMarketAccess | null {
  if (planKey === null || planKey === undefined) return null;
  if (typeof planKey !== "string" || !PLAN_KEYS.includes(planKey as TouchlineFantasyMarketPlanKey)) return null;
  if (planKey === "beta") {
    return {
      planKey,
      budgetEur: TOUCHLINE_FANTASY_BETA_BUDGET_EUR,
      allowedClubTeamIds: TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS,
    };
  }
  const budgetEur = planKey === "standard" ? 500_000_000
    : planKey === "pro" ? 1_000_000_000
    : planKey === "master" ? 2_000_000_000
    : planKey === "vip" ? null : null;
  if (budgetEur === null && planKey !== "vip") return null;
  return { planKey: planKey as TouchlineFantasyMarketPlanKey, budgetEur, allowedClubTeamIds: null };
}
