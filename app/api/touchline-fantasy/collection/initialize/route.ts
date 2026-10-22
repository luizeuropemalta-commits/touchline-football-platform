import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubCollectionEnabled } from "@/lib/touchlineFantasy/club-collection-server";
import { CLUB_COACH_VALUES } from "@/lib/touchlineFantasy/club-acquisition";
import { loadTouchlineFantasyReadSnapshot } from "@/lib/touchlineFantasy/server";
import { readClubCommand } from "@/lib/touchlineFantasy/club-request";
import { inspectClubAcquisition } from "@/lib/touchlineFantasy/club-acquisition";
import { parseClubCommandAuthority, clubCommandMatchesAuthority } from "@/lib/touchlineFantasy/club-command-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { headers, status });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("INVALID_ORIGIN",403);
  if (!clubCollectionEnabled()) return fail("CLUB_COLLECTION_UNAVAILABLE",503);
  try {
  const client = await createClient();
  const { data, error: authError } = client ? await client.auth.getUser() : { data: { user: null }, error: null };
  if (authError || !data.user) return fail("AUTH_REQUIRED",401);
  const parsed = await readClubCommand(request, 512);
  const envelope = parseClubCommandAuthority(parsed);
  if (!envelope) return fail("INVALID_REQUEST",400);
  const body = envelope.command as { coachId?: unknown };
  if (Object.keys(body).some(k => k !== "coachId")
    || typeof body.coachId !== "string" || body.coachId.length > 100) return fail("INVALID_REQUEST",400);
  const admin = createAdminClient();
  if (!admin) return fail("CLUB_STORAGE_UNAVAILABLE",503);
  const snapshot = await loadTouchlineFantasyReadSnapshot(data.user);
  if (!snapshot?.entitlementActive) return fail("CLUB_ACCESS_REQUIRED",403);
  const plan = snapshot.marketAccess?.planKey;
  if (!plan || !["standard","master","vip"].includes(plan)) return fail("CLUB_PLAN_UNAVAILABLE",409);
  const coach = snapshot.coaches.find(entry => entry.id === body.coachId);
  if (!coach) return fail("CLUB_COACH_UNAVAILABLE",409);
  const { data: config, error: configError } = await admin.from("touchline_fantasy_configs").select("season_id")
    .eq("competition_key","england").eq("status","active").single();
  if (configError || !config?.season_id) return fail("CLUB_SEASON_UNAVAILABLE",503);
  if (!clubCommandMatchesAuthority(envelope.authority, data.user.id, String(config.season_id))) return fail("CLUB_CONTEXT_CHANGED",409);
  const { data: state, error } = await admin.rpc("touchline_club_initialize_collection", {
    p_user_id: data.user.id, p_season_id: config.season_id, p_plan: plan,
    p_coach: { id: coach.id, tier: coach.slot.cardTier, valueEur: CLUB_COACH_VALUES[coach.slot.cardTier] },
  });
  if (error) return fail(error.message.match(/CLUB_[A-Z_]+/)?.[0] ?? "CLUB_STORAGE_UNAVAILABLE",409);
  inspectClubAcquisition(state);
  return NextResponse.json({ ok: true, state }, { headers });
  } catch { return fail("CLUB_STORAGE_UNAVAILABLE",503); }
}
