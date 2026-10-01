import { NextResponse } from "next/server";
import { loadTouchlineGoldenBoot } from "@/lib/touchlineArena/golden-boot-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

/** Public, sanitized award state only. No request-selected scope, provider
 * refresh or mutation; the server loader remains default OFF. */
export async function GET() {
  try {
    return NextResponse.json(await loadTouchlineGoldenBoot(), { headers });
  } catch {
    return NextResponse.json(null, { status: 503, headers });
  }
}
