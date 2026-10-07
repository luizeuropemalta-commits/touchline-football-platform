import { normalizeTouchLineLocale, type TouchLineLocale } from "./i18n.ts";

export type TouchlineClubHubShareCopy = Readonly<{
  shared: string;
  copied: string;
  unavailable: string;
  idle: string;
}>;

export const TOUCHLINE_CLUB_HUB_SHARE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_SHARE_DRAFT_STATUS = "draft" as const;

// Presentation-only feedback. The shared EN/PT normalizer keeps drafts gated.
export const TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES = {
  "en-GB": { shared: "Shared", copied: "Post copied", unavailable: "Sharing unavailable", idle: "Share post" },
  "pt-BR": { shared: "Compartilhado", copied: "Link copiado", unavailable: "Compartilhamento indisponível", idle: "Compartilhar" },
  "es-ES": { shared: "Compartido", copied: "Enlace copiado", unavailable: "La opción de compartir no está disponible.", idle: "Compartir publicación" },
  "it-IT": { shared: "Condiviso", copied: "Link copiato", unavailable: "Condivisione non disponibile", idle: "Condividi post" },
  "fr-FR": { shared: "Partagé", copied: "Lien copié", unavailable: "Partage indisponible", idle: "Partager la publication" },
  "ar-SA": { shared: "تمت المشاركة", copied: "تم نسخ الرابط", unavailable: "المشاركة غير متاحة", idle: "مشاركة المنشور" },
  "tr-TR": { shared: "Paylaşıldı", copied: "Bağlantı kopyalandı", unavailable: "Paylaşım kullanılamıyor", idle: "Gönderiyi paylaş" },
  "de-DE": { shared: "Geteilt", copied: "Link kopiert", unavailable: "Teilen nicht verfügbar", idle: "Beitrag teilen" },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubShareCopy>>;

export function getTouchlineClubHubShareCopy(locale?: string | null): TouchlineClubHubShareCopy {
  return TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES[normalizeTouchLineLocale(locale)];
}
