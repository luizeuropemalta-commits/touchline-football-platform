import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { getTouchlineCoachCardCopy, TOUCHLINE_COACH_CARD_CATALOGUES } from "./coach-card-i18n.ts";
import { getTouchlineCardZoomCopy, TOUCHLINE_CARD_ZOOM_CATALOGUES } from "./card-zoom-i18n.ts";
import { getTouchlineTablesPresentationCopy, TOUCHLINE_TABLES_PRESENTATION_CATALOGUES } from "./tables-presentation-i18n.ts";
import { getTouchlineMatchCentreCopy, TOUCHLINE_MATCH_CENTRE_CATALOGUES } from "./match-centre-i18n.ts";
import { getTouchlineCoachProfileCopy } from "./coach-profile-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
// Only public performance copy. Historical contract/date presentation is unchanged.
const rows = {
  rank: ["Rank #{rank}", "Ranking #{rank}", "Posición #{rank}", "Posizione #{rank}", "Classement #{rank}", "الترتيب #{rank}", "Sıra #{rank}", "Rang #{rank}"],
  noContract: ["No TouchLine contract", "Sem contrato TouchLine", "Sin contrato TouchLine", "Nessun contratto TouchLine", "Aucun contrat TouchLine", "لا يوجد عقد TouchLine", "TouchLine sözleşmesi yok", "Kein TouchLine-Vertrag"],
  panelAria: ["Coach TouchLine performance", "Desempenho TouchLine do treinador", "Rendimiento TouchLine del entrenador", "Rendimento TouchLine dell’allenatore", "Performances TouchLine de l’entraîneur", "أداء المدرب في TouchLine", "Antrenörün TouchLine performansı", "TouchLine-Leistung des Trainers"],
  seasonEyebrow: ["TOUCHLINE SEASON", "TEMPORADA TOUCHLINE", "TEMPORADA TOUCHLINE", "STAGIONE TOUCHLINE", "SAISON TOUCHLINE", "موسم TOUCHLINE", "TOUCHLINE SEZONU", "TOUCHLINE-SAISON"],
  officialPerformance: ["Official performance", "Desempenho oficial", "Rendimiento oficial", "Rendimento ufficiale", "Performances officielles", "الأداء الرسمي", "Resmî performans", "Offizielle Leistung"],
  totalScore: ["Total score", "Pontuação total", "Puntuación total", "Punteggio totale", "Score total", "مجموع النقاط", "Toplam puan", "Gesamtpunktzahl"],
  disciplineAria: ["Coach discipline", "Disciplina do treinador", "Disciplina del entrenador", "Disciplina dell’allenatore", "Discipline de l’entraîneur", "انضباط المدرب", "Antrenör disiplini", "Disziplin des Trainers"],
  disciplineEyebrow: ["DISCIPLINE", "DISCIPLINA", "DISCIPLINA", "DISCIPLINA", "DISCIPLINE", "الانضباط", "DİSİPLİN", "DISZIPLIN"],
  officialCards: ["Official cards", "Cartões oficiais", "Tarjetas oficiales", "Cartellini ufficiali", "Cartons officiels", "البطاقات الرسمية", "Resmî kartlar", "Offizielle Karten"],
  yellow: ["Yellow", "Amarelo", "Amarilla", "Giallo", "Jaune", "أصفر", "Sarı", "Gelb"],
  red: ["Red", "Vermelho", "Roja", "Rosso", "Rouge", "أحمر", "Kırmızı", "Rot"],
  empty: ["This coach has no TouchLine contract with the authenticated account. No points have been invented.", "Este treinador não possui contrato TouchLine com a conta autenticada. Nenhum ponto foi inventado.", "Este entrenador no tiene contrato TouchLine con la cuenta autenticada. No se han inventado puntos.", "Questo allenatore non ha un contratto TouchLine con l’account autenticato. Nessun punto è stato inventato.", "Cet entraîneur n’a pas de contrat TouchLine avec le compte authentifié. Aucun point n’a été inventé.", "هذا المدرب ليس لديه عقد TouchLine مع الحساب المصادق عليه. لم تُختلق أي نقاط.", "Bu antrenörün kimliği doğrulanmış hesapla TouchLine sözleşmesi yok. Hiçbir puan uydurulmadı.", "Dieser Trainer hat keinen TouchLine-Vertrag mit dem authentifizierten Konto. Es wurden keine Punkte erfunden."],
} as const satisfies Record<string, readonly [string, string, string, string, string, string, string, string]>;

type OwnCopy = Readonly<Record<keyof typeof rows, string>>;
export type TouchlineCoachPerformanceCopy = OwnCopy & Readonly<Record<"home" | "away" | "performance" | "wins" | "draws" | "losses" | "season" | "matches", string>>;
export const TOUCHLINE_COACH_PERFORMANCE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_COACH_PERFORMANCE_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_COACH_PERFORMANCE_CATALOGUES = Object.fromEntries(locales.map((locale, index) => [
  locale, Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]])),
])) as Record<TouchLineLocale, OwnCopy>;

export function getTouchlineCoachPerformanceCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineCoachPerformanceCopy {
  const resolved = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const card = draftLocalesEnabled ? TOUCHLINE_COACH_CARD_CATALOGUES[resolved] : getTouchlineCoachCardCopy(resolved);
  const zoom = draftLocalesEnabled ? TOUCHLINE_CARD_ZOOM_CATALOGUES[resolved] : getTouchlineCardZoomCopy(resolved);
  const tables = draftLocalesEnabled ? TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[resolved] : getTouchlineTablesPresentationCopy(resolved);
  const match = draftLocalesEnabled ? TOUCHLINE_MATCH_CENTRE_CATALOGUES[resolved] : getTouchlineMatchCentreCopy(resolved);
  const profile = getTouchlineCoachProfileCopy(resolved, draftLocalesEnabled);
  return { ...TOUCHLINE_COACH_PERFORMANCE_CATALOGUES[resolved], home: card.home, away: card.away,
    performance: zoom.performance, wins: tables.wins, draws: tables.draws, losses: tables.losses, season: match.season, matches: profile.matches };
}
