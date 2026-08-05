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

function successResponse(responseWithSession: NextResponse) {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );

  // Preserve each cookie through the route-handler response. Passing the
  // raw Headers object can collapse repeated Set-Cookie headers in some
  // runtimes; Safari then receives an incomplete (and unusable) session.
  responseWithSession.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
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

  // The session is established by the first-party response itself. This keeps
  // password handling on TouchLine and avoids a second cross-origin browser
  // authentication request after the credentials have already been verified.
  const responseWithSession = NextResponse.json({ ok: true });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => responseWithSession.cookies.set(name, value, options));
      },
    },
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
      return successResponse(responseWithSession);
    } catch {
      return NextResponse.json({ ok: false, error: "arena_access_unavailable" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
