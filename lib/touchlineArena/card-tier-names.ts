import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export const TOUCHLINE_CARD_TIER_KEYS = [
  "ruby-red",
  "sapphire-blue",
  "amethyst-purple",
  "radiant-gold",
  "emerald-green",
  "clear-diamond",
  "diamond-gold",
] as const;

export type TouchlineCardTierKey = (typeof TOUCHLINE_CARD_TIER_KEYS)[number];

export const TOUCHLINE_CARD_TIER_NAME_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CARD_TIER_NAME_DRAFT_STATUS = "draft" as const;
type TouchlineCardTierNameDraftLocale = (typeof TOUCHLINE_CARD_TIER_NAME_DRAFT_LOCALES)[number];

/**
 * The one human-readable identity for each approved card tier. Economy,
 * cards and every localized surface derive labels here rather than carrying
 * their own English copy.
 * The en/pt properties retain their existing API and approved names. The six
 * full-locale columns are draft translations, not approved product names or
 * language release approval; the public normalizer keeps them gated.
 */
export const TOUCHLINE_CARD_TIER_NAMES: Record<
  TouchlineCardTierKey,
  { en: string; pt: string } & Record<TouchlineCardTierNameDraftLocale, string>
> = {
  "ruby-red": {
    en: "Red Ruby", pt: "Rubi Vermelho",
    "es-ES": "Rubí rojo", "it-IT": "Rubino rosso", "fr-FR": "Rubis rouge",
    "ar-SA": "ياقوت أحمر", "tr-TR": "Kırmızı yakut", "de-DE": "Roter Rubin",
  },
  "sapphire-blue": {
    en: "Blue Sapphire", pt: "Safira Azul",
    "es-ES": "Zafiro azul", "it-IT": "Zaffiro blu", "fr-FR": "Saphir bleu",
    "ar-SA": "ياقوت أزرق", "tr-TR": "Mavi safir", "de-DE": "Blauer Saphir",
  },
  "amethyst-purple": {
    en: "Purple Amethyst", pt: "Ametista Roxa",
    "es-ES": "Amatista morada", "it-IT": "Ametista viola", "fr-FR": "Améthyste violette",
    "ar-SA": "جمشت أرجواني", "tr-TR": "Mor ametist", "de-DE": "Violetter Amethyst",
  },
  "radiant-gold": {
    en: "Radiant Gold", pt: "Ouro Radiante",
    "es-ES": "Oro radiante", "it-IT": "Oro radioso", "fr-FR": "Or rayonnant",
    "ar-SA": "ذهب متألق", "tr-TR": "Işıltılı altın", "de-DE": "Strahlendes Gold",
  },
  "emerald-green": {
    en: "Green Emerald", pt: "Esmeralda Verde",
    "es-ES": "Esmeralda verde", "it-IT": "Smeraldo verde", "fr-FR": "Émeraude verte",
    "ar-SA": "زمرد أخضر", "tr-TR": "Yeşil zümrüt", "de-DE": "Grüner Smaragd",
  },
  "clear-diamond": {
    en: "Clear Diamond", pt: "Diamante Cristalino",
    "es-ES": "Diamante cristalino", "it-IT": "Diamante limpido", "fr-FR": "Diamant limpide",
    "ar-SA": "ألماس صافٍ", "tr-TR": "Berrak elmas", "de-DE": "Klarer Diamant",
  },
  "diamond-gold": {
    en: "Golden Diamond", pt: "Diamante Dourado",
    "es-ES": "Diamante dorado", "it-IT": "Diamante dorato", "fr-FR": "Diamant doré",
    "ar-SA": "ألماس ذهبي", "tr-TR": "Altın elmas", "de-DE": "Goldener Diamant",
  },
};

export function touchlineCardTierName(
  tier: TouchlineCardTierKey,
  locale: "pt-BR" | "en" | string = "en",
  draftLocalesEnabled = false,
) {
  const names = TOUCHLINE_CARD_TIER_NAMES[tier];
  const normalizedLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return normalizedLocale === "en-GB" ? names.en : normalizedLocale === "pt-BR" ? names.pt : names[normalizedLocale];
}
