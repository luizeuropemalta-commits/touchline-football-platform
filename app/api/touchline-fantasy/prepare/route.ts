import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { loadTouchlineFantasyReadSnapshot } from "@/lib/touchlineFantasy/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function failure(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readCommand(request: NextRequest): Promise<{ expectedAccountId: string; gameweekId: string } | null> {
  const length = request.headers.get("content-length");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > 512)) || request.signal.aborted) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(512);
  let used = 0, expired = false;
  const cancel = () => { expired = true; void reader.cancel().catch(() => undefined); };
  const timer = setTimeout(cancel, 3000);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!expired) {
      const { value, done } = await reader.read();
      if (expired) return null;
      if (done) {
        const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used)));
        return input && typeof input === "object" && !Array.isArray(input)
          && Object.keys(input).length === 2 && typeof input.expectedAccountId === "string"
          && typeof input.gameweekId === "string" && UUID.test(input.expectedAccountId) && UUID.test(input.gameweekId)
          ? { expectedAccountId: input.expectedAccountId, gameweekId: input.gameweekId } : null;
      }
      if (used + value.byteLength > bytes.length) { cancel(); return null; }
      bytes.set(value, used); used += value.byteLength;
    }
  } catch { return null; }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  return null;
}

/** Deliberate authenticated ClubOwner command, never a GET/prefetch writer.
 * Only the canonical prepare RPC can carry an XI; no direct table updates,
 * global score reconciliation, auto-confirmation, entitlement grant or reset. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin
    || (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return failure("INVALID_ORIGIN", 403);
  try {
    const client = await createClient();
    if (!client) return failure("FANTASY_UNAVAILABLE", 503);
    const auth = await resolveServerReadWithin(client.auth.getUser(), null, 8000);
    const user = auth?.error === null ? auth.data.user : null;
    if (!user) return failure("AUTH_REQUIRED", 401);
    if (!user.email || !user.email_confirmed_at || !hasTouchLineArenaAccess(user) || isOwnerEmail(user.email)) return failure("FANTASY_FORBIDDEN", 403);
    const command = await readCommand(request);
    if (!command) return failure("INVALID_CONTINUITY_COMMAND", 400);
    if (command.expectedAccountId !== user.id) return failure("FANTASY_ACCOUNT_CHANGED", 403);
    const read = () => resolveServerReadWithin(loadTouchlineFantasyReadSnapshot(user), null, 8000);
    let snapshot = await read();
    if (!snapshot || snapshot.userId !== user.id) return failure("FANTASY_UNAVAILABLE", 503);
    const round = snapshot.activeGameweek;
    if (round?.id !== command.gameweekId || !snapshot.entitlementActive) return failure("FANTASY_CONTEXT_CHANGED", 409);
    if (!snapshot.userGameweek) {
      if (round.state !== "MARKET_OPEN" || !Number.isFinite(Date.parse(round.locksAt)) || Date.parse(round.locksAt) <= Date.now()) return failure("FANTASY_GAMEWEEK_LOCKED", 409);
      if (request.signal.aborted) return failure("FANTASY_UNAVAILABLE", 503);
      const admin = createAdminClient();
      if (!admin) return failure("FANTASY_UNAVAILABLE", 503);
      // The SQL transaction serializes concurrent calls, preserves existing
      // drafts and validates the predecessor, current plan and eligible XI.
      const result = await resolveServerReadWithin(admin.rpc("touchline_fantasy_prepare_user_gameweek", {
        p_user_id: user.id, p_gameweek_id: round.id,
      }).then(value => value), null, 8000);
      if (!result || result.error || typeof result.data !== "string" || !UUID.test(result.data)) return failure("FANTASY_PREPARATION_UNCONFIRMED", 503);
      if (request.signal.aborted) return failure("FANTASY_PREPARATION_UNCONFIRMED", 503);
      snapshot = await read();
      if (!snapshot || snapshot.userId !== user.id || snapshot.activeGameweek?.id !== round.id
        || snapshot.userGameweek?.id !== result.data) return failure("FANTASY_PREPARATION_UNCONFIRMED", 503);
    }
    return NextResponse.json({ ok: true, userId: snapshot.userId, gameweeks: snapshot.gameweeks,
      activeGameweek: snapshot.activeGameweek, userGameweek: snapshot.userGameweek, selections: snapshot.selections,
      gameweekScore: snapshot.gameweekScore, seasonScore: snapshot.seasonScore, matchHistory: snapshot.matchHistory,
      gameweekRanking: snapshot.gameweekRanking, seasonRanking: snapshot.seasonRanking,
      lineupAlerts: snapshot.lineupAlerts, matchCardIndicators: snapshot.matchCardIndicators ?? null,
      playerAvailabilityIndicators: snapshot.playerAvailabilityIndicators ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return failure("FANTASY_UNAVAILABLE", 503); }
}
