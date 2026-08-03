import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { createTouchlineStripeTestClient, resolveTouchlineStripeTestConfig, validateTouchlineStripeTestWebhookEvent } from "@/lib/stripe/touchline-test-mode";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const resolved = resolveTouchlineStripeTestConfig();
  const admin = createAdminClient();
  if (!resolved.ok || !admin) return NextResponse.json({ error: "TouchLine Test Mode webhook is not configured." }, { status: 503 });

  let event: Stripe.Event;
  try {
    const stripe = createTouchlineStripeTestClient(resolved.config);
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") || "",
      resolved.config.webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid TouchLine Test Mode webhook signature." }, { status: 400 });
  }

  const validated = validateTouchlineStripeTestWebhookEvent(event as unknown as Parameters<typeof validateTouchlineStripeTestWebhookEvent>[0]);
  if (!validated.ok) return NextResponse.json({ error: "Rejected TouchLine Test Mode event." }, { status: 400 });

  const { data: claimed, error } = await admin.rpc("claim_touchline_stripe_test_webhook_event", {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_operation_id: validated.operationId,
  });
  if (error) return NextResponse.json({ error: "TouchLine Test Mode webhook claim failed." }, { status: 500 });
  return NextResponse.json({ received: true, duplicate: claimed === false, testMode: true });
}
