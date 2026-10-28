import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { syncSportmonksLiveState } from "@/lib/football-data/live-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
});

/** Owner-session entry to the existing durable lease and provider quota pipeline.
 * No caller-supplied fixture, provider, score or environment overrides.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin
    || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ ok: false, error: "INVALID_ORIGIN" }, 403);
  }
  try {
    const session = await createClient();
    if (!session) return reply({ ok: false, error: "UNAVAILABLE" }, 503);
    const { data: { user }, error } = await session.auth.getUser();
    if (error || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
      return reply({ ok: false, error: "FORBIDDEN" }, 403);
    }
    const admin = createAdminClient();
    if (!admin) return reply({ ok: false, error: "UNAVAILABLE" }, 503);
    // Reuses runtime isolation, atomic run acquisition, quota admission, history,
    // post-match checks and downstream recalculation. Never bypass their guards.
    const result = await syncSportmonksLiveState(admin);
    return reply({
      ok: result.ok,
      status: result.status,
      runId: result.syncRunId ?? null,
      fixturesUpdated: result.updated,
      playerRowsUpdated: result.playerFixtureRowsWritten,
      coachPointsReconciled: result.coachPointsReconciled,
      issueCount: result.errors.length,
    }, result.ok ? 200 : 502);
  } catch {
    // A network/runtime error is not evidence that the operation never started.
    return reply({ ok: false, error: "SYNC_NOT_CONFIRMED" }, 503);
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, {
    status: 405, headers: { Allow: "POST", "Cache-Control": "private, no-store" },
  });
}
