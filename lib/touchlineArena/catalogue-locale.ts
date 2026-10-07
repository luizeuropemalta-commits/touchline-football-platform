import {
  isTouchLineLocaleApproved,
  normalizeTouchLineLocale,
  type TouchLineLocale,
} from "./i18n.ts";

/** Explicit presentation opt-in, like login; never marks a draft as complete. */
export function resolveTouchlineCatalogueLocale(
  locale?: string | null,
  draftLocalesEnabled = false,
): TouchLineLocale {
  return draftLocalesEnabled && isTouchLineLocaleApproved(locale)
    ? locale
    : normalizeTouchLineLocale(locale);
}
