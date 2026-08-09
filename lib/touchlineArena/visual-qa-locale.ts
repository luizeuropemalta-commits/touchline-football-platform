import type { TouchLineCompleteLocale } from "./i18n";

/**
 * Visual QA fixtures intentionally render only the two human-complete
 * presentation locales. Invalid, incomplete, or missing query values fail
 * closed to English instead of making a fixture appear localized.
 */
export function resolveTouchlineVisualQaLocale(value: string | undefined): TouchLineCompleteLocale {
  return value === "pt-BR" ? "pt-BR" : "en-GB";
}
