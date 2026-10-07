import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export type TouchlineSiteAccessibilityCopy = Readonly<{
  skipToMainContent: string;
  orientationEyebrow: string;
  orientationTitle: string;
  orientationDescription: string;
  orientationHint: string;
}>;
export const TOUCHLINE_SITE_ACCESSIBILITY_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_SITE_ACCESSIBILITY_DRAFT_STATUS = "draft" as const;

/** Copy only. Six drafts remain gated until linguistic and rendered
 * accessibility/RTL review; this catalogue cannot activate a public locale.
 */
export const TOUCHLINE_SITE_ACCESSIBILITY_CATALOGUES = {
  "en-GB": {
    skipToMainContent: "Skip to main content",
    orientationEyebrow: "Give the game the whole screen",
    orientationTitle: "Rotate to landscape",
    orientationDescription: "TouchLine is played in landscape on mobile. Turn your device to continue where you left off.",
    orientationHint: "Your page and squad stay exactly as they are",
  },
  "pt-BR": {
    skipToMainContent: "Pular para o conteúdo principal",
    orientationEyebrow: "O jogo merece a tela inteira",
    orientationTitle: "Gire para o modo horizontal",
    orientationDescription: "No celular, a TouchLine é jogada deitada. Gire o aparelho para continuar de onde parou.",
    orientationHint: "Sua página e seu time estão preservados",
  },
  "es-ES": {
    skipToMainContent: "Saltar al contenido principal",
    orientationEyebrow: "Dale al juego toda la pantalla",
    orientationTitle: "Gira al modo horizontal",
    orientationDescription: "En el móvil, TouchLine se juega en horizontal. Gira el dispositivo para continuar donde lo dejaste.",
    orientationHint: "Tu página y tu equipo se mantienen tal como están",
  },
  "it-IT": {
    skipToMainContent: "Vai al contenuto principale",
    orientationEyebrow: "Dai al gioco tutto lo schermo",
    orientationTitle: "Ruota in modalità orizzontale",
    orientationDescription: "Su mobile, TouchLine si gioca in orizzontale. Ruota il dispositivo per continuare da dove eri rimasto.",
    orientationHint: "La tua pagina e la tua squadra restano esattamente come sono",
  },
  "fr-FR": {
    skipToMainContent: "Aller au contenu principal",
    orientationEyebrow: "Offrez tout l’écran au jeu",
    orientationTitle: "Passez en mode paysage",
    orientationDescription: "Sur mobile, TouchLine se joue en mode paysage. Tournez votre appareil pour reprendre là où vous en étiez.",
    orientationHint: "Votre page et votre équipe restent exactement telles quelles",
  },
  "ar-SA": {
    skipToMainContent: "انتقل إلى المحتوى الرئيسي",
    orientationEyebrow: "امنح اللعبة الشاشة كاملة",
    orientationTitle: "أدر الجهاز إلى الوضع الأفقي",
    orientationDescription: "تُلعَب TouchLine بالوضع الأفقي على الهاتف. أدر جهازك للمتابعة من حيث توقفت.",
    orientationHint: "تبقى صفحتك وتشكيلتك كما هما تمامًا",
  },
  "tr-TR": {
    skipToMainContent: "Ana içeriğe geç",
    orientationEyebrow: "Oyuna tüm ekranı ayır",
    orientationTitle: "Yatay moda döndür",
    orientationDescription: "TouchLine mobilde yatay modda oynanır. Kaldığın yerden devam etmek için cihazını döndür.",
    orientationHint: "Sayfan ve kadron olduğu gibi korunur",
  },
  "de-DE": {
    skipToMainContent: "Zum Hauptinhalt springen",
    orientationEyebrow: "Gib dem Spiel den ganzen Bildschirm",
    orientationTitle: "Ins Querformat drehen",
    orientationDescription: "Auf dem Handy wird TouchLine im Querformat gespielt. Drehe dein Gerät, um dort weiterzumachen, wo du aufgehört hast.",
    orientationHint: "Deine Seite und dein Kader bleiben genau so erhalten",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineSiteAccessibilityCopy>>;

export function getTouchlineSiteAccessibilityCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineSiteAccessibilityCopy {
  return TOUCHLINE_SITE_ACCESSIBILITY_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
