import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  offline: { title: "TouchLine — Temporarily unavailable", description: "The Arena is temporarily unavailable. Please try again shortly.", statusLabel: "Please try again shortly" },
  error: {
    eyebrow: "TouchLine · safe state",
    title: "This area could not be opened right now.",
    body: "No club data has been changed. Try again or return to ClubOwner.",
    retry: "Try again",
    arena: "Return to ClubOwner",
  },
  notFound: {
    eyebrow: "Safe navigation",
    title: "This area is not available",
    description: "The address may have changed or may not exist. No club data was changed.",
    code: "Error 404",
  },
} as const;
export type TouchlinePublicErrorCopy = {
  readonly [Group in keyof typeof enGB]: Readonly<Record<keyof typeof enGB[Group], string>>;
};
export const TOUCHLINE_PUBLIC_ERROR_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_PUBLIC_ERROR_DRAFT_STATUS = "draft" as const;

// Public presentation only. Existing EN/PT recovery statements are preserved,
// not evidence of transaction state. Never interpolate private error details.
// Six additional catalogues remain unapproved drafts behind the shared gate.
export const TOUCHLINE_PUBLIC_ERROR_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    offline: { title: "TouchLine — Temporariamente indisponível", description: "A Arena está temporariamente indisponível. Tente novamente em instantes.", statusLabel: "Tente novamente em instantes" },
    error: { eyebrow: "TouchLine · estado seguro", title: "Não foi possível abrir esta área agora.", body: "Nenhum dado do seu clube foi alterado. Você pode tentar novamente ou voltar para o ClubOwner.", retry: "Tentar novamente", arena: "Voltar ao ClubOwner" },
    notFound: { eyebrow: "Navegação segura", title: "Esta área não está disponível", description: "O endereço pode ter mudado ou não existir. Nenhum dado do seu clube foi alterado.", code: "Erro 404" },
  },
  "es-ES": {
    offline: { title: "TouchLine — Temporalmente no disponible", description: "La Arena no está disponible temporalmente. Vuelve a intentarlo en unos instantes.", statusLabel: "Vuelve a intentarlo en unos instantes" },
    error: { eyebrow: "TouchLine · estado seguro", title: "No se ha podido abrir esta sección ahora.", body: "No se ha modificado ningún dato de tu club. Puedes volver a intentarlo o regresar a ClubOwner.", retry: "Volver a intentarlo", arena: "Volver a ClubOwner" },
    notFound: { eyebrow: "Navegación segura", title: "Esta sección no está disponible", description: "La dirección puede haber cambiado o no existir. No se ha modificado ningún dato de tu club.", code: "Error 404" },
  },
  "it-IT": {
    offline: { title: "TouchLine — Temporaneamente non disponibile", description: "L’Arena è temporaneamente non disponibile. Riprova tra poco.", statusLabel: "Riprova tra poco" },
    error: { eyebrow: "TouchLine · stato sicuro", title: "Al momento non è stato possibile aprire questa sezione.", body: "Nessun dato del tuo club è stato modificato. Puoi riprovare o tornare a ClubOwner.", retry: "Riprova", arena: "Torna a ClubOwner" },
    notFound: { eyebrow: "Navigazione sicura", title: "Questa sezione non è disponibile", description: "L’indirizzo potrebbe essere cambiato o non esistere. Nessun dato del tuo club è stato modificato.", code: "Errore 404" },
  },
  "fr-FR": {
    offline: { title: "TouchLine — Temporairement indisponible", description: "L’Arena est temporairement indisponible. Veuillez réessayer dans quelques instants.", statusLabel: "Veuillez réessayer dans quelques instants" },
    error: { eyebrow: "TouchLine · état sûr", title: "Cette section n’a pas pu être ouverte pour le moment.", body: "Aucune donnée de votre club n’a été modifiée. Vous pouvez réessayer ou revenir à ClubOwner.", retry: "Réessayer", arena: "Revenir à ClubOwner" },
    notFound: { eyebrow: "Navigation sécurisée", title: "Cette section n’est pas disponible", description: "L’adresse a peut-être changé ou n’existe pas. Aucune donnée de votre club n’a été modifiée.", code: "Erreur 404" },
  },
  "ar-SA": {
    offline: { title: "TouchLine — غير متاح مؤقتًا", description: "Arena غير متاحة مؤقتًا. يُرجى المحاولة مجددًا بعد قليل.", statusLabel: "يُرجى المحاولة مجددًا بعد قليل" },
    error: { eyebrow: "TouchLine · حالة آمنة", title: "تعذّر فتح هذا القسم الآن.", body: "لم تتغير أي بيانات لناديك. يمكنك المحاولة مجددًا أو العودة إلى ClubOwner.", retry: "المحاولة مجددًا", arena: "العودة إلى ClubOwner" },
    notFound: { eyebrow: "تصفّح آمن", title: "هذا القسم غير متاح", description: "ربما تغيّر العنوان أو لم يعد موجودًا. لم تتغير أي بيانات لناديك.", code: "خطأ 404" },
  },
  "tr-TR": {
    offline: { title: "TouchLine — Geçici olarak kullanılamıyor", description: "Arena geçici olarak kullanılamıyor. Lütfen kısa bir süre sonra tekrar deneyin.", statusLabel: "Lütfen kısa bir süre sonra tekrar deneyin" },
    error: { eyebrow: "TouchLine · güvenli durum", title: "Bu alan şu anda açılamadı.", body: "Kulübünüzün hiçbir verisi değiştirilmedi. Tekrar deneyebilir veya ClubOwner’a dönebilirsiniz.", retry: "Tekrar dene", arena: "ClubOwner’a dön" },
    notFound: { eyebrow: "Güvenli gezinme", title: "Bu alan kullanılamıyor", description: "Adres değişmiş olabilir veya mevcut olmayabilir. Kulübünüzün hiçbir verisi değiştirilmedi.", code: "Hata 404" },
  },
  "de-DE": {
    offline: { title: "TouchLine — Vorübergehend nicht verfügbar", description: "Die Arena ist vorübergehend nicht verfügbar. Bitte versuche es in Kürze erneut.", statusLabel: "Bitte versuche es in Kürze erneut" },
    error: { eyebrow: "TouchLine · sicherer Zustand", title: "Dieser Bereich konnte gerade nicht geöffnet werden.", body: "Es wurden keine Daten deines Vereins geändert. Du kannst es erneut versuchen oder zu ClubOwner zurückkehren.", retry: "Erneut versuchen", arena: "Zurück zu ClubOwner" },
    notFound: { eyebrow: "Sichere Navigation", title: "Dieser Bereich ist nicht verfügbar", description: "Die Adresse hat sich möglicherweise geändert oder existiert nicht. Es wurden keine Daten deines Vereins geändert.", code: "Fehler 404" },
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlinePublicErrorCopy>>;

export function getTouchlinePublicErrorCopy(locale?: string | null, draftLocalesEnabled = false): TouchlinePublicErrorCopy {
  return TOUCHLINE_PUBLIC_ERROR_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
