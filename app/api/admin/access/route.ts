import { NextResponse } from "next/server";
import { isOwnerEmail, ownerGrantSubscriptionId } from "@/lib/admin/owner";
import { isPlanKey, type BillingInterval } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AccessBody = {
  userId?: string;
  action?: "grant" | "revoke";
  planKey?: string;
  interval?: BillingInterval;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerEmail(user?.email)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

  const body = (await request.json()) as AccessBody;
  const userId = body.userId?.trim();
  if (!userId) return NextResponse.json({ error: "User ID is required." }, { status: 400 });

  const { data: target, error: targetError } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const subscriptionId = ownerGrantSubscriptionId(userId);
  const now = new Date();

  if (body.action === "revoke") {
    const { error } = await admin
      .from("billing_subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: false,
        canceled_at: now.toISOString(),
        ended_at: now.toISOString(),
        metadata: {
          source: "owner_panel",
          revoked_by: user!.id,
          revoked_at: now.toISOString(),
        },
      })
      .eq("stripe_subscription_id", subscriptionId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "grant") return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });

  const planKey = body.planKey && isPlanKey(body.planKey) ? body.planKey : "elite_agency";
  const interval: BillingInterval = body.interval === "month" ? "month" : "year";
  const currentPeriodEnd = new Date(Date.UTC(2099, 11, 31, 23, 59, 59)).toISOString();

  const { error } = await admin.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: `owner_grant_customer_${userId}`,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: `owner_grant_${planKey}_${interval}`,
      plan_key: planKey,
      billing_interval: interval,
      status: "active",
      quantity: 1,
      current_period_start: now.toISOString(),
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: false,
      canceled_at: null,
      ended_at: null,
      metadata: {
        source: "owner_panel",
        granted_by: user!.id,
        granted_at: now.toISOString(),
      },
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

