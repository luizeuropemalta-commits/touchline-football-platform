/**
 * Private review seam for unpublished catalogues. This is intentionally not a
 * runtime locale resolver: it has no routes, persistence, or public fallback.
 */
export const TOUCHLINE_DRAFT_REVIEW_NAMESPACES = ["core", "auth", "rankings"] as const;

export type TouchLineDraftReviewNamespace = (typeof TOUCHLINE_DRAFT_REVIEW_NAMESPACES)[number];

type DraftReviewCatalogue = object;

export type TouchLineDraftReviewCatalogueResult =
  | Readonly<{
    available: true;
    publicationState: "draft";
    locale: string;
    namespace: TouchLineDraftReviewNamespace;
    catalogue: DraftReviewCatalogue;
  }>
  | Readonly<{
    available: false;
    reason: "unsupported-draft-locale" | "unsupported-namespace";
  }>;

// Deliberately local: importing the shared draft tuple would eagerly import
// core-drafts and defeat the loader's per-namespace lazy boundary.
const DRAFT_LOCALE_CODES = new Set(["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]);

function isDraftLocale(value: unknown): value is string {
  return typeof value === "string" && DRAFT_LOCALE_CODES.has(value);
}

function isDraftReviewNamespace(value: unknown): value is TouchLineDraftReviewNamespace {
  return typeof value === "string" && (TOUCHLINE_DRAFT_REVIEW_NAMESPACES as readonly string[]).includes(value);
}

function available(
  locale: string,
  namespace: TouchLineDraftReviewNamespace,
  catalogue: DraftReviewCatalogue,
): TouchLineDraftReviewCatalogueResult {
  return { available: true, publicationState: "draft", locale, namespace, catalogue };
}

/**
 * Loads one authored draft catalogue for review only. Public EN/PT resolvers
 * must not use this function: unsupported inputs never receive English copy.
 */
export async function loadTouchLineDraftReviewCatalogue(
  locale: unknown,
  namespace: unknown,
): Promise<TouchLineDraftReviewCatalogueResult> {
  if (!isDraftReviewNamespace(namespace)) {
    return { available: false, reason: "unsupported-namespace" };
  }
  if (!isDraftLocale(locale)) {
    return { available: false, reason: "unsupported-draft-locale" };
  }

  switch (namespace) {
    case "core": {
      const { touchlineCoreDrafts } = await import("./core-drafts.ts");
      return available(locale, namespace, touchlineCoreDrafts[locale as keyof typeof touchlineCoreDrafts]);
    }
    case "auth": {
      const { touchlineAuthDrafts } = await import("./auth-drafts.ts");
      return available(locale, namespace, touchlineAuthDrafts[locale as keyof typeof touchlineAuthDrafts]);
    }
    case "rankings": {
      const { touchlineRankingsDrafts } = await import("./rankings-drafts.ts");
      return available(locale, namespace, touchlineRankingsDrafts[locale as keyof typeof touchlineRankingsDrafts]);
    }
  }
}
