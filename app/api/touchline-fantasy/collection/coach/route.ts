import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail, ownerEmails } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLUB_COACH_VALUES } from "@/lib/touchlineFantasy/club-acquisition";
import { loadTouchlineFantasyReadSnapshot } from "@/lib/touchlineFantasy/server";
import { readClubCommand } from "@/lib/touchlineFantasy/club-request";
import { parseClubCommandAuthority, clubCommandMatchesAuthority } from "@/lib/touchlineFantasy/club-command-authority";
import { parseClubCoachLifecycleCommand } from "@/lib/touchlineFantasy/club-coach-lifecycle";
import { clubCoachLifecycleEnabled, commitClubCoachLifecycle, createClubCoachLifecycleRepository } from "@/lib/touchlineFantasy/club-coach-lifecycle-server";
import { readClubCoachLifecycleRecovery } from "@/lib/touchlineFantasy/club-coach-lifecycle-recovery-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers });
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("INVALID_ORIGIN", 403);
  if (!clubCoachLifecycleEnabled()) return fail("CLUB_COACH_LIFECYCLE_UNAVAILABLE", 503);
  try {
    const client = await createClient();
    const { data, error } = client ? await client.auth.getUser() : { data: { user: null }, error: null };
    if (error || !data.user) return fail("AUTH_REQUIRED", 401);
    if (!ownerEmails().length || !data.user.email || isOwnerEmail(data.user.email) || !hasTouchLineArenaAccess(data.user)) return fail("CLUB_ACCESS_REQUIRED", 403);
    const envelope = parseClubCommandAuthority(await readClubCommand(request));
    const command = parseClubCoachLifecycleCommand(envelope?.command);
    if (!envelope || !command) return fail("INVALID_REQUEST", 400);
    const admin = createAdminClient();
    if (!admin) return fail("CLUB_STORAGE_UNAVAILABLE", 503);
    const { data: config, error: configError } = await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key", "england").eq("status", "active").single();
    if (configError || !config?.season_id) return fail("CLUB_SEASON_UNAVAILABLE", 503);
    const seasonId = String(config.season_id);
    if (!clubCommandMatchesAuthority(envelope.authority, data.user.id, seasonId)) return fail("CLUB_CONTEXT_CHANGED", 409);
    const repository = createClubCoachLifecycleRepository(admin);
    const context = { status: "verified", role: "customer", accountId: data.user.id, seasonId } as const;
    const recovered = await readClubCoachLifecycleRecovery(repository, context, { ...envelope.authority, ...command }, true);
    if (recovered.status === "committed") return NextResponse.json(recovered.response, { headers });
    if (recovered.status !== "not_observed") return fail("CLUB_STORAGE_UNAVAILABLE", 503);
    const snapshot = await loadTouchlineFantasyReadSnapshot(data.user);
    if (!snapshot?.entitlementActive) return fail("CLUB_ACCESS_REQUIRED", 403);
    const coach = command.action === "hire-coach" ? snapshot.coaches.find(entry => entry.selectable !== false && entry.id === command.incomingCoachId) : null;
    if (command.action === "hire-coach" && !coach) return fail("CLUB_COACH_UNAVAILABLE", 409);
    await commitClubCoachLifecycle(admin, data.user.id, seasonId, command, coach ? {
      id: coach.id, tier: coach.slot.cardTier, valueEur: CLUB_COACH_VALUES[coach.slot.cardTier], clubId: coach.clubId, published: true,
      catalogueRevision: coach.catalogueRevision, cataloguePublicationId: coach.cataloguePublicationId,
    } : null);
    // Prove the durable historical record, never infer completion from current vacancy.
    const committed = await readClubCoachLifecycleRecovery(repository, context, { ...envelope.authority, ...command }, true);
    if (committed.status !== "committed") return fail("CLUB_STORAGE_UNAVAILABLE", 503);
    return NextResponse.json({ ...committed.response, replayed: false }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message.match(/^CLUB_[A-Z_]+$/)?.[0] : null;
    return fail(code ?? "CLUB_STORAGE_UNAVAILABLE", !code || code.includes("UNAVAILABLE") ? 503 : 409);
  }
}

/** Observation remains available with the mutation gate OFF; never retries POST. */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin !== null && origin !== request.nextUrl.origin) return fail("INVALID_ORIGIN", 403);
  const reference = request.headers.get("X-Touchline-Coach-Reference");
  if (!reference || reference.length > 1024) return fail("INVALID_REQUEST", 400);
  try {
    const envelope = parseClubCommandAuthority(JSON.parse(reference));
    const command = parseClubCoachLifecycleCommand(envelope?.command);
    if (!envelope || !command) return fail("INVALID_REQUEST", 400);
    const client = await createClient();
    const { data, error } = client ? await client.auth.getUser() : { data: { user: null }, error: null };
    if (error || !data.user) return fail("AUTH_REQUIRED", 401);
    if (!ownerEmails().length || !data.user.email || isOwnerEmail(data.user.email) || !hasTouchLineArenaAccess(data.user)) return fail("CLUB_ACCESS_REQUIRED", 403);
    const admin = createAdminClient();
    if (!admin) return fail("CLUB_STORAGE_UNAVAILABLE", 503);
    const { data: config, error: configError } = await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key", "england").eq("status", "active").single();
    if (configError || !config?.season_id) return fail("CLUB_SEASON_UNAVAILABLE", 503);
    const seasonId = String(config.season_id);
    if (!clubCommandMatchesAuthority(envelope.authority, data.user.id, seasonId)) return fail("CLUB_CONTEXT_CHANGED", 409);
    const result = await readClubCoachLifecycleRecovery(createClubCoachLifecycleRepository(admin),
      { status: "verified", role: "customer", accountId: data.user.id, seasonId }, { ...envelope.authority, ...command }, true);
    return NextResponse.json(result, { headers });
  } catch { return fail("CLUB_STORAGE_UNAVAILABLE", 503); }
}
