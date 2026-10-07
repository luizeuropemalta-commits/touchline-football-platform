import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";

const enGB = {
  unavailable: "Unavailable", open: "Market Open", closed: "Market Closed", viewOnly: "View only",
  statusAria: "Market status", lineupWindow: "LINEUP WINDOW", manageXI: "Choose a position to manage the XI",
  browseReadOnly: "Browse every club, position and profile. XI changes are unavailable.",
  windowRule: "Closes at the first match kickoff of the round. Reopens after the provider confirms the final whistle of the last match.",
} as const;

export type TouchlineFantasyMarketAccessCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_FANTASY_MARKET_ACCESS_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_FANTASY_MARKET_ACCESS_DRAFT_STATUS = "draft" as const;

/** Labels only: calendar openness is not permission to edit. The existing
 * consumer retains entitlement/deadline checks and chooses the applicable copy.
 * Six additional catalogues remain drafts behind the public EN/PT gate.
 */
export const TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    unavailable: "Indisponível", open: "Mercado aberto", closed: "Mercado fechado", viewOnly: "Somente consulta",
    statusAria: "Estado do mercado", lineupWindow: "JANELA DE ESCALAÇÃO", manageXI: "Escolha uma posição para gerenciar o XI",
    browseReadOnly: "Consulte todos os clubes, posições e perfis. Alterações no XI não estão disponíveis.",
    windowRule: "Fecha no apito inicial do primeiro jogo da rodada. Reabre após a confirmação do apito final do último jogo pelo provedor.",
  },
  "es-ES": {
    unavailable: "No disponible", open: "Mercado abierto", closed: "Mercado cerrado", viewOnly: "Solo consulta",
    statusAria: "Estado del mercado", lineupWindow: "VENTANA DE ALINEACIÓN", manageXI: "Elige una posición para gestionar el once",
    browseReadOnly: "Consulta todos los clubes, posiciones y perfiles. Los cambios en el once no están disponibles.",
    windowRule: "Cierra con el pitido inicial del primer partido de la jornada. Reabre cuando el proveedor confirma el pitido final del último partido.",
  },
  "it-IT": {
    unavailable: "Non disponibile", open: "Mercato aperto", closed: "Mercato chiuso", viewOnly: "Sola consultazione",
    statusAria: "Stato del mercato", lineupWindow: "FINESTRA DI FORMAZIONE", manageXI: "Scegli una posizione per gestire gli undici titolari",
    browseReadOnly: "Consulta tutti i club, le posizioni e i profili. Le modifiche agli undici titolari non sono disponibili.",
    windowRule: "Chiude al fischio d’inizio della prima partita della giornata. Riapre quando il fornitore conferma il fischio finale dell’ultima partita.",
  },
  "fr-FR": {
    unavailable: "Indisponible", open: "Marché ouvert", closed: "Marché fermé", viewOnly: "Consultation uniquement",
    statusAria: "État du marché", lineupWindow: "FENÊTRE DE COMPOSITION", manageXI: "Choisissez un poste pour gérer le onze",
    browseReadOnly: "Consultez tous les clubs, postes et profils. Les modifications du onze ne sont pas disponibles.",
    windowRule: "Ferme au coup d’envoi du premier match de la journée. Rouvre lorsque le fournisseur confirme le coup de sifflet final du dernier match.",
  },
  "ar-SA": {
    unavailable: "غير متاح", open: "السوق مفتوح", closed: "السوق مغلق", viewOnly: "للاطلاع فقط",
    statusAria: "حالة السوق", lineupWindow: "فترة اختيار التشكيلة", manageXI: "اختر مركزًا لإدارة التشكيلة الأساسية",
    browseReadOnly: "تصفح جميع الأندية والمراكز والملفات. تعديلات التشكيلة الأساسية غير متاحة.",
    windowRule: "يغلق عند صافرة بداية أول مباراة في الجولة. يعاد فتحه بعد أن يؤكد مزود البيانات صافرة النهاية لآخر مباراة.",
  },
  "tr-TR": {
    unavailable: "Kullanılamıyor", open: "Pazar açık", closed: "Pazar kapalı", viewOnly: "Yalnızca görüntüleme",
    statusAria: "Pazar durumu", lineupWindow: "KADRO OLUŞTURMA DÖNEMİ", manageXI: "İlk 11’i yönetmek için bir mevki seçin",
    browseReadOnly: "Tüm kulüplere, mevkilere ve profillere göz atın. İlk 11 değişiklikleri kullanılamıyor.",
    windowRule: "Haftanın ilk maçının başlangıç düdüğünde kapanır. Veri sağlayıcısı son maçın bitiş düdüğünü doğruladığında yeniden açılır.",
  },
  "de-DE": {
    unavailable: "Nicht verfügbar", open: "Markt geöffnet", closed: "Markt geschlossen", viewOnly: "Nur ansehen",
    statusAria: "Marktstatus", lineupWindow: "AUFSTELLUNGSZEITFENSTER", manageXI: "Wähle eine Position, um die Startelf zu verwalten",
    browseReadOnly: "Sieh dir alle Vereine, Positionen und Profile an. Änderungen an der Startelf sind nicht verfügbar.",
    windowRule: "Schließt beim Anpfiff des ersten Spiels des Spieltags. Öffnet wieder, sobald der Anbieter den Schlusspfiff des letzten Spiels bestätigt.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineFantasyMarketAccessCopy>>;

export function getTouchlineFantasyMarketAccessCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineFantasyMarketAccessCopy {
  return TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
