import { createHash } from "node:crypto";
import { TOUCHLINE_LIVE_QUICK_SUB_ENABLED } from "@/lib/touchlineArena/quick-substitution-product-policy";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";
import { strictSportmonksId } from "@/lib/football-data/sportmonks-season-topscorers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store" };

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin")) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function errorStatus(message: string) {
  if (message.includes("TL_QUICK_SUB_SESSION_NOT_FOUND")) return 404;
  if (message.includes("TL_QUICK_SUB_SERVICE_ONLY")) return 500;
  return 409;
}

async function owner() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && user && hasTouchLineArenaAccess(user) ? user : null;
}

export async function GET(request: Request) {
  const user = await owner();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  if (!admin) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_UNAVAILABLE" }, { status: 503, headers: NO_STORE });

  // Live's public fixture key is provider-scoped. Resolve it server-side to
  // the canonical UUID; never ask the browser to manufacture/guess that UUID.
  const providerFixtureId = strictSportmonksId(new URL(request.url).searchParams.get("providerFixtureId"));
  if (!providerFixtureId) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_INVALID_FIXTURE" }, { status: 400, headers: NO_STORE });

  const { data: fixture, error: fixtureError } = await admin.from("football_fixtures")
    .select("id,provider")
    .eq("provider", "sportmonks")
    .eq("provider_fixture_id", providerFixtureId)
    .maybeSingle();
  if (fixtureError) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_FIXTURE_READ_FAILED" }, { status: 503, headers: NO_STORE });
  const fixtureId = uuid(fixture?.id);
  if (!fixtureId || fixture?.provider !== "sportmonks") return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_MATCH_NOT_CANONICAL" }, { status: 409, headers: NO_STORE });

  const { data: session, error: sessionError } = await admin
    .from("touchline_arena_quick_substitution_sessions")
    .select("id,user_id,gameweek_id,fixture_id,roster_revision,starting_inventory_ids,bench_inventory_ids,active_inventory_ids,available_bench_inventory_ids,substituted_out_inventory_ids,revision,created_at,updated_at")
    .eq("user_id", user.id)
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_READ_FAILED" }, { status: 500, headers: NO_STORE });
  if (!session) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_SESSION_NOT_FOUND" }, { status: 404, headers: NO_STORE });
  if (!Number.isSafeInteger(session.revision) || session.revision < 0 || session.revision > 9) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_HISTORY_INCOMPLETE" }, { status: 503, headers: NO_STORE });
  }

  // The projection and each event commit atomically; events cannot be edited
  // or removed. Bound this second read to the captured projection revision so
  // a concurrent command cannot mix a newer history with an older XI.
  const { data: events, error: eventsError } = await admin
    .from("touchline_arena_quick_substitution_events")
    .select("command_id,user_id,actor_id,expected_revision,expected_roster_revision,resulting_revision,command_hash,before_state,after_state,release_sha,outgoing_inventory_id,incoming_inventory_id,occurred_at")
    .eq("user_id", user.id)
    .eq("session_id", session.id)
    .lte("resulting_revision", session.revision)
    .order("resulting_revision", { ascending: true });
  if (eventsError) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_READ_FAILED" }, { status: 500, headers: NO_STORE });
  if (!Array.isArray(events) || events.length !== session.revision
      || events.some((event, index) => event.expected_revision !== index || event.resulting_revision !== index + 1)) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_HISTORY_INCOMPLETE" }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true, session, events }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_ORIGIN_FORBIDDEN" }, { status: 403, headers: NO_STORE });
  }
  const user = await owner();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  if (!TOUCHLINE_LIVE_QUICK_SUB_ENABLED) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_DISABLED_MARKET_RULE" }, { status: 410, headers: NO_STORE });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_UNAVAILABLE" }, { status: 503, headers: NO_STORE });

  const body = record(await request.json().catch(() => null));
  // The Live UI has only the provider-scoped public fixture key. Map it to
  // the immutable TouchLine fixture UUID on the server before any DB command.
  const providerFixtureId = strictSportmonksId(body?.providerFixtureId);
  const suppliedBench = body?.benchInventoryIds;
  const benchIds = Array.isArray(suppliedBench) ? suppliedBench.map(uuid) : [];
  if (!providerFixtureId || benchIds.length !== 9 || benchIds.some((id) => !id)) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_INVALID_MATCHDAY" }, { status: 400, headers: NO_STORE });
  }
  const canonicalBenchIds = benchIds as string[];
  if (new Set(canonicalBenchIds).size !== 9) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_INVALID_MATCHDAY" }, { status: 400, headers: NO_STORE });
  }

  const [rosterResult, fixtureResult] = await Promise.all([
    readAuthoritativeTouchlineRoster(admin, user.id),
    admin.from("football_fixtures")
      .select("id,round_id,provider")
      .eq("provider", "sportmonks")
      .eq("provider_fixture_id", providerFixtureId)
      .maybeSingle(),
  ]);
  if (!rosterResult.ok) {
    return NextResponse.json({ ok: false, error: rosterResult.error }, { status: 503, headers: NO_STORE });
  }
  if (fixtureResult.error) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_FIXTURE_READ_FAILED" }, { status: 503, headers: NO_STORE });
  if (!fixtureResult.data?.round_id) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_MATCH_NOT_CANONICAL" }, { status: 409, headers: NO_STORE });
  }
  const fixtureId = uuid(fixtureResult.data.id);
  if (!fixtureId || fixtureResult.data.provider !== "sportmonks") {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_MATCH_NOT_CANONICAL" }, { status: 409, headers: NO_STORE });
  }

  const { data: gameweek, error: gameweekError } = await admin
    .from("touchline_fantasy_gameweeks")
    .select("id,state")
    .eq("round_id", fixtureResult.data.round_id)
    .maybeSingle();
  if (gameweekError) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_GAMEWEEK_READ_FAILED" }, { status: 503, headers: NO_STORE });
  if (!gameweek || !["LOCKED", "LIVE"].includes(gameweek.state)) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_MATCH_NOT_ACTIVE" }, { status: 409, headers: NO_STORE });
  }

  const { data: userGameweek, error: userGameweekError } = await admin
    .from("touchline_fantasy_user_gameweeks")
    .select("id,state,locked_at")
    .eq("user_id", user.id)
    .eq("gameweek_id", gameweek.id)
    .eq("state", "LOCKED")
    .maybeSingle();
  if (userGameweekError) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_LOCKED_XI_READ_FAILED" }, { status: 503, headers: NO_STORE });
  if (!userGameweek?.locked_at) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_LOCKED_XI_UNAVAILABLE" }, { status: 409, headers: NO_STORE });
  }

  const { data: lockedRows, error: lockedRowsError } = await admin
    .from("touchline_fantasy_locked_selections")
    .select("player_id,slot_index")
    .eq("user_gameweek_id", userGameweek.id)
    .order("slot_index", { ascending: true });
  if (lockedRowsError) return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_LOCKED_XI_READ_FAILED" }, { status: 503, headers: NO_STORE });
  if (!Array.isArray(lockedRows) || lockedRows.length !== 11) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_LOCKED_XI_INVALID" }, { status: 409, headers: NO_STORE });
  }

  const inventoryByCanonicalPlayer = new Map(
    rosterResult.snapshot.cards.flatMap((card) => {
      const canonicalPlayerId = uuid(card.canonicalPlayerId);
      const inventoryId = uuid(card.inventoryId);
      return canonicalPlayerId && inventoryId ? [[canonicalPlayerId, inventoryId] as const] : [];
    }),
  );
  const startingIds = lockedRows.map((row) => {
    const playerId = uuid(row.player_id);
    return playerId ? inventoryByCanonicalPlayer.get(playerId) ?? null : null;
  });
  if (startingIds.length !== 11 || startingIds.some((id) => !id) || new Set(startingIds).size !== 11) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_LOCKED_XI_INVALID" }, { status: 409, headers: NO_STORE });
  }
  const canonicalStartingIds = startingIds as string[];
  const ownedIds = new Set(rosterResult.snapshot.inventoryIds.map((id) => id.toLowerCase()));
  if (canonicalBenchIds.some((id) => !ownedIds.has(id) || canonicalStartingIds.includes(id))) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_BENCH_OWNERSHIP_INVALID" }, { status: 409, headers: NO_STORE });
  }

  const rosterRevision = createHash("sha256")
    .update(JSON.stringify({
      userGameweekId: userGameweek.id,
      lockedAt: userGameweek.locked_at,
      lockedPlayerIds: lockedRows.map((row) => row.player_id),
      startingInventoryIds: canonicalStartingIds,
      benchInventoryIds: canonicalBenchIds,
    }))
    .digest("hex");
  const { data, error } = await admin.rpc("touchline_arena_quick_substitution_start", {
    p_user_id: user.id,
    p_fixture_id: fixtureId,
    p_roster_revision: rosterRevision,
    p_starting_inventory_ids: canonicalStartingIds,
    p_bench_inventory_ids: canonicalBenchIds,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message.match(/TL_QUICK_SUB_[A-Z_]+/)?.[0] ?? "TL_QUICK_SUB_START_FAILED" },
      { status: errorStatus(error.message), headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, session: data }, { status: 200, headers: NO_STORE });
}
