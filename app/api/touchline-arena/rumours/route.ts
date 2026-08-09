import { NextResponse } from "next/server";

const UNAVAILABLE_STATUS = "Signals are unavailable until a canonical persisted signal projection is published.";

/**
 * A public request must never turn into provider news/live-event ingestion.
 * There is no versioned persisted signal projection yet, so fail closed rather
 * than presenting a request-time or synthetic feed as official TouchLine data.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: [],
    state: "unavailable",
    status: UNAVAILABLE_STATUS,
    warnings: [UNAVAILABLE_STATUS],
    note: "No canonical persisted signal snapshot is available.",
  }, {
    headers: {
      "cache-control": "private, no-store",
    },
  });
}
