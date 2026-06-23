import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, getPriceId, getStripe } from "@/lib/billing/stripe";
import { isPlanKey, planMap } from "@/lib/billing/plans";
import { readJsonObject } from "@/lib/server/request";

const requestSchema = z.object({
  planKey: z.string(),
  interval: z.enum(["month", "year"]),
});

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const supabase = await createClient();
    const admin = createAdminClient();
    if (!stripe || !supabase || !admin) {
      return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const json = await readJsonObject(request);
    if (!json.ok) return json.response;

    const parsed = requestSchema.safeParse(json.data);
    if (!parsed.success || !isPlanKey(parsed.data.planKey)) {
      return NextResponse.json({ error: "Invalid subscription selection." }, { status: 400 });
    }

    const { planKey, interval } = parsed.data;
    const plan = planMap[planKey];
    if (interval === "month" && plan.monthly === null) {
      return NextResponse.json({ error: "This plan is available yearly only." }, { status: 400 });
    }

    const priceId = getPriceId(planKey, interval);
    if (!priceId) return NextResponse.json({ error: "This Stripe price has not been configured." }, { status: 503 });

    const { data: existingSubscription } = await admin
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due", "unpaid"])
      .limit(1)
      .maybeSingle();

    const origin = getAppUrl(new URL(request.url).origin);
    if (existingSubscription?.stripe_customer_id) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: existingSubscription.stripe_customer_id,
        return_url: `${origin}/billing`,
      });
      return NextResponse.json({ url: portal.url, portal: true });
    }

    const { data: savedCustomer } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = savedCustomer?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.user_metadata?.full_name,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("billing_customers").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        email: user.email,
      });
    }

    let founderSlot: number | null = null;
    if (planKey === "founder") {
      const { data, error } = await supabase.rpc("reserve_founder_plan_slot");
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      founderSlot = data;
    }

    const trialDays = Math.max(0, Number(process.env.STRIPE_TRIAL_DAYS || 14));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
      metadata: { user_id: user.id, plan_key: planKey, billing_interval: interval },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_key: planKey,
          billing_interval: interval,
          ...(founderSlot ? { founder_slot: String(founderSlot) } : {}),
        },
        ...(trialDays > 0 && planKey !== "founder" ? {
          trial_period_days: trialDays,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
        } : {}),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
