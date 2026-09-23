import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { syncTouchLinePlayerSeasonStatistics } from "@/lib/football-data/player-season-statistics-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";
import { inspectTouchlineProductionSyncRuntime } from "@/lib/football-data/production-sync-runtime";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";

function isDedicatedQaRuntime() {
  return inspectTouchlineIsolatedPreviewEnvironment().status === "qa"
    && process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF === QA_PROJECT_REF;
}

async function isAuthorized(request: NextRequest) {
  const secret = process.env.FOOTBALL_DATA_SYNC_SECRET ?? process.env.FOOTBALL_DATA_VALIDATION_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email);
}

export async function POST(request: NextRequest) {
  // Runtime admission precedes authentication/client construction. Production
  // is default OFF and bound to the explicitly retained data project.
  if (!isDedicatedQaRuntime() && !inspectTouchlineProductionSyncRuntime(process.env).allowed) {
    return NextResponse.json({ ok: false, error: "Score Engine V3 rebuild requires a verified QA or explicitly enabled Production runtime." }, { status: 403 });
  }
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
