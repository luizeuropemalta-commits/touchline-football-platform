import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

function rosterResponse(
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return rosterResponse({
      ok: false,
      state: "unavailable",
      cards: [],
      activeContractCount: 0,
      error: "TL_ROSTER_SERVER_UNAVAILABLE",
    }, 503);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !hasTouchLineArenaAccess(user)) {
    return rosterResponse({
      ok: false,
      state: "anonymous",
      cards: [],
      activeContractCount: 0,
      error: "TL_ROSTER_AUTH_REQUIRED",
    }, 401);
  }

  const admin = createAdminClient();
  if (!admin) {
    return rosterResponse({
      ok: false,
      state: "unavailable",
      cards: [],
      activeContractCount: 0,
      error: "TL_ROSTER_SERVER_UNAVAILABLE",
    }, 503);
  }

  const roster = await readAuthoritativeTouchlineRoster(admin, user.id);
  if (!roster.ok) {
    return rosterResponse({
      ok: false,
      state: "unavailable",
      cards: [],
      activeContractCount: 0,
      error: roster.error,
    }, roster.error === "TL_ROSTER_DATA_INCOMPLETE" ? 500 : 503);
  }

  return rosterResponse({
    ok: true,
    state: "authenticated",
    source: roster.snapshot.source,
    cards: roster.snapshot.cards,
    activeContractCount: roster.snapshot.activeContractCount,
  }, 200);
}
