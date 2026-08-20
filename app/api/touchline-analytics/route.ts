import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  isSameOriginAnalyticsRequest,
  parseTouchlineAnalyticsPayload,
  readBoundedTouchlineAnalyticsJson,
  touchlineAnalyticsAreaFromReferrer,
  touchlineAnalyticsDeviceFromHeaders,
} from "@/lib/touchlineArena/analytics-contract";

function rejected(reason: string, status: number, publicError: string) {
  console.warn(`[touchline-analytics] rejected reason=${reason} status=${status}`);
  return NextResponse.json({ ok: false, error: publicError }, { status });
}

export async function POST(request: Request) {
  if (!isSameOriginAnalyticsRequest(request.url, request.headers.get("origin"))) {
    return rejected("origin_mismatch", 403, "invalid_origin");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return rejected("fetch_site_mismatch", 403, "invalid_origin");
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !hasTouchLineArenaAccess(user)) {
    return rejected("unauthorized", 401, "unauthorized");
  }

  const payload = parseTouchlineAnalyticsPayload(await readBoundedTouchlineAnalyticsJson(request));
  if (!payload) return rejected("malformed_payload", 400, "invalid_request");
  const area = touchlineAnalyticsAreaFromReferrer(request.url, request.headers.get("referer"));
  if (!area) {
    return rejected("activity_context_mismatch", 403, "invalid_context");
  }
  if (area === "admin" && !isOwnerEmail(user.email)) {
    return rejected("admin_activity_forbidden", 403, "invalid_context");
  }
  const device = touchlineAnalyticsDeviceFromHeaders(request.headers);

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  const { data, error } = await admin.rpc("touchline_record_analytics_observation", {
    p_session_id: payload.sessionId,
    p_user_id: user.id,
    p_area: area,
    p_device: device,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 500 });
  }
  const status = (data as { status?: unknown }).status;
  if (status === "owner_mismatch") {
    return rejected("session_owner_mismatch", 403, "invalid_session");
  }
  if (status === "rate_limited") {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "retry-after": "10" } },
    );
  }
  if (status !== "created" && status !== "recorded") {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
