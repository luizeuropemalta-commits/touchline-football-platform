import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { grantVipAccess, readVipAccessCommand, type VipAccessRpc } from "@/lib/touchlineFantasy/vip-access-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function response(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function failure(error: string, status: number) { return response({ ok: false, error }, status); }

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (origin ? origin !== request.nextUrl.origin || Boolean(site && site !== "same-origin") : site !== "same-origin") {
    return failure("VIP_CROSS_ORIGIN", 403);
  }
  try {
    const supabase = await createClient();
    if (!supabase) return failure("VIP_UNAVAILABLE", 503);
    const user = await resolveServerReadWithin(supabase.auth.getUser().then(({ data, error }) => error ? null : data.user), null, 8000);
    if (!user?.id || !user.email || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user.email)) return failure("VIP_FORBIDDEN", 403);
    const command = await readVipAccessCommand(request);
    if (!command) return failure("VIP_INVALID_COMMAND", 400);
    if (isOwnerEmail(command.email)) return failure("VIP_OWNER_EXCLUDED", 409);
    if (request.signal.aborted) return failure("VIP_UNAVAILABLE", 503);
    const admin = createAdminClient();
    if (!admin) return failure("VIP_UNAVAILABLE", 503);
    // A timeout is an unknown outcome, never proof that the transaction failed.
    // The caller must reuse commandId; only the SQL receipt can confirm replay.
    const result = await resolveServerReadWithin(
      grantVipAccess(admin as unknown as VipAccessRpc, { id: user.id, email: user.email }, command),
      { status: 503, body: { ok: false as const, error: "VIP_UNAVAILABLE" } }, 8000,
    );
    if (request.signal.aborted) return failure("VIP_UNAVAILABLE", 503);
    return response(result.body, result.status);
  } catch { return failure("VIP_UNAVAILABLE", 503); }
}
