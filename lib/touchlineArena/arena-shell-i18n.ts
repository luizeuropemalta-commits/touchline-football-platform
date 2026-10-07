import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

// Customer-visible chrome only. Owner navigation and authority remain in the shell.
const en = {
  arenaOperations: "TouchLine operations", clubOwnerIdentity: "Authenticated ClubOwner", account: "ClubOwner account",
  openSearch: "Open football search", openNotifications: "Open notification preferences",
  openMenu: "Open menu", closeMenu: "Close menu", closeNavigation: "Close navigation",
  signingOut: "Signing out…", signOut: "Sign out", switchAccount: "Switch account", authUnavailable: "Authentication service is unavailable.",
  introDescription: "Return to introduction", notificationsLabel: "Notifications", notificationsDescription: "Your delivery preferences",
  inboxLabel: "Inbox", inboxDescription: "Official Central notices", searchLabel: "Football Search", searchDescription: "Official football data",
};
type Copy = { readonly [Key in keyof typeof en]: string };
const pt: Copy = {
  arenaOperations: "Operações TouchLine", clubOwnerIdentity: "Conta ClubOwner", account: "Conta ClubOwner",
  openSearch: "Abrir pesquisa de futebol", openNotifications: "Abrir preferências de notificações",
  openMenu: "Abrir menu", closeMenu: "Fechar menu", closeNavigation: "Fechar navegação",
  signingOut: "Saindo…", signOut: "Sair", switchAccount: "Trocar conta", authUnavailable: "O serviço de autenticação está indisponível.",
  introDescription: "Voltar à introdução", notificationsLabel: "Notificações", notificationsDescription: "Suas preferências de entrega",
  inboxLabel: "Caixa de entrada", inboxDescription: "Avisos oficiais da Central", searchLabel: "Pesquisa de Futebol", searchDescription: "Dados oficiais de futebol",
};
const draftLocales = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const rows = {
  arenaOperations: ["Operaciones TouchLine", "Operazioni TouchLine", "Opérations TouchLine", "عمليات TouchLine", "TouchLine işlemleri", "TouchLine-Betrieb"],
  clubOwnerIdentity: ["Cuenta ClubOwner", "Account ClubOwner", "Compte ClubOwner", "حساب ClubOwner", "ClubOwner hesabı", "ClubOwner-Konto"],
  account: ["Cuenta ClubOwner", "Account ClubOwner", "Compte ClubOwner", "حساب ClubOwner", "ClubOwner hesabı", "ClubOwner-Konto"],
  openSearch: ["Abrir búsqueda de fútbol", "Apri la ricerca calcistica", "Ouvrir la recherche football", "فتح البحث عن كرة القدم", "Futbol aramasını aç", "Fußballsuche öffnen"],
  openNotifications: ["Abrir preferencias de notificaciones", "Apri le preferenze delle notifiche", "Ouvrir les préférences de notification", "فتح تفضيلات الإشعارات", "Bildirim tercihlerini aç", "Benachrichtigungseinstellungen öffnen"],
  openMenu: ["Abrir menú", "Apri menu", "Ouvrir le menu", "فتح القائمة", "Menüyü aç", "Menü öffnen"],
  closeMenu: ["Cerrar menú", "Chiudi menu", "Fermer le menu", "إغلاق القائمة", "Menüyü kapat", "Menü schließen"],
  closeNavigation: ["Cerrar navegación", "Chiudi navigazione", "Fermer la navigation", "إغلاق التنقل", "Gezinmeyi kapat", "Navigation schließen"],
  signingOut: ["Cerrando sesión…", "Disconnessione…", "Déconnexion…", "جارٍ تسجيل الخروج…", "Çıkış yapılıyor…", "Abmeldung…"],
  signOut: ["Cerrar sesión", "Esci", "Se déconnecter", "تسجيل الخروج", "Çıkış yap", "Abmelden"],
  switchAccount: ["Cambiar de cuenta", "Cambia account", "Changer de compte", "تبديل الحساب", "Hesap değiştir", "Konto wechseln"],
  authUnavailable: ["El servicio de autenticación no está disponible.", "Il servizio di autenticazione non è disponibile.", "Le service d’authentification est indisponible.", "خدمة المصادقة غير متاحة.", "Kimlik doğrulama hizmeti kullanılamıyor.", "Der Authentifizierungsdienst ist nicht verfügbar."],
  introDescription: ["Volver a la introducción", "Torna all’introduzione", "Retour à l’introduction", "العودة إلى المقدمة", "Tanıtıma dön", "Zur Einführung zurück"],
  notificationsLabel: ["Notificaciones", "Notifiche", "Notifications", "الإشعارات", "Bildirimler", "Benachrichtigungen"],
  notificationsDescription: ["Tus preferencias de entrega", "Le tue preferenze di ricezione", "Vos préférences de réception", "تفضيلات التسليم الخاصة بك", "Teslim tercihlerin", "Deine Zustellungseinstellungen"],
  inboxLabel: ["Bandeja de entrada", "Posta in arrivo", "Boîte de réception", "صندوق الوارد", "Gelen kutusu", "Posteingang"],
  inboxDescription: ["Avisos oficiales de Central", "Avvisi ufficiali di Central", "Messages officiels de Central", "إشعارات Central الرسمية", "Resmî Central bildirimleri", "Offizielle Central-Mitteilungen"],
  searchLabel: ["Búsqueda de fútbol", "Ricerca calcistica", "Recherche football", "البحث عن كرة القدم", "Futbol araması", "Fußballsuche"],
  searchDescription: ["Datos oficiales de fútbol", "Dati ufficiali di calcio", "Données officielles du football", "بيانات كرة القدم الرسمية", "Resmî futbol verileri", "Offizielle Fußballdaten"],
} as const satisfies Record<keyof Copy, readonly [string, string, string, string, string, string]>;
const drafts = Object.fromEntries(draftLocales.map((locale, index) => [locale,
  Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]])),
])) as Record<(typeof draftLocales)[number], Copy>;
export const TOUCHLINE_ARENA_SHELL_CATALOGUES = { "en-GB": en, "pt-BR": pt, ...drafts } satisfies Record<TouchLineLocale, Copy>;
export function getTouchlineArenaShellCopy(locale?: string | null, draftLocalesEnabled = false): Copy {
  return TOUCHLINE_ARENA_SHELL_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
