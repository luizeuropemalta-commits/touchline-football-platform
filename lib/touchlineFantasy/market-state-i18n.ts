import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";
import type { TouchlineFantasyBuilderStep } from "./domain.ts";

type GameweekState = "UPCOMING" | "MARKET_OPEN" | "LOCKED" | "LIVE" | "FINAL" | "SETTLED";
type LineupError = "TL_FANTASY_BUDGET_EXCEEDED" | "TL_FANTASY_GAMEWEEK_LOCKED" | "TL_FANTASY_XI_REQUIRES_11"
  | "TL_FANTASY_SELECTION_INELIGIBLE" | "TL_FANTASY_ENTITLEMENT_REQUIRED";
export type TouchlineFantasyMarketStateCopy = Readonly<{
  states: Readonly<Record<GameweekState, string>>;
  steps: Readonly<Record<TouchlineFantasyBuilderStep, string>>;
  errors: Readonly<Record<LineupError, string>>;
  errorFallback: string;
  unavailableTitle: string;
  unavailableMessage: string;
}>;

export const TOUCHLINE_FANTASY_MARKET_STATE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_FANTASY_MARKET_STATE_DRAFT_STATUS = "draft" as const;

/** Current XI state copy, not the retired contracts/checkout catalogue.
 * EN/PT retain the existing live wording, including the existing game budget.
 * The other six catalogues require human and rendered review before release;
 * their presence does not enable their public presentation.
 */
export const TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES = {
  "en-GB": {
    states: { UPCOMING: "Upcoming", MARKET_OPEN: "Market open", LOCKED: "Locked", LIVE: "Live", FINAL: "Final", SETTLED: "Settled" },
    steps: { coach: "Coach", formation: "Formation", players: "Starting XI", review: "Review", locked: "Arena sync" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "This team exceeds the €900M budget.",
      TL_FANTASY_GAMEWEEK_LOCKED: "The market is closed for this Gameweek.",
      TL_FANTASY_XI_REQUIRES_11: "Complete exactly 11 players before confirming.",
      TL_FANTASY_SELECTION_INELIGIBLE: "One selected card is no longer eligible. Replace it and save again.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "Gameweek access is not active for this account.",
    },
    errorFallback: "Unable to save your team.", unavailableTitle: "My Club", unavailableMessage: "Service temporarily unavailable.",
  },
  "pt-BR": {
    states: { UPCOMING: "Em breve", MARKET_OPEN: "Mercado aberto", LOCKED: "Bloqueada", LIVE: "Ao vivo", FINAL: "Final", SETTLED: "Liquidada" },
    steps: { coach: "Treinador", formation: "Formação", players: "11 jogadores", review: "Revisão", locked: "Enviar à Arena" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "Este time ultrapassa o orçamento de €900M.",
      TL_FANTASY_GAMEWEEK_LOCKED: "O mercado está fechado para esta rodada.",
      TL_FANTASY_XI_REQUIRES_11: "Complete exatamente 11 jogadores antes de confirmar.",
      TL_FANTASY_SELECTION_INELIGIBLE: "Um card escolhido não está mais elegível. Troque-o e salve novamente.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "O acesso à rodada não está ativo nesta conta.",
    },
    errorFallback: "Não foi possível salvar sua equipe.", unavailableTitle: "Meu Clube", unavailableMessage: "Serviço temporariamente indisponível.",
  },
  "es-ES": {
    states: { UPCOMING: "Próximamente", MARKET_OPEN: "Mercado abierto", LOCKED: "Bloqueada", LIVE: "En directo", FINAL: "Finalizada", SETTLED: "Puntuación consolidada" },
    steps: { coach: "Entrenador", formation: "Formación", players: "Once titular", review: "Revisión", locked: "Sincronizar con la Arena" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "Este equipo supera el presupuesto de 900 millones de €.",
      TL_FANTASY_GAMEWEEK_LOCKED: "El mercado está cerrado para esta jornada.",
      TL_FANTASY_XI_REQUIRES_11: "Completa exactamente 11 jugadores antes de confirmar.",
      TL_FANTASY_SELECTION_INELIGIBLE: "Una carta seleccionada ya no es elegible. Sustitúyela y vuelve a guardar.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "El acceso a la jornada no está activo para esta cuenta.",
    },
    errorFallback: "No se ha podido guardar tu equipo.", unavailableTitle: "Mi club", unavailableMessage: "Servicio temporalmente no disponible.",
  },
  "it-IT": {
    states: { UPCOMING: "In arrivo", MARKET_OPEN: "Mercato aperto", LOCKED: "Bloccata", LIVE: "In diretta", FINAL: "Conclusa", SETTLED: "Punteggio consolidato" },
    steps: { coach: "Allenatore", formation: "Modulo", players: "Undici titolari", review: "Riepilogo", locked: "Sincronizza con l’Arena" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "Questa squadra supera il budget di 900 milioni di €.",
      TL_FANTASY_GAMEWEEK_LOCKED: "Il mercato è chiuso per questa giornata.",
      TL_FANTASY_XI_REQUIRES_11: "Completa la squadra con esattamente 11 giocatori prima di confermare.",
      TL_FANTASY_SELECTION_INELIGIBLE: "Una carta selezionata non è più idonea. Sostituiscila e salva di nuovo.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "L’accesso alla giornata non è attivo per questo account.",
    },
    errorFallback: "Impossibile salvare la squadra.", unavailableTitle: "Il mio club", unavailableMessage: "Servizio temporaneamente non disponibile.",
  },
  "fr-FR": {
    states: { UPCOMING: "À venir", MARKET_OPEN: "Marché ouvert", LOCKED: "Verrouillée", LIVE: "En direct", FINAL: "Terminée", SETTLED: "Points consolidés" },
    steps: { coach: "Entraîneur", formation: "Formation", players: "Onze de départ", review: "Vérification", locked: "Synchroniser avec l’Arena" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "Cette équipe dépasse le budget de 900 millions d’€.",
      TL_FANTASY_GAMEWEEK_LOCKED: "Le marché est fermé pour cette journée.",
      TL_FANTASY_XI_REQUIRES_11: "Sélectionnez exactement 11 joueurs avant de confirmer.",
      TL_FANTASY_SELECTION_INELIGIBLE: "Une carte sélectionnée n’est plus éligible. Remplacez-la et enregistrez à nouveau.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "L’accès à la journée n’est pas actif pour ce compte.",
    },
    errorFallback: "Impossible d’enregistrer votre équipe.", unavailableTitle: "Mon club", unavailableMessage: "Service temporairement indisponible.",
  },
  "ar-SA": {
    states: { UPCOMING: "قريبًا", MARKET_OPEN: "السوق مفتوح", LOCKED: "مقفلة", LIVE: "مباشر", FINAL: "منتهية", SETTLED: "النقاط معتمدة" },
    steps: { coach: "المدرب", formation: "الخطة", players: "التشكيلة الأساسية", review: "المراجعة", locked: "المزامنة مع Arena" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "يتجاوز هذا الفريق ميزانية ٩٠٠ مليون يورو.",
      TL_FANTASY_GAMEWEEK_LOCKED: "السوق مغلق لهذه الجولة.",
      TL_FANTASY_XI_REQUIRES_11: "أكمل التشكيلة بـ١١ لاعبًا بالضبط قبل التأكيد.",
      TL_FANTASY_SELECTION_INELIGIBLE: "إحدى البطاقات المختارة لم تعد مؤهلة. استبدلها واحفظ مجددًا.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "الوصول إلى الجولة غير مفعّل لهذا الحساب.",
    },
    errorFallback: "تعذّر حفظ فريقك.", unavailableTitle: "ناديي", unavailableMessage: "الخدمة غير متاحة مؤقتًا.",
  },
  "tr-TR": {
    states: { UPCOMING: "Yakında", MARKET_OPEN: "Pazar açık", LOCKED: "Kilitli", LIVE: "Canlı", FINAL: "Tamamlandı", SETTLED: "Puanlar kesinleşti" },
    steps: { coach: "Teknik direktör", formation: "Diziliş", players: "İlk 11", review: "Kontrol", locked: "Arena ile eşitle" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "Bu takım 900 milyon € bütçesini aşıyor.",
      TL_FANTASY_GAMEWEEK_LOCKED: "Pazar bu hafta için kapalı.",
      TL_FANTASY_XI_REQUIRES_11: "Onaylamadan önce takımı tam 11 oyuncuya tamamlayın.",
      TL_FANTASY_SELECTION_INELIGIBLE: "Seçilen kartlardan biri artık uygun değil. Kartı değiştirip yeniden kaydedin.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "Bu hesap için hafta erişimi etkin değil.",
    },
    errorFallback: "Takımınız kaydedilemedi.", unavailableTitle: "Kulübüm", unavailableMessage: "Hizmet geçici olarak kullanılamıyor.",
  },
  "de-DE": {
    states: { UPCOMING: "Demnächst", MARKET_OPEN: "Markt geöffnet", LOCKED: "Gesperrt", LIVE: "Live", FINAL: "Beendet", SETTLED: "Punkte bestätigt" },
    steps: { coach: "Trainer", formation: "Formation", players: "Startelf", review: "Überprüfen", locked: "Mit der Arena synchronisieren" },
    errors: {
      TL_FANTASY_BUDGET_EXCEEDED: "Dieses Team überschreitet das Budget von 900 Millionen €.",
      TL_FANTASY_GAMEWEEK_LOCKED: "Der Markt ist für diesen Spieltag geschlossen.",
      TL_FANTASY_XI_REQUIRES_11: "Wähle vor der Bestätigung genau 11 Spieler aus.",
      TL_FANTASY_SELECTION_INELIGIBLE: "Eine ausgewählte Karte ist nicht mehr zugelassen. Ersetze sie und speichere erneut.",
      TL_FANTASY_ENTITLEMENT_REQUIRED: "Der Spieltagszugang ist für dieses Konto nicht aktiv.",
    },
    errorFallback: "Dein Team konnte nicht gespeichert werden.", unavailableTitle: "Mein Verein", unavailableMessage: "Der Dienst ist vorübergehend nicht verfügbar.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineFantasyMarketStateCopy>>;

/** Public callers retain the EN/PT gate; a page may explicitly opt into draft copy. */
export function getTouchlineFantasyMarketStateCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineFantasyMarketStateCopy {
  return TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function touchlineFantasyLineupErrorCopy(code: string, locale?: string | null, draftLocalesEnabled = false) {
  const copy = getTouchlineFantasyMarketStateCopy(locale, draftLocalesEnabled);
  return Object.hasOwn(copy.errors, code) ? copy.errors[code as LineupError] : copy.errorFallback;
}

export function touchlineFantasyStatusCopy(state: string | undefined, locale?: string | null, draftLocalesEnabled = false) {
  const copy = getTouchlineFantasyMarketStateCopy(locale, draftLocalesEnabled);
  return state && Object.hasOwn(copy.states, state) ? copy.states[state as GameweekState] : "—";
}

export function touchlineFantasyStepLabel(step: TouchlineFantasyBuilderStep, locale?: string | null, draftLocalesEnabled = false) {
  return getTouchlineFantasyMarketStateCopy(locale, draftLocalesEnabled).steps[step];
}
