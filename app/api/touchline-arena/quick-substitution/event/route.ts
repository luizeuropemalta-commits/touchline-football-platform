import { createHash } from "node:crypto";
import { TOUCHLINE_LIVE_QUICK_SUB_ENABLED } from "@/lib/touchlineArena/quick-substitution-product-policy";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

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

async function owner() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && user && hasTouchLineArenaAccess(user) ? user : null;
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
  const sessionId = uuid(body?.sessionId);
  const commandId = uuid(body?.commandId);
  const outgoingId = uuid(body?.outgoingInventoryId);
  const incomingId = uuid(body?.incomingInventoryId);
  const expectedRevision = typeof body?.expectedRevision === "number"
    && Number.isSafeInteger(body.expectedRevision)
    && body.expectedRevision >= 0
    ? body.expectedRevision
    : null;
  const expectedRosterRevision = typeof body?.expectedRosterRevision === "string"
    && /^[0-9a-f]{64}$/i.test(body.expectedRosterRevision)
    ? body.expectedRosterRevision.toLowerCase()
    : null;
  if (!sessionId || !commandId || !outgoingId || !incomingId || expectedRevision === null
      || !expectedRosterRevision || outgoingId === incomingId) {
    return NextResponse.json({ ok: false, error: "TL_QUICK_SUB_INVALID_COMMAND" }, { status: 400, headers: NO_STORE });
  }

  const commandHash = createHash("sha256").update(JSON.stringify([
    "touchline-quick-sub-v1",
    user.id,
    sessionId,
    commandId,
    expectedRosterRevision,
    expectedRevision,
    outgoingId,
    incomingId,
  ])).digest("hex");
  const releaseSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const releaseLink = releaseSha && /^[0-9a-f]{40}$/i.test(releaseSha)
    ? releaseSha.toLowerCase()
    : "unknown";

  const { data, error } = await admin.rpc("touchline_arena_quick_substitution_apply", {
    p_user_id: user.id,
    p_session_id: sessionId,
    p_command_id: commandId,
    p_expected_revision: expectedRevision,
    p_expected_roster_revision: expectedRosterRevision,
    p_command_hash: commandHash,
    p_release_sha: releaseLink,
    p_outgoing_inventory_id: outgoingId,
    p_incoming_inventory_id: incomingId,
  });
  if (error) {
    const code = error.message.match(/TL_QUICK_SUB_[A-Z_]+/)?.[0] ?? "TL_QUICK_SUB_APPLY_FAILED";
    const status = code === "TL_QUICK_SUB_SESSION_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ ok: false, error: code }, { status, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE });
}
