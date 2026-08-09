import { NextResponse } from "next/server";

const RETIRED_ERROR = "On-demand fantasy capability retrieval is retired. Use a published persisted projection when available.";

/**
 * Browser GETs must not trigger provider ingestion or capability persistence.
 * Future ingestion belongs to a protected server-only job boundary.
 */
export async function GET() {
  return NextResponse.json({
    ok: false,
    code: "TL_FOOTBALL_DATA_RETIRED",
    error: RETIRED_ERROR,
  }, {
    status: 410,
    headers: {
      allow: "GET",
      "cache-control": "private, no-store",
    },
  });
}
