import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
  return_to?: unknown;
};

function applySessionCookies(response: NextResponse, responseWithSession: NextResponse) {
  // Copy through the cookies as cookies, not as a raw Headers object.  This is
  // important for Safari: it must receive the Supabase session Set-Cookie on
  // the same first-party response that confirms the sign-in.
  responseWithSession.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

function successResponse(responseWithSession: NextResponse, access: Awaited<ReturnType<typeof ensureTouchlineArenaAccess>>) {
  const response = NextResponse.json({ ok: true, ...access });
  applySessionCookies(response, responseWithSession);
  return response;
}

function invalidRequest() {
  return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 400 });
}

function safeReturnTo(request: NextRequest, value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/arena";
  const target = new URL(value, request.url);
  return target.origin === request.nextUrl.origin ? `${target.pathname}${target.search}` : "/arena";
}

function loginErrorRedirect(request: NextRequest, error: string, returnTo: unknown) {
  const redirectUrl = new URL("/login", request.url);
  redirectUrl.searchParams.set("error", error);
  const target = safeReturnTo(request, returnTo);
  if (target !== "/arena") redirectUrl.searchParams.set("returnTo", target);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

/**
 * Password sign-in stays first-party for browser resilience.  Safari can
 * occasionally reject a cross-origin auth fetch before Supabase receives it;
 * the server route performs that same verified exchange without ever logging
 * or returning the password.
 */
export async function POST(request: NextRequest) {
  let payload: LoginPayload;
  const nativeFormPost = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  try {
    if (nativeFormPost) {
      const formData = await request.formData();
      payload = {
        email: formData.get("email"),
        password: formData.get("password"),
        return_to: formData.get("return_to"),
      };
    } else {
      payload = await request.json() as LoginPayload;
    }
  } catch {
    return nativeFormPost ? loginErrorRedirect(request, "invalid_credentials", undefined) : invalidRequest();
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password) {
    return nativeFormPost ? loginErrorRedirect(request, "invalid_credentials", payload.return_to) : invalidRequest();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return nativeFormPost
      ? loginErrorRedirect(request, "auth_unavailable", payload.return_to)
      : NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }

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
      return nativeFormPost
        ? loginErrorRedirect(request, "invalid_credentials", payload.return_to)
        : NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    try {
      const access = await ensureTouchlineArenaAccess(data.user);
      if (nativeFormPost) {
        const destination = new URL(safeReturnTo(request, payload.return_to), request.url);
        const redirect = NextResponse.redirect(destination, { status: 303 });
        return applySessionCookies(redirect, response);
      }
      return successResponse(response, access);
    } catch {
      await supabase.auth.signOut({ scope: "local" });
      return nativeFormPost
        ? loginErrorRedirect(request, "arena_access_unavailable", payload.return_to)
        : NextResponse.json({ ok: false, error: "arena_access_unavailable" }, { status: 503 });
    }
  } catch {
    return nativeFormPost
      ? loginErrorRedirect(request, "auth_unavailable", payload.return_to)
      : NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
