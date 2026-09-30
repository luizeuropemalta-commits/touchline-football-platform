import type { NextRequest } from "next/server";
import { TOUCHLINE_QA_SUPABASE_ORIGIN } from "../touchlineArena/qa-canonical-persona.ts";

/** Safari rejects Secure cookies on HTTP localhost. Never relax hosted cookies. */
export function shouldSecureLoginCookie(
  request: Pick<NextRequest, "url" | "headers">,
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment.NODE_ENV !== "development"
    || environment.VERCEL === "1"
    || environment.VERCEL_ENV === "production"
    || environment.TOUCHLINE_DEPLOYMENT_MODE !== "qa-preview"
    || environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== "qa-preview"
    || environment.NEXT_PUBLIC_SUPABASE_URL !== TOUCHLINE_QA_SUPABASE_ORIGIN
  ) return true;
  try {
    const url = new URL(request.url);
    return !(url.protocol === "http:"
      && url.hostname === "localhost"
      && !url.username && !url.password
      && request.headers.get("host") === url.host);
  } catch {
    // An unexpected/malformed request never enables the local-only exception.
  }
  return true;
}
