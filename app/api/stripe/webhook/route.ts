import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

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
    if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
      await syncInvoice(event.data.object as Stripe.Invoice, event.type);
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
      await createAlert(userId, "payment_failed", "Payment failed", "Stripe could not collect this invoice payment. Update your payment method to avoid interruption.", invoice.id);
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
