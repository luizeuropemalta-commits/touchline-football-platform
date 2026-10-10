import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export const CLUB_HUB_STRIP_COPY = {
  "en-GB": { pause: "Pause movement", play: "Resume movement" },
  "pt-BR": { pause: "Pausar movimento", play: "Retomar movimento" },
  "es-ES": { pause: "Pausar movimiento", play: "Reanudar movimiento" },
  "it-IT": { pause: "Metti in pausa", play: "Riprendi movimento" },
  "fr-FR": { pause: "Suspendre le mouvement", play: "Reprendre le mouvement" },
  "ar-SA": { pause: "إيقاف الحركة", play: "استئناف الحركة" },
  "tr-TR": { pause: "Hareketi duraklat", play: "Hareketi sürdür" },
  "de-DE": { pause: "Bewegung pausieren", play: "Bewegung fortsetzen" },
} as const;

export function getClubHubStripCopy(locale: string, draftLocalesEnabled = false) {
  return CLUB_HUB_STRIP_COPY[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
