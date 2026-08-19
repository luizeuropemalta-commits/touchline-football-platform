import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { isOwnerEmail } from "@/lib/admin/owner";
import { syncSportmonksProviderCapabilities } from "@/lib/football-data/capability-sync";
import { syncSportmonksFixtureSchedule } from "@/lib/football-data/fixture-schedule-sync";
import { syncSportmonksStarterFoundation } from "@/lib/football-data/starter-sync";
import { syncQaCountryData } from "@/lib/football-data/qa-country-sync";
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

async function runFootballDataSync(request: NextRequest) {
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
  const scope = request.nextUrl.searchParams.get("scope") ?? "foundation";

  try {
    const result = scope === "capabilities"
      ? await syncSportmonksProviderCapabilities()
      : scope === "fixture_schedule"
      ? await syncSportmonksFixtureSchedule(admin, {
          competitionId,
          fromDate: request.nextUrl.searchParams.get("fromDate") ?? undefined,
          throughDate: request.nextUrl.searchParams.get("throughDate") ?? undefined,
        })
      : scope === "foundation"
        ? await syncSportmonksStarterFoundation(admin, { competitionId, clubId })
        : scope === "qa_country_sync"
          ? await syncQaCountryData(admin, request.nextUrl.searchParams.get("runId") ?? randomUUID())
        : null;

    if (!result) {
      return NextResponse.json(
        { ok: false, status: "invalid_scope", error: "Use scope=capabilities, foundation, fixture_schedule or qa_country_sync." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json({
      ...result,
      mode: auth.mode,
      syncedAt: new Date().toISOString(),
      note: scope === "capabilities"
        ? "Sportmonks account entitlements were recorded behind the protected provider boundary."
        : scope === "fixture_schedule"
        ? "Sportmonks schedule data was normalized before the Live read model can publish it."
        : scope === "qa_country_sync"
          ? "QA-only country data was reconciled from the complete provider scope after a reversible 588-player backup."
        : "TouchLine Data feeds the normalized TouchLine database. Frontend modules should read from /api/football-data/foundation.",
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

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      status: "method_not_allowed",
      error: "Football data synchronization requires POST.",
    },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  return runFootballDataSync(request);
}
