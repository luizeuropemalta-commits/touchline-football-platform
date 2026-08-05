"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ensureTouchlineArenaAccess } from "@/lib/server/touchline-arena-access";
import {
  normalizeTouchLineAuthLocale,
  normalizeTouchLineAuthReturnTo,
  touchLineAuthEntryHref,
  touchLinePostAuthHref,
} from "@/lib/touchlineArena/auth-i18n";

type LoginError =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_disabled"
  | "profile_setup_failed"
  | "session_cookie_failure"
  | "auth_unavailable";

function safeLoginError(error: { code?: string } | null): LoginError {
  if (error?.code === "email_not_confirmed") return "email_not_confirmed";
  if (error?.code === "user_banned" || error?.code === "user_disabled") return "account_disabled";
  if (error?.code === "invalid_credentials") return "invalid_credentials";
  return "auth_unavailable";
}

function loginFailure(error: LoginError, locale: string, returnTo: string | null): never {
  const destination = new URL(touchLineAuthEntryHref("/login", locale, returnTo), "https://touchline.local");
  destination.searchParams.set("error", error);
  redirect(`${destination.pathname}${destination.search}`);
}

/**
 * The password form uses a Next Server Action instead of a visible API
 * navigation. Safari keeps the login document as the current browser route
 * while Next performs the POST, persists first-party cookies and redirects to
 * the actual requested Arena page.
 */
export async function loginWithPassword(formData: FormData) {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const locale = normalizeTouchLineAuthLocale(typeof formData.get("locale") === "string" ? formData.get("locale") as string : null);
  const requestedReturnTo = normalizeTouchLineAuthReturnTo(
    typeof formData.get("return_to") === "string" ? formData.get("return_to") as string : null,
  );
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || !password) {
    return loginFailure("invalid_credentials", locale, requestedReturnTo);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return loginFailure("auth_unavailable", locale, requestedReturnTo);
  }

  const store = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => store.set(name, value, {
          ...options,
          domain: undefined,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        }));
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return loginFailure(safeLoginError(error), locale, requestedReturnTo);
  }
  const user = data.user;

  if (!data.session?.access_token || !data.session.refresh_token) {
    return loginFailure("session_cookie_failure", locale, requestedReturnTo);
  }

  try {
    await ensureTouchlineArenaAccess(user);
  } catch {
    return loginFailure("profile_setup_failed", locale, requestedReturnTo);
  }

  redirect(touchLinePostAuthHref(requestedReturnTo, locale));
}
