import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export const maxDuration = 60;
const supported = new Set(["invoice.created", "invoice.finalized", "invoice.updated", "invoice.voided", "invoice.marked_uncollectible", "invoice.deleted", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"]);
const iso = (value: number | null | undefined) => value ? new Date(value * 1000).toISOString() : null;
const idOf = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id ?? null;

/** Bounded financial projection; never retain the full provider/customer payload. */
function projectInvoice(invoice: Stripe.Invoice) {
  const tax = Array.isArray(invoice.total_taxes) ? invoice.total_taxes.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.amount) || !Number.isSafeInteger(sum + item.amount)) throw new Error("BILLING_INVALID_TAX");
    return sum + item.amount;
  }, 0) : null;
  return {
    id: invoice.id, customer_id: idOf(invoice.customer), livemode: invoice.livemode,
    subscription_id: invoice.parent?.type === "subscription_details" ? idOf(invoice.parent.subscription_details?.subscription ?? null) : null,
    number: invoice.number, status: invoice.status, currency: invoice.currency,
    subtotal: invoice.subtotal, tax, total: invoice.total,
    amount_paid: invoice.amount_paid, amount_due: invoice.amount_due, amount_remaining: invoice.amount_remaining,
    hosted_invoice_url: invoice.hosted_invoice_url, invoice_pdf: invoice.invoice_pdf,
    period_start: iso(invoice.period_start), period_end: iso(invoice.period_end), paid_at: iso(invoice.status_transitions.paid_at),
  };
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const admin = createAdminClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !admin || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") || "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let token: string | undefined;
  try {
    // This existing billing store is for the configured account, not Connect.
    if (event.account) throw new Error("BILLING_ACCOUNT_NOT_SUPPORTED");
    const source = supported.has(event.type) ? projectInvoice(event.data.object as Stripe.Invoice) : null;
    const { data: claim, error: claimError } = await admin.rpc("touchline_billing_claim_event", { p_event: {
      id: event.id, type: event.type, created: event.created, livemode: event.livemode,
      invoice_id: source?.id ?? null, customer_id: source?.customer_id ?? null, source_snapshot: source,
    } });
    if (claimError || claim?.eventId !== event.id) throw new Error("BILLING_CLAIM_NOT_CONFIRMED");
    if (claim.status === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    if (claim.status === "ignored") return NextResponse.json({ received: true });
    if (claim.status === "busy") return NextResponse.json({ error: "Webhook processing is in progress." }, { status: 503, headers: { "Retry-After": "5" } });
    if (claim.status !== "claimed" || typeof claim.token !== "string" || !source) throw new Error("BILLING_CLAIM_INVALID");
    token = claim.token;

    // Event.created is seconds, not an object version. Read current provider
    // state only while owning the invoice lease; never order snapshot IDs.
    let observed: ReturnType<typeof projectInvoice> | { id: string; customer_id: string | null; livemode: boolean; deleted: true };
    try {
      const current = await stripe.invoices.retrieve(source.id, {}, { timeout: 10_000, maxNetworkRetries: 0 });
      if (event.type === "invoice.deleted") throw new Error("BILLING_DELETION_NOT_CONFIRMED");
      observed = projectInvoice(current);
    } catch (error) {
      const failure = error as { type?: string; code?: string; statusCode?: number };
      // Stripe permits permanent deletion only for one-off drafts. A 404 alone
      // is never evidence of deletion or permission to erase financial history.
      if (event.type !== "invoice.deleted" || source.status !== "draft" || source.amount_paid !== 0
        || failure.type !== "StripeInvalidRequestError" || failure.code !== "resource_missing" || failure.statusCode !== 404) throw error;
      observed = { id: source.id, customer_id: source.customer_id, livemode: event.livemode, deleted: true };
    }
    if (observed.id !== source.id || observed.customer_id !== source.customer_id || observed.livemode !== event.livemode) {
      throw new Error("BILLING_INVOICE_IDENTITY_MISMATCH");
    }
    const { data: result, error } = await admin.rpc("touchline_billing_finish_event", {
      p_event_id: event.id, p_token: token, p_invoice: observed,
    });
    if (error || result?.status !== "applied" || result.eventId !== event.id) throw new Error("BILLING_COMMIT_NOT_CONFIRMED");
    return NextResponse.json({ received: true });
  } catch {
    if (token) {
      try { await admin.rpc("touchline_billing_release_event", { p_event_id: event.id, p_token: token }); } catch { /* Expiry and token fencing remain authoritative. */ }
    }
    // A lost commit reply is ambiguous. The next delivery verifies the receipt.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
