import { NextResponse } from "next/server";

const RETIRED_ERROR = "On-demand fantasy event retrieval is retired. Use a published persisted projection when available.";

/**
 * Browser GETs must not trigger provider ingestion. A future replacement must
 * be a protected server job that publishes a versioned persisted read model.
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
