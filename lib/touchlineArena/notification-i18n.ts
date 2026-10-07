import type { TouchLineLocale } from "./i18n.ts";

export const TOUCHLINE_NOTIFICATION_EVENT_KINDS = [
  "goal", "own-goal", "red-card", "match-start", "half-time", "second-half", "full-time",
  "penalty-awarded", "penalty-confirmed", "penalty-missed", "penalty-converted",
  "var-review", "goal-disallowed", "penalty-cancelled", "var-goal-confirmed",
  "official-lineup", "lineup-reminder", "crown", "golden-boot",
] as const;

export type TouchlineNotificationEventKind = (typeof TOUCHLINE_NOTIFICATION_EVENT_KINDS)[number];
export type TouchlineNotificationCopy = Readonly<{
  brand: "TouchLine";
  eventLabels: Readonly<Record<TouchlineNotificationEventKind, string>>;
  reminders: Readonly<{ title: string; missing_xi: string; complete_unconfirmed: string }>;
  match: Readonly<{ titleTemplate: string; bodyTemplate: string }>;
  actions: Readonly<{ openMatch: string; openLineup: string; openRankings: string; close: string }>;
}>;

const matchTemplates = Object.freeze({
  titleTemplate: "{home} - {away}",
  bodyTemplate: "{event} · {minute} · {homeScore} - {awayScore} · {player}",
});

function catalogue(input: Pick<TouchlineNotificationCopy, "eventLabels" | "reminders" | "actions">): TouchlineNotificationCopy {
  return Object.freeze({
    brand: "TouchLine",
    eventLabels: Object.freeze(input.eventLabels),
    reminders: Object.freeze(input.reminders),
    match: matchTemplates,
    actions: Object.freeze(input.actions),
  });
}

/**
 * Presentation vocabulary only. A label does not verify an event, enable its
 * delivery, select an account's language or change a public site locale gate.
 * No score/rating/identity is inferred here; formatters provide verified facts.
 */
const catalogues = {
  "en-GB": catalogue({
    eventLabels: {
      goal: "Goal",
      "own-goal": "Own goal",
      "red-card": "Red card",
      "match-start": "Kick-off",
      "half-time": "Half-time",
      "second-half": "Second half",
      "full-time": "Full-time",
      "penalty-awarded": "Penalty awarded",
      "penalty-confirmed": "Penalty confirmed",
      "penalty-missed": "Penalty missed",
      "penalty-converted": "Penalty scored",
      "var-review": "VAR review",
      "goal-disallowed": "Goal disallowed",
      "penalty-cancelled": "Penalty cancelled",
      "var-goal-confirmed": "Goal confirmed by VAR",
      "official-lineup": "Official lineup",
      "lineup-reminder": "Lineup reminder",
      crown: "League leader",
      "golden-boot": "Top scorer",
    },
    reminders: {
      title: "Your team is waiting",
      missing_xi: "Build your lineup",
      complete_unconfirmed: "Confirm your lineup",
    },
    actions: { openMatch: "View match", openLineup: "Open lineup", openRankings: "View rankings", close: "Close" },
  }),
  "pt-BR": catalogue({
    eventLabels: {
      goal: "Gol",
      "own-goal": "Gol contra",
      "red-card": "Cartão vermelho",
      "match-start": "Início de jogo",
      "half-time": "Intervalo",
      "second-half": "Segundo tempo",
      "full-time": "Fim de jogo",
      "penalty-awarded": "Pênalti marcado",
      "penalty-confirmed": "Pênalti confirmado",
      "penalty-missed": "Pênalti perdido",
      "penalty-converted": "Gol de pênalti",
      "var-review": "Revisão do VAR",
      "goal-disallowed": "Gol anulado",
      "penalty-cancelled": "Pênalti cancelado",
      "var-goal-confirmed": "Gol confirmado pelo VAR",
      "official-lineup": "Escalação oficial",
      "lineup-reminder": "Lembrete de escalação",
      crown: "Líder da liga",
      "golden-boot": "Artilheiro da liga",
    },
    reminders: {
      title: "Seu time está esperando",
      missing_xi: "Monte sua escalação",
      complete_unconfirmed: "Confirme sua escalação",
    },
    actions: { openMatch: "Ver jogo", openLineup: "Abrir escalação", openRankings: "Ver rankings", close: "Fechar" },
  }),
  "es-ES": catalogue({
    eventLabels: {
      goal: "Gol",
      "own-goal": "Gol en propia puerta",
      "red-card": "Tarjeta roja",
      "match-start": "Inicio del partido",
      "half-time": "Descanso",
      "second-half": "Segunda parte",
      "full-time": "Final del partido",
      "penalty-awarded": "Penalti señalado",
      "penalty-confirmed": "Penalti confirmado",
      "penalty-missed": "Penalti fallado",
      "penalty-converted": "Gol de penalti",
      "var-review": "Revisión del VAR",
      "goal-disallowed": "Gol anulado",
      "penalty-cancelled": "Penalti anulado",
      "var-goal-confirmed": "Gol confirmado por el VAR",
      "official-lineup": "Alineación oficial",
      "lineup-reminder": "Recordatorio de alineación",
      crown: "Líder de la liga",
      "golden-boot": "Máximo goleador de la liga",
    },
    reminders: {
      title: "Tu equipo te espera",
      missing_xi: "Prepara tu alineación",
      complete_unconfirmed: "Confirma tu alineación",
    },
    actions: { openMatch: "Ver partido", openLineup: "Abrir alineación", openRankings: "Ver clasificaciones", close: "Cerrar" },
  }),
  "it-IT": catalogue({
    eventLabels: {
      goal: "Gol",
      "own-goal": "Autogol",
      "red-card": "Cartellino rosso",
      "match-start": "Calcio d’inizio",
      "half-time": "Intervallo",
      "second-half": "Secondo tempo",
      "full-time": "Fine partita",
      "penalty-awarded": "Rigore assegnato",
      "penalty-confirmed": "Rigore confermato",
      "penalty-missed": "Rigore sbagliato",
      "penalty-converted": "Gol su rigore",
      "var-review": "Revisione VAR",
      "goal-disallowed": "Gol annullato",
      "penalty-cancelled": "Rigore revocato",
      "var-goal-confirmed": "Gol confermato dal VAR",
      "official-lineup": "Formazione ufficiale",
      "lineup-reminder": "Promemoria formazione",
      crown: "Leader del campionato",
      "golden-boot": "Capocannoniere del campionato",
    },
    reminders: {
      title: "La tua squadra ti aspetta",
      missing_xi: "Prepara la tua formazione",
      complete_unconfirmed: "Conferma la tua formazione",
    },
    actions: { openMatch: "Vedi la partita", openLineup: "Apri la formazione", openRankings: "Vedi le classifiche", close: "Chiudi" },
  }),
  "fr-FR": catalogue({
    eventLabels: {
      goal: "But",
      "own-goal": "But contre son camp",
      "red-card": "Carton rouge",
      "match-start": "Coup d’envoi",
      "half-time": "Mi-temps",
      "second-half": "Seconde période",
      "full-time": "Fin du match",
      "penalty-awarded": "Penalty accordé",
      "penalty-confirmed": "Penalty confirmé",
      "penalty-missed": "Penalty manqué",
      "penalty-converted": "But sur penalty",
      "var-review": "Vérification VAR",
      "goal-disallowed": "But refusé",
      "penalty-cancelled": "Penalty annulé",
      "var-goal-confirmed": "But confirmé par la VAR",
      "official-lineup": "Composition officielle",
      "lineup-reminder": "Rappel de composition",
      crown: "Leader du championnat",
      "golden-boot": "Meilleur buteur du championnat",
    },
    reminders: {
      title: "Votre équipe vous attend",
      missing_xi: "Préparez votre composition",
      complete_unconfirmed: "Confirmez votre composition",
    },
    actions: { openMatch: "Voir le match", openLineup: "Ouvrir la composition", openRankings: "Voir les classements", close: "Fermer" },
  }),
  "ar-SA": catalogue({
    eventLabels: {
      goal: "هدف",
      "own-goal": "هدف عكسي",
      "red-card": "بطاقة حمراء",
      "match-start": "بداية المباراة",
      "half-time": "نهاية الشوط الأول",
      "second-half": "الشوط الثاني",
      "full-time": "نهاية المباراة",
      "penalty-awarded": "احتساب ركلة جزاء",
      "penalty-confirmed": "تأكيد ركلة الجزاء",
      "penalty-missed": "ركلة جزاء ضائعة",
      "penalty-converted": "هدف من ركلة جزاء",
      "var-review": "مراجعة حكم الفيديو",
      "goal-disallowed": "هدف ملغى",
      "penalty-cancelled": "إلغاء ركلة الجزاء",
      "var-goal-confirmed": "هدف مؤكد بعد مراجعة الفيديو",
      "official-lineup": "التشكيلة الرسمية",
      "lineup-reminder": "تذكير بالتشكيلة",
      crown: "متصدر الدوري",
      "golden-boot": "هداف الدوري",
    },
    reminders: {
      title: "فريقك ينتظرك",
      missing_xi: "كوّن تشكيلتك",
      complete_unconfirmed: "أكد تشكيلتك",
    },
    actions: { openMatch: "عرض المباراة", openLineup: "فتح التشكيلة", openRankings: "عرض الترتيب", close: "إغلاق" },
  }),
  "tr-TR": catalogue({
    eventLabels: {
      goal: "Gol",
      "own-goal": "Kendi kalesine gol",
      "red-card": "Kırmızı kart",
      "match-start": "Maç başladı",
      "half-time": "Devre arası",
      "second-half": "İkinci yarı",
      "full-time": "Maç sona erdi",
      "penalty-awarded": "Penaltı verildi",
      "penalty-confirmed": "Penaltı onaylandı",
      "penalty-missed": "Penaltı kaçtı",
      "penalty-converted": "Penaltı golü",
      "var-review": "VAR incelemesi",
      "goal-disallowed": "Gol iptal edildi",
      "penalty-cancelled": "Penaltı iptal edildi",
      "var-goal-confirmed": "Gol VAR ile onaylandı",
      "official-lineup": "Resmî ilk 11",
      "lineup-reminder": "Kadro hatırlatması",
      crown: "Lig lideri",
      "golden-boot": "Ligin gol kralı",
    },
    reminders: {
      title: "Takımınız sizi bekliyor",
      missing_xi: "Kadronuzu kurun",
      complete_unconfirmed: "Kadronuzu onaylayın",
    },
    actions: { openMatch: "Maçı görüntüle", openLineup: "Kadroyu aç", openRankings: "Sıralamaları görüntüle", close: "Kapat" },
  }),
  "de-DE": catalogue({
    eventLabels: {
      goal: "Tor",
      "own-goal": "Eigentor",
      "red-card": "Rote Karte",
      "match-start": "Anpfiff",
      "half-time": "Halbzeit",
      "second-half": "Zweite Halbzeit",
      "full-time": "Abpfiff",
      "penalty-awarded": "Elfmeter gegeben",
      "penalty-confirmed": "Elfmeter bestätigt",
      "penalty-missed": "Elfmeter vergeben",
      "penalty-converted": "Elfmetertor",
      "var-review": "VAR-Prüfung",
      "goal-disallowed": "Tor aberkannt",
      "penalty-cancelled": "Elfmeter zurückgenommen",
      "var-goal-confirmed": "Tor durch VAR bestätigt",
      "official-lineup": "Offizielle Aufstellung",
      "lineup-reminder": "Aufstellungserinnerung",
      crown: "Tabellenführer",
      "golden-boot": "Torschützenkönig der Liga",
    },
    reminders: {
      title: "Dein Team wartet auf dich",
      missing_xi: "Stelle dein Team auf",
      complete_unconfirmed: "Bestätige deine Aufstellung",
    },
    actions: { openMatch: "Spiel ansehen", openLineup: "Aufstellung öffnen", openRankings: "Ranglisten ansehen", close: "Schließen" },
  }),
} satisfies Record<TouchLineLocale, TouchlineNotificationCopy>;

/** Reject unknown values and prototype keys; never guess an account's locale. */
export function getTouchlineNotificationCopy(locale: unknown): TouchlineNotificationCopy | null {
  if (typeof locale !== "string" || !Object.hasOwn(catalogues, locale)) return null;
  return catalogues[locale as keyof typeof catalogues];
}
