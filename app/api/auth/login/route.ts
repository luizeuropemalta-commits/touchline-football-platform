import { createServerClient } from "@supabase/ssr";
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

  // Keep the response object that will return to Safari. Supabase writes its
  // authenticated cookie into this exact response, instead of relying on a
  // framework cookie mutation that can be lost at a route-handler boundary.
  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    try {
      const access = await ensureTouchlineArenaAccess(data.user);
      return NextResponse.json({ ok: true, ...access }, { headers: response.headers });
    } catch {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json({ ok: false, error: "arena_access_unavailable" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
