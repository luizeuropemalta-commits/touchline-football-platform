import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadTouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  const snapshot = await loadTouchlineFantasySnapshot(user);
  if (!snapshot) return NextResponse.json({ ok: false, error: "FANTASY_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({
    ok: true,
    activeGameweek: snapshot.activeGameweek,
    userGameweek: snapshot.userGameweek,
    selections: snapshot.selections,
    lineupAlerts: snapshot.lineupAlerts,
    gameweekScore: snapshot.gameweekScore,
    seasonScore: snapshot.seasonScore,
    matchHistory: snapshot.matchHistory,
    gameweekRanking: snapshot.gameweekRanking,
    seasonRanking: snapshot.seasonRanking,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
