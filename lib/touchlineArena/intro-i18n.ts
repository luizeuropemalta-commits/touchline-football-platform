import { getTouchlineAmbientAudioCopy } from "./ambient-audio-i18n.ts";
import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  introAria: "Official TouchLine Arena introduction",
  arenaEnableSound: "Enable Arena sound",
  arenaMute: "Mute Arena",
  skipIntro: "Skip intro",
  entryEnableSound: "Enable sound",
  entryMute: "Mute",
  goToMarket: "Go to ClubOwner",
} as const;
type IntroOwnCopy = Readonly<Record<keyof typeof enGB, string>>;
export type TouchlineIntroCopy = IntroOwnCopy & Readonly<{ sound: string }>;
export const TOUCHLINE_INTRO_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_INTRO_DRAFT_STATUS = "draft" as const;

/** Copy only. Six drafts require linguistic and rendered/RTL review before
 * public activation. Audio gestures, media and the protected slogan are not
 * controlled by this catalogue. */
export const TOUCHLINE_INTRO_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    introAria: "Introdução oficial da TouchLine Arena",
    arenaEnableSound: "Ativar som da Arena", arenaMute: "Silenciar Arena",
    skipIntro: "Pular intro", entryEnableSound: "Ativar som", entryMute: "Silenciar", goToMarket: "Ir ao ClubOwner",
  },
  "es-ES": {
    introAria: "Introducción oficial de TouchLine Arena",
    arenaEnableSound: "Activar el sonido de la Arena", arenaMute: "Silenciar el sonido de la Arena",
    skipIntro: "Saltar introducción", entryEnableSound: "Activar sonido", entryMute: "Silenciar", goToMarket: "Ir a ClubOwner",
  },
  "it-IT": {
    introAria: "Introduzione ufficiale di TouchLine Arena",
    arenaEnableSound: "Attiva l’audio dell’Arena", arenaMute: "Disattiva l’audio dell’Arena",
    skipIntro: "Salta introduzione", entryEnableSound: "Attiva l’audio", entryMute: "Silenzia", goToMarket: "Vai a ClubOwner",
  },
  "fr-FR": {
    introAria: "Introduction officielle de TouchLine Arena",
    arenaEnableSound: "Activer le son de l’Arena", arenaMute: "Couper le son de l’Arena",
    skipIntro: "Passer l’introduction", entryEnableSound: "Activer le son", entryMute: "Couper le son", goToMarket: "Accéder à ClubOwner",
  },
  "ar-SA": {
    introAria: "المقدمة الرسمية لـ TouchLine Arena",
    arenaEnableSound: "تفعيل صوت Arena", arenaMute: "كتم صوت Arena",
    skipIntro: "تخطي المقدمة", entryEnableSound: "تفعيل الصوت", entryMute: "كتم الصوت", goToMarket: "الانتقال إلى ClubOwner",
  },
  "tr-TR": {
    introAria: "TouchLine Arena resmî tanıtımı",
    arenaEnableSound: "Arena sesini aç", arenaMute: "Arena sesini kapat",
    skipIntro: "Tanıtımı atla", entryEnableSound: "Sesi aç", entryMute: "Sesi kapat", goToMarket: "ClubOwner’a git",
  },
  "de-DE": {
    introAria: "Offizielle Einführung in TouchLine Arena",
    arenaEnableSound: "Arena-Ton aktivieren", arenaMute: "Arena stummschalten",
    skipIntro: "Einführung überspringen", entryEnableSound: "Ton aktivieren", entryMute: "Stummschalten", goToMarket: "Zu ClubOwner",
  },
} as const satisfies Readonly<Record<TouchLineLocale, IntroOwnCopy>>;

export function getTouchlineIntroCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineIntroCopy {
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { ...TOUCHLINE_INTRO_CATALOGUES[language], sound: getTouchlineAmbientAudioCopy(language, draftLocalesEnabled).sound };
}
