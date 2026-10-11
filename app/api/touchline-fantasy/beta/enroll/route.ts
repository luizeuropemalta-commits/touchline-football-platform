import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { enrollBeta, readBetaEnrollmentCommand, type BetaEnrollmentRpc } from "@/lib/touchlineFantasy/beta-enrollment-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function response(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function failure(error: string, status: number) { return response({ ok: false, error }, status); }

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (origin ? origin !== request.nextUrl.origin || Boolean(site && site !== "same-origin") : site !== "same-origin") {
    return failure("BETA_CROSS_ORIGIN", 403);
  }
  try {
    const supabase = await createClient();
    if (!supabase) return failure("BETA_UNAVAILABLE", 503);
    const user = await resolveServerReadWithin(supabase.auth.getUser().then(({ data, error }) => error ? null : data.user), null, 8000);
    if (!user?.id || !user.email || !user.email_confirmed_at || !hasTouchLineArenaAccess(user)) return failure("BETA_FORBIDDEN", 403);
    if (isOwnerEmail(user.email)) return failure("BETA_OWNER_EXCLUDED", 403);
    if (!await readBetaEnrollmentCommand(request)) return failure("BETA_INVALID_COMMAND", 400);
    if (request.signal.aborted) return failure("BETA_UNAVAILABLE", 503);
    const admin = createAdminClient();
    if (!admin) return failure("BETA_UNAVAILABLE", 503);
    // The SQL contract is idempotent for this canonical user. A timeout does
    // not mean failure: repeating {} reads current state without downgrading.
    const result = await resolveServerReadWithin(enrollBeta(admin as unknown as BetaEnrollmentRpc, { id: user.id, email: user.email }),
      { status: 503, body: { ok: false as const, error: "BETA_UNAVAILABLE" } }, 8000);
    if (request.signal.aborted) return failure("BETA_UNAVAILABLE", 503);
    return response(result.body, result.status);
  } catch { return failure("BETA_UNAVAILABLE", 503); }
}
