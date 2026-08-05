import { NextRequest, NextResponse } from "next/server";

import { syncSportmonksFixtureSchedule } from "@/lib/football-data/fixture-schedule-sync";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { toPublicTouchlineFixtures } from "@/lib/football-data/public-fixture";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

async function isAuthorizedScheduleEditor(request: NextRequest) {
  const secret = process.env.FOOTBALL_DATA_SYNC_SECRET ?? process.env.FOOTBALL_DATA_VALIDATION_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email);
}

export async function GET() {
  const fixtures = await readPublicCompetitionFixtures();
  return NextResponse.json({
    ok: true,
    data: toPublicTouchlineFixtures(fixtures),
    source: "canonical-schedule",
    fetchedAt: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedScheduleEditor(request)) {
    return NextResponse.json({ ok: false, error: "Owner session or football data sync secret required." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 200 });
  const result = await syncSportmonksFixtureSchedule(admin, {
    competitionId: request.nextUrl.searchParams.get("competitionId") ?? undefined,
    fromDate: request.nextUrl.searchParams.get("from") ?? undefined,
    throughDate: request.nextUrl.searchParams.get("through") ?? undefined,
  });
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
