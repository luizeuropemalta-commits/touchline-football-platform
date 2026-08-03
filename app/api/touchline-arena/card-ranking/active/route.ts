import { NextResponse } from "next/server";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadTouchLineActiveRanking(), {
    headers: { "Cache-Control": "no-store" },
  });
}
