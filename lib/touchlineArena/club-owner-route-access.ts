import {
  PUBLIC_CLUB_OWNER_SLUG,
  normalizeTouchlineClubOwnerSlug,
} from "./club-owner-page-identity.ts";
import type { TouchlineClubOwnerSelfArea } from "./club-owner-routes.ts";

type ClubOwnerPrivateArea = Exclude<TouchlineClubOwnerSelfArea, "profile">;

export type TouchlineClubOwnerRouteAccess =
  | { action: "allow"; kind: "public-profile" | "own-profile" | "own-private" | "self" }
  | { action: "login"; area: TouchlineClubOwnerSelfArea }
  | { action: "redirect-self"; area: TouchlineClubOwnerSelfArea }
  | { action: "not-found" };

function parseClubOwnerPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "club-owner" || segments.length < 2 || segments.length > 3) return null;

  const requestedSlug = normalizeTouchlineClubOwnerSlug(segments[1]);
  // Do not allow a non-canonical user-controlled spelling to bypass the
  // pre-stream owner boundary and reach a late App Router notFound().
  if (!requestedSlug || requestedSlug !== segments[1]) return { invalid: true } as const;
  const area = segments[2] as ClubOwnerPrivateArea | undefined;
  if (segments[2] && !["history", "renewals", "substitution"].includes(segments[2])) {
    return { invalid: true } as const;
  }

  return { requestedSlug, area } as const;
}

/**
 * Authorizes only the path shape and resolved identity boundary. It does not
 * query or expose ClubOwner data. The proxy uses it before an App Router stream
 * starts so forbidden owner URLs receive a real HTTP 404.
 */
export function resolveTouchlineClubOwnerRouteAccess({
  pathname,
  isAuthenticated,
  ownerSlug,
}: {
  pathname: string;
  isAuthenticated: boolean;
  ownerSlug?: string | null;
}): TouchlineClubOwnerRouteAccess | null {
  const route = parseClubOwnerPath(pathname);
  if (!route) return null;
  if ("invalid" in route) return { action: "not-found" };

  const resolvedOwnerSlug = normalizeTouchlineClubOwnerSlug(ownerSlug);
  const selfArea: TouchlineClubOwnerSelfArea = route.area ?? "profile";

  if (route.requestedSlug === "me") {
    if (!isAuthenticated) return { action: "login", area: selfArea };
    return resolvedOwnerSlug && resolvedOwnerSlug !== "me"
      ? { action: "allow", kind: "self" }
      : { action: "not-found" };
  }

  // This was historically a public-demo path rather than a private owner
  // destination. Preserve the bookmark as a self-scoped alias; it can never
  // reveal or select Luiz's squad for a different authenticated visitor.
  if (route.requestedSlug === PUBLIC_CLUB_OWNER_SLUG && route.area === "substitution") {
    return { action: "redirect-self", area: "substitution" };
  }

  if (route.area) {
    if (!isAuthenticated) return { action: "login", area: selfArea };
    return resolvedOwnerSlug === route.requestedSlug
      ? { action: "allow", kind: "own-private" }
      : { action: "not-found" };
  }

  if (route.requestedSlug === PUBLIC_CLUB_OWNER_SLUG) {
    return { action: "allow", kind: "public-profile" };
  }

  return isAuthenticated && resolvedOwnerSlug === route.requestedSlug
    ? { action: "allow", kind: "own-profile" }
    : { action: "not-found" };
}
