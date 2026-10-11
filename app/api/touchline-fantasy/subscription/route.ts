import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "INVALID_ORIGIN" }, {
      status: 403, headers: { "Cache-Control": "private, no-store" },
    });
  }
  const supabase = await createClient().catch(() => null);
  const viewer = supabase ? await supabase.auth.getUser().catch(() => null) : null;
  if (viewer?.error || !viewer?.data.user?.email) {
    return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, {
      status: 401, headers: { "Cache-Control": "private, no-store" },
    });
  }
  // Retire new monthly GBP checkouts only. Historical subscription processing
  // and its webhook remain unchanged; no replacement price is inferred here.
  return NextResponse.json({
    ok: false,
    error: "LEGACY_GBP_CHECKOUT_RETIRED",
    message: "This monthly GBP offer is no longer available. Existing subscriptions are unchanged.",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
