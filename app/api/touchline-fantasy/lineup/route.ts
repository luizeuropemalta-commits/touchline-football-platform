import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseTouchlineFantasyLineupRequest } from "@/lib/touchlineFantasy/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_LINEUP_REQUEST_BYTES = 8_192;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_LINEUP_REQUEST_BYTES) return null;
  const bodyText = await request.text().catch(() => "");
  if (!bodyText || new TextEncoder().encode(bodyText).byteLength > MAX_LINEUP_REQUEST_BYTES) return null;
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return null;
  }
}

function statusForMessage(message: string) {
  if (message.includes("ENTITLEMENT_REQUIRED")) return 403;
  if (message.includes("GAMEWEEK_LOCKED")) return 409;
  if (message.includes("NOT_FOUND")) return 404;
  return 422;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  const input = parseTouchlineFantasyLineupRequest(await readBoundedJson(request));
  if (!input) return NextResponse.json({ ok: false, error: "INVALID_LINEUP_REQUEST" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { data, error } = await admin.rpc("touchline_fantasy_save_lineup", {
    p_user_id: user.id,
    p_gameweek_id: input.gameweekId,
    p_selected_coach_id: input.selectedCoachId,
    p_formation_code: input.formationCode,
    p_selections: input.selections,
    p_action: input.action,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const message = String(error.message ?? "TL_FANTASY_LINEUP_FAILED");
    return NextResponse.json({ ok: false, error: message.match(/TL_FANTASY_[A-Z0-9_]+/)?.[0] ?? "TL_FANTASY_LINEUP_FAILED" }, { status: statusForMessage(message) });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
