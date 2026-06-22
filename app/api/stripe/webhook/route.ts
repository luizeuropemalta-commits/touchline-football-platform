import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, resolvePlanFromPrice } from "@/lib/billing/stripe";
import { isPlanKey, type BillingInterval, type PlanKey } from "@/lib/billing/plans";

const iso = (value: number | null | undefined) => value ? new Date(value * 1000).toISOString() : null;
const idOf = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id ?? null;

export async function POST(request: Request) {
  const stripe = getStripe();
  const admin = createAdminClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !admin || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const adminClient = admin;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") || "", secret);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid signature." }, { status: 400 });
  }

  const { data: processed } = await adminClient.from("stripe_webhook_events").select("stripe_event_id").eq("stripe_event_id", event.id).maybeSingle();
  if (processed) return NextResponse.json({ received: true, duplicate: true });

  try {
    if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(idOf(session.subscription)!);
        await syncSubscription(subscription);
      }
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
      await syncInvoice(event.data.object as Stripe.Invoice, event.type);
    } else if (event.type === "customer.subscription.trial_will_end") {
      const subscription = event.data.object as Stripe.Subscription;
      await createAlert(subscription.metadata.user_id, "trial_ending", "Trial ending soon", "Add or confirm a payment method to keep your football operations online.", subscription.id);
    }

    await adminClient.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, { status: 500 });
  }

  async function syncSubscription(subscription: Stripe.Subscription) {
    const item = subscription.items.data[0];
    if (!item) return;
    const resolved = resolvePlanFromPrice(item.price.id);
    const metadataPlan = subscription.metadata.plan_key;
    const planKey: PlanKey | null = isPlanKey(metadataPlan) ? metadataPlan : resolved?.planKey ?? null;
    const interval = (subscription.metadata.billing_interval || item.price.recurring?.interval || resolved?.interval) as BillingInterval | undefined;
    const userId = subscription.metadata.user_id;
    const customerId = idOf(subscription.customer);
    if (!userId || !customerId || !planKey || !interval) return;

    await adminClient.from("billing_customers").upsert({
      user_id: userId,
      stripe_customer_id: customerId,
    });
    await adminClient.from("billing_subscriptions").upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: item.price.id,
      plan_key: planKey,
      billing_interval: interval,
      status: subscription.status,
      quantity: item.quantity || 1,
      trial_start: iso(subscription.trial_start),
      trial_end: iso(subscription.trial_end),
      current_period_start: iso(item.current_period_start),
      current_period_end: iso(item.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: iso(subscription.canceled_at),
      ended_at: iso(subscription.ended_at),
      metadata: subscription.metadata,
    }, { onConflict: "stripe_subscription_id" });

    if (planKey === "founder" && ["active", "trialing"].includes(subscription.status)) {
      await adminClient.from("founder_plan_slots").update({
        status: "claimed",
        claimed_at: new Date().toISOString(),
        reservation_expires_at: null,
        stripe_subscription_id: subscription.id,
      }).eq("user_id", userId);
    }
  }

  async function syncInvoice(invoice: Stripe.Invoice, eventType: string) {
    const customerId = idOf(invoice.customer);
    if (!customerId) return;
    const { data: customer } = await adminClient.from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    const userId = customer?.user_id;
    if (!userId) return;
    const subscriptionId = invoice.parent?.type === "subscription_details"
      ? idOf(invoice.parent.subscription_details?.subscription ?? null)
      : null;

    await adminClient.from("billing_invoices").upsert({
      user_id: userId,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId,
      number: invoice.number,
      status: invoice.status,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      tax: Math.max(0, invoice.total - invoice.subtotal),
      total: invoice.total,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      period_start: iso(invoice.period_start),
      period_end: iso(invoice.period_end),
      paid_at: iso(invoice.status_transitions.paid_at),
    }, { onConflict: "stripe_invoice_id" });

    if (eventType === "invoice.payment_failed") {
      await createAlert(userId, "payment_failed", "Payment failed", "Stripe could not collect your subscription payment. Update your payment method to avoid interruption.", invoice.id);
    } else if (eventType === "invoice.payment_action_required") {
      await createAlert(userId, "payment_action_required", "Payment action required", "Your bank needs additional authentication before this payment can complete.", invoice.id);
    } else if (eventType === "invoice.paid") {
      await adminClient.from("billing_alerts").update({ resolved_at: new Date().toISOString() }).eq("user_id", userId).in("type", ["payment_failed", "payment_action_required"]).is("resolved_at", null);
    }
  }

  async function createAlert(userId: string | undefined, type: string, title: string, message: string, stripeObjectId: string) {
    if (!userId) return;
    const { data } = await adminClient.from("billing_alerts").select("id").eq("user_id", userId).eq("type", type).eq("stripe_object_id", stripeObjectId).is("resolved_at", null).maybeSingle();
    if (!data) await adminClient.from("billing_alerts").insert({ user_id: userId, type, title, message, stripe_object_id: stripeObjectId });
  }
}
