import { isTouchLineLocaleApproved, normalizeTouchLineLocale, type TouchLineLocale } from "./i18n.ts";

export type TouchlineAuthLeaguePickerCopy = Readonly<{
  summary: string;
  availability: string;
  navigationAria: string;
}>;

export const TOUCHLINE_AUTH_LEAGUE_PICKER_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_AUTH_LEAGUE_PICKER_DRAFT_STATUS = "draft" as const;

// Presentation copy only. The shared EN/PT normalizer continues to gate drafts.
export const TOUCHLINE_AUTH_LEAGUE_PICKER_CATALOGUES = {
  "en-GB": {
    summary: "Choose league",
    availability: "League supported in this version. Other leagues are not available yet.",
    navigationAria: "Available leagues",
  },
  "pt-BR": {
    summary: "Escolher liga",
    availability: "Liga disponível nesta versão. Outras ligas ainda não estão disponíveis.",
    navigationAria: "Ligas disponíveis",
  },
  "es-ES": {
    summary: "Elegir liga",
    availability: "Liga disponible en esta versión. Las demás ligas aún no están disponibles.",
    navigationAria: "Ligas disponibles",
  },
  "it-IT": {
    summary: "Scegli una lega",
    availability: "Questa lega è disponibile in questa versione. Le altre leghe non sono ancora disponibili.",
    navigationAria: "Leghe disponibili",
  },
  "fr-FR": {
    summary: "Choisir une ligue",
    availability: "Ligue disponible dans cette version. Les autres ligues ne sont pas encore disponibles.",
    navigationAria: "Ligues disponibles",
  },
  "ar-SA": {
    summary: "اختر دوريًا",
    availability: "الدوري متاح في هذا الإصدار. لا تتوفر دوريات أخرى بعد.",
    navigationAria: "الدوريات المتاحة",
  },
  "tr-TR": {
    summary: "Lig seç",
    availability: "Bu sürümde yalnızca bu lig sunuluyor. Diğer ligler henüz mevcut değil.",
    navigationAria: "Kullanılabilir ligler",
  },
  "de-DE": {
    summary: "Liga auswählen",
    availability: "Diese Liga ist in dieser Version verfügbar. Andere Ligen sind noch nicht verfügbar.",
    navigationAria: "Verfügbare Ligen",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineAuthLeaguePickerCopy>>;

export function getTouchlineAuthLeaguePickerCopy(locale?: string | null, allowDraftLocale = false): TouchlineAuthLeaguePickerCopy {
  if (allowDraftLocale && isTouchLineLocaleApproved(locale)) return TOUCHLINE_AUTH_LEAGUE_PICKER_CATALOGUES[locale];
  return TOUCHLINE_AUTH_LEAGUE_PICKER_CATALOGUES[normalizeTouchLineLocale(locale)];
}
