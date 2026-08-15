import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";
import { resolveTouchLineAuthCallbackDestination } from "@/lib/server/auth-callback-destination";
import {
  createTouchLinePasswordRecoveryGrant,
  TOUCHLINE_PASSWORD_RECOVERY_COOKIE,
  TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE,
  touchLinePasswordRecoveryCookieOptions,
  touchLinePasswordRecoveryIntentCookieOptions,
  verifyTouchLinePasswordRecoveryIntent,
} from "@/lib/server/password-recovery";
import { normalizeTouchLineAuthReturnTo } from "@/lib/touchlineArena/auth-i18n";

function clearPasswordRecoveryState(response: NextResponse, requestUrl: string) {
  response.cookies.set(TOUCHLINE_PASSWORD_RECOVERY_COOKIE, "", {
    ...touchLinePasswordRecoveryCookieOptions(requestUrl),
    maxAge: 0,
  });
  response.cookies.set(TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE, "", {
    ...touchLinePasswordRecoveryIntentCookieOptions(requestUrl),
    maxAge: 0,
  });
  return response;
}

function clearPasswordRecoveryIntent(response: NextResponse, requestUrl: string) {
  response.cookies.set(TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE, "", {
    ...touchLinePasswordRecoveryIntentCookieOptions(requestUrl),
    maxAge: 0,
  });
  return response;
}

async function signOutFailedAuthentication(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    return !error;
  } catch {
    // The failure response still prevents application navigation. Supabase cookie
    // removal is attempted first so a partially provisioned session cannot linger.
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const nextUrl = resolveTouchLineAuthCallbackDestination(requestedNext, origin);
  const requestsPasswordRecovery = nextUrl.pathname === "/reset-password";
  if (code) {
    const supabase = await createClient();
    if (!supabase) {
      return clearPasswordRecoveryState(
        NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 }),
        request.url,
      );
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      const failureUrl = requestsPasswordRecovery ? nextUrl : new URL("/login", origin);
      const locale = nextUrl.searchParams.get("lang");
      if (locale) failureUrl.searchParams.set("lang", locale);
      const returnTo = normalizeTouchLineAuthReturnTo(`${nextUrl.pathname}${nextUrl.search}`);
      if (!requestsPasswordRecovery && returnTo) failureUrl.searchParams.set("returnTo", returnTo);
      failureUrl.searchParams.set("error", "auth_callback");
      return clearPasswordRecoveryState(NextResponse.redirect(failureUrl), request.url);
    }

    const recoveryIntent = request.cookies.get(TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE)?.value;
    const isPasswordRecovery = requestsPasswordRecovery
      && verifyTouchLinePasswordRecoveryIntent(recoveryIntent, data.user.email);
    if (requestsPasswordRecovery && !isPasswordRecovery) {
      const signedOut = await signOutFailedAuthentication(supabase);
      if (!signedOut) {
        return clearPasswordRecoveryState(
          NextResponse.json(
            { error: "Invalid recovery session could not be cleared." },
            { status: 503 },
          ),
          request.url,
        );
      }
      nextUrl.searchParams.set("error", "auth_callback");
      return clearPasswordRecoveryState(NextResponse.redirect(nextUrl), request.url);
    }

    if (isPasswordRecovery) {
      const recoveryUrl = requestsPasswordRecovery ? nextUrl : new URL("/reset-password", origin);
      const locale = nextUrl.searchParams.get("lang");
      if (locale) recoveryUrl.searchParams.set("lang", locale);
      try {
        const response = NextResponse.redirect(recoveryUrl);
        response.cookies.set(
          TOUCHLINE_PASSWORD_RECOVERY_COOKIE,
          createTouchLinePasswordRecoveryGrant(data.user.id),
          touchLinePasswordRecoveryCookieOptions(request.url),
        );
        return clearPasswordRecoveryIntent(response, request.url);
      } catch {
        const signedOut = await signOutFailedAuthentication(supabase);
        return clearPasswordRecoveryState(
          NextResponse.json(
            {
              error: signedOut
                ? "Password recovery is unavailable."
                : "Password recovery is unavailable and the session could not be cleared.",
            },
            { status: 503 },
          ),
          request.url,
        );
      }
    }

    try {
      await ensureTouchlineArenaAccess(data.user);
    } catch {
      const signedOut = await signOutFailedAuthentication(supabase);
      // The server-owned access flag remains absent, so protected routes fail
      // closed even if Supabase cannot clear the incomplete session immediately.
      return clearPasswordRecoveryState(
        NextResponse.json(
          {
            error: signedOut
              ? "Unable to finish Arena access."
              : "Unable to finish Arena access or clear the incomplete session.",
          },
          { status: 503 },
        ),
        request.url,
      );
    }
  }
  return clearPasswordRecoveryState(NextResponse.redirect(nextUrl), request.url);
}
