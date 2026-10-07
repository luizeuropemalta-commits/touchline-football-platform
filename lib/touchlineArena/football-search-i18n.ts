import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  back: "Back to ClubOwner",
  title: "TouchLine football search",
  editorialTitle: "Cards are managed by the editorial team",
  editorialDescription: "Each card is published manually, one player at a time, after editorial review.",
} as const;
type FootballSearchCopy = Readonly<Record<keyof typeof enGB, string>>;

/** Draft copy is opt-in only; this notice never initiates a search or publication. */
export const TOUCHLINE_FOOTBALL_SEARCH_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    back: "Voltar ao ClubOwner", title: "Pesquisa de futebol TouchLine",
    editorialTitle: "Cards geridos pela equipa editorial",
    editorialDescription: "Cada card é publicado manualmente, jogador por jogador, depois de revisão editorial.",
  },
  "es-ES": {
    back: "Volver a ClubOwner", title: "Búsqueda de fútbol de TouchLine",
    editorialTitle: "El equipo editorial gestiona las tarjetas",
    editorialDescription: "Cada tarjeta se publica manualmente, jugador por jugador, tras una revisión editorial.",
  },
  "it-IT": {
    back: "Torna a ClubOwner", title: "Ricerca calcistica TouchLine",
    editorialTitle: "Le carte sono gestite dalla redazione",
    editorialDescription: "Ogni carta viene pubblicata manualmente, un giocatore alla volta, dopo una revisione editoriale.",
  },
  "fr-FR": {
    back: "Retour à ClubOwner", title: "Recherche de football TouchLine",
    editorialTitle: "Les cartes sont gérées par l’équipe éditoriale",
    editorialDescription: "Chaque carte est publiée manuellement, joueur par joueur, après une révision éditoriale.",
  },
  "ar-SA": {
    back: "العودة إلى ClubOwner", title: "بحث كرة القدم في TouchLine",
    editorialTitle: "يتولى فريق التحرير إدارة البطاقات",
    editorialDescription: "تُنشر كل بطاقة يدويًا، لاعبًا تلو الآخر، بعد مراجعة تحريرية.",
  },
  "tr-TR": {
    back: "ClubOwner’a dön", title: "TouchLine futbol araması",
    editorialTitle: "Kartlar editör ekibi tarafından yönetilir",
    editorialDescription: "Her kart, editoryal incelemenin ardından oyuncu oyuncu manuel olarak yayımlanır.",
  },
  "de-DE": {
    back: "Zurück zu ClubOwner", title: "TouchLine-Fußballsuche",
    editorialTitle: "Die Karten werden von der Redaktion verwaltet",
    editorialDescription: "Jede Karte wird nach redaktioneller Prüfung manuell veröffentlicht, Spieler für Spieler.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, FootballSearchCopy>>;

export function getTouchlineFootballSearchCopy(locale?: string | null, draftLocalesEnabled = false): FootballSearchCopy {
  return TOUCHLINE_FOOTBALL_SEARCH_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
