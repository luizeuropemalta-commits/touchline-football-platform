import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { TOUCHLINE_PLAYER_SOCIAL_CATALOGUES } from "./player-social-i18n.ts";

const enGB = {
  alerts: "Alerts",
  loading: "Checking preference…",
  saving: "Saving preference…",
  signedOut: "Sign in to Arena to follow this match.",
  disabled: "Match alerts have not been enabled yet.",
  error: "Alerts unavailable. Your preference could not be confirmed.",
  saved: "Match added to your preferences.",
  notSaved: "This match is not in your preferences yet.",
  deliveryUnavailable: "Mobile delivery is not available yet. Saving this match does not enable notifications.",
  removeMatch: "Remove match",
  saveMatch: "Save match",
  signIn: "Sign in",
  checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["en-GB"].checkAgain,
} as const;

export type TouchlineFixtureAlertCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_FIXTURE_ALERT_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_FIXTURE_ALERT_DRAFT_STATUS = "draft" as const;

/** Saved fixture interest is not consent or confirmation of mobile delivery.
 * Six draft catalogues remain behind the canonical EN/PT gate, pending
 * independent linguistic, rendered accessibility and RTL verification.
 */
export const TOUCHLINE_FIXTURE_ALERT_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    alerts: "Alertas",
    loading: "Consultando preferência…",
    saving: "Salvando preferência…",
    signedOut: "Entre na Arena para acompanhar esta partida.",
    disabled: "Os alertas desta partida ainda não foram ativados.",
    error: "Alertas indisponíveis. Não foi possível confirmar sua preferência.",
    saved: "Partida adicionada às suas preferências.",
    notSaved: "Esta partida ainda não está nas suas preferências.",
    deliveryUnavailable: "O envio para o celular ainda não está disponível. Salvar a partida não ativa notificações.",
    removeMatch: "Remover partida",
    saveMatch: "Salvar partida",
    signIn: "Entrar",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["pt-BR"].checkAgain,
  },
  "es-ES": {
    alerts: "Alertas",
    loading: "Consultando preferencia…",
    saving: "Guardando preferencia…",
    signedOut: "Inicia sesión en Arena para seguir este partido.",
    disabled: "Las alertas de este partido aún no se han activado.",
    error: "Alertas no disponibles. No se pudo confirmar tu preferencia.",
    saved: "Partido añadido a tus preferencias.",
    notSaved: "Este partido aún no está en tus preferencias.",
    deliveryUnavailable: "El envío al móvil aún no está disponible. Guardar este partido no activa las notificaciones.",
    removeMatch: "Quitar partido",
    saveMatch: "Guardar partido",
    signIn: "Iniciar sesión",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["es-ES"].checkAgain,
  },
  "it-IT": {
    alerts: "Avvisi",
    loading: "Verifica della preferenza…",
    saving: "Salvataggio della preferenza…",
    signedOut: "Accedi ad Arena per seguire questa partita.",
    disabled: "Gli avvisi per questa partita non sono ancora stati attivati.",
    error: "Avvisi non disponibili. Non è stato possibile confermare la tua preferenza.",
    saved: "Partita aggiunta alle tue preferenze.",
    notSaved: "Questa partita non è ancora nelle tue preferenze.",
    deliveryUnavailable: "L’invio al cellulare non è ancora disponibile. Salvare questa partita non attiva le notifiche.",
    removeMatch: "Rimuovi partita",
    saveMatch: "Salva partita",
    signIn: "Accedi",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["it-IT"].checkAgain,
  },
  "fr-FR": {
    alerts: "Alertes",
    loading: "Vérification de la préférence…",
    saving: "Enregistrement de la préférence…",
    signedOut: "Connectez-vous à Arena pour suivre ce match.",
    disabled: "Les alertes pour ce match n’ont pas encore été activées.",
    error: "Alertes indisponibles. Votre préférence n’a pas pu être confirmée.",
    saved: "Match ajouté à vos préférences.",
    notSaved: "Ce match ne figure pas encore dans vos préférences.",
    deliveryUnavailable: "L’envoi sur mobile n’est pas encore disponible. Enregistrer ce match n’active pas les notifications.",
    removeMatch: "Retirer le match",
    saveMatch: "Enregistrer le match",
    signIn: "Se connecter",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["fr-FR"].checkAgain,
  },
  "ar-SA": {
    alerts: "التنبيهات",
    loading: "جارٍ التحقق من التفضيل…",
    saving: "جارٍ حفظ التفضيل…",
    signedOut: "سجّل الدخول إلى Arena لمتابعة هذه المباراة.",
    disabled: "لم يتم تفعيل تنبيهات هذه المباراة بعد.",
    error: "التنبيهات غير متاحة. تعذّر تأكيد تفضيلك.",
    saved: "تمت إضافة المباراة إلى تفضيلاتك.",
    notSaved: "هذه المباراة ليست ضمن تفضيلاتك بعد.",
    deliveryUnavailable: "الإرسال إلى الهاتف غير متاح بعد. حفظ هذه المباراة لا يفعّل الإشعارات.",
    removeMatch: "إزالة المباراة",
    saveMatch: "حفظ المباراة",
    signIn: "تسجيل الدخول",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["ar-SA"].checkAgain,
  },
  "tr-TR": {
    alerts: "Uyarılar",
    loading: "Tercih kontrol ediliyor…",
    saving: "Tercih kaydediliyor…",
    signedOut: "Bu maçı takip etmek için Arena’ya giriş yapın.",
    disabled: "Bu maçın uyarıları henüz etkinleştirilmedi.",
    error: "Uyarılar kullanılamıyor. Tercihiniz doğrulanamadı.",
    saved: "Maç tercihlerinize eklendi.",
    notSaved: "Bu maç henüz tercihlerinizde değil.",
    deliveryUnavailable: "Telefona gönderim henüz kullanılamıyor. Bu maçı kaydetmek bildirimleri etkinleştirmez.",
    removeMatch: "Maçı kaldır",
    saveMatch: "Maçı kaydet",
    signIn: "Giriş yap",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["tr-TR"].checkAgain,
  },
  "de-DE": {
    alerts: "Benachrichtigungen",
    loading: "Einstellung wird geprüft…",
    saving: "Einstellung wird gespeichert…",
    signedOut: "Melde dich bei Arena an, um dieses Spiel zu verfolgen.",
    disabled: "Benachrichtigungen für dieses Spiel wurden noch nicht aktiviert.",
    error: "Benachrichtigungen nicht verfügbar. Deine Einstellung konnte nicht bestätigt werden.",
    saved: "Spiel zu deinen Einstellungen hinzugefügt.",
    notSaved: "Dieses Spiel ist noch nicht in deinen Einstellungen enthalten.",
    deliveryUnavailable: "Die Zustellung ans Handy ist noch nicht verfügbar. Das Speichern dieses Spiels aktiviert keine Benachrichtigungen.",
    removeMatch: "Spiel entfernen",
    saveMatch: "Spiel speichern",
    signIn: "Anmelden",
    checkAgain: TOUCHLINE_PLAYER_SOCIAL_CATALOGUES["de-DE"].checkAgain,
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineFixtureAlertCopy>>;

export function getTouchlineFixtureAlertCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineFixtureAlertCopy {
  return TOUCHLINE_FIXTURE_ALERT_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
