import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";

const enGB = {
  summaryAria: "Your XI summary", remainingBudget: "XI budget remaining", roundPoints: "Gameweek points",
  roundPointsAria: "Gameweek points — open rankings", seasonPoints: "Season points", seasonPointsAria: "Season points — open rankings",
} as const;

export type TouchlineFantasyMarketMetricsCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_FANTASY_MARKET_METRICS_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_FANTASY_MARKET_METRICS_DRAFT_STATUS = "draft" as const;

/** Labels only. Account metrics, game budget, points, formatting and destinations
 * remain owned by the existing consumer, never by this catalogue. Six additional
 * languages are drafts; this namespace does not open any public locale gate.
 */
export const TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    summaryAria: "Resumo do seu XI", remainingBudget: "Orçamento restante do XI", roundPoints: "Pontos da rodada",
    roundPointsAria: "Pontos da rodada — abrir ranking", seasonPoints: "Pontos da temporada", seasonPointsAria: "Pontos da temporada — abrir ranking",
  },
  "es-ES": {
    summaryAria: "Resumen de tu XI", remainingBudget: "Presupuesto restante del XI", roundPoints: "Puntos de la jornada",
    roundPointsAria: "Puntos de la jornada — abrir clasificación", seasonPoints: "Puntos de la temporada", seasonPointsAria: "Puntos de la temporada — abrir clasificación",
  },
  "it-IT": {
    summaryAria: "Riepilogo del tuo XI", remainingBudget: "Budget rimanente dell’XI", roundPoints: "Punti della giornata",
    roundPointsAria: "Punti della giornata — apri la classifica", seasonPoints: "Punti della stagione", seasonPointsAria: "Punti della stagione — apri la classifica",
  },
  "fr-FR": {
    summaryAria: "Résumé de votre XI", remainingBudget: "Budget restant du XI", roundPoints: "Points de la journée",
    roundPointsAria: "Points de la journée — ouvrir le classement", seasonPoints: "Points de la saison", seasonPointsAria: "Points de la saison — ouvrir le classement",
  },
  "ar-SA": {
    summaryAria: "ملخص تشكيلتك XI", remainingBudget: "الميزانية المتبقية لتشكيلة XI", roundPoints: "نقاط الجولة",
    roundPointsAria: "نقاط الجولة — فتح الترتيب", seasonPoints: "نقاط الموسم", seasonPointsAria: "نقاط الموسم — فتح الترتيب",
  },
  "tr-TR": {
    summaryAria: "XI özeti", remainingBudget: "XI için kalan bütçe", roundPoints: "Haftanın puanları",
    roundPointsAria: "Haftanın puanları — sıralamayı aç", seasonPoints: "Sezon puanları", seasonPointsAria: "Sezon puanları — sıralamayı aç",
  },
  "de-DE": {
    summaryAria: "Übersicht deiner XI", remainingBudget: "Verbleibendes XI-Budget", roundPoints: "Spieltagspunkte",
    roundPointsAria: "Spieltagspunkte — Rangliste öffnen", seasonPoints: "Saisonpunkte", seasonPointsAria: "Saisonpunkte — Rangliste öffnen",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineFantasyMarketMetricsCopy>>;

export function getTouchlineFantasyMarketMetricsCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineFantasyMarketMetricsCopy {
  return TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
