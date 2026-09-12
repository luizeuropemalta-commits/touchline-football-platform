import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { parseTouchlineDeviceRegistration } from "@/lib/touchlineArena/push-device-contract";

async function currentUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user: hasTouchLineArenaAccess(user) ? user : null };
}

export async function PUT(request: NextRequest) {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const registration = parseTouchlineDeviceRegistration(await request.json().catch(() => null));
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Invalid device registration." }, { status: 400 });
  }
  const { error } = await supabase.from("notification_devices").upsert({
    user_id: user.id,
    installation_id: registration.installationId,
    permission: registration.permission,
    push_subscription: registration.subscription,
    user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "user_id,installation_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, delivery: "not-sent" });
}
