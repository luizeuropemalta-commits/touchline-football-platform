import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  canonicalizeArenaLineupForPersistence,
  reconcileStoredArenaFormationLayouts,
  reconcileStoredArenaLineupWithAuthoritativeRoster,
  sanitizeArenaFormationLayoutsForPersistence,
} from "@/lib/touchlineArena/authoritative-arena-state";
import {
  readAuthoritativeTouchlineRoster,
  validateLineupInventoryOwnership,
} from "@/lib/touchlineArena/authoritative-roster-server";

const FORMATIONS = new Set(["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-2-3", "5-3-2", "5-4-1"]);

async function authenticatedUser() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) ? user : null;
}

function rosterReadFailure(error: string, userId?: string) {
  return NextResponse.json(
    { ok: false, error, ...(userId ? { userId } : {}) },
    {
      status: error === "TL_ROSTER_DATA_INCOMPLETE" ? 500 : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET() {
  const user = await authenticatedUser();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (!admin) return NextResponse.json({ ok: false, userId: user.id }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  let { data, error } = await admin
    .from("touchline_user_arena_state")
    .select("formation_key,lineup,saved_formation_layouts,coach_provider_id,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  // Keep approved authenticated Arena state readable until the non-financial
  // coach-identity migration is applied in the verified remote environment.
  // The fallback never creates or mutates coach data.
  if (error?.code === "42703") {
    ({ data, error } = await admin
      .from("touchline_user_arena_state")
      .select("formation_key,lineup,saved_formation_layouts,updated_at")
      .eq("user_id", user.id)
      .maybeSingle());
  }
  if (error) return NextResponse.json({ ok: false, userId: user.id }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  if (!data) {
    return NextResponse.json(
      { ok: true, userId: user.id, state: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const roster = await readAuthoritativeTouchlineRoster(admin, user.id);
  if (!roster.ok) return rosterReadFailure(roster.error, user.id);

  const state = {
    ...data,
    lineup: reconcileStoredArenaLineupWithAuthoritativeRoster(
      data.lineup,
      roster.snapshot.cards,
    ),
    saved_formation_layouts: reconcileStoredArenaFormationLayouts(
      data.saved_formation_layouts,
    ),
  };
  return NextResponse.json(
    { ok: true, userId: user.id, state },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await authenticatedUser();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });
  const body = await request.json().catch(() => null);
  const formation = typeof body?.formation === "string" && FORMATIONS.has(body.formation) ? body.formation : null;
  const lineup = Array.isArray(body?.lineup) && body.lineup.length <= 11 ? body.lineup : null;
  const suppliedLayouts = body?.savedFormationLayouts ?? {};
  if (!formation || !lineup || JSON.stringify(lineup).length > 150_000 || JSON.stringify(suppliedLayouts).length > 150_000) return NextResponse.json({ ok: false }, { status: 400 });

  const sanitizedLayouts = sanitizeArenaFormationLayoutsForPersistence(suppliedLayouts);
  if (!sanitizedLayouts.ok) {
    return NextResponse.json(
      { ok: false, error: sanitizedLayouts.error },
      { status: 400 },
    );
  }

  const roster = await readAuthoritativeTouchlineRoster(admin, user.id);
  if (!roster.ok) {
    return rosterReadFailure(roster.error);
  }

  const ownership = validateLineupInventoryOwnership(
    lineup,
    roster.snapshot.inventoryIds,
  );
  if (!ownership.ok) {
    return NextResponse.json({
      ok: false,
      error: "TL_ARENA_LINEUP_OWNERSHIP_INVALID",
      missingInventoryIndexes: ownership.missingInventoryIndexes,
      foreignInventoryIds: ownership.foreignInventoryIds,
      duplicateInventoryIds: ownership.duplicateInventoryIds,
    }, { status: 409 });
  }

  const canonicalLineup = canonicalizeArenaLineupForPersistence(
    lineup,
    roster.snapshot.cards,
  );
  if (!canonicalLineup.ok) {
    return NextResponse.json({
      ok: false,
      error: canonicalLineup.error,
      lineupTooLarge: canonicalLineup.lineupTooLarge,
      missingInventoryIndexes: canonicalLineup.missingInventoryIndexes,
      foreignInventoryIds: canonicalLineup.foreignInventoryIds,
      duplicateInventoryIds: canonicalLineup.duplicateInventoryIds,
      invalidTacticalIndexes: canonicalLineup.invalidTacticalIndexes,
    }, { status: 400 });
  }

  const { error } = await admin.from("touchline_user_arena_state").upsert({ user_id: user.id, formation_key: formation, lineup: canonicalLineup.lineup, saved_formation_layouts: sanitizedLayouts.layouts, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
