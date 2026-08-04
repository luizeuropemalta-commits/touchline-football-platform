import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { syncSportmonksStarterFoundation } from "@/lib/football-data/starter-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

type SyncAuthResult =
  | { ok: true; mode: "owner_session" | "sync_secret" }
  | { ok: false; reason: string };

function syncSecret() {
  return process.env.FOOTBALL_DATA_SYNC_SECRET ?? process.env.FOOTBALL_DATA_VALIDATION_SECRET;
}

async function authorize(request: NextRequest): Promise<SyncAuthResult> {
  const secret = syncSecret();
  const authorization = request.headers.get("authorization");

  if (secret && authorization === `Bearer ${secret}`) {
    return { ok: true, mode: "sync_secret" };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, reason: "Supabase auth client is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email)) {
    return { ok: true, mode: "owner_session" };
  }

  return { ok: false, reason: "Owner session or football data sync secret required." };
}

async function runStarterSync(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, status: "unauthorized", error: auth.reason }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        error: "Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 200 },
    );
  }

  const competitionId = request.nextUrl.searchParams.get("competitionId") ?? undefined;
  const clubId = request.nextUrl.searchParams.get("clubId") ?? undefined;

  try {
    const result = await syncSportmonksStarterFoundation(admin, { competitionId, clubId });

    return NextResponse.json({
      ...result,
      mode: auth.mode,
      syncedAt: new Date().toISOString(),
      note: "TouchLine Data feeds the normalized TouchLine database. Frontend modules should read from /api/football-data/foundation.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message.replace(/SportMonks/gi, "TouchLine Data") : "Unknown TouchLine Data sync error.",
        hint: "If this mentions a missing relation, run supabase/migrations/013_football_data_foundation.sql in Supabase first.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return runStarterSync(request);
}

export async function POST(request: NextRequest) {
  return runStarterSync(request);
}
