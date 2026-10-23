import { NextResponse } from "next/server";
import { loadTouchlineSportsPublication } from "@/lib/touchlineArena/sports-publication-server";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  try {
    const data = await loadTouchlineSportsPublication();
    return NextResponse.json(data ? { ok: true, data } : { ok: false, status: "publication-pending" }, { headers });
  } catch {
    return NextResponse.json({ ok: false, status: "publication-unavailable" }, { status: 503, headers });
  }
}
