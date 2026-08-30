import { NextResponse } from "next/server";

import { loadTouchlineLivePresentationState } from "@/lib/touchlineArena/live-presentation-state-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadTouchlineLivePresentationState(), {
    headers: { "Cache-Control": "no-store" },
  });
}
