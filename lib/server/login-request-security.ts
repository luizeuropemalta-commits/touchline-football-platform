import type { NextRequest } from "next/server";

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
  if (typeof value !== "string" || !value.startsWith("/")) return "/arena";
  const target = new URL(value, request.url);
  return target.origin === request.nextUrl.origin
    ? `${target.pathname}${target.search}${target.hash}`
    : "/arena";
}
