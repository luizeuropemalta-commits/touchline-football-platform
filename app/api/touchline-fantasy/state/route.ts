import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadTouchlineFantasyReadSnapshot } from "@/lib/touchlineFantasy/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  const snapshot = await loadTouchlineFantasyReadSnapshot(user).catch(() => null);
  if (!snapshot) return NextResponse.json({ ok: false, error: "FANTASY_UNAVAILABLE" }, {
    status: 503, headers: { "Cache-Control": "private, no-store" },
  });
  return NextResponse.json({
    ok: true,
    userId: snapshot.userId,
    qaClubMarketOpen: snapshot.qaClubMarketOpen === true,
    gameweeks: snapshot.gameweeks,
    activeGameweek: snapshot.activeGameweek,
    userGameweek: snapshot.userGameweek,
    selections: snapshot.selections,
    lineupAlerts: snapshot.lineupAlerts,
    matchCardIndicators: snapshot.matchCardIndicators ?? null,
    playerAvailabilityIndicators: snapshot.playerAvailabilityIndicators ?? null,
    gameweekScore: snapshot.gameweekScore,
    seasonScore: snapshot.seasonScore,
    matchHistory: snapshot.matchHistory,
    gameweekRanking: snapshot.gameweekRanking,
    seasonRanking: snapshot.seasonRanking,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
