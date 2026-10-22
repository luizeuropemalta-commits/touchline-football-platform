import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";
import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
type Copy = Readonly<{ unknownPlan: string; instruction: string }>;
export const TOUCHLINE_EXCHANGE_ROOM_COPY: Readonly<Record<TouchLineLocale, Copy>> = {
  "en-GB": { unknownPlan: "Plan to be confirmed", instruction: "Players in the same position. Every condition, before acceptance." },
  "pt-BR": { unknownPlan: "Plano a confirmar", instruction: "Jogadores da mesma posição. Cada condição, antes do aceite." },
  "es-ES": { unknownPlan: "Plan por confirmar", instruction: "Jugadores de la misma posición. Cada condición, antes de aceptar." },
  "it-IT": { unknownPlan: "Piano da confermare", instruction: "Giocatori nella stessa posizione. Ogni condizione, prima di accettare." },
  "fr-FR": { unknownPlan: "Offre à confirmer", instruction: "Joueurs au même poste. Chaque condition, avant d'accepter." },
  "ar-SA": { unknownPlan: "الباقة بانتظار التأكيد", instruction: "لاعبون في المركز نفسه. جميع الشروط، قبل القبول." },
  "tr-TR": { unknownPlan: "Plan doğrulanacak", instruction: "Aynı pozisyondaki oyuncular. Kabulden önce tüm koşullar." },
  "de-DE": { unknownPlan: "Plan noch zu bestätigen", instruction: "Spieler auf derselben Position. Alle Bedingungen vor der Annahme." },
};
export function getExchangeRoomCopy(locale: string, draftLocalesEnabled = false): Copy {
  // Preserve existing PT-prefix callers; all additional locales require opt-in.
  return TOUCHLINE_EXCHANGE_ROOM_COPY[locale.startsWith("pt") ? "pt-BR" : resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
