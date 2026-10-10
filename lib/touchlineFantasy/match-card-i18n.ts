import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";

/** A card shown in this match, not an accumulated-card suspension. */
const labels: Record<TouchLineLocale, Readonly<{ yellow: string; red: string }>> = {
  "en-GB": { yellow: "Yellow card in this match", red: "Red card in this match" },
  "pt-BR": { yellow: "Cartão amarelo nesta partida", red: "Cartão vermelho nesta partida" },
  "es-ES": { yellow: "Tarjeta amarilla en este partido", red: "Tarjeta roja en este partido" },
  "it-IT": { yellow: "Cartellino giallo in questa partita", red: "Cartellino rosso in questa partita" },
  "fr-FR": { yellow: "Carton jaune dans ce match", red: "Carton rouge dans ce match" },
  "ar-SA": { yellow: "بطاقة صفراء في هذه المباراة", red: "بطاقة حمراء في هذه المباراة" },
  "tr-TR": { yellow: "Bu maçta sarı kart", red: "Bu maçta kırmızı kart" },
  "de-DE": { yellow: "Gelbe Karte in diesem Spiel", red: "Rote Karte in diesem Spiel" },
};

export function matchCardLabel(kind: "yellow" | "red", locale: string, draftLocalesEnabled = false): string {
  return labels[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)][kind];
}
