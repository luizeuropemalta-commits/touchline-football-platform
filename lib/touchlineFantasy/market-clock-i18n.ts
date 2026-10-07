import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";

type UnitForms = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { one: string; other: string }>;
type ClockUnit = "hour" | "minute" | "second";
const enGB = {
  closesIn: "Market closes in", reopensIn: "Market reopens in", open: "Market open", closed: "Market closed",
  lastWhistle: "Last whistle of the round", updating: "Updating My Club", nextWindow: "Next window",
  awaitingFinal: "Reopens when the provider confirms the last match has ended. No estimated time.",
  syncingWindow: "Syncing the canonical window", london: "London",
  closesAt: "Closes {deadline}. The countdown starts 24 hours before.",
  reopensAt: "Reopens {deadline}. The countdown starts 24 hours before.",
  unconfirmedTime: "Time to be confirmed", closedStatus: "Market Closed", openStatus: "Market Open",
  syncingStatus: "Syncing", unconfirmedStatus: "To be confirmed", hourShort: "H", minuteShort: "M", secondShort: "S",
  units: {
    hour: { one: "{count} hour", other: "{count} hours" },
    minute: { one: "{count} minute", other: "{count} minutes" },
    second: { one: "{count} second", other: "{count} seconds" },
  },
} as const;

export type TouchlineFantasyMarketClockCopy = Readonly<Record<Exclude<keyof typeof enGB, "units">, string> & {
  units: Readonly<Record<ClockUnit, UnitForms>>;
}>;
export const TOUCHLINE_FANTASY_MARKET_CLOCK_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_FANTASY_MARKET_CLOCK_DRAFT_STATUS = "draft" as const;

/** Presentation only. The canonical clock, 24-hour threshold, deadline and
 * Europe/London timezone remain owned by their existing runtime consumers.
 * Six catalogues are drafts, not linguistic/RTL or release acceptance.
 */
export const TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    closesIn: "Mercado fecha em", reopensIn: "Mercado reabre em", open: "Mercado aberto", closed: "Mercado fechado",
    lastWhistle: "Último apito da rodada", updating: "Atualizando o Meu Clube", nextWindow: "Próxima janela",
    awaitingFinal: "Reabre quando o provedor confirmar o fim do último jogo. Sem horário estimado.",
    syncingWindow: "Sincronizando a janela canônica", london: "Londres",
    closesAt: "Fecha em {deadline}. O cronômetro inicia 24h antes.",
    reopensAt: "Reabre em {deadline}. O cronômetro inicia 24h antes.",
    unconfirmedTime: "Horário em confirmação", closedStatus: "Mercado fechado", openStatus: "Mercado aberto",
    syncingStatus: "Sincronizando", unconfirmedStatus: "A confirmar", hourShort: "H", minuteShort: "M", secondShort: "S",
    units: {
      hour: { one: "{count} hora", other: "{count} horas" },
      minute: { one: "{count} minuto", other: "{count} minutos" },
      second: { one: "{count} segundo", other: "{count} segundos" },
    },
  },
  "es-ES": {
    closesIn: "El mercado cierra en", reopensIn: "El mercado reabre en", open: "Mercado abierto", closed: "Mercado cerrado",
    lastWhistle: "Último pitido de la jornada", updating: "Actualizando Mi Club", nextWindow: "Próxima ventana",
    awaitingFinal: "Reabre cuando el proveedor confirme el final del último partido. Sin hora estimada.",
    syncingWindow: "Sincronizando la ventana canónica", london: "Londres",
    closesAt: "Cierra el {deadline}. La cuenta atrás comienza 24 horas antes.",
    reopensAt: "Reabre el {deadline}. La cuenta atrás comienza 24 horas antes.",
    unconfirmedTime: "Hora por confirmar", closedStatus: "Mercado cerrado", openStatus: "Mercado abierto",
    syncingStatus: "Sincronizando", unconfirmedStatus: "Por confirmar", hourShort: "H", minuteShort: "M", secondShort: "S",
    units: {
      hour: { one: "{count} hora", other: "{count} horas" },
      minute: { one: "{count} minuto", other: "{count} minutos" },
      second: { one: "{count} segundo", other: "{count} segundos" },
    },
  },
  "it-IT": {
    closesIn: "Il mercato chiude tra", reopensIn: "Il mercato riapre tra", open: "Mercato aperto", closed: "Mercato chiuso",
    lastWhistle: "Ultimo fischio della giornata", updating: "Aggiornamento del mio club", nextWindow: "Prossima finestra",
    awaitingFinal: "Riapre quando il fornitore conferma la fine dell’ultima partita. Nessun orario stimato.",
    syncingWindow: "Sincronizzazione della finestra canonica", london: "Londra",
    closesAt: "Chiude il {deadline}. Il conto alla rovescia inizia 24 ore prima.",
    reopensAt: "Riapre il {deadline}. Il conto alla rovescia inizia 24 ore prima.",
    unconfirmedTime: "Orario da confermare", closedStatus: "Mercato chiuso", openStatus: "Mercato aperto",
    syncingStatus: "Sincronizzazione", unconfirmedStatus: "Da confermare", hourShort: "H", minuteShort: "M", secondShort: "S",
    units: {
      hour: { one: "{count} ora", other: "{count} ore" },
      minute: { one: "{count} minuto", other: "{count} minuti" },
      second: { one: "{count} secondo", other: "{count} secondi" },
    },
  },
  "fr-FR": {
    closesIn: "Le marché ferme dans", reopensIn: "Le marché rouvre dans", open: "Marché ouvert", closed: "Marché fermé",
    lastWhistle: "Dernier coup de sifflet de la journée", updating: "Mise à jour de Mon Club", nextWindow: "Prochaine fenêtre",
    awaitingFinal: "Rouvre lorsque le fournisseur confirme la fin du dernier match. Aucun horaire estimé.",
    syncingWindow: "Synchronisation de la fenêtre canonique", london: "Londres",
    closesAt: "Ferme le {deadline}. Le compte à rebours commence 24 heures avant.",
    reopensAt: "Rouvre le {deadline}. Le compte à rebours commence 24 heures avant.",
    unconfirmedTime: "Horaire à confirmer", closedStatus: "Marché fermé", openStatus: "Marché ouvert",
    syncingStatus: "Synchronisation", unconfirmedStatus: "À confirmer", hourShort: "H", minuteShort: "M", secondShort: "S",
    units: {
      hour: { one: "{count} heure", other: "{count} heures" },
      minute: { one: "{count} minute", other: "{count} minutes" },
      second: { one: "{count} seconde", other: "{count} secondes" },
    },
  },
  "ar-SA": {
    closesIn: "يغلق السوق بعد", reopensIn: "يعاد فتح السوق بعد", open: "السوق مفتوح", closed: "السوق مغلق",
    lastWhistle: "الصافرة الأخيرة للجولة", updating: "جارٍ تحديث ناديي", nextWindow: "الفترة التالية",
    awaitingFinal: "يعاد الفتح عندما يؤكد مزود البيانات انتهاء المباراة الأخيرة. لا يوجد وقت تقديري.",
    syncingWindow: "جارٍ مزامنة الفترة المعتمدة", london: "لندن",
    closesAt: "يغلق في {deadline}. يبدأ العد التنازلي قبل 24 ساعة.",
    reopensAt: "يعاد الفتح في {deadline}. يبدأ العد التنازلي قبل 24 ساعة.",
    unconfirmedTime: "الوقت بانتظار التأكيد", closedStatus: "السوق مغلق", openStatus: "السوق مفتوح",
    syncingStatus: "جارٍ المزامنة", unconfirmedStatus: "بانتظار التأكيد", hourShort: "س", minuteShort: "د", secondShort: "ث",
    units: {
      hour: { zero: "{count} ساعة", one: "{count} ساعة", two: "{count} ساعتان", few: "{count} ساعات", many: "{count} ساعة", other: "{count} ساعة" },
      minute: { zero: "{count} دقيقة", one: "{count} دقيقة", two: "{count} دقيقتان", few: "{count} دقائق", many: "{count} دقيقة", other: "{count} دقيقة" },
      second: { zero: "{count} ثانية", one: "{count} ثانية", two: "{count} ثانيتان", few: "{count} ثوانٍ", many: "{count} ثانية", other: "{count} ثانية" },
    },
  },
  "tr-TR": {
    closesIn: "Pazarın kapanmasına", reopensIn: "Pazarın yeniden açılmasına", open: "Pazar açık", closed: "Pazar kapalı",
    lastWhistle: "Haftanın son düdüğü", updating: "Kulübüm güncelleniyor", nextWindow: "Sonraki dönem",
    awaitingFinal: "Veri sağlayıcısı son maçın bittiğini doğruladığında yeniden açılır. Tahmini saat yoktur.",
    syncingWindow: "Kanonik dönem eşitleniyor", london: "Londra",
    closesAt: "Kapanış: {deadline}. Geri sayım 24 saat önce başlar.",
    reopensAt: "Yeniden açılış: {deadline}. Geri sayım 24 saat önce başlar.",
    unconfirmedTime: "Saat doğrulanmayı bekliyor", closedStatus: "Pazar kapalı", openStatus: "Pazar açık",
    syncingStatus: "Eşitleniyor", unconfirmedStatus: "Doğrulanacak", hourShort: "S", minuteShort: "D", secondShort: "Sn",
    units: {
      hour: { one: "{count} saat", other: "{count} saat" },
      minute: { one: "{count} dakika", other: "{count} dakika" },
      second: { one: "{count} saniye", other: "{count} saniye" },
    },
  },
  "de-DE": {
    closesIn: "Markt schließt in", reopensIn: "Markt öffnet wieder in", open: "Markt geöffnet", closed: "Markt geschlossen",
    lastWhistle: "Letzter Abpfiff des Spieltags", updating: "Mein Verein wird aktualisiert", nextWindow: "Nächstes Zeitfenster",
    awaitingFinal: "Öffnet wieder, sobald der Anbieter das Ende des letzten Spiels bestätigt. Keine geschätzte Uhrzeit.",
    syncingWindow: "Kanonisches Zeitfenster wird synchronisiert", london: "London",
    closesAt: "Schließt am {deadline}. Der Countdown beginnt 24 Stunden vorher.",
    reopensAt: "Öffnet wieder am {deadline}. Der Countdown beginnt 24 Stunden vorher.",
    unconfirmedTime: "Uhrzeit noch zu bestätigen", closedStatus: "Markt geschlossen", openStatus: "Markt geöffnet",
    syncingStatus: "Synchronisierung", unconfirmedStatus: "Noch zu bestätigen", hourShort: "H", minuteShort: "M", secondShort: "S",
    units: {
      hour: { one: "{count} Stunde", other: "{count} Stunden" },
      minute: { one: "{count} Minute", other: "{count} Minuten" },
      second: { one: "{count} Sekunde", other: "{count} Sekunden" },
    },
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineFantasyMarketClockCopy>>;

export function getTouchlineFantasyMarketClockCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineFantasyMarketClockCopy {
  return TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function formatTouchlineFantasyClockUnit(value: number, unit: ClockUnit, locale?: string | null, draftLocalesEnabled = false): string {
  const resolvedLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const forms = getTouchlineFantasyMarketClockCopy(resolvedLocale, draftLocalesEnabled).units[unit];
  // Preserve the existing public PT countdown: zero uses plural ("0 horas").
  const category = resolvedLocale === "pt-BR" ? (value === 1 ? "one" : "other") : new Intl.PluralRules(resolvedLocale).select(value);
  return (forms[category] ?? forms.other).replace("{count}", String(value));
}
