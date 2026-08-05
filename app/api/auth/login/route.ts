import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";

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
export async function POST(request: NextRequest) {
  let payload: LoginPayload;
  try {
    payload = await request.json() as LoginPayload;
  } catch {
    return invalidRequest();
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password) return invalidRequest();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });

  // Do not return an HTTP Set-Cookie from this endpoint. Safari was dropping
  // the connection while processing the large chunked session header. The
  // browser client receives the short-lived session payload over HTTPS and
  // stores it through its canonical Supabase cookie adapter instead.
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    try {
      await ensureTouchlineArenaAccess(data.user);
      if (!data.session?.access_token || !data.session.refresh_token) {
        return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
      }
      return NextResponse.json(
        {
          ok: true,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json({ ok: false, error: "arena_access_unavailable" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
