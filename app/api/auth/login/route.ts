import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
  return_to?: unknown;
};

type LoginError =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_disabled"
  | "profile_setup_failed"
  | "session_cookie_failure"
  | "auth_unavailable";

function invalidRequest() {
  return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 400 });
}

function isNativeFormRequest(request: NextRequest) {
  return request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
}

function safeReturnTo(request: NextRequest, value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/arena";
  const target = new URL(value, request.url);
  return target.origin === request.nextUrl.origin ? `${target.pathname}${target.search}` : "/arena";
}

function nativeErrorResponse(request: NextRequest, error: LoginError, returnTo: unknown) {
  const target = new URL("/login", request.url);
  target.searchParams.set("error", error);
  const destination = safeReturnTo(request, returnTo);
  if (destination !== "/arena") target.searchParams.set("returnTo", destination);
  return NextResponse.redirect(target, { status: 303 });
}

function safeLoginError(error: { code?: string; message?: string } | null): LoginError {
  if (error?.code === "email_not_confirmed") return "email_not_confirmed";
  if (error?.code === "user_banned" || error?.code === "user_disabled") return "account_disabled";
  if (error?.code === "invalid_credentials") return "invalid_credentials";
  return "auth_unavailable";
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

function nativeSessionResponse(
  request: NextRequest,
  responseWithSession: NextResponse,
  returnTo: unknown,
) {
  const destination = safeReturnTo(request, returnTo);
  const response = new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>TouchLine</title></head><body><script>window.location.replace(${JSON.stringify(destination)});</script><noscript><a href="${destination}">Continue</a></noscript></body></html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
      },
    },
  );

  // This response is a top-level Safari navigation, not a fetch response.
  // Keep the session host-only, HTTPS-only and Lax so www redirects cannot
  // produce a competing session cookie for the canonical root domain.
  responseWithSession.cookies.getAll().forEach(({ name, value, ...cookie }) => {
    response.cookies.set(name, value, {
      ...cookie,
      domain: undefined,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
  return response;
}

/**
 * Password sign-in stays first-party for browser resilience.  Safari can
 * occasionally reject a cross-origin auth fetch before Supabase receives it;
 * the server route performs that same verified exchange without ever logging
 * or returning the password.
 */
export async function POST(request: NextRequest) {
  const nativeFormPost = isNativeFormRequest(request);
  let payload: LoginPayload;
  try {
    if (nativeFormPost) {
      const form = await request.formData();
      payload = {
        email: form.get("email"),
        password: form.get("password"),
        return_to: form.get("return_to"),
      };
    } else {
      payload = await request.json() as LoginPayload;
    }
  } catch {
    return nativeFormPost ? nativeErrorResponse(request, "invalid_credentials", undefined) : invalidRequest();
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password) {
    return nativeFormPost
      ? nativeErrorResponse(request, "invalid_credentials", payload.return_to)
      : invalidRequest();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return nativeFormPost
      ? nativeErrorResponse(request, "auth_unavailable", payload.return_to)
      : NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }

  // The session is established by the first-party response itself. This keeps
  // password handling on TouchLine and avoids a second cross-origin browser
  // authentication request after the credentials have already been verified.
  const responseWithSession = NextResponse.json({ ok: true });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => responseWithSession.cookies.set(name, value, {
          ...options,
          path: "/",
          sameSite: "lax",
          secure: true,
        }));
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const safeError = safeLoginError(error);
      return nativeFormPost
        ? nativeErrorResponse(request, safeError, payload.return_to)
        : NextResponse.json({ ok: false, error: safeError }, { status: 401 });
    }

    try {
      await ensureTouchlineArenaAccess(data.user);
      if (!data.session?.access_token || !data.session.refresh_token) {
        return nativeFormPost
          ? nativeErrorResponse(request, "session_cookie_failure", payload.return_to)
          : NextResponse.json({ ok: false, error: "session_cookie_failure" }, { status: 503 });
      }
      return nativeFormPost
        ? nativeSessionResponse(request, responseWithSession, payload.return_to)
        : successResponse(responseWithSession);
    } catch {
      return nativeFormPost
        ? nativeErrorResponse(request, "profile_setup_failed", payload.return_to)
        : NextResponse.json({ ok: false, error: "profile_setup_failed" }, { status: 503 });
    }
  } catch {
    return nativeFormPost
      ? nativeErrorResponse(request, "auth_unavailable", payload.return_to)
      : NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
