import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { syncTouchLinePlayerSeasonStatistics } from "@/lib/football-data/player-season-statistics-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

async function isAuthorized(request: NextRequest) {
  const secret = process.env.FOOTBALL_DATA_SYNC_SECRET ?? process.env.FOOTBALL_DATA_VALIDATION_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email);
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Owner session or TouchLine Data sync credential required." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, status: "not_configured", error: "TouchLine Data administration is not configured." }, { status: 200 });
  }
  const result = await syncTouchLinePlayerSeasonStatistics(admin);
  return NextResponse.json({
    ...result,
    source: "touchline_verified",
    syncedAt: new Date().toISOString(),
  }, { status: result.ok ? 200 : 500 });
}
