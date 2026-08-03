import { NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { isLocalTouchlineEditorEnabled } from "@/lib/touchlineArena/editor-request";

export function requireLocalTouchlineEditor(_request: Request) {
  if (isLocalTouchlineEditorEnabled()) return null;

  return NextResponse.json(
    { ok: false, error: "This editor operation is available only from the local TouchLine development environment." },
    { status: 403 },
  );
}

async function authenticatedUserEmail() {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) ? user?.email ?? null : null;
}

export async function requireAuthenticatedOrLocalTouchlineEditor(_request: Request) {
  if (isLocalTouchlineEditorEnabled()) return null;
  if (await authenticatedUserEmail()) return null;

  return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
}

export async function requireOwnerOrLocalTouchlineEditor(_request: Request) {
  if (isLocalTouchlineEditorEnabled()) return null;
  if (isOwnerEmail(await authenticatedUserEmail())) return null;

  return NextResponse.json({ ok: false, error: "Owner access required." }, { status: 403 });
}
