import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  createTouchlineFantasyStripeClient,
  isTouchlineFantasyMonthlyPrice,
  resolveTouchlineFantasyStripeConfig,
} from "@/lib/touchlineFantasy/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user?.email) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  const resolved = resolveTouchlineFantasyStripeConfig();
  if (!resolved.ok) return NextResponse.json({ ok: false, error: "TEST_BILLING_UNAVAILABLE" }, { status: 503 });
  const stripe = await createTouchlineFantasyStripeClient(resolved.config);
  const price = await stripe.prices.retrieve(resolved.config.monthlyPriceId);
  if (!isTouchlineFantasyMonthlyPrice(price)) {
    return NextResponse.json({ ok: false, error: "MONTHLY_PRICE_MISMATCH" }, { status: 503 });
  }
  const metadata = { touchlineFantasyUserId: user.id, touchlineEnvironment: "qa" };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price: resolved.config.monthlyPriceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    success_url: `${request.nextUrl.origin}/fantasy?checkout=success`,
    cancel_url: `${request.nextUrl.origin}/fantasy?checkout=cancelled`,
    allow_promotion_codes: false,
  });
  if (!session.url) return NextResponse.json({ ok: false, error: "CHECKOUT_URL_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ ok: true, url: session.url }, { headers: { "Cache-Control": "private, no-store" } });
}
