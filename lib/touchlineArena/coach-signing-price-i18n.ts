import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import type { TouchLineLocale } from "./i18n.ts";

/** Presentation only. Draft copy follows the existing locale opt-in gate. */
const labels = {
  "en-GB": "Signing value",
  "pt-BR": "Valor de contratação",
  "es-ES": "Valor de contratación",
  "it-IT": "Valore di ingaggio",
  "fr-FR": "Valeur de recrutement",
  "ar-SA": "قيمة التعاقد",
  "tr-TR": "Transfer bedeli",
  "de-DE": "Verpflichtungswert",
} satisfies Record<TouchLineLocale, string>;

export function resolveCoachSigningPricePresentation(locale?: string, draftLocalesEnabled = false) {
  const resolved = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { locale: resolved, label: labels[resolved] };
}
