import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
  return_to?: unknown;
  locale?: unknown;
};

type LoginError =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_disabled"
  | "profile_setup_failed"
  | "session_cookie_failure"
  | "auth_unavailable";

type SessionCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

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

function nativeErrorResponse(request: NextRequest, error: LoginError, returnTo: unknown, locale?: unknown) {
  const target = new URL("/login", request.url);
  target.searchParams.set("error", error);
  if (locale === "pt-BR" || locale === "en-GB") target.searchParams.set("lang", locale);
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

function applySessionCookies(response: NextResponse, sessionCookies: SessionCookie[]) {
  sessionCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...options,
      domain: undefined,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
  return response;
}

function successResponse(sessionCookies: SessionCookie[]) {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  return applySessionCookies(response, sessionCookies);
}

function nativeSessionResponse(
  request: NextRequest,
  sessionCookies: SessionCookie[],
  returnTo: unknown,
) {
  const destination = safeReturnTo(request, returnTo);
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  return applySessionCookies(response, sessionCookies);
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
        locale: form.get("locale"),
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
      ? nativeErrorResponse(request, "invalid_credentials", payload.return_to, payload.locale)
      : invalidRequest();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return nativeFormPost
      ? nativeErrorResponse(request, "auth_unavailable", payload.return_to, payload.locale)
      : NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }

  // The session is established by the first-party response itself. This keeps
  // password handling on TouchLine and avoids a second cross-origin browser
  // authentication request after the credentials have already been verified.
  let sessionCookies: SessionCookie[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      encode: "tokens-only",
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        // Apply the final compact cookie set once. An intermediate response
        // can duplicate chunks and produce a header Safari/Vercel rejects.
        sessionCookies = items;
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const safeError = safeLoginError(error);
      return nativeFormPost
        ? nativeErrorResponse(request, safeError, payload.return_to, payload.locale)
        : NextResponse.json({ ok: false, error: safeError }, { status: 401 });
    }

    try {
      await ensureTouchlineArenaAccess(data.user);
      if (!data.session?.access_token || !data.session.refresh_token) {
        return nativeFormPost
          ? nativeErrorResponse(request, "session_cookie_failure", payload.return_to, payload.locale)
          : NextResponse.json({ ok: false, error: "session_cookie_failure" }, { status: 503 });
      }
      return nativeFormPost
        ? nativeSessionResponse(request, sessionCookies, payload.return_to)
        : successResponse(sessionCookies);
    } catch {
      return nativeFormPost
        ? nativeErrorResponse(request, "profile_setup_failed", payload.return_to, payload.locale)
        : NextResponse.json({ ok: false, error: "profile_setup_failed" }, { status: 503 });
    }
  } catch {
    return nativeFormPost
      ? nativeErrorResponse(request, "auth_unavailable", payload.return_to, payload.locale)
      : NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
