import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!stripe || !supabase || !admin) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "No billing account found." }, { status: 404 });

  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${getAppUrl(new URL(request.url).origin)}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
