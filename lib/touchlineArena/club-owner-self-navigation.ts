import { touchLineAuthEntryHref } from "./auth-i18n.ts";
import {
  TOUCHLINE_CLUB_OWNER_SELF_SEGMENT,
  touchlineClubOwnerHistoryHref,
  touchlineClubOwnerProfileHref,
  touchlineClubOwnerRenewalsHref,
  touchlineClubOwnerSelfHref,
  touchlineClubOwnerSubstitutionHref,
  type TouchlineClubOwnerSelfArea,
} from "./club-owner-routes.ts";
import { touchlineClubOwnerSlugForUser } from "./club-owner-page-identity.ts";

type TouchlineClubOwnerSelfUser = Readonly<{
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}>;

export type TouchlineClubOwnerSelfNavigation =
  | { kind: "login"; href: string }
  | { kind: "denied"; reason: "not-a-club-owner" | "invalid-owner-slug" }
  | { kind: "owner"; ownerSlug: string; href: string };

function ownerAreaHref(area: TouchlineClubOwnerSelfArea, locale: string, ownerSlug: string) {
  if (area === "history") return touchlineClubOwnerHistoryHref(locale, ownerSlug);
  if (area === "renewals") return touchlineClubOwnerRenewalsHref(locale, ownerSlug);
  if (area === "substitution") return touchlineClubOwnerSubstitutionHref(locale, ownerSlug);
  return touchlineClubOwnerProfileHref(locale, ownerSlug);
}

/**
 * Resolves an owner-only destination without ever falling back to a public
 * profile. The route component supplies the server-authenticated user and
 * platform-owner boundary; this pure function remains testable with two users.
 */
export function resolveTouchlineClubOwnerSelfNavigation({
  area,
  locale,
  user,
  isClubOwner,
}: {
  area: TouchlineClubOwnerSelfArea;
  locale: string;
  user: TouchlineClubOwnerSelfUser | null | undefined;
  isClubOwner: boolean;
}): TouchlineClubOwnerSelfNavigation {
  const selfHref = touchlineClubOwnerSelfHref(locale, area);
  if (!user) {
    return {
      kind: "login",
      href: touchLineAuthEntryHref("/login", locale, selfHref),
    };
  }
  if (!isClubOwner) return { kind: "denied", reason: "not-a-club-owner" };

  const ownerSlug = touchlineClubOwnerSlugForUser(user);
  if (!ownerSlug || ownerSlug === TOUCHLINE_CLUB_OWNER_SELF_SEGMENT) {
    return { kind: "denied", reason: "invalid-owner-slug" };
  }

  return {
    kind: "owner",
    ownerSlug,
    href: ownerAreaHref(area, locale, ownerSlug),
  };
}
