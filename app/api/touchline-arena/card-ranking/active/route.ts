import { NextResponse } from "next/server";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  try {
    return NextResponse.json(await loadTouchLineActiveRanking(), { headers });
  } catch {
    // Consumers preserve their last verified ranking on non-success responses.
    // Never cache a transient outage or turn it into a preseason publication.
    return NextResponse.json({ error: "ranking_unavailable" }, { status: 503, headers });
  }
}
