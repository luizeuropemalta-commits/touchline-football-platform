import {
  isTouchLineLocaleComplete,
  normalizeTouchLineLocale,
  type TouchLineLocale,
} from "./i18n.ts";

/**
 * Only English and Brazilian Portuguese have complete public TouchLine copy.
 * A supported-but-incomplete language must never leave the document labelled
 * in one language while its content falls back to another one.
 */
export const TOUCHLINE_PRESENTATION_LOCALES = ["en-GB", "pt-BR"] as const;

export type TouchLinePresentationLocale = (typeof TOUCHLINE_PRESENTATION_LOCALES)[number];

/**
 * Proxy forwards this request header to Server Components so the initial HTML
 * language agrees with the canonical query parameter before hydration.
 */
export const TOUCHLINE_PRESENTATION_LOCALE_HEADER = "x-touchline-presentation-locale";

function firstLocaleValue(value?: string | string[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolves the language that may be presented to a public visitor today.
 * `normalizeTouchLineLocale` still understands all future menu locales, while
 * this narrower resolver is deliberately used at public rendering boundaries
 * until their complete translations exist.
 */
export function resolveTouchLinePresentationLocale(
  value?: string | string[] | null,
): TouchLinePresentationLocale {
  const normalized = normalizeTouchLineLocale(firstLocaleValue(value));
  return isTouchLineLocaleComplete(normalized) && normalized === "pt-BR"
    ? "pt-BR"
    : "en-GB";
}

export function touchlineDocumentDirection(_locale: TouchLinePresentationLocale) {
  // Both currently complete public locales are left-to-right. Keeping this in
  // the resolver makes a future complete RTL locale an explicit addition.
  return "ltr" as const;
}

/**
 * Resolves the first root-level `lang` parameter before the landing redirect.
 * Query parameters may be repeated by a browser or intermediary, but only the
 * first value is part of the canonical initial-navigation contract.
 */
export function resolveTouchLineRootLocale(value?: string | string[] | null): TouchLineLocale {
  return resolveTouchLinePresentationLocale(value);
}
