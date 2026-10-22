import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseTouchlineFantasyLineupRequest } from "@/lib/touchlineFantasy/domain";
import { clubCollectionEnabled } from "@/lib/touchlineFantasy/club-collection-server";
import { parseClubCommandAuthority, clubCommandMatchesAuthority } from "@/lib/touchlineFantasy/club-command-authority";

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
  const { data: { user }, error: authError } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
  if (authError || !user) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  const body = await readBoundedJson(request);
  const input = parseTouchlineFantasyLineupRequest(body);
  if (!input) return NextResponse.json({ ok: false, error: "INVALID_LINEUP_REQUEST" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const revision = body && typeof body === "object" ? (body as Record<string, unknown>).collectionRevision : undefined;
  const collection = revision !== undefined;
  if (collection && (!clubCollectionEnabled() || !Number.isSafeInteger(revision) || Number(revision)<0)) {
    return NextResponse.json({ok:false,error:"CLUB_COLLECTION_UNAVAILABLE"},{status:409});
  }
  if (collection) {
    const envelope = parseClubCommandAuthority(body);
    if (!envelope) return NextResponse.json({ok:false,error:"INVALID_LINEUP_REQUEST"},{status:400});
    const {data:config,error:configError} = await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key","england").eq("status","active").single();
    if (configError || !config?.season_id) return NextResponse.json({ok:false,error:"CLUB_SEASON_UNAVAILABLE"},{status:503});
    if (!clubCommandMatchesAuthority(envelope.authority,user.id,String(config.season_id))) {
      return NextResponse.json({ok:false,error:"CLUB_CONTEXT_CHANGED"},{status:409});
    }
  }
  const { data, error } = await admin.rpc(collection ? "touchline_club_save_lineup" : "touchline_fantasy_save_lineup", {
    p_user_id: user.id,
    p_gameweek_id: input.gameweekId,
    p_selected_coach_id: input.selectedCoachId,
    p_formation_code: input.formationCode,
    p_selections: input.selections,
    p_action: input.action,
    p_idempotency_key: input.idempotencyKey,
    ...(collection ? { p_expected_revision: revision } : {}),
  });
  if (error) {
    const message = String(error.message ?? "TL_FANTASY_LINEUP_FAILED");
    return NextResponse.json({ ok: false, error: message.match(/(?:TL_FANTASY|CLUB)_[A-Z0-9_]+/)?.[0] ?? "TL_FANTASY_LINEUP_FAILED" }, { status: statusForMessage(message) });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
