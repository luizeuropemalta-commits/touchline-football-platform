import {
  TOUCHLINE_APPROVED_LOCALES,
  type TouchLineLocale,
} from "./i18n.ts";

/**
 * A future human-catalogue review contract. It is deliberately separate from
 * the runtime resolver: drafting metadata must never make a locale renderable.
 */
export const TOUCHLINE_LOCALE_CATALOGUE_NAMESPACES = [
  "core",
  "auth",
  "market",
  "rankings",
  "public-routes",
  "errors",
] as const;

export type TouchLineLocaleCatalogueNamespace =
  (typeof TOUCHLINE_LOCALE_CATALOGUE_NAMESPACES)[number];

export const TOUCHLINE_LOCALE_REVIEW_STATES = [
  "draft",
  "in_human_review",
  "approved",
  "published",
  "outdated",
] as const;

export type TouchLineLocaleReviewState =
  (typeof TOUCHLINE_LOCALE_REVIEW_STATES)[number];

export type TouchLineLocaleReviewRecord = {
  locale: TouchLineLocale;
  state: TouchLineLocaleReviewState;
  sourceLocale: "en-GB";
  sourceCatalogueRevision: string | null;
  sourceCatalogueHash: string | null;
  catalogueHash: string | null;
  translator: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
  namespaces: Record<TouchLineLocaleCatalogueNamespace, boolean>;
  qa: {
    routeMatrixComplete: boolean;
    viewportMatrixComplete: boolean;
    persistenceComplete: boolean;
    metadataComplete: boolean;
    rtlComplete: boolean;
  };
};

export type TouchLineLocaleReviewValidation = {
  ready: boolean;
  reasons: string[];
};

function emptyNamespaces(): Record<TouchLineLocaleCatalogueNamespace, boolean> {
  return {
    core: false,
    auth: false,
    market: false,
    rankings: false,
    "public-routes": false,
    errors: false,
  };
}

/** A starting point that deliberately contains no invented review evidence. */
export function createTouchLineLocaleReviewTemplate(
  locale: TouchLineLocale,
): TouchLineLocaleReviewRecord {
  return {
    locale,
    state: "draft",
    sourceLocale: "en-GB",
    sourceCatalogueRevision: null,
    sourceCatalogueHash: null,
    catalogueHash: null,
    translator: null,
    reviewer: null,
    reviewedAt: null,
    namespaces: emptyNamespaces(),
    qa: {
      routeMatrixComplete: false,
      viewportMatrixComplete: false,
      persistenceComplete: false,
      metadataComplete: false,
      rtlComplete: false,
    },
  };
}

export function validateTouchLineLocaleReviewRecord(
  record: TouchLineLocaleReviewRecord,
): TouchLineLocaleReviewValidation {
  const reasons: string[] = [];

  if (!TOUCHLINE_APPROVED_LOCALES.some((candidate) => candidate.code === record.locale)) {
    reasons.push("locale-not-approved");
  }
  if (record.state !== "published") reasons.push("catalogue-not-published");

  for (const [field, value] of [
    ["source-catalogue-revision", record.sourceCatalogueRevision],
    ["source-catalogue-hash", record.sourceCatalogueHash],
    ["catalogue-hash", record.catalogueHash],
    ["translator", record.translator],
    ["reviewer", record.reviewer],
    ["reviewed-at", record.reviewedAt],
  ] as const) {
    if (!value?.trim()) reasons.push(`missing-${field}`);
  }

  for (const namespace of TOUCHLINE_LOCALE_CATALOGUE_NAMESPACES) {
    if (!record.namespaces[namespace]) reasons.push(`namespace-incomplete:${namespace}`);
  }
  if (!record.qa.routeMatrixComplete) reasons.push("route-qa-incomplete");
  if (!record.qa.viewportMatrixComplete) reasons.push("viewport-qa-incomplete");
  if (!record.qa.persistenceComplete) reasons.push("persistence-qa-incomplete");
  if (!record.qa.metadataComplete) reasons.push("metadata-qa-incomplete");
  if (record.locale === "ar-SA" && !record.qa.rtlComplete) reasons.push("rtl-qa-incomplete");

  return { ready: reasons.length === 0, reasons };
}

/** No fallback is permitted to label English copy as another locale. */
export function isTouchLineLocaleReviewReady(record: TouchLineLocaleReviewRecord) {
  return validateTouchLineLocaleReviewRecord(record).ready;
}
