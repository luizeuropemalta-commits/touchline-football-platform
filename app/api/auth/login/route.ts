import { NextResponse } from "next/server";

import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";
import { createClient } from "@/lib/supabase/server";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
};

function invalidRequest() {
  return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 400 });
}

/**
 * Password sign-in stays first-party for browser resilience.  Safari can
 * occasionally reject a cross-origin auth fetch before Supabase receives it;
 * the server route performs that same verified exchange without ever logging
 * or returning the password.
 */
export async function POST(request: Request) {
  let payload: LoginPayload;
  try {
    payload = await request.json() as LoginPayload;
  } catch {
    return invalidRequest();
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password) return invalidRequest();

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    try {
      const access = await ensureTouchlineArenaAccess(data.user);
      return NextResponse.json({ ok: true, ...access });
    } catch {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json({ ok: false, error: "arena_access_unavailable" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
