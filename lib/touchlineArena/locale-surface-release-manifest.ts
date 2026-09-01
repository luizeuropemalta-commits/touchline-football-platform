import {
  TOUCHLINE_APPROVED_LOCALES,
  TOUCHLINE_COMPLETE_LOCALES,
  type TouchLineLocale,
} from "./i18n.ts";

export type TouchLineLocaleSurfaceKind = "public" | "auth" | "private" | "system";

export type TouchLineLocaleSurface = Readonly<{
  id: string;
  kind: TouchLineLocaleSurfaceKind;
  paths: readonly string[];
  requires: readonly string[];
}>;

/**
 * Release inventory rather than a runtime routing table. It makes every
 * surface that can show shared or account copy reviewable before a locale is
 * enabled, including metadata and PWA fallbacks that are easy to overlook.
 */
export const TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST = [
  {
    id: "root-document-and-navigation",
    kind: "public",
    paths: ["/", "/arena"],
    requires: ["document-lang", "direction", "global-navigation", "first-visit", "persistence"],
  },
  {
    id: "clubhub-and-profiles",
    kind: "public",
    paths: ["/touchline-clubs", "/touchline-clubs/[club]", "/touchline-players/[player]", "/touchline-coaches/[coach]"],
    requires: ["content", "shared-data-state", "metadata", "deep-links", "viewport"],
  },
  {
    id: "live-rankings-and-tables",
    kind: "public",
    paths: ["/live", "/touchline-player-card-rankings", "/touchline-tables"],
    requires: ["content", "shared-data-state", "metadata", "keyboard", "viewport"],
  },
  {
    id: "market-and-card-surfaces",
    kind: "private",
    paths: ["/market-transfer"],
    requires: ["market-copy", "pending-state", "price-labels", "auth-return", "viewport"],
  },
  {
    id: "authentication-and-recovery",
    kind: "auth",
    paths: ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"],
    requires: ["form-copy", "validation", "return-to", "recovery", "persistence"],
  },
  {
    id: "private-owner-and-administration",
    kind: "private",
    paths: ["/club-owner/me", "/admin", "/admin/arena", "/inbox"],
    requires: ["owner-boundary", "auth-copy", "empty-state", "audit-state", "viewport"],
  },
  {
    id: "metadata-pwa-and-recovery",
    kind: "system",
    paths: ["metadata", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/error"],
    requires: ["title", "description", "canonical-policy", "hreflang-policy", "offline-and-error-copy"],
  },
] as const satisfies readonly TouchLineLocaleSurface[];

export type TouchLineLocaleSurfaceReview = Readonly<{
  locale: TouchLineLocale;
  surfaceId: (typeof TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST)[number]["id"];
  contentReviewed: boolean;
  metadataReviewed: boolean;
  viewportReviewed: boolean;
  persistenceReviewed: boolean;
  rtlReviewed: boolean;
}>;

export function createTouchLineLocaleSurfaceReviewTemplate(
  locale: TouchLineLocale,
  surfaceId: TouchLineLocaleSurfaceReview["surfaceId"],
): TouchLineLocaleSurfaceReview {
  return {
    locale,
    surfaceId,
    contentReviewed: false,
    metadataReviewed: false,
    viewportReviewed: false,
    persistenceReviewed: false,
    rtlReviewed: false,
  };
}

export function validateTouchLineLocaleSurfaceReview(
  review: TouchLineLocaleSurfaceReview,
) {
  const reasons: string[] = [];
  if (!TOUCHLINE_APPROVED_LOCALES.some((locale) => locale.code === review.locale)) {
    reasons.push("locale-not-approved");
  }
  if (!TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST.some((surface) => surface.id === review.surfaceId)) {
    reasons.push("surface-not-in-release-manifest");
  }
  if (!TOUCHLINE_COMPLETE_LOCALES.some((locale) => locale === review.locale)) {
    reasons.push("catalogue-not-complete");
  }
  if (!review.contentReviewed) reasons.push("content-review-incomplete");
  if (!review.metadataReviewed) reasons.push("metadata-review-incomplete");
  if (!review.viewportReviewed) reasons.push("viewport-review-incomplete");
  if (!review.persistenceReviewed) reasons.push("persistence-review-incomplete");
  if (review.locale === "ar-SA" && !review.rtlReviewed) reasons.push("rtl-review-incomplete");
  return { ready: reasons.length === 0, reasons };
}
