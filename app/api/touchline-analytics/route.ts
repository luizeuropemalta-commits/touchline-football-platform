import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

const AREAS = new Set(["arena", "club-owner", "club", "player", "market", "training", "ranking", "admin", "other"]);
const DEVICES = new Set(["mobile", "tablet", "desktop", "unknown"]);

function cleanArea(value: unknown) {
  return typeof value === "string" && AREAS.has(value) ? value : "other";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ ok: false }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !hasTouchLineArenaAccess(user)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(body.sessionId) ? body.sessionId : null;
  if (!sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  const area = cleanArea(body.area);
  const device = typeof body.device === "string" && DEVICES.has(body.device) ? body.device : "unknown";
  const seconds = Math.max(0, Math.min(30, Number.isFinite(body.activeSeconds) ? Math.floor(body.activeSeconds) : 0));

  const { data: existing } = await admin.from("touchline_analytics_sessions").select("active_seconds,user_id").eq("id", sessionId).maybeSingle();
  if (existing && existing.user_id !== user.id) return NextResponse.json({ ok: false }, { status: 403 });
  const now = new Date().toISOString();
  const { error } = existing
    ? await admin.from("touchline_analytics_sessions").update({ last_seen_at: now, updated_at: now, current_area: area, device_class: device, active_seconds: Number(existing.active_seconds || 0) + seconds }).eq("id", sessionId)
    : await admin.from("touchline_analytics_sessions").insert({ id: sessionId, user_id: user.id, started_at: now, last_seen_at: now, updated_at: now, entry_area: area, current_area: area, device_class: device, active_seconds: seconds });
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
