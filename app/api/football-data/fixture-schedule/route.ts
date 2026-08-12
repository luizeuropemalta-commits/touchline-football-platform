import { NextResponse } from "next/server";

import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { toPublicTouchlineFixtures } from "@/lib/football-data/public-fixture";
import { completeTouchlineOfficialFixtureSchedule } from "@/lib/football-data/touchline-official-fixture-completion";

export async function GET() {
  let fixtures = [] as Awaited<ReturnType<typeof readPublicCompetitionFixtures>>;
  try {
    fixtures = completeTouchlineOfficialFixtureSchedule(await readPublicCompetitionFixtures());
  } catch {
    fixtures = [];
  }

  if (!fixtures.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "No persisted fixture schedule is available.",
        status: "persisted-fixture-schedule-unavailable",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json({
    ok: true,
    data: toPublicTouchlineFixtures(fixtures),
    // The current normalized tables do not yet publish one immutable schedule
    // revision. Keep the state honest and do not mint a request-time timestamp.
    state: "partial-persisted-schedule",
    capturedAt: null,
    degraded: true,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Schedule ingestion belongs to a future protected server job, never a browser route. */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Fixture schedule ingestion is not available from this route.",
      status: "method-not-allowed",
    },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "private, no-store" } },
  );
}
