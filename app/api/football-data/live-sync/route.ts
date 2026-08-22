import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { syncSportmonksLiveState } from "@/lib/football-data/live-sync";
import { createAdminClient } from "@/lib/supabase/admin";

// A cold QA run can include the first persisted V2 historical reconciliation
// in addition to the live provider write. Keep the function inside Vercel's
// documented App Router duration contract instead of letting that idempotent
// backfill terminate at the former 60-second boundary.
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.TOUCHLINE_LIVE_SYNC_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !authorization.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length).trim();
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, status: "unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, status: "not_configured" }, { status: 503 });
  }

  let fixtureId: string | null = null;
  try {
    const body = await request.json() as { fixtureId?: unknown };
    if (typeof body.fixtureId === "string" && /^[1-9]\d{0,19}$/.test(body.fixtureId.trim())) {
      fixtureId = body.fixtureId.trim();
    }
  } catch {
    // The scheduled request intentionally sends an empty JSON object.
  }

  try {
    const result = await syncSportmonksLiveState(admin, { forceFixtureId: fixtureId });
    return NextResponse.json(result, {
      status: result.ok || result.status === "skipped" ? 200 : 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, status: "error", error: "Live synchronization failed safely." }, {
      status: 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, status: "method_not_allowed" }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "private, no-store" },
  });
}
