import { CLUB_ACQUISITION_BUDGETS } from "./club-acquisition.ts";

/** A read-only entitlement allowance, not a fabricated initialized collection. */
export type ClubInitialBudget = Readonly<{
  plan: "standard" | "master" | "vip";
  balanceEur: number;
}>;

export function parseClubInitialBudget(value: unknown): ClubInitialBudget | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const plan = candidate.plan;
  if (plan !== "standard" && plan !== "master" && plan !== "vip") return null;
  return candidate.balanceEur === CLUB_ACQUISITION_BUDGETS[plan]
    ? { plan, balanceEur: CLUB_ACQUISITION_BUDGETS[plan] } : null;
}
