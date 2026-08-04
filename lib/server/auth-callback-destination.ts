import { TOUCHLINE_CLUB_OWNER_ROUTE_BASE } from "../touchlineArena/club-owner-routes.ts";

const ALLOWED_AUTH_CALLBACK_PATHS = [
  "/arena",
  TOUCHLINE_CLUB_OWNER_ROUTE_BASE,
  "/reset-password",
  "/market-transfer",
  "/admin",
  "/notifications",
  "/inbox",
  "/football-search",
  "/visual-qa",
] as const;

function isAllowedPath(pathname: string) {
  return ALLOWED_AUTH_CALLBACK_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function resolveTouchLineAuthCallbackDestination(
  requestedNext: string | null | undefined,
  requestOrigin: string,
) {
  const trustedOrigin = new URL(requestOrigin).origin;
  const fallback = new URL("/arena", trustedOrigin);
  if (!requestedNext) return fallback;

  try {
    const candidate = new URL(requestedNext, trustedOrigin);
    if (candidate.origin !== trustedOrigin || !isAllowedPath(candidate.pathname)) {
      return fallback;
    }
    return candidate;
  } catch {
    return fallback;
  }
}
