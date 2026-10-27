import { NextResponse } from "next/server";

import { readPersistedLiveRail } from "@/lib/touchlineArena/persisted-live-rail-server";

/**
 * Browser-readable live state is a durable snapshot only. It never refreshes
 * a provider, merges process-local deltas, or persists from a request.
 */
export async function GET() {
  const snapshot = await readPersistedLiveRail();
  if (snapshot) {
    return NextResponse.json({
      ok: true,
      data: snapshot.fixtures,
      admissionScope: snapshot.admissionScope,
      state: snapshot.metadata.state,
      ...(snapshot.metadata.fetchedAt ? { fetchedAt: snapshot.metadata.fetchedAt } : {}),
      degraded: snapshot.metadata.degraded,
    }, {
      // No versioned matchweek projection exists to promote to shared cache.
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "No coherent persisted live data is available.",
      status: "persisted-live-data-unavailable",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
