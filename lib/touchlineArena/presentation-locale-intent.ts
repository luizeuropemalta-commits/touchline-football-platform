import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "./browser-storage.ts";
import { isTouchLineLocaleApproved, type TouchLineLocale } from "./i18n.ts";

export const TOUCHLINE_PRESENTATION_LOCALE_INTENT_KEY = "touchline:presentation-locale-intent:v1";
type PresentationLocale = TouchLineLocale;

/** A deliberate presentation choice in this browser tab, not an account
 * preference or permission to write one. URLs and old cookies never create it.
 * Session storage may be unavailable; then normal account restoration wins.
 * This is not cross-device persistence and does not open draft locale gates.
 */
export function readTouchlinePresentationLocaleIntent(draftLocalesEnabled = false): PresentationLocale | null {
  const value = readBrowserStorage("sessionStorage", TOUCHLINE_PRESENTATION_LOCALE_INTENT_KEY);
  return isTouchLineLocaleApproved(value) && (draftLocalesEnabled || value === "en-GB" || value === "pt-BR") ? value : null;
}

/** Call only for a selector gesture or a confirmed authenticated selection. */
export function rememberTouchlinePresentationLocaleIntent(value: unknown, draftLocalesEnabled = false) {
  if (typeof value !== "string" || !isTouchLineLocaleApproved(value)
    || (!draftLocalesEnabled && value !== "en-GB" && value !== "pt-BR")) return false;
  const written = writeBrowserStorage("sessionStorage", TOUCHLINE_PRESENTATION_LOCALE_INTENT_KEY, value);
  if (!written) {
    // A readable old intent must not override a newer confirmed account choice.
    // Removal is best effort: when storage rejects every operation, no tab
    // persistence is guaranteed and reads safely fall back to account restore.
    removeBrowserStorage("sessionStorage", TOUCHLINE_PRESENTATION_LOCALE_INTENT_KEY);
  }
  return written;
}
