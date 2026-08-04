import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { parseTouchlineCentralReadIntent } from "@/lib/touchlineArena/central-inbox";

function isCentralAudienceForEngland(
  row: { origin?: unknown; publication_status?: unknown; audience_scope?: unknown; competition_key?: unknown; target_user_id?: unknown },
  userId: string,
) {
  if (row.origin !== "ADMIN" || row.publication_status !== "PUBLISHED") return false;
  if (row.audience_scope === "GLOBAL") return true;
  if (row.audience_scope === "COMPETITION") return row.competition_key === "england";
  return row.audience_scope === "USER"
    && row.target_user_id === userId
    && (row.competition_key === null || row.competition_key === "england");
}

export async function POST(request: Request) {
  const intent = parseTouchlineCentralReadIntent(await request.json().catch(() => null));
  if (!intent) return NextResponse.json({ ok: false, error: "TL_CENTRAL_INVALID_READ_INTENT" }, { status: 400 });

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user || !hasTouchLineArenaAccess(user)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!admin) return NextResponse.json({ ok: false, error: "TL_CENTRAL_UNAVAILABLE" }, { status: 503 });

  const { data: message, error: messageError } = await admin
    .from("touchline_central_messages")
    .select("id,origin,publication_status,audience_scope,competition_key,target_user_id")
    .eq("id", intent.messageId)
    .maybeSingle();
  if (messageError) return NextResponse.json({ ok: false, error: "TL_CENTRAL_UNAVAILABLE" }, { status: 503 });
  if (!message || !isCentralAudienceForEngland(message, user.id)) {
    return NextResponse.json({ ok: false, error: "TL_CENTRAL_MESSAGE_NOT_FOUND" }, { status: 404 });
  }

  const { error: receiptError } = await admin
    .from("touchline_central_inbox_receipts")
    .upsert({ message_id: intent.messageId, user_id: user.id, read_at: new Date().toISOString() }, { onConflict: "message_id,user_id" });
  if (receiptError) return NextResponse.json({ ok: false, error: "TL_CENTRAL_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
