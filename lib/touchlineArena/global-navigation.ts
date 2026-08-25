import {
  touchlineArenaHref,
  touchlineClubHubHref,
} from "./arena-navigation.ts";
import { touchlineClubOwnerSelfHref } from "./club-owner-routes.ts";
import { resolveTouchLinePresentationLocale } from "./root-locale.ts";

/**
 * The public navigation vocabulary is intentionally small and stable. Routes
 * may add contextual actions nearby, but they must not quietly turn one of
 * these links into a specific club or ClubOwner destination.
 */
export type TouchlineGlobalNavigationSurface = "public" | "auth" | "authenticated";

export type TouchlineGlobalNavigationRoute =
  | "arena"
  | "clubHub"
  | "clubProfile"
  | "playerProfile"
  | "live"
  | "market"
  | "rankings"
  | "fantasy"
  | "myClub"
  | "clubOwnerHistory"
  | "clubOwnerRenewals"
  | "notFound";

export type TouchlineTrustedNavigationContext = Readonly<{
  club?: Readonly<{
    teamId: string;
    slug: string;
    name: string;
  }>;
}>;

export type TouchlineGlobalNavigationItemKey = "clubHub" | "live" | "market" | "rankings" | "fantasy" | "myClub";

export type TouchlineGlobalNavigationItem = Readonly<{
  key: TouchlineGlobalNavigationItemKey;
  href: string;
}>;

/**
 * A valid login and a ClubOwner identity are different capabilities. Admins
 * are authenticated but must never receive the self-scoped My Club link,
 * because the `/club-owner/me` boundary deliberately rejects administrator
 * identities.
 */
export function resolveTouchlineGlobalNavigationSurface(input: Readonly<{
  isAuthenticated: boolean;
  isAdmin: boolean;
}>): TouchlineGlobalNavigationSurface {
  if (!input.isAuthenticated) return "public";
  return input.isAdmin ? "auth" : "authenticated";
}

/**
 * Keep generic destinations independent from a page's contextual club. A
 * signed-in surface may add the server-resolved `/me` route, but never a
 * profile slug from a URL, demo seed, or another owner.
 */
export function resolveTouchlineGlobalNavigationItems(
  locale: string,
  surface: TouchlineGlobalNavigationSurface,
): readonly TouchlineGlobalNavigationItem[] {
  const effectiveLocale = resolveTouchLinePresentationLocale(locale);
  const lang = encodeURIComponent(effectiveLocale);

  const generalItems: TouchlineGlobalNavigationItem[] = [
    { key: "clubHub", href: touchlineClubHubHref(effectiveLocale) },
    { key: "live", href: `/live?lang=${lang}` },
    { key: "market", href: `/market-transfer?lang=${lang}` },
    { key: "rankings", href: `/touchline-tables?lang=${lang}` },
    { key: "fantasy", href: `/fantasy?lang=${lang}` },
  ];

  return surface === "authenticated"
    ? [...generalItems, { key: "myClub", href: touchlineClubOwnerSelfHref(effectiveLocale) }]
    : generalItems;
}

export function touchlineGlobalNavigationArenaHref(locale: string) {
  return touchlineArenaHref(resolveTouchLinePresentationLocale(locale));
}

export function isTouchlineGlobalNavigationCurrent(
  currentRoute: TouchlineGlobalNavigationRoute,
  key: TouchlineGlobalNavigationItemKey,
) {
  return currentRoute === key;
}
