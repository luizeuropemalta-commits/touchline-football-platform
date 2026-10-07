import {
  touchlineClubHubHref,
} from "./arena-navigation.ts";
import { resolveTouchLinePresentationLocale } from "./root-locale.ts";

/**
 * The public navigation vocabulary is intentionally small and stable. Routes
 * may add contextual actions nearby, but they must not quietly turn one of
 * these links into a specific club or ClubOwner destination. The primary
 * Market destination replaces the cinematic Arena and separate My Club link.
 */
export type TouchlineGlobalNavigationSurface = "public" | "auth" | "authenticated";

export type TouchlineGlobalNavigationRoute =
  | "arena"
  | "clubHub"
  | "clubProfile"
  | "playerProfile"
  | "coachProfile"
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

export type TouchlineGlobalNavigationItemKey = "clubHub" | "live" | "rankings" | "myClub";

export type TouchlineGlobalNavigationItem = Readonly<{
  key: TouchlineGlobalNavigationItemKey;
  href: string;
}>;

/**
 * A valid login and a ClubOwner identity are different capabilities. Admins
 * are authenticated but must never receive the self-scoped My Club link,
 * because the `/my-club` boundary deliberately rejects administrator
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
  draftLocalesEnabled = false,
): readonly TouchlineGlobalNavigationItem[] {
  const effectiveLocale = resolveTouchLinePresentationLocale(locale, draftLocalesEnabled);
  const lang = encodeURIComponent(effectiveLocale);

  const generalItems: TouchlineGlobalNavigationItem[] = [
    { key: "clubHub", href: touchlineClubHubHref(effectiveLocale, null, draftLocalesEnabled) },
    { key: "live", href: `/live?lang=${lang}` },
    { key: "rankings", href: `/rankings?lang=${lang}` },
  ];

  // The primary Market link owns the game; no duplicate ClubOwner entry.
  void surface;
  return generalItems;
}

export function touchlineGlobalNavigationArenaHref(locale: string, draftLocalesEnabled = false) {
  return `/clubowner?lang=${encodeURIComponent(resolveTouchLinePresentationLocale(locale, draftLocalesEnabled))}`;
}

export function isTouchlineGlobalNavigationCurrent(
  currentRoute: TouchlineGlobalNavigationRoute,
  key: TouchlineGlobalNavigationItemKey,
) {
  return currentRoute === key;
}
