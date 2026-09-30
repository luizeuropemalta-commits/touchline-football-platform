import type { NextRequest } from "next/server";
import { normalizeTouchLineAuthReturnTo } from "../touchlineArena/auth-i18n.ts";

/**
 * A password POST can establish a browser session. Require browser provenance
 * before the route parses credentials or contacts the identity provider.
 *
 * We deliberately do not leave an originless fallback for an unrecognised
 * server caller: this route has no separately authenticated machine client.
 */
export function isAllowedLoginPost(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin && !fetchSite) return false;
  if (fetchSite && fetchSite !== "same-origin") return false;
  if (!origin) return fetchSite === "same-origin";

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

/** Preserve only a same-origin, path-relative return target, including hash. */
export function safeReturnTo(request: NextRequest, value: unknown) {
  const fallback = "/market-transfer";
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if ([...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  try {
    const target = new URL(value, request.url);
    if (target.origin !== request.nextUrl.origin) return fallback;
    if (["/admin", "/visual-qa"].some((path) => target.pathname.startsWith(path)
      && target.pathname !== path && !target.pathname.startsWith(`${path}/`))) return fallback;
    const relative = `${target.pathname}${target.search}${target.hash}`;
    // Native login already supported public pages outside the callback allowlist.
    // Keep those returns; reuse normalization only for approved/retired routes.
    return normalizeTouchLineAuthReturnTo(relative) ?? relative;
  } catch {
    return fallback;
  }
}
