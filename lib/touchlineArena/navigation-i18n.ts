import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export type TouchlineNavigationCopy = Readonly<{
  ariaLabel: string;
  backToArena: string;
  clubHub: string;
  allClubs: string;
  live: string;
  rankings: string;
  fantasy: string;
  myClub: string;
  more: string;
  currentClub: string;
  opening: string;
}>;

/**
 * EN/PT retain their published copy. The other six catalogues are authored
 * drafts: their presence does not grant public presentation readiness.
 */
export const TOUCHLINE_NAVIGATION_CATALOGUES = {
  "en-GB": {
    ariaLabel: "TouchLine navigation",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "All clubs",
    live: "Live",
    rankings: "Rankings",
    fantasy: "Fantasy",
    myClub: "My Club",
    more: "More",
    currentClub: "Current club",
    opening: "Opening",
  },
  "pt-BR": {
    ariaLabel: "Navegação TouchLine",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "Todos os clubes",
    live: "Ao vivo",
    rankings: "Rankings",
    fantasy: "Fantasy",
    myClub: "Meu Clube",
    more: "Mais",
    currentClub: "Clube atual",
    opening: "Abrindo",
  },
  "es-ES": {
    ariaLabel: "Navegación de TouchLine",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "Todos los clubes",
    live: "En directo",
    rankings: "Clasificaciones",
    fantasy: "Fantasy",
    myClub: "Mi club",
    more: "Más",
    currentClub: "Club actual",
    opening: "Abriendo",
  },
  "it-IT": {
    ariaLabel: "Navigazione TouchLine",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "Tutti i club",
    live: "In diretta",
    rankings: "Classifiche",
    fantasy: "Fantasy",
    myClub: "Il mio club",
    more: "Altro",
    currentClub: "Club attuale",
    opening: "Apertura in corso",
  },
  "fr-FR": {
    ariaLabel: "Navigation TouchLine",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "Tous les clubs",
    live: "En direct",
    rankings: "Classements",
    fantasy: "Fantasy",
    myClub: "Mon club",
    more: "Plus",
    currentClub: "Club actuel",
    opening: "Ouverture en cours",
  },
  "ar-SA": {
    ariaLabel: "التنقل في TouchLine",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "جميع الأندية",
    live: "مباشر",
    rankings: "الترتيبات",
    fantasy: "Fantasy",
    myClub: "ناديي",
    more: "المزيد",
    currentClub: "النادي الحالي",
    opening: "جارٍ الفتح",
  },
  "tr-TR": {
    ariaLabel: "TouchLine gezinme menüsü",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "Tüm kulüpler",
    live: "Canlı",
    rankings: "Sıralamalar",
    fantasy: "Fantasy",
    myClub: "Kulübüm",
    more: "Daha fazla",
    currentClub: "Geçerli kulüp",
    opening: "Açılıyor",
  },
  "de-DE": {
    ariaLabel: "TouchLine-Navigation",
    backToArena: "Club Owner",
    clubHub: "ClubHub",
    allClubs: "Alle Vereine",
    live: "Live",
    rankings: "Ranglisten",
    fantasy: "Fantasy",
    myClub: "Mein Verein",
    more: "Mehr",
    currentClub: "Aktueller Verein",
    opening: "Wird geöffnet",
  },
} satisfies Readonly<Record<TouchLineLocale, TouchlineNavigationCopy>>;

/** A page may opt into draft labels; destination URL gates remain independent. */
export function getTouchlineNavigationCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineNavigationCopy {
  return TOUCHLINE_NAVIGATION_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
