import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  hide: "Hide full performance", view: "View full performance", history: "Match history", recent: "Recent matches", full: "Full performance",
  close: "Close card", profile: "View profile", historyLink: "View TouchLine history", cardEngine: "Edit in Card Engine",
  performance: "Performance", performanceSubtitle: "Official match ratings and statistics",
  expandCard: "Expand card for {playerName}", openCard: "Open card for {playerName}",
  openCurrentCard: "Open current card for {playerName}", openMatchCard: "Open match card for {playerName}",
  openGoalCard: "Open goal card for {playerName}", openUpgradedCard: "Open upgraded card for {playerName}",
  lastMatchRating: "Last match rating", officialPlayerProfile: "Official player profile", matchHistoryEntry: "Match history",
} as const;

export type TouchlineCardZoomCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CARD_ZOOM_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CARD_ZOOM_DRAFT_STATUS = "draft" as const;

/** Presentation chrome and caller overrides only. Field semantics, factual
 * values, social actions and legacy commercial CTA behavior remain owned by callers.
 * Six catalogues are drafts, not linguistic/RTL review or release approval.
 */
export const TOUCHLINE_CARD_ZOOM_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    hide: "Ocultar desempenho completo", view: "Ver desempenho completo", history: "Histórico de partidas", recent: "Últimas partidas", full: "Desempenho completo",
    close: "Fechar card", profile: "Ver perfil", historyLink: "Ver histórico TouchLine", cardEngine: "Editar no Card Engine",
    performance: "Desempenho", performanceSubtitle: "Notas e estatísticas oficiais da partida",
    expandCard: "Ampliar card de {playerName}", openCard: "Ampliar card de {playerName}",
    openCurrentCard: "Ampliar card atual de {playerName}", openMatchCard: "Ampliar card da partida de {playerName}",
    openGoalCard: "Ampliar card do gol de {playerName}", openUpgradedCard: "Ampliar card evoluído de {playerName}",
    lastMatchRating: "Nota da última partida", officialPlayerProfile: "Perfil oficial do atleta", matchHistoryEntry: "Histórico da partida",
  },
  "es-ES": {
    hide: "Ocultar rendimiento completo", view: "Ver rendimiento completo", history: "Historial de partidos", recent: "Partidos recientes", full: "Rendimiento completo",
    close: "Cerrar tarjeta", profile: "Ver perfil", historyLink: "Ver historial TouchLine", cardEngine: "Editar en Card Engine",
    performance: "Rendimiento", performanceSubtitle: "Valoraciones y estadísticas oficiales del partido",
    expandCard: "Ampliar tarjeta de {playerName}", openCard: "Abrir tarjeta de {playerName}",
    openCurrentCard: "Abrir tarjeta actual de {playerName}", openMatchCard: "Abrir tarjeta del partido de {playerName}",
    openGoalCard: "Abrir tarjeta del gol de {playerName}", openUpgradedCard: "Abrir tarjeta mejorada de {playerName}",
    lastMatchRating: "Valoración del último partido", officialPlayerProfile: "Perfil oficial del jugador", matchHistoryEntry: "Historial del partido",
  },
  "it-IT": {
    hide: "Nascondi il rendimento completo", view: "Mostra il rendimento completo", history: "Storico delle partite", recent: "Partite recenti", full: "Rendimento completo",
    close: "Chiudi la carta", profile: "Visualizza il profilo", historyLink: "Visualizza lo storico TouchLine", cardEngine: "Modifica in Card Engine",
    performance: "Rendimento", performanceSubtitle: "Valutazioni e statistiche ufficiali della partita",
    expandCard: "Ingrandisci la carta di {playerName}", openCard: "Apri la carta di {playerName}",
    openCurrentCard: "Apri la carta attuale di {playerName}", openMatchCard: "Apri la carta della partita di {playerName}",
    openGoalCard: "Apri la carta del gol di {playerName}", openUpgradedCard: "Apri la carta migliorata di {playerName}",
    lastMatchRating: "Valutazione dell’ultima partita", officialPlayerProfile: "Profilo ufficiale del giocatore", matchHistoryEntry: "Storico della partita",
  },
  "fr-FR": {
    hide: "Masquer les performances complètes", view: "Voir les performances complètes", history: "Historique des matchs", recent: "Matchs récents", full: "Performances complètes",
    close: "Fermer la carte", profile: "Voir le profil", historyLink: "Voir l’historique TouchLine", cardEngine: "Modifier dans Card Engine",
    performance: "Performances", performanceSubtitle: "Notes et statistiques officielles du match",
    expandCard: "Agrandir la carte de {playerName}", openCard: "Ouvrir la carte de {playerName}",
    openCurrentCard: "Ouvrir la carte actuelle de {playerName}", openMatchCard: "Ouvrir la carte du match de {playerName}",
    openGoalCard: "Ouvrir la carte du but de {playerName}", openUpgradedCard: "Ouvrir la carte améliorée de {playerName}",
    lastMatchRating: "Note du dernier match", officialPlayerProfile: "Profil officiel du joueur", matchHistoryEntry: "Historique du match",
  },
  "ar-SA": {
    hide: "إخفاء الأداء الكامل", view: "عرض الأداء الكامل", history: "سجل المباريات", recent: "المباريات الأخيرة", full: "الأداء الكامل",
    close: "إغلاق البطاقة", profile: "عرض الملف الشخصي", historyLink: "عرض سجل TouchLine", cardEngine: "التعديل في Card Engine",
    performance: "الأداء", performanceSubtitle: "التقييمات والإحصاءات الرسمية للمباراة",
    expandCard: "تكبير بطاقة {playerName}", openCard: "فتح بطاقة {playerName}",
    openCurrentCard: "فتح البطاقة الحالية للاعب {playerName}", openMatchCard: "فتح بطاقة المباراة للاعب {playerName}",
    openGoalCard: "فتح بطاقة الهدف للاعب {playerName}", openUpgradedCard: "فتح البطاقة المطوّرة للاعب {playerName}",
    lastMatchRating: "تقييم المباراة الأخيرة", officialPlayerProfile: "الملف الرسمي للاعب", matchHistoryEntry: "سجل المباراة",
  },
  "tr-TR": {
    hide: "Tüm performansı gizle", view: "Tüm performansı göster", history: "Maç geçmişi", recent: "Son maçlar", full: "Tüm performans",
    close: "Kartı kapat", profile: "Profili görüntüle", historyLink: "TouchLine geçmişini görüntüle", cardEngine: "Card Engine içinde düzenle",
    performance: "Performans", performanceSubtitle: "Resmî maç değerlendirmeleri ve istatistikleri",
    expandCard: "{playerName} kartını büyüt", openCard: "{playerName} kartını aç",
    openCurrentCard: "{playerName} güncel kartını aç", openMatchCard: "{playerName} maç kartını aç",
    openGoalCard: "{playerName} gol kartını aç", openUpgradedCard: "{playerName} geliştirilmiş kartını aç",
    lastMatchRating: "Son maç puanı", officialPlayerProfile: "Resmî oyuncu profili", matchHistoryEntry: "Maç geçmişi",
  },
  "de-DE": {
    hide: "Vollständige Leistung ausblenden", view: "Vollständige Leistung anzeigen", history: "Spielhistorie", recent: "Letzte Spiele", full: "Vollständige Leistung",
    close: "Karte schließen", profile: "Profil ansehen", historyLink: "TouchLine-Verlauf ansehen", cardEngine: "In Card Engine bearbeiten",
    performance: "Leistung", performanceSubtitle: "Offizielle Spielbewertungen und Statistiken",
    expandCard: "Karte von {playerName} vergrößern", openCard: "Karte von {playerName} öffnen",
    openCurrentCard: "Aktuelle Karte von {playerName} öffnen", openMatchCard: "Spielkarte von {playerName} öffnen",
    openGoalCard: "Torkarte von {playerName} öffnen", openUpgradedCard: "Verbesserte Karte von {playerName} öffnen",
    lastMatchRating: "Bewertung des letzten Spiels", officialPlayerProfile: "Offizielles Spielerprofil", matchHistoryEntry: "Spielhistorie",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineCardZoomCopy>>;

export function getTouchlineCardZoomCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineCardZoomCopy {
  return TOUCHLINE_CARD_ZOOM_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
