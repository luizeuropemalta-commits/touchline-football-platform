import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTouchlineFantasyStripeClient,
  resolveTouchlineFantasyStripeConfig,
  touchlineFantasyEntitlementStatus,
} from "@/lib/touchlineFantasy/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reference(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function timestamp(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

export async function POST(request: NextRequest) {
  const resolved = resolveTouchlineFantasyStripeConfig();
  if (!resolved.ok) return NextResponse.json({ ok: false }, { status: 503 });
  const stripe = await createTouchlineFantasyStripeClient(resolved.config);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      resolved.config.webhookSecret,
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (event.livemode) return NextResponse.json({ ok: false }, { status: 403 });
  if (![
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ].includes(event.type)) return NextResponse.json({ ok: true, ignored: true });

  let subscription: Stripe.Subscription | null = null;
  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    subscriptionId = reference(session.subscription);
  } else {
    subscriptionId = reference((event.data.object as Stripe.Subscription).id);
  }
  if (subscriptionId) subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription?.metadata.touchlineFantasyUserId;
  if (!subscription || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ ok: false }, { status: 422 });
  }
  const item = subscription.items.data[0];
  if (!item || item.price.id !== resolved.config.monthlyPriceId) {
    return NextResponse.json({ ok: false }, { status: 422 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });
  const { error } = await admin.rpc("touchline_fantasy_apply_test_subscription_event", {
    p_provider_event_id: event.id,
    p_provider_event_created_at: new Date(event.created * 1000).toISOString(),
    p_event_type: event.type,
    p_livemode: false,
    p_user_id: userId,
    p_provider_customer_reference: reference(subscription.customer),
    p_provider_subscription_reference: subscription.id,
    p_entitlement_status: touchlineFantasyEntitlementStatus(subscription.status),
    p_current_period_start: timestamp(item.current_period_start),
    p_current_period_end: timestamp(item.current_period_end),
  });
  return error
    ? NextResponse.json({ ok: false }, { status: 422 })
    : NextResponse.json({ ok: true });
}
