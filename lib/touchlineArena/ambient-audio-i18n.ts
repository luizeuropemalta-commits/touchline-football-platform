import { isTouchLineLocaleApproved, normalizeTouchLineLocale, type TouchLineLocale } from "./i18n.ts";

const enGB = {
  sound: "Sound",
  mute: "Mute ambient sound",
  enable: "Enable quiet ambient sound",
  unavailable: "Sound unavailable. Try again.",
} as const;

export type TouchlineAmbientAudioCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_AMBIENT_AUDIO_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_AMBIENT_AUDIO_DRAFT_STATUS = "draft" as const;

/** Presentation only: this catalogue does not grant consent or start audio.
 * Six locales remain drafts behind the canonical EN/PT public gate, pending
 * independent linguistic and rendered accessibility/RTL verification.
 */
export const TOUCHLINE_AMBIENT_AUDIO_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    sound: "Som",
    mute: "Silenciar som ambiente",
    enable: "Ativar som ambiente suave",
    unavailable: "Som indisponível. Tente novamente.",
  },
  "es-ES": {
    sound: "Sonido",
    mute: "Silenciar el sonido ambiente",
    enable: "Activar el sonido ambiente suave",
    unavailable: "Sonido no disponible. Inténtalo de nuevo.",
  },
  "it-IT": {
    sound: "Audio",
    mute: "Disattiva l’audio ambientale",
    enable: "Attiva l’audio ambientale a basso volume",
    unavailable: "Audio non disponibile. Riprova.",
  },
  "fr-FR": {
    sound: "Son",
    mute: "Couper le son d’ambiance",
    enable: "Activer le son d’ambiance à faible volume",
    unavailable: "Son indisponible. Réessayez.",
  },
  "ar-SA": {
    sound: "الصوت",
    mute: "كتم الصوت المحيط",
    enable: "تفعيل الصوت المحيط بمستوى منخفض",
    unavailable: "الصوت غير متاح. حاول مرة أخرى.",
  },
  "tr-TR": {
    sound: "Ses",
    mute: "Ortam sesini kapat",
    enable: "Ortam sesini düşük ses düzeyinde aç",
    unavailable: "Ses kullanılamıyor. Tekrar deneyin.",
  },
  "de-DE": {
    sound: "Ton",
    mute: "Umgebungsgeräusche stummschalten",
    enable: "Leise Umgebungsgeräusche aktivieren",
    unavailable: "Ton nicht verfügbar. Versuche es erneut.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineAmbientAudioCopy>>;

export function getTouchlineAmbientAudioCopy(locale?: string | null, allowDraftLocale = false): TouchlineAmbientAudioCopy {
  if (allowDraftLocale && isTouchLineLocaleApproved(locale)) return TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale];
  return TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[normalizeTouchLineLocale(locale)];
}
