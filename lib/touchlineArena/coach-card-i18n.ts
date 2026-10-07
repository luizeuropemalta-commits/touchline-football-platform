import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  awaitingCoach: "Awaiting coach", coachPending: "Coach pending", coachCardAria: "{coachName} TouchLine coach card",
  nationality: "Nationality", currentClub: "Current club", firstTeamManager: "First-team manager",
  home: "Home", homeFixtureAria: "Home fixture", away: "Away", awayFixtureAria: "Away fixture", result: "Result", cards: "Cards",
} as const;

export type TouchlineCoachCardCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_COACH_CARD_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_COACH_CARD_DRAFT_STATUS = "draft" as const;

/** Public presentation only. Official names, ISO codes, TL PTS, artwork and
 * scoring are not translation keys. Six drafts await linguistic/RTL release review.
 */
export const TOUCHLINE_COACH_CARD_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    awaitingCoach: "Aguardando treinador", coachPending: "Treinador pendente", coachCardAria: "Card de treinador TouchLine de {coachName}",
    nationality: "Nacionalidade", currentClub: "Clube atual", firstTeamManager: "Treinador principal",
    home: "Casa", homeFixtureAria: "Partida em casa", away: "Fora", awayFixtureAria: "Partida fora de casa", result: "Resultado", cards: "Cartões",
  },
  "es-ES": {
    awaitingCoach: "Esperando entrenador", coachPending: "Entrenador pendiente", coachCardAria: "Tarjeta de entrenador TouchLine de {coachName}",
    nationality: "Nacionalidad", currentClub: "Club actual", firstTeamManager: "Entrenador del primer equipo",
    home: "Local", homeFixtureAria: "Partido como local", away: "Visitante", awayFixtureAria: "Partido como visitante", result: "Resultado", cards: "Tarjetas",
  },
  "it-IT": {
    awaitingCoach: "In attesa dell’allenatore", coachPending: "Allenatore in attesa", coachCardAria: "Carta allenatore TouchLine di {coachName}",
    nationality: "Nazionalità", currentClub: "Club attuale", firstTeamManager: "Allenatore della prima squadra",
    home: "Casa", homeFixtureAria: "Partita in casa", away: "Trasferta", awayFixtureAria: "Partita in trasferta", result: "Risultato", cards: "Cartellini",
  },
  "fr-FR": {
    awaitingCoach: "En attente de l’entraîneur", coachPending: "Entraîneur en attente", coachCardAria: "Carte d’entraîneur TouchLine de {coachName}",
    nationality: "Nationalité", currentClub: "Club actuel", firstTeamManager: "Entraîneur de l’équipe première",
    home: "Domicile", homeFixtureAria: "Match à domicile", away: "Extérieur", awayFixtureAria: "Match à l’extérieur", result: "Résultat", cards: "Cartons",
  },
  "ar-SA": {
    awaitingCoach: "في انتظار المدرب", coachPending: "المدرب قيد الانتظار", coachCardAria: "بطاقة مدرب TouchLine لـ {coachName}",
    nationality: "الجنسية", currentClub: "النادي الحالي", firstTeamManager: "مدرب الفريق الأول",
    home: "على أرضه", homeFixtureAria: "مباراة على أرضه", away: "خارج أرضه", awayFixtureAria: "مباراة خارج أرضه", result: "النتيجة", cards: "البطاقات",
  },
  "tr-TR": {
    awaitingCoach: "Teknik direktör bekleniyor", coachPending: "Teknik direktör bekleniyor", coachCardAria: "{coachName} TouchLine teknik direktör kartı",
    nationality: "Uyruk", currentClub: "Mevcut kulüp", firstTeamManager: "A takım teknik direktörü",
    home: "İç saha", homeFixtureAria: "İç saha maçı", away: "Deplasman", awayFixtureAria: "Deplasman maçı", result: "Sonuç", cards: "Kartlar",
  },
  "de-DE": {
    awaitingCoach: "Trainer ausstehend", coachPending: "Trainer ausstehend", coachCardAria: "TouchLine-Trainerkarte von {coachName}",
    nationality: "Nationalität", currentClub: "Aktueller Verein", firstTeamManager: "Trainer der ersten Mannschaft",
    home: "Heim", homeFixtureAria: "Heimspiel", away: "Auswärts", awayFixtureAria: "Auswärtsspiel", result: "Ergebnis", cards: "Karten",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineCoachCardCopy>>;

export function getTouchlineCoachCardCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineCoachCardCopy {
  return TOUCHLINE_COACH_CARD_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
