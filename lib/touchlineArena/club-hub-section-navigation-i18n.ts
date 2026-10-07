import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  table: "Table",
  matchday: "Matchday",
  squad: "Squad",
  sectionsAria: "ClubHub sections",
  backToTop: "Back to top",
  top: "Top",
} as const;

export type TouchlineClubHubSectionNavigationCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_STATUS = "draft" as const;

/** Presentation only. The six additional catalogues remain unapproved drafts.
 * ClubHub remains a protected name; canonical section identities are unchanged.
 */
export const TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": { table: "Tabela", matchday: "Dia de jogo", squad: "Elenco", sectionsAria: "Seções do ClubHub", backToTop: "Voltar ao topo", top: "Topo" },
  "es-ES": { table: "Clasificación", matchday: "Día de partido", squad: "Plantilla", sectionsAria: "Secciones de ClubHub", backToTop: "Volver arriba", top: "Arriba" },
  "it-IT": { table: "Classifica", matchday: "Giorno della partita", squad: "Rosa", sectionsAria: "Sezioni di ClubHub", backToTop: "Torna in cima", top: "In cima" },
  "fr-FR": { table: "Classement", matchday: "Jour de match", squad: "Effectif", sectionsAria: "Sections de ClubHub", backToTop: "Retour en haut", top: "Haut" },
  "ar-SA": { table: "الترتيب", matchday: "يوم المباراة", squad: "قائمة الفريق", sectionsAria: "أقسام ClubHub", backToTop: "العودة إلى الأعلى", top: "الأعلى" },
  "tr-TR": { table: "Puan durumu", matchday: "Maç günü", squad: "Kadro", sectionsAria: "ClubHub bölümleri", backToTop: "Başa dön", top: "Baş" },
  "de-DE": { table: "Tabelle", matchday: "Spieltag", squad: "Kader", sectionsAria: "ClubHub-Bereiche", backToTop: "Nach oben", top: "Oben" },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubSectionNavigationCopy>>;

export function getTouchlineClubHubSectionNavigationCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubSectionNavigationCopy {
  return TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
