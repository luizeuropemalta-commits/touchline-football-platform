import type { NextRequest } from "next/server";
import { normalizeTouchLineAuthLocale, normalizeTouchLineAuthReturnTo } from "../touchlineArena/auth-i18n.ts";

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
    const browserOrigin = new URL(origin);
    if (browserOrigin.origin === request.nextUrl.origin) return true;
    // NextURL canonicalizes numeric loopback addresses to localhost. Preserve
    // exact browser provenance using Host only for that normalization case;
    // never trust forwarded hosts or broaden deployed-origin acceptance.
    return request.nextUrl.hostname === "localhost"
      && ["127.0.0.1", "[::1]"].includes(browserOrigin.hostname)
      && browserOrigin.protocol === request.nextUrl.protocol
      && browserOrigin.port === request.nextUrl.port
      && request.headers.get("host") === browserOrigin.host;
  } catch {
    return false;
  }
}

/** Preserve only a same-origin, path-relative return target, including hash. */
export function safeReturnTo(request: NextRequest, value: unknown, draftLocalesEnabled = false) {
  const fallback = "/clubowner";
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if ([...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  try {
    const target = new URL(value, request.url);
    if (target.origin !== request.nextUrl.origin) return fallback;
    if (["/admin", "/visual-qa"].some((path) => target.pathname.startsWith(path)
      && target.pathname !== path && !target.pathname.startsWith(`${path}/`))) return fallback;
    const publicLocalesEnabled = draftLocalesEnabled && !["/admin", "/visual-qa"].some(
      (path) => target.pathname === path || target.pathname.startsWith(`${path}/`),
    );
    const locale = target.searchParams.get("lang");
    if (locale) target.searchParams.set("lang", normalizeTouchLineAuthLocale(locale, publicLocalesEnabled));
    const relative = `${target.pathname}${target.search}${target.hash}`;
    // Native login already supported public pages outside the callback allowlist.
    // Keep those returns; reuse normalization only for approved/retired routes.
    return normalizeTouchLineAuthReturnTo(relative, publicLocalesEnabled) ?? relative;
  } catch {
    return fallback;
  }
}
