import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  intro: "Open each team’s official ClubHub, review real club information and follow TouchLine cards without landing inside one specific club by default.",
  open: "Open ClubHub",
  clubs: "20 clubs",
  hint: "Premium club selection",
  openingClub: "Opening ClubHub",
  loadingCards: "Loading cards…",
} as const;

export type TouchlineClubHubDirectoryCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_STATUS = "draft" as const;

/** Directory presentation only; the six additional languages remain drafts.
 * The fixed 20-club wording reflects the existing directory, not a new counter.
 * The shared chooseClub title has one authority in market-workflow-i18n.
 * TouchLine England and TouchLine Verified remain literal brands in the page.
 */
export const TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    intro: "Entre no ClubHub oficial de cada equipe, veja informações reais do clube e acompanhe os cards TouchLine sem cair direto em uma página específica.",
    open: "Abrir ClubHub", clubs: "20 clubes", hint: "Seleção premium de clubes",
    openingClub: "Abrindo ClubHub", loadingCards: "Carregando cards…",
  },
  "es-ES": {
    intro: "Entra en el ClubHub oficial de cada equipo, consulta información real del club y sigue las tarjetas TouchLine sin llegar directamente a un club específico.",
    open: "Abrir ClubHub", clubs: "20 clubes", hint: "Selección premium de clubes",
    openingClub: "Abriendo ClubHub", loadingCards: "Cargando tarjetas…",
  },
  "it-IT": {
    intro: "Entra nel ClubHub ufficiale di ogni squadra, consulta le informazioni reali sul club e segui le carte TouchLine senza accedere direttamente a un club specifico.",
    open: "Apri ClubHub", clubs: "20 club", hint: "Selezione premium dei club",
    openingClub: "Apertura di ClubHub", loadingCards: "Caricamento delle carte…",
  },
  "fr-FR": {
    intro: "Accédez au ClubHub officiel de chaque équipe, consultez les informations réelles du club et suivez les cartes TouchLine sans arriver directement sur un club en particulier.",
    open: "Ouvrir ClubHub", clubs: "20 clubs", hint: "Sélection premium de clubs",
    openingClub: "Ouverture de ClubHub", loadingCards: "Chargement des cartes…",
  },
  "ar-SA": {
    intro: "ادخل إلى ClubHub الرسمي لكل فريق، واطّلع على معلومات النادي الفعلية وتابع بطاقات TouchLine، دون الانتقال مباشرة إلى نادٍ محدد.",
    open: "فتح ClubHub", clubs: "20 ناديًا", hint: "مجموعة مميزة من الأندية",
    openingClub: "جارٍ فتح ClubHub", loadingCards: "جارٍ تحميل البطاقات…",
  },
  "tr-TR": {
    intro: "Doğrudan belirli bir kulübe gitmeden her takımın resmî ClubHub sayfasını açın, kulübün gerçek bilgilerini inceleyin ve TouchLine kartlarını takip edin.",
    open: "ClubHub sayfasını aç", clubs: "20 kulüp", hint: "Özenle seçilmiş kulüpler",
    openingClub: "ClubHub açılıyor", loadingCards: "Kartlar yükleniyor…",
  },
  "de-DE": {
    intro: "Öffne den offiziellen ClubHub jedes Teams, sieh dir echte Vereinsinformationen an und verfolge die TouchLine-Karten, ohne direkt bei einem bestimmten Verein zu landen.",
    open: "ClubHub öffnen", clubs: "20 Vereine", hint: "Premium-Vereinsauswahl",
    openingClub: "ClubHub wird geöffnet", loadingCards: "Karten werden geladen…",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubDirectoryCopy>>;

export function getTouchlineClubHubDirectoryCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubDirectoryCopy {
  return TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
