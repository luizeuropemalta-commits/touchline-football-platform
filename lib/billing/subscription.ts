import { createClient } from "@/lib/supabase/server";
import type { PlanKey } from "./plans";

export type SubscriptionState = {
  planKey: PlanKey | null;
  status: string | null;
  interval: "month" | "year" | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const previewState: SubscriptionState = {
  planKey: "elite_agency",
  status: "active",
  interval: "year",
  trialEnd: null,
  currentPeriodEnd: "2027-06-22T00:00:00.000Z",
  cancelAtPeriodEnd: false,
};

const adminEmails = new Set(["luizeuropemalta@gmail.com"]);
const betaFullAccess = true;

const adminState: SubscriptionState = {
  planKey: "elite_agency",
  status: "administrator",
  interval: "year",
  trialEnd: null,
  currentPeriodEnd: "2099-12-31T23:59:59.000Z",
  cancelAtPeriodEnd: false,
};

export async function getCurrentSubscription(): Promise<SubscriptionState> {
  const supabase = await createClient();
  if (!supabase) return previewState;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { planKey: null, status: null, interval: null, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  if (user.email && adminEmails.has(user.email.toLowerCase())) return adminState;

  const { data } = await supabase
    .from("billing_subscriptions")
    .select("plan_key,status,billing_interval,trial_end,current_period_end,cancel_at_period_end")
    .eq("user_id", user.id)
    .in("status", ["trialing", "active", "past_due", "unpaid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data && betaFullAccess) return { ...previewState, status: "beta_full_access" };
  if (!data) return { planKey: null, status: null, interval: null, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  return {
    planKey: data.plan_key as PlanKey,
    status: data.status,
    interval: data.billing_interval,
    trialEnd: data.trial_end,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}
