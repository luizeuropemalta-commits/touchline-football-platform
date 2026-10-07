import type { TouchLinePlayerFixtureStatistics } from "./player-season-statistics.ts";
import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export const TOUCHLINE_PLAYER_APPEARANCE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_PLAYER_APPEARANCE_DRAFT_STATUS = "draft" as const;

type AppearanceCopy = Readonly<Record<TouchLinePlayerFixtureStatistics["appearanceStatus"] | "source", string>>;

/** Presentation only. Six catalogues remain drafts, not linguistic or release
 * approval. Legacy absent means unconfirmed participation, never proven absence.
 */
export const TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES = {
  "en-GB": {
    started: "Started",
    substitute: "Substitute",
    unused: "Unused",
    absent: "Participation unconfirmed",
    unavailable: "Unavailable",
    source: "Source: TouchLine · coverage varies by match",
  },
  "pt-BR": {
    started: "Titular",
    substitute: "Substituto",
    unused: "Não utilizado",
    absent: "Participação não confirmada",
    unavailable: "Indisponível",
    source: "Fonte: TouchLine · cobertura por partida",
  },
  "es-ES": {
    started: "Titular", substitute: "Suplente", unused: "No utilizado", absent: "Participación no confirmada", unavailable: "No disponible",
    source: "Fuente: TouchLine · la cobertura varía según el partido",
  },
  "it-IT": {
    started: "Titolare", substitute: "Subentrato", unused: "Non utilizzato", absent: "Partecipazione non confermata", unavailable: "Non disponibile",
    source: "Fonte: TouchLine · la copertura varia in base alla partita",
  },
  "fr-FR": {
    started: "Titulaire", substitute: "Remplaçant", unused: "Non utilisé", absent: "Participation non confirmée", unavailable: "Indisponible",
    source: "Source : TouchLine · la couverture varie selon le match",
  },
  "ar-SA": {
    started: "أساسي", substitute: "بديل", unused: "لم يشارك", absent: "المشاركة غير مؤكدة", unavailable: "غير متاح",
    source: "المصدر: TouchLine · تختلف التغطية حسب المباراة",
  },
  "tr-TR": {
    started: "İlk 11", substitute: "Sonradan oyuna giren", unused: "Oyuna girmedi", absent: "Katılım doğrulanmadı", unavailable: "Mevcut değil",
    source: "Kaynak: TouchLine · kapsam maça göre değişir",
  },
  "de-DE": {
    started: "Startelf", substitute: "Eingewechselt", unused: "Nicht eingesetzt", absent: "Teilnahme unbestätigt", unavailable: "Nicht verfügbar",
    source: "Quelle: TouchLine · die Abdeckung variiert je nach Spiel",
  },
} as const satisfies Readonly<Record<TouchLineLocale, AppearanceCopy>>;

/** Legacy absent rows do not prove fixture-specific squad or registration evidence. */
export function touchlinePlayerAppearanceLabel(
  status: TouchLinePlayerFixtureStatistics["appearanceStatus"] | null | undefined,
  locale: string,
  draftLocalesEnabled = false,
): string {
  return TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)][status ?? "unavailable"];
}

export function touchlinePlayerDataSourceLabel(locale: string, draftLocalesEnabled = false): string {
  return TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)].source;
}
