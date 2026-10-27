import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLUB_ACQUISITION_BUDGETS } from "./club-acquisition";
import type { ClubInitialBudget } from "./club-initial-budget";

/** Read-only preflight mirrors initializer ownership guards. RPC still owns all writes. */
export async function readClubInitialBudget(
  admin: NonNullable<ReturnType<typeof createAdminClient>>, ownerId: string, seasonId: string,
): Promise<ClubInitialBudget | null> {
  const [entitlement, cards, coaches, selections] = await Promise.all([
    admin.from("touchline_fantasy_entitlements")
      .select("plan_key,current_period_start,current_period_end").eq("user_id", ownerId)
      .eq("entitlement_key", "fantasy_access").eq("status", "active").maybeSingle(),
    admin.from("touchline_card_contracts").select("id").eq("user_id", ownerId)
      .eq("status", "active").or(`season_id.eq.${seasonId},season_id.is.null`).limit(1),
    admin.from("touchline_coach_contracts").select("id").eq("user_id", ownerId)
      .eq("status", "active").limit(1),
    admin.from("touchline_fantasy_user_gameweek_selections")
      .select("user_gameweek_id,touchline_fantasy_user_gameweeks!inner(user_id,touchline_fantasy_gameweeks!inner(season_id))")
      .eq("touchline_fantasy_user_gameweeks.user_id", ownerId)
      .eq("touchline_fantasy_user_gameweeks.touchline_fantasy_gameweeks.season_id", seasonId).limit(1),
  ]);
  if ([entitlement, cards, coaches, selections].some(result => result.error)
    || [cards, coaches, selections].some(result => !Array.isArray(result.data))) {
    throw new Error("CLUB_BUDGET_UNCONFIRMED");
  }
  if (cards.data!.length || coaches.data!.length || selections.data!.length) return null;
  const value = entitlement.data;
  const plan: unknown = value?.plan_key;
  if (!value || (plan !== "beta" && plan !== "standard" && plan !== "master" && plan !== "vip")) return null;
  const now = Date.now();
  const start = value.current_period_start === null ? -Infinity : Date.parse(value.current_period_start);
  const end = value.current_period_end === null ? Infinity : Date.parse(value.current_period_end);
  if (!(start <= now && end > now)) return null;
  return { plan, balanceEur: CLUB_ACQUISITION_BUDGETS[plan] };
}
