import {
  isTouchLineLocaleComplete,
  isTouchLineLocaleApproved,
  isTouchLineRtlLocale,
  normalizeTouchLineLocale,
  type TouchLineLocale,
} from "./i18n.ts";

export { TOUCHLINE_LOCALE_STORAGE_KEY } from "./i18n.ts";

/**
 * Only English and Brazilian Portuguese have complete public TouchLine copy.
 * A supported-but-incomplete language must never leave the document labelled
 * in one language while its content falls back to another one.
 */
export const TOUCHLINE_PRESENTATION_LOCALES = ["en-GB", "pt-BR"] as const;

export type TouchLinePresentationLocale = (typeof TOUCHLINE_PRESENTATION_LOCALES)[number];

/** Saved preferences must be exact: complete by default, approved with explicit
 * draft opt-in. Invalid cookies are absent, never coerced to a preference. */
export function resolveTouchLineSavedPresentationLocale(
  value?: string | null,
  draftLocalesEnabled?: false,
): TouchLinePresentationLocale | null;
export function resolveTouchLineSavedPresentationLocale(
  value: string | null | undefined,
  draftLocalesEnabled: boolean,
): TouchLineLocale | null;
export function resolveTouchLineSavedPresentationLocale(
  value?: string | null,
  draftLocalesEnabled = false,
): TouchLineLocale | null {
  if (draftLocalesEnabled && isTouchLineLocaleApproved(value)) return value;
  return value === "en-GB" || value === "pt-BR" ? value : null;
}

/**
 * Proxy forwards this request header to Server Components so the initial HTML
 * language agrees with the canonical query parameter before hydration.
 */
export const TOUCHLINE_PRESENTATION_LOCALE_HEADER = "x-touchline-presentation-locale";
/** Trusted proxy-only locale override for the exact public login route. */
export const TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER = "x-touchline-login-presentation-locale";

function firstLocaleValue(value?: string | string[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolves the language that may be presented to a public visitor today.
 * `TOUCHLINE_APPROVED_LOCALES` records the product vocabulary, while this
 * narrower resolver is deliberately used at public rendering boundaries
 * until their complete translations exist. An explicit caller opt-in shares
 * draft resolution with metadata/auth/document consumers without opening gates.
 */
export function resolveTouchLinePresentationLocale(
  value?: string | string[] | null,
  draftLocalesEnabled?: false,
): TouchLinePresentationLocale;
export function resolveTouchLinePresentationLocale(
  value: string | string[] | null | undefined,
  draftLocalesEnabled: boolean,
): TouchLineLocale;
export function resolveTouchLinePresentationLocale(
  value?: string | string[] | null,
  draftLocalesEnabled = false,
): TouchLineLocale {
  const normalized = normalizeTouchLineLocale(firstLocaleValue(value), draftLocalesEnabled);
  if (draftLocalesEnabled) return normalized;
  return isTouchLineLocaleComplete(normalized) && normalized === "pt-BR"
    ? "pt-BR"
    : "en-GB";
}

export function touchlineDocumentDirection(locale: TouchLinePresentationLocale | string) {
  return isTouchLineRtlLocale(locale) ? "rtl" as const : "ltr" as const;
}

/**
 * An incomplete or unapproved `lang` must not remain in the public URL while
 * the server renders English. The edge boundary uses this before SSR.
 */
export function touchlineLocaleRequestNeedsCanonicalRedirect(value?: string | string[] | null, draftLocalesEnabled = false) {
  const requested = firstLocaleValue(value);
  return requested !== undefined
    && requested !== null
    && requested !== resolveTouchLinePresentationLocale(requested, draftLocalesEnabled);
}

/**
 * Resolves the first root-level `lang` parameter before the landing redirect.
 * Query parameters may be repeated by a browser or intermediary, but only the
 * first value is part of the canonical initial-navigation contract.
 */
export function resolveTouchLineRootLocale(value?: string | string[] | null): TouchLineLocale;
export function resolveTouchLineRootLocale(value: string | string[] | null | undefined, draftLocalesEnabled: boolean): TouchLineLocale;
export function resolveTouchLineRootLocale(value?: string | string[] | null, draftLocalesEnabled = false): TouchLineLocale {
  return resolveTouchLinePresentationLocale(value, draftLocalesEnabled);
}
