import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import type { TouchlineCardStatId } from "./position-aware-card-stats.ts";

export type TouchlineCardMatchFactLabels = Readonly<Record<TouchlineCardStatId, string>>;
export const TOUCHLINE_CARD_MATCH_FACT_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CARD_MATCH_FACT_DRAFT_STATUS = "draft" as const;

/** Labels only: canonical projection, order, icons, kinds and values remain
 * owned by the fact builder. Eighteen labels do not authorize eighteen facts.
 * Six drafts require linguistic/RTL review and explicit release approval.
 */
export const TOUCHLINE_CARD_MATCH_FACT_CATALOGUES = {
  "en-GB": {
    goals: "Goals", assists: "Assists", defense: "DEF score", cleanSheets: "Clean sheets", cards: "Cards", yellowCards: "Yellow cards", redCards: "Red cards", saves: "Saves", goalsConceded: "Goals conceded", minutes: "Minutes", appearances: "Appearances", shotsOnTarget: "Shots on target", shotsOffTarget: "Shots off target", defensiveActionsTotal: "Defensive actions (DAT)", penaltySaves: "Penalty saves", penaltiesMissed: "Penalties missed", ownGoals: "Own goals", rating: "Rating",
  },
  "pt-BR": {
    goals: "Gols", assists: "Assistências", defense: "Pontuação DEF", cleanSheets: "Jogos sem sofrer gols", cards: "Cartões", yellowCards: "Cartões amarelos", redCards: "Cartões vermelhos", saves: "Defesas", goalsConceded: "Gols sofridos", minutes: "Minutos", appearances: "Aparições", shotsOnTarget: "Chutes no gol", shotsOffTarget: "Chutes para fora", defensiveActionsTotal: "Ações defensivas (DAT)", penaltySaves: "Pênaltis defendidos", penaltiesMissed: "Pênaltis perdidos", ownGoals: "Gols contra", rating: "Nota",
  },
  "es-ES": {
    goals: "Goles", assists: "Asistencias", defense: "Puntuación DEF", cleanSheets: "Porterías a cero", cards: "Tarjetas", yellowCards: "Tarjetas amarillas", redCards: "Tarjetas rojas", saves: "Paradas", goalsConceded: "Goles encajados", minutes: "Minutos", appearances: "Partidos disputados", shotsOnTarget: "Tiros a puerta", shotsOffTarget: "Tiros fuera", defensiveActionsTotal: "Acciones defensivas (DAT)", penaltySaves: "Penaltis parados", penaltiesMissed: "Penaltis fallados", ownGoals: "Goles en propia puerta", rating: "Valoración",
  },
  "it-IT": {
    goals: "Gol", assists: "Assist", defense: "Punteggio DEF", cleanSheets: "Partite senza subire gol", cards: "Cartellini", yellowCards: "Cartellini gialli", redCards: "Cartellini rossi", saves: "Parate", goalsConceded: "Gol subiti", minutes: "Minuti", appearances: "Presenze", shotsOnTarget: "Tiri in porta", shotsOffTarget: "Tiri fuori", defensiveActionsTotal: "Azioni difensive (DAT)", penaltySaves: "Rigori parati", penaltiesMissed: "Rigori sbagliati", ownGoals: "Autogol", rating: "Voto",
  },
  "fr-FR": {
    goals: "Buts", assists: "Passes décisives", defense: "Score DEF", cleanSheets: "Matchs sans encaisser de but", cards: "Cartons", yellowCards: "Cartons jaunes", redCards: "Cartons rouges", saves: "Arrêts", goalsConceded: "Buts encaissés", minutes: "Minutes", appearances: "Matchs disputés", shotsOnTarget: "Tirs cadrés", shotsOffTarget: "Tirs non cadrés", defensiveActionsTotal: "Actions défensives (DAT)", penaltySaves: "Penalties arrêtés", penaltiesMissed: "Penalties manqués", ownGoals: "Buts contre son camp", rating: "Note",
  },
  "ar-SA": {
    goals: "الأهداف", assists: "التمريرات الحاسمة", defense: "نقاط DEF", cleanSheets: "مباريات بشباك نظيفة", cards: "البطاقات", yellowCards: "البطاقات الصفراء", redCards: "البطاقات الحمراء", saves: "التصديات", goalsConceded: "الأهداف المستقبلة", minutes: "الدقائق", appearances: "المشاركات", shotsOnTarget: "التسديدات على المرمى", shotsOffTarget: "التسديدات خارج المرمى", defensiveActionsTotal: "التدخلات الدفاعية (DAT)", penaltySaves: "ركلات الجزاء المتصدى لها", penaltiesMissed: "ركلات الجزاء المهدرة", ownGoals: "الأهداف العكسية", rating: "التقييم",
  },
  "tr-TR": {
    goals: "Goller", assists: "Asistler", defense: "DEF puanı", cleanSheets: "Gol yemeden tamamlanan maçlar", cards: "Kartlar", yellowCards: "Sarı kartlar", redCards: "Kırmızı kartlar", saves: "Kurtarışlar", goalsConceded: "Yenilen goller", minutes: "Dakikalar", appearances: "Maça çıkma sayısı", shotsOnTarget: "İsabetli şutlar", shotsOffTarget: "İsabetsiz şutlar", defensiveActionsTotal: "Savunma aksiyonları (DAT)", penaltySaves: "Kurtarılan penaltılar", penaltiesMissed: "Kaçırılan penaltılar", ownGoals: "Kendi kalesine goller", rating: "Değerlendirme",
  },
  "de-DE": {
    goals: "Tore", assists: "Torvorlagen", defense: "DEF-Wertung", cleanSheets: "Spiele ohne Gegentor", cards: "Karten", yellowCards: "Gelbe Karten", redCards: "Rote Karten", saves: "Paraden", goalsConceded: "Gegentore", minutes: "Minuten", appearances: "Einsätze", shotsOnTarget: "Schüsse aufs Tor", shotsOffTarget: "Schüsse neben das Tor", defensiveActionsTotal: "Defensivaktionen (DAT)", penaltySaves: "Gehaltene Elfmeter", penaltiesMissed: "Verschossene Elfmeter", ownGoals: "Eigentore", rating: "Bewertung",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineCardMatchFactLabels>>;

export function getTouchlineCardMatchFactLabels(locale?: string | null, draftLocalesEnabled = false): TouchlineCardMatchFactLabels {
  return TOUCHLINE_CARD_MATCH_FACT_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
